import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {DndContext,DragOverlay,PointerSensor,TouchSensor,useSensor,useSensors,defaultDropAnimationSideEffects,type DragEndEvent,type DragMoveEvent,type DragStartEvent,type DropAnimation,type Modifier,type Active} from '@dnd-kit/core';
import {motion,useAnimate,useMotionValue,useSpring,useTransform,type MotionValue} from 'motion/react';
import {applyIntent,noIntent,type Intent} from '../../intent.ts';
import {dayPlan,overrunEnd} from '../../today.ts';
import {insertionBefore} from '../../flow.ts';
import {placementIssue} from '../../placement.ts';
import {createTimeAxis,timeAxisForDays,type TimeAxis} from '../../time-axis.ts';
import type {Task} from '../../types.ts';
import {formatDuration} from '../../format.ts';
import {time} from '../../dates.ts';
import {getState,setUi,useApp} from '../store/state.ts';
import {dayRule,drop,setGesture} from '../store/tasks.ts';
import {LIFT_SCALE,MAX_TILT,bump,reduced} from '../ui/motion.ts';
import {Lock} from '../ui/icons.tsx';

// Horizontal geometry of a day space. `bodyLeft` is where the rail ends and order space begins.
// A held block bites into the rail once its left edge is pushed `bite` px left of where flow blocks stand,
// and lets go only after being pulled `hold` px back past that point, so it never chatters at the edge.
export type Geometry={ruler:number;railLeft:number;railWidth:number;bodyLeft:number;flowLeft:number;fixedLeft:number;right:number;bite:number;hold:number};
export const DAY_GEOMETRY:Geometry={ruler:50,railLeft:52,railWidth:30,bodyLeft:86,flowLeft:92,fixedLeft:56,right:10,bite:10,hold:14};
export const COLUMN_GEOMETRY:Geometry={ruler:0,railLeft:0,railWidth:13,bodyLeft:14,flowLeft:17,fixedLeft:1,right:4,bite:6,hold:10};

// Places where a held block can land. Day spaces know their time axis; the others take a date or send work back to 미계획.
type Region={key:string;kind:'space'|'date'|'tray';date:string|null;el:HTMLElement;axis?:TimeAxis;geometry?:Geometry};
// Over a body the copy settles on its `slot`, where the order puts it; `rising` when that slot is above where the copy was.
type Slot={start:number;end:number;over:boolean};
export type Held={task:Task;intent:Intent;slot:Slot|null;rising:boolean;startRect:{left:number;top:number;width:number;height:number};grabX:number;width:number;height:number;dropping?:boolean};
type Ctx={held:Held|null;pending:Intent|null;tasks:Task[];register:(r:Region)=>()=>void};
const DragCtx=createContext<Ctx>({held:null,pending:null,tasks:[],register:()=>()=>{}});
export const useDrag=()=>useContext(DragCtx);

// Registers an element as a landing region while mounted.
export function useRegion(kind:Region['kind'],date:string|null,extra:{axis?:TimeAxis;geometry?:Geometry}={}){
  const {register}=useDrag(),key=useRef(Math.random().toString(36).slice(2)).current,off=useRef<(()=>void)|null>(null);
  const extraRef=useRef(extra);extraRef.current=extra;
  return useCallback((el:HTMLElement|null)=>{
    off.current?.();off.current=null;
    if(el)off.current=register({key,kind,date,el,get axis(){return extraRef.current.axis;},get geometry(){return extraRef.current.geometry;}} as Region);
  },[register,kind,date,key]);
}

// The days' shared time axis, stretched to show flow work that runs past working time.
// While a block is held it only grows, so the space under the pointer never moves.
export function useDaysAxis(dates:string[],scale:number){
  const {snapshot}=useApp(),{tasks}=useDrag();
  const axis=timeAxisForDays(dates.map(dayRule),scale);
  const ends=[snapshot?.tasks??[],tasks].flatMap(list=>dates.map(d=>overrunEnd(dayPlan(d,list,dayRule(d),snapshot?.layouts??[]))??0));
  const end=Math.max(...ends);
  return end>axis.end-30?createTimeAxis(axis.start,Math.max(Math.min(1440,end+30),end),scale):axis;
}

// A mouse or pen lifts a block after a short pull. A finger must rest on it first (TouchSensor), so a swipe still scrolls.
class MousePenSensor extends PointerSensor{
  static activators=[{eventName:'onPointerDown' as const,handler:(...a:Parameters<typeof PointerSensor.activators[0]['handler']>)=>(a[0].nativeEvent as PointerEvent).pointerType!=='touch'&&PointerSensor.activators[0].handler(...a)}];
}
// Work is never put on a day that has passed, even its own: it would turn straight into 지난 미완료.
const pastReason=(date:string|null)=>date&&date<getState().today?'지난 날짜에는 놓을 수 없어요':null;
const point=(e:Event)=>{const p='touches' in e?(e as TouchEvent).touches[0]??(e as TouchEvent).changedTouches[0]:e as PointerEvent;return {x:p.clientX,y:p.clientY};};

export function DragProvider({children}:{children:ReactNode}){
  const {snapshot}=useApp();
  const [held,setHeld]=useState<Held|null>(null);
  const [pending,setPending]=useState<Intent|null>(null);
  const regions=useRef(new Map<string,Region>());
  const motionRef=useRef<{x:number;t:number;tilt:number;idle?:ReturnType<typeof setTimeout>}>({x:0,t:0,tilt:0});
  const snap=useRef<{left:number;top:number}|null>(null);
  const start=useRef<Held['startRect']|null>(null);
  const tilt=useMotionValue(0),lean=useSpring(tilt,{stiffness:140,damping:22});
  const pull=useMotionValue(0),reach=useSpring(pull,{stiffness:500,damping:30});
  const sensors=useSensors(useSensor(MousePenSensor,{activationConstraint:{distance:5}}),useSensor(TouchSensor,{activationConstraint:{delay:250,tolerance:6}}));
  const heldRef=useRef(held);heldRef.current=held;
  // dnd-kit's own English hints and ids are replaced: blocks are lifted by pointer only, and results are announced by the app.
  const accessibility=useMemo(()=>({screenReaderInstructions:{draggable:''},announcements:{
    onDragStart:({active}:{active:Active})=>{const id=String(active.data.current?.taskId??active.id),t=getState().snapshot?.tasks.find(x=>x.id===id);return t?`‘${t.title}’을 들었어요`:undefined;},
    onDragOver:()=>undefined,onDragMove:()=>undefined,onDragCancel:()=>'',
    onDragEnd:()=>{const i=heldRef.current?.intent;return i&&!i.ok&&i.reason?i.reason:'';}
  }}),[]);
  const register=useCallback((r:Region)=>{regions.current.set(r.key,r);return ()=>{regions.current.delete(r.key);};},[]);
  const base=snapshot?.tasks??[];
  // A rejected place is never previewed: the days stay as they are while the copy shows why.
  const tasks=useMemo(()=>{const i=held&&!held.dropping?held.intent:pending??held?.intent??null;return applyIntent(base,i?.ok?i:null);},[base,held,pending]);

  // `grab` is where along its width the block was taken; `prev` is the last intent, for the latch's hysteresis.
  function zoneAt(task:Task,px:number,py:number,top:number,grab:number,prev:Intent):{intent:Intent;region?:Region;slot?:Slot;near?:number}{
    const intent=noIntent(task.id);
    const inside=(el:HTMLElement)=>{const r=el.getBoundingClientRect();return px>=r.left&&px<=r.right&&py>=r.top&&py<=r.bottom?r:null;};
    const all=[...regions.current.values()];
    for(const region of all.filter(r=>r.kind==='space')){
      const r=inside(region.el);if(!r||!region.axis||!region.geometry||!region.date)continue;
      const {axis,geometry:g,date}=region,topIn=top-r.top,rule=dayRule(date),layouts=snapshot!.layouts??[];
      // A fixed block starts latched on its own day; anything latched keeps the wider fixed shape while it is measured.
      const was=prev.zone==='rail'?prev.date===date:prev.zone==='none'&&task.starts_at?.slice(0,10)===date;
      const edge=px-r.left-grab*(r.width-(was?g.fixedLeft:g.flowLeft)-g.right),bite=g.flowLeft-g.bite;
      if(px-r.left<g.bodyLeft||edge<=bite+(was?g.hold:0)){
        const minute=Math.round(axis.minute(Math.max(0,topIn))/15)*15;
        const reason=pastReason(date)??placementIssue(task.id,date,minute,task.duration,rule,base)?.label??null;
        return {intent:{...intent,zone:'rail',date,start:minute,ok:!reason,reason},region};
      }
      const rest=dayPlan(date,base.filter(t=>t.id!==task.id),rule,layouts),past=pastReason(date);
      const centre=axis.minute(topIn+task.duration*axis.scale/2),flows=rest.items.filter(i=>!i.fixed);
      const body:Intent={...intent,zone:'body',date,before:insertionBefore(flows,centre),ok:!past,reason:past};
      // How far the block has been pushed toward the rail, 0–1, for its tooth to reach out.
      const near=Math.max(0,Math.min(1,(g.flowLeft-edge)/g.bite));
      if(past)return {intent:body,region,near};
      const item=dayPlan(date,applyIntent(base,body),rule,layouts).items.find(i=>i.task.id===task.id);
      return {intent:body,region,near,slot:item&&{start:item.start,end:item.end,over:item.over}};
    }
    for(const kind of ['date','tray'] as const)for(const region of all.filter(r=>r.kind===kind)){
      if(!inside(region.el))continue;
      if(kind==='tray')return task.plan_date?{intent:{...intent,zone:'tray'}}:{intent};
      const reason=pastReason(region.date);
      return {intent:{...intent,zone:'date',date:region.date,ok:!reason,reason},region};
    }
    return {intent};
  }

  function onDragStart(e:DragStartEvent){
    const id=String(e.active.data.current?.taskId??e.active.id),task=base.find(t=>t.id===id);if(!task)return;
    // dnd-kit measures after this callback; read the block's own box so the copy starts exactly on it.
    const node=(e.activatorEvent.target as HTMLElement).closest<HTMLElement>('[data-block]')!,r=node.getBoundingClientRect();
    const px=point(e.activatorEvent!).x;
    start.current={left:r.left,top:r.top,width:r.width,height:r.height};
    motionRef.current={x:px,t:performance.now(),tilt:0};snap.current=null;tilt.set(0);
    setGesture(true);setUi({contextMenu:null});
    pull.set(0);
    setHeld({task,intent:noIntent(task.id),slot:null,rising:false,startRect:start.current,grabX:px-r.left,width:r.width,height:r.height});
  }
  function onDragMove(e:DragMoveEvent){
    const h=held,s=start.current;if(!h||!s||h.dropping)return;
    const a=point(e.activatorEvent!),px=a.x+e.delta.x,py=a.y+e.delta.y;
    const {intent,region,slot=null,near=0}=zoneAt(h.task,px,py,s.top+e.delta.y,h.grabX/s.width,h.intent);
    pull.set(intent.zone==='body'?near:0);
    const rect=region?.el.getBoundingClientRect(),g=region?.geometry,axis=region?.axis;
    // Both places show where the block will be: the rail on its 15-minute tick, the body on the slot its order gives it.
    const was=snap.current?.top??s.top+e.delta.y;
    snap.current=!rect||!g||!axis?null
      :intent.zone==='rail'?{left:rect.left+g.fixedLeft,top:rect.top+axis.position(intent.start!)+1}
      :slot?{left:rect.left+g.flowLeft,top:rect.top+axis.position(slot.start)+1}:null;
    const rising=intent.zone==='body'&&!!snap.current&&snap.current.top<was-.5;
    const m=motionRef.current,t=performance.now(),vx=(px-m.x)/Math.max(8,t-m.t)*16;m.x=px;m.t=t;
    m.tilt=snap.current||reduced()?0:Math.max(-MAX_TILT,Math.min(MAX_TILT,m.tilt*.85+vx*.04));
    tilt.set(m.tilt);clearTimeout(m.idle);m.idle=setTimeout(()=>{m.tilt=0;tilt.set(0);},140);
    const width=rect&&g?(intent.zone==='rail'?rect.width-g.fixedLeft-g.right:intent.zone==='body'?rect.width-g.flowLeft-g.right:s.width):s.width;
    const height=axis?h.task.duration*axis.scale-2:s.height;
    const i=h.intent;
    if(i.zone!==intent.zone||i.date!==intent.date||i.before!==intent.before||i.start!==intent.start||i.ok!==intent.ok||width!==h.width||height!==h.height
      ||h.slot?.start!==slot?.start||h.slot?.end!==slot?.end)setHeld({...h,intent,slot,rising,width,height});
  }
  async function onDragEnd(_:DragEndEvent){
    const h=held;snap.current=null;tilt.set(0);setGesture(false);
    if(!h)return;
    // The copy keeps rendering while it settles onto the block, now aligned with it.
    setHeld({...h,dropping:true});setTimeout(()=>setHeld(x=>x?.dropping?null:x),reduced()?0:320);
    if(h.intent.zone==='none'||!h.intent.ok)return;
    // The dropped block stays where it was put until the store answers; a failure lets it spring back.
    setPending(h.intent);
    await drop(h.intent);
    setPending(null);
  }
  const snapModifier:Modifier=({transform})=>{const s=snap.current,o=start.current;return s&&o?{...transform,x:s.left-o.left,y:s.top-o.top}:transform;};
  const dropAnimation:DropAnimation={
    duration:reduced()?0:300,easing:'cubic-bezier(.3,1.35,.5,1)',
    keyframes:({transform})=>[{transform:`translate3d(${transform.initial.x}px,${transform.initial.y}px,0)`},{transform:`translate3d(${transform.final.x}px,${transform.final.y}px,0)`}],
    sideEffects:defaultDropAnimationSideEffects({styles:{active:{opacity:'0'}}})
  };
  return <DragCtx.Provider value={{held,pending,tasks,register}}>
    <DndContext sensors={sensors} accessibility={accessibility} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={()=>{setHeld(null);snap.current=null;setGesture(false);}} autoScroll={false}>
      {children}
      <DragOverlay modifiers={[snapModifier]} dropAnimation={dropAnimation} transition={held&&!held.dropping&&settled(held)&&!reduced()?glide(held):undefined}>{held&&<HeldBlock held={held} lean={lean} reach={reduced()?pull:reach}/>}</DragOverlay>
    </DndContext>
  </DragCtx.Provider>;
}

// The copy sits where the block will be, on a rail tick or on its slot in the order.
// Up to a slot it is drawn in, gathering speed until it meets what is above; down it is pushed, easing to a stop.
const RISE_MS=220;
const glide=(h:Held)=>h.intent.zone==='rail'?'transform .16s cubic-bezier(.3,1.3,.5,1)'
  :h.rising?`transform ${RISE_MS}ms cubic-bezier(.55,.05,.85,.6)`:'transform .22s cubic-bezier(.3,0,.3,1)';
const settled=(h:Held)=>h.intent.zone==='rail'||(h.intent.zone==='body'&&!!h.slot);
function HeldBlock({held,lean,reach}:{held:Held;lean:MotionValue<number>;reach:MotionValue<number>}){
  const {task,intent,slot,width,height}=held,rail=intent.zone==='rail',fixedLook=rail||(!!task.starts_at&&intent.zone==='none'),bad=!intent.ok;
  const placed=settled(held),at=rail?{start:intent.start!,end:intent.start!+task.duration}:intent.zone==='body'?slot:null;
  // Pushed toward the rail, the tooth reaches out for it before the block bites.
  const tooth=useTransform(reach,[0,1],[4,14]);
  const [tileRef,animateTile]=useAnimate();
  useEffect(()=>{if(held.rising&&!reduced()&&tileRef.current)void animateTile(tileRef.current,bump,{delay:RISE_MS/1000,duration:.22,ease:'easeOut'});},[slot?.start,held.rising]);
  // When the block widens over a day, the point that was grabbed stays under the pointer.
  const shift=placed||held.dropping?0:-held.grabX*(width/held.startRect.width-1);
  return <motion.div className={'blk held '+(fixedLook?'fixed':'flow')+(bad?' bad':'')+(!rail&&slot?.over&&intent.zone==='body'?' over':'')} style={{rotate:lean,transformOrigin:'50% 30%'}}
    initial={{scale:1,width:held.startRect.width,height:held.startRect.height,marginLeft:0}}
    animate={{scale:held.dropping?1:placed?1.01:LIFT_SCALE,width,height,marginLeft:shift,x:bad?[0,-4,3,-2,0]:0}}
    transition={{scale:{type:'spring',visualDuration:.16,bounce:.4},width:{duration:.18},height:{duration:.18},marginLeft:{duration:.18},x:{duration:.32}}}>
    {!fixedLook&&<motion.span className="tooth" aria-hidden="true" style={{width:tooth}}/>}
    <div ref={tileRef} className="tile" style={{transformOrigin:'50% 100%'}}>
      {fixedLook&&<motion.span className="latch" initial={rail?{x:-5,scaleX:1.2}:false} animate={{x:0,scaleX:1}} transition={{duration:.3,ease:[.3,1.6,.5,1]}}><Lock open/></motion.span>}
      <span className="chk"/>
      <span className="main"><span className="ttl">{task.title}</span><span className="meta">{at?`${time(at.start)}–${time(at.end)}`:formatDuration(task.duration)}</span></span>
    </div>
    {bad&&!held.dropping&&<span className="held-why">{intent.reason}</span>}
  </motion.div>;
}
export const isGestureActive=()=>getState().gesture;
