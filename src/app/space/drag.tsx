import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {DndContext,DragOverlay,PointerSensor,TouchSensor,useSensor,useSensors,defaultDropAnimationSideEffects,type DragEndEvent,type DragMoveEvent,type DragStartEvent,type DropAnimation,type Modifier,type Active} from '@dnd-kit/core';
import {motion} from 'motion/react';
import {applyIntent,noIntent,type Intent} from '../../intent.ts';
import {dayPlan,newlyOver,overrunEnd} from '../../today.ts';
import {insertionBefore} from '../../flow.ts';
import {placementIssue} from '../../placement.ts';
import {createTimeAxis,timeAxisForDays,type TimeAxis} from '../../time-axis.ts';
import type {DayLayout,Task} from '../../types.ts';
import {formatDuration} from '../../format.ts';
import {time} from '../../dates.ts';
import {getState,setUi,useApp} from '../store/state.ts';
import {dayRule,drop,setGesture} from '../store/tasks.ts';
import {reduced} from '../ui/motion.ts';
import {Lock} from '../ui/icons.tsx';

// Horizontal geometry of a day space. `bodyLeft` is where the rail ends and order space begins.
// A held block bites into the rail once its left edge is pushed `bite` px left of where flow blocks stand, and lets go
// once pulled `pull` px right of where fixed blocks stand: a little easier than biting, and still clear of the bite point
// (fixedLeft+pull > flowLeft-bite), so it never chatters at the edge. Until then the copy gives up to `give` px toward the hand.
// Both distances grow while the hand is moving up or down (see `steadiness`), so reordering never latches by drift.
export type Geometry={ruler:number;railLeft:number;railWidth:number;bodyLeft:number;flowLeft:number;fixedLeft:number;right:number;bite:number;pull:number;give:number};
export const DAY_GEOMETRY:Geometry={ruler:50,railLeft:52,railWidth:30,bodyLeft:86,flowLeft:92,fixedLeft:56,right:10,bite:24,pull:20,give:6};
export const COLUMN_GEOMETRY:Geometry={ruler:0,railLeft:0,railWidth:13,bodyLeft:14,flowLeft:17,fixedLeft:1,right:4,bite:12,pull:10,give:3};
// How far a flow block's runner reaches left from the block to sit in the middle of the rail's groove.
export const runnerReach=(g:Geometry)=>g.flowLeft-(g.railLeft+g.railWidth/2);

// Places where a held block can land. Day spaces know their time axis; the others take a date or send work back to 미계획.
type Region={key:string;kind:'space'|'date'|'tray';date:string|null;el:HTMLElement;axis?:TimeAxis;geometry?:Geometry};
// The hollow marks the body slot; the held copy follows the hand until it latches onto a rail tick.
type Slot={start:number;end:number;over:boolean};
export type Held={task:Task;intent:Intent;slot:Slot|null;column:boolean;startRect:{left:number;top:number;width:number;height:number};grabX:number;grabY:number;width:number;height:number;dropping?:boolean};
// `pushed`: blocks the shown change would newly put past working time.
type Ctx={held:Held|null;pending:Intent|null;tasks:Task[];pushed:string[];register:(r:Region)=>()=>void};
const DragCtx=createContext<Ctx>({held:null,pending:null,tasks:[],pushed:[],register:()=>()=>{}});
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
  // Recent motion per axis, px per frame, fading over about 120ms. Its vertical share is the budget up/down travel has taken.
  const travel=useRef({x:0,y:0,px:0,py:0,t:0});
  const snap=useRef<{left:number;top:number}|null>(null);
  const dropTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const start=useRef<Held['startRect']|null>(null);
  useEffect(()=>()=>{if(dropTimer.current)clearTimeout(dropTimer.current);},[]);
  const sensors=useSensors(useSensor(MousePenSensor,{activationConstraint:{distance:5}}),useSensor(TouchSensor,{activationConstraint:{delay:250,tolerance:6}}));
  const heldRef=useRef(held);heldRef.current=held;
  // dnd-kit's own English hints and ids are replaced: blocks are lifted by pointer only, and results are announced by the app.
  const accessibility=useMemo(()=>({screenReaderInstructions:{draggable:''},announcements:{
    onDragStart:({active}:{active:Active})=>{const id=String(active.data.current?.taskId??active.id),t=getState().snapshot?.tasks.find(x=>x.id===id);return t?`‘${t.title}’을 들었어요`:undefined;},
    onDragOver:()=>undefined,onDragMove:()=>undefined,onDragCancel:()=>'',
    onDragEnd:()=>{
      const i=heldRef.current?.intent,s=getState().snapshot;if(i&&!i.ok&&i.reason)return i.reason;
      const n=s&&i?pushedBy(s.tasks,s.layouts??[],i).length:0;return n?`${n}개가 근무 외로 밀렸어요`:'';
    }
  }}),[]);
  const register=useCallback((r:Region)=>{regions.current.set(r.key,r);return ()=>{regions.current.delete(r.key);};},[]);
  const base=snapshot?.tasks??[];
  // A time on the rail is passed over, not chosen, until the hand rests on it: only then do the days make way for it.
  // Anything else, and the drop itself, shows at once. A rejected place is never previewed: the days stay as they are while the copy shows why.
  const live=held&&!held.dropping?held.intent:null;
  const resting=useDwell(live,live?`${live.zone}|${live.date}|${live.before}|${live.start}|${live.ok}`:'',live?.zone==='rail');
  const shown=held&&!held.dropping?resting:pending??held?.intent??null;
  const tasks=useMemo(()=>applyIntent(base,shown?.ok?shown:null),[base,shown]);
  const pushed=useMemo(()=>held&&!held.dropping?pushedBy(base,snapshot?.layouts??[],shown):[],[held,shown,base,snapshot]);

  // `grab` is where along its width the block was taken; `prev` is the last intent, for the latch's hysteresis.
  // `near` is how far the block has been pushed toward biting (or, latched, pulled toward letting go), 0–1.
  // `stretch` scales both distances: 1 when the hand is still or moving sideways, up to STRETCH while it travels up or down.
  function zoneAt(task:Task,px:number,py:number,grabY:number,grab:number,prev:Intent,stretch=1):{intent:Intent;region?:Region;slot?:Slot;near?:number}{
    const intent=noIntent(task.id);
    const inside=(el:HTMLElement)=>{const r=el.getBoundingClientRect();return px>=r.left&&px<=r.right&&py>=r.top&&py<=r.bottom?r:null;};
    const all=[...regions.current.values()];
    for(const region of all.filter(r=>r.kind==='space')){
      const r=inside(region.el);if(!r||!region.axis||!region.geometry||!region.date)continue;
      const {axis,geometry:g,date}=region,topIn=py-r.top-grabY*Math.max(10,task.duration*axis.scale-2),rule=dayRule(date),layouts=snapshot!.layouts??[];
      // A fixed block starts latched on its own day; anything latched keeps the wider fixed shape while it is measured.
      const was=prev.zone==='rail'?prev.date===date:prev.zone==='none'&&task.starts_at?.slice(0,10)===date;
      const edge=px-r.left-grab*(r.width-(was?g.fixedLeft:g.flowLeft)-g.right);
      const bite=g.bite*stretch,pull=g.pull*stretch;
      if(px-r.left<g.bodyLeft||(was?edge<g.fixedLeft+pull:edge<=g.flowLeft-bite)){
        const minute=Math.round(axis.minute(Math.max(0,topIn))/15)*15;
        const reason=placementIssue(task.id,date,minute,task.duration,rule,base)?.label??null;
        return {intent:{...intent,zone:'rail',date,start:minute,ok:!reason,reason},region,near:was?Math.max(0,Math.min(1,(edge-g.fixedLeft)/pull)):0};
      }
      const rest=dayPlan(date,base.filter(t=>t.id!==task.id),rule,layouts);
      const centre=axis.minute(topIn+task.duration*axis.scale/2),flows=rest.items.filter(i=>!i.fixed);
      const body:Intent={...intent,zone:'body',date,before:insertionBefore(flows,centre),ok:true,reason:null};
      const near=Math.max(0,Math.min(1,(g.flowLeft-edge)/bite));
      const item=dayPlan(date,applyIntent(base,body),rule,layouts).items.find(i=>i.task.id===task.id);
      return {intent:body,region,near,slot:item&&{start:item.start,end:item.end,over:item.over}};
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
    if(dropTimer.current)clearTimeout(dropTimer.current);
    // dnd-kit measures after this callback; read the block's own box so the copy starts exactly on it.
    const node=(e.activatorEvent.target as HTMLElement).closest<HTMLElement>('[data-block]')!,r=node.getBoundingClientRect();
    const {x:px,y:py}=point(e.activatorEvent!);
    start.current={left:r.left,top:r.top,width:r.width,height:r.height};
    snap.current=null;
    travel.current={x:0,y:0,px,py,t:performance.now()};
    setGesture(true);setUi({contextMenu:null});
    setHeld({task,intent:noIntent(task.id),slot:null,column:false,startRect:start.current,grabX:px-r.left,grabY:py-r.top,width:r.width,height:r.height});
  }
  function onDragMove(e:DragMoveEvent){
    const h=held,s=start.current;if(!h||!s||h.dropping)return;
    const a=point(e.activatorEvent!),px=a.x+e.delta.x,py=a.y+e.delta.y;
    const {intent,region,slot=null,near=0}=zoneAt(h.task,px,py,h.grabY/s.height,h.grabX/s.width,h.intent,steadiness(travel.current,px,py));
    const rect=region?.el.getBoundingClientRect(),g=region?.geometry,axis=region?.axis;
    // Only the rail constrains the hand to a 15-minute tick; the hollow carries the projected order slot.
    snap.current=rect&&g&&axis&&intent.zone==='rail'?{left:rect.left+g.fixedLeft+near*g.give,top:rect.top+axis.position(intent.start!)+1}:null;
    const width=rect&&g?(intent.zone==='rail'?rect.width-g.fixedLeft-g.right:intent.zone==='body'?rect.width-g.flowLeft-g.right:s.width):s.width;
    const height=axis?Math.max(10,h.task.duration*axis.scale-2):s.height;
    const column=g?.ruler===0;
    const i=h.intent;
    if(h.column!==column||i.zone!==intent.zone||i.date!==intent.date||i.before!==intent.before||i.start!==intent.start||i.ok!==intent.ok||width!==h.width||height!==h.height
      ||h.slot?.start!==slot?.start||h.slot?.end!==slot?.end)setHeld({...h,intent,slot,column,width,height});
  }
  async function onDragEnd(_:DragEndEvent){
    const h=held;snap.current=null;setGesture(false);
    if(!h)return;
    // The copy keeps rendering while it settles onto the block, now aligned with it.
    setHeld({...h,dropping:true});
    if(dropTimer.current)clearTimeout(dropTimer.current);
    dropTimer.current=setTimeout(()=>setHeld(x=>x?.dropping?null:x),reduced()?0:160);
    if(h.intent.zone==='none'||!h.intent.ok)return;
    // The dropped block stays where it was put until the store answers; a failure lets it spring back.
    setPending(h.intent);
    await drop(h.intent);
    setPending(null);
  }
  const snapModifier:Modifier=({transform})=>{const s=snap.current,o=start.current;return s&&o?{...transform,x:s.left-o.left,y:s.top-o.top}:transform;};
  // A short, non-bouncy handoff to the projected destination.
  const dropAnimation:DropAnimation={
    duration:reduced()?0:140,easing:'cubic-bezier(.16,1,.3,1)',
    keyframes:({transform})=>[{transform:`translate3d(${transform.initial.x}px,${transform.initial.y}px,0)`},{transform:`translate3d(${transform.final.x}px,${transform.final.y}px,0)`}],
    sideEffects:defaultDropAnimationSideEffects({styles:{active:{opacity:'0'}}})
  };
  return <DragCtx.Provider value={{held,pending,tasks,pushed,register}}>
    <DndContext sensors={sensors} accessibility={accessibility} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={()=>{if(dropTimer.current)clearTimeout(dropTimer.current);setHeld(null);snap.current=null;setGesture(false);}} autoScroll={false}>
      {children}
      <DragOverlay modifiers={[snapModifier]} dropAnimation={dropAnimation}>{held&&<HeldBlock held={held} out={pushed.length}/>}</DragOverlay>
    </DndContext>
  </DragCtx.Provider>;
}

// How much harder biting and letting go are right now. Like a scroll view's directional lock, but soft: the vertical share of
// recent motion (y/(x+y+REST)) takes up to STRETCH× the distance; a pause lets it fade, so a deliberate sideways push still bites.
const STRETCH=3,REST=.6,FADE_MS=120;
function steadiness(m:{x:number;y:number;px:number;py:number;t:number},px:number,py:number){
  const t=performance.now(),dt=Math.max(1,t-m.t),k=1-Math.exp(-dt/FADE_MS),frame=16/dt;
  m.x+=k*(Math.abs(px-m.px)*frame-m.x);m.y+=k*(Math.abs(py-m.py)*frame-m.y);m.px=px;m.py=py;m.t=t;
  return 1+(STRETCH-1)*m.y/(m.x+m.y+REST);
}

function HeldBlock({held,out}:{held:Held;out:number}){
  const {task,intent,slot,width,height}=held,rail=intent.zone==='rail',fixedLook=rail||(!!task.starts_at&&intent.zone==='none'),bad=!intent.ok;
  const at=rail?{start:intent.start!,end:intent.start!+task.duration}:intent.zone==='body'?slot:null;
  // Keep the same point under the pointer as the copy changes width or height between surfaces.
  const shiftX=rail?0:-held.grabX*(width/held.startRect.width-1),shiftY=rail?0:-held.grabY*(height/held.startRect.height-1);
  return <motion.div className={'blk held '+(held.column?'column ':'')+(fixedLook?'fixed':'flow')+(height<(held.column?47:56)?' compact':'')+(bad?' bad':'')+(!rail&&slot?.over&&intent.zone==='body'?' over':'')} style={{width,height,marginLeft:shiftX,marginTop:shiftY}}
    initial={false} animate={{x:bad?[0,-4,3,-2,0]:0}} transition={{x:{duration:reduced()?0:.18}}}>
    <div className="tile">
      {/* Latching, the clasp shoots out of the runner and seats on the rail: fast, no overshoot. */}
      {fixedLook&&<motion.span className="latch" style={{transformOrigin:'0 50%'}} initial={rail?{scaleX:.15}:false} animate={{scaleX:1}} transition={{duration:.09,ease:[.2,.9,.3,1]}}><Lock open/></motion.span>}
      <span className="chk"/>
      <span className="main"><span className="ttl-row"><span className="ttl">{task.title}</span></span><span className="meta">{at?`${time(at.start)}–${time(at.end)}`:formatDuration(task.duration)}</span></span>
    </div>
    {bad&&!held.dropping&&<span className="held-why">{intent.reason}</span>}
    {!bad&&out>0&&!held.dropping&&<span className="held-why out">근무 외 {out}개</span>}
  </motion.div>;
}
export const isGestureActive=()=>getState().gesture;

// Blocks that dropping `intent` would newly push past working time on its day.
function pushedBy(tasks:Task[],layouts:DayLayout[],intent:Intent|null){
  if(!intent?.ok||!intent.date)return [];
  const date=intent.date,plan=(list:Task[])=>dayPlan(date,list,dayRule(date),layouts);
  return newlyOver(plan(tasks),plan(applyIntent(tasks,intent)));
}

// How long a held change must stay put before the blocks around it move.
const DWELL_MS=200;
// `value` while `dwell` is off; while it is on, the last value that held still (same `key`) for DWELL_MS.
export function useDwell<T>(value:T,key:string,dwell:boolean):T{
  const settled=useRef(value),latest=useRef(value),[,bump]=useState(0);
  latest.current=value;if(!dwell)settled.current=value;
  useEffect(()=>{
    if(!dwell)return;
    const t=setTimeout(()=>{settled.current=latest.current;bump(n=>n+1);},DWELL_MS);
    return ()=>clearTimeout(t);
  },[key,dwell]);
  return dwell?settled.current:value;
}
