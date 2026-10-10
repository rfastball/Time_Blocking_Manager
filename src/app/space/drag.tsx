import {createContext,useCallback,useContext,useMemo,useRef,useState,type ReactNode} from 'react';
import {DndContext,DragOverlay,PointerSensor,TouchSensor,useSensor,useSensors,defaultDropAnimationSideEffects,type DragEndEvent,type DragMoveEvent,type DragStartEvent,type DropAnimation,type Modifier,type Active} from '@dnd-kit/core';
import {motion,useMotionValue,useSpring,type MotionValue} from 'motion/react';
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
import {LIFT_SCALE,MAX_TILT,reduced} from '../ui/motion.ts';
import {Lock} from '../ui/icons.tsx';

// Horizontal geometry of a day space. `bodyLeft` is where the rail ends and order space begins.
export type Geometry={ruler:number;railLeft:number;railWidth:number;bodyLeft:number;flowLeft:number;fixedLeft:number;right:number};
export const DAY_GEOMETRY:Geometry={ruler:50,railLeft:52,railWidth:30,bodyLeft:86,flowLeft:92,fixedLeft:56,right:10};
export const COLUMN_GEOMETRY:Geometry={ruler:0,railLeft:0,railWidth:13,bodyLeft:14,flowLeft:17,fixedLeft:1,right:4};

// Places where a held block can land. Day spaces know their time axis; the others take a date or send work back to 미계획.
type Region={key:string;kind:'space'|'date'|'tray';date:string|null;el:HTMLElement;axis?:TimeAxis;geometry?:Geometry};
export type Held={task:Task;intent:Intent;startRect:{left:number;top:number;width:number;height:number};grabX:number;width:number;height:number;dropping?:boolean};
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
  const tasks=useMemo(()=>applyIntent(base,held&&!held.dropping?held.intent:pending??held?.intent??null),[base,held,pending]);

  function zoneAt(task:Task,px:number,py:number,top:number):{intent:Intent;region?:Region}{
    const intent=noIntent(task.id);
    const inside=(el:HTMLElement)=>{const r=el.getBoundingClientRect();return px>=r.left&&px<=r.right&&py>=r.top&&py<=r.bottom?r:null;};
    const all=[...regions.current.values()];
    for(const region of all.filter(r=>r.kind==='space')){
      const r=inside(region.el);if(!r||!region.axis||!region.geometry||!region.date)continue;
      const {axis,geometry:g,date}=region,topIn=top-r.top,rule=dayRule(date);
      if(px-r.left<g.bodyLeft){
        const minute=Math.round(axis.minute(Math.max(0,topIn))/15)*15;
        const issue=placementIssue(task.id,date,minute,task.duration,rule,base);
        return {intent:{...intent,zone:'rail',date,start:minute,ok:!issue,reason:issue?.label??null},region};
      }
      const rest=dayPlan(date,base.filter(t=>t.id!==task.id),rule,snapshot!.layouts??[]);
      const centre=axis.minute(topIn+task.duration*axis.scale/2),flows=rest.items.filter(i=>!i.fixed);
      return {intent:{...intent,zone:'body',date,before:insertionBefore(flows,centre)},region};
    }
    for(const kind of ['date','tray'] as const)for(const region of all.filter(r=>r.kind===kind)){
      if(!inside(region.el))continue;
      if(kind==='tray')return task.plan_date?{intent:{...intent,zone:'tray'}}:{intent};
      return {intent:{...intent,zone:'date',date:region.date},region};
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
    setHeld({task,intent:noIntent(task.id),startRect:start.current,grabX:px-r.left,width:r.width,height:r.height});
  }
  function onDragMove(e:DragMoveEvent){
    const h=held,s=start.current;if(!h||!s||h.dropping)return;
    const a=point(e.activatorEvent!),px=a.x+e.delta.x,py=a.y+e.delta.y;
    const {intent,region}=zoneAt(h.task,px,py,s.top+e.delta.y);
    const rect=region?.el.getBoundingClientRect(),g=region?.geometry,axis=region?.axis;
    snap.current=intent.zone==='rail'&&rect&&g&&axis?{left:rect.left+g.fixedLeft,top:rect.top+axis.position(intent.start!)+1}:null;
    const m=motionRef.current,t=performance.now(),vx=(px-m.x)/Math.max(8,t-m.t)*16;m.x=px;m.t=t;
    m.tilt=intent.zone==='rail'||reduced()?0:Math.max(-MAX_TILT,Math.min(MAX_TILT,m.tilt*.85+vx*.04));
    tilt.set(m.tilt);clearTimeout(m.idle);m.idle=setTimeout(()=>{m.tilt=0;tilt.set(0);},140);
    const width=rect&&g?(intent.zone==='rail'?rect.width-g.fixedLeft-g.right:intent.zone==='body'?rect.width-g.flowLeft-g.right:s.width):s.width;
    const height=axis?h.task.duration*axis.scale-2:s.height;
    const i=h.intent;
    if(i.zone!==intent.zone||i.date!==intent.date||i.before!==intent.before||i.start!==intent.start||i.ok!==intent.ok||width!==h.width||height!==h.height)setHeld({...h,intent,width,height});
  }
  async function onDragEnd(_:DragEndEvent){
    const h=held;snap.current=null;tilt.set(0);setGesture(false);
    if(!h)return;
    // The copy keeps rendering while it settles onto the block, now aligned with it.
    setHeld({...h,dropping:true});setTimeout(()=>setHeld(x=>x?.dropping?null:x),reduced()?0:320);
    if(h.intent.zone==='none'||(h.intent.zone==='rail'&&!h.intent.ok))return;
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
      <DragOverlay modifiers={[snapModifier]} dropAnimation={dropAnimation}>{held&&<HeldBlock held={held} lean={lean}/>}</DragOverlay>
    </DndContext>
  </DragCtx.Provider>;
}

function HeldBlock({held,lean}:{held:Held;lean:MotionValue<number>}){
  const {task,intent,width,height}=held,rail=intent.zone==='rail',fixedLook=rail||(!!task.starts_at&&intent.zone==='none');
  // When the block widens over a day, the point that was grabbed stays under the pointer.
  const shift=rail||held.dropping?0:-held.grabX*(width/held.startRect.width-1);
  return <motion.div className={'blk held '+(fixedLook?'fixed':'flow')+(rail&&!intent.ok?' bad':'')} style={{rotate:lean,transformOrigin:'50% 30%'}}
    initial={{scale:1,width:held.startRect.width,height:held.startRect.height,marginLeft:0}}
    animate={{scale:held.dropping?1:rail?1.01:LIFT_SCALE,width,height,marginLeft:shift,x:rail&&!intent.ok?[0,-4,3,-2,0]:0}}
    transition={{scale:{type:'spring',visualDuration:.16,bounce:.4},width:{duration:.18},height:{duration:.18},marginLeft:{duration:.18},x:{duration:.32}}}>
    <div className="tile">
      {fixedLook&&<span className="latch"><Lock open/></span>}
      <span className="chk"/>
      <span className="main"><span className="ttl">{task.title}</span><span className="meta">{rail?`${time(intent.start!)}–${time(intent.start!+task.duration)}`:formatDuration(task.duration)}</span></span>
      {rail&&!intent.ok&&<span className="held-why">{intent.reason}</span>}
    </div>
  </motion.div>;
}
export const isGestureActive=()=>getState().gesture;
