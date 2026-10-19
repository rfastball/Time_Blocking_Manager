import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {DndContext,DragOverlay,PointerSensor,TouchSensor,useSensor,useSensors,type DragEndEvent,type DragMoveEvent,type DragStartEvent,type DropAnimation,type Modifier,type Active} from '@dnd-kit/core';
import {applyIntent,carried,noIntent,type Intent} from '../../intent.ts';
import {dayPlan,newlyOver,overrunEnd} from '../../today.ts';
import {arrive,listIndex,pace,spaceZone,steadiness,type Geometry,type Passage,type Slot,type Travel} from '../../drag-zone.ts';
import {createTimeAxis,timeAxisForDays,type TimeAxis} from '../../time-axis.ts';
import type {DayLayout,Task} from '../../types.ts';
import {quotedObject} from '../../format.ts';
import {getState,setUi,useApp} from '../store/state.ts';
import {dayRule,drop,setGesture} from '../store/tasks.ts';
import {selectedTasks} from '../store/bench.ts';
import {waiting} from '../../bench.ts';
import {reduced} from '../ui/motion.ts';
import {HeldBlock} from './HeldBlock.tsx';

// Places where a held block can land. Day spaces know their time axis; the others take a date or send work back to 준비.
// The 준비 lists (inbox, shelf) say what they hold top to bottom, so a drop index comes from the same heights they draw.
// `form`: the box a held block takes over the region (its destination's shape); none keeps the shape it was lifted with.
// `density`: how much of the block its destination shows — full, narrow (a week column), line (a 2주 title), bar (a 월 load segment).
export type Form={width:number;height:number;density?:Density};
export type Density='full'|'narrow'|'line'|'bar';
export type ListModel={gap:number;items:()=>{id:string;height:number}[];top?:()=>number};
type RegionExtra={axis?:TimeAxis;geometry?:Geometry;list?:ListModel;form?:(task:Task,ids:string[])=>Form|null};
type Region={key:string;kind:'space'|'date'|'tray'|'inbox'|'shelf'|'wait';date:string|null;el:HTMLElement}&RegionExtra;
// `ids`: every block carried (a selection), in order.
// `passing`: the hand is crossing a place it has not come to rest on; the copy keeps the shape and `look` (the zone it was
// last shaped by) of the place before, and that place's preview stays, while `intent` already says where a release would land.
// `ready`: the day whose rail the block can be pushed into now (it has come into that day's order).
export type Held={task:Task;ids:string[];intent:Intent;ready?:string|null;slot:Slot|null;column:boolean;density?:Density;boundary?:boolean;axis?:TimeAxis;startRect:{left:number;top:number;width:number;height:number};grabX:number;grabY:number;width:number;height:number;dropping?:boolean;passing?:boolean;look?:Intent['zone']};
// `pushed`: blocks the shown change would newly put past working time.
type Ctx={held:Held|null;pending:Intent|null;tasks:Task[];pushed:string[];register:(r:Region)=>()=>void};
const DragCtx=createContext<Ctx>({held:null,pending:null,tasks:[],pushed:[],register:()=>()=>{}});
export const useDrag=()=>useContext(DragCtx);
// The place a held block would land on if let go now, once the hand has come to it; nothing while it lands.
export const aimedAt=(held:Held|null,zone:Intent['zone'],date?:string)=>!!held&&!held.dropping&&!held.passing&&held.intent.zone===zone&&(date===undefined||held.intent.date===date);

// Registers an element as a landing region while mounted.
export function useRegion(kind:Region['kind'],date:string|null,extra:RegionExtra={}){
  const {register}=useDrag(),key=useRef(Math.random().toString(36).slice(2)).current,off=useRef<(()=>void)|null>(null);
  const extraRef=useRef(extra);extraRef.current=extra;
  return useCallback((el:HTMLElement|null)=>{
    off.current?.();off.current=null;
    if(el)off.current=register({key,kind,date,el,get axis(){return extraRef.current.axis;},get geometry(){return extraRef.current.geometry;},get list(){return extraRef.current.list;},get form(){return extraRef.current.form;}} as Region);
  },[register,kind,date,key]);
}

// The days' shared time axis, stretched to show flow work that runs past working time.
// While a block is held it only grows, so the space under the pointer never moves.
export function useDaysAxis(dates:string[],scale:number){
  const {snapshot}=useApp(),{tasks}=useDrag();
  const axis=timeAxisForDays(dates.map(dayRule),scale);
  const ends=[snapshot?.tasks??[],tasks].flatMap(list=>dates.map(d=>overrunEnd(dayPlan(d,list,dayRule(d),snapshot?.layouts??[]))??0));
  const end=Math.max(...ends);
  const starts=dates.flatMap(d=>dayPlan(d,snapshot?.tasks??[],dayRule(d),snapshot?.layouts??[]).items.map(i=>i.start));
  const start=Math.max(0,Math.min(axis.start,...starts.map(m=>m-30)));
  return createTimeAxis(start,Math.max(axis.end,Math.min(1440,end+30),end),scale);
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
  // Recent motion per axis; its vertical share is the budget up/down travel has taken.
  const travel=useRef<Travel>({x:0,y:0,px:0,py:0,t:0});
  const stretch=useRef(1);
  const snap=useRef<{left:number;top:number}|null>(null);
  type Landing={held:Held;intent:Intent;valid:boolean;animating:boolean;saved?:Promise<boolean>};
  const landing=useRef<Landing|null>(null);
  const start=useRef<Held['startRect']|null>(null);
  const pointer=useRef<{x:number;y:number}|null>(null);
  const passage=useRef<Passage>({since:0});
  // The day whose order the held block has come into since it last left that day; only that day's rail can take it.
  const entered=useRef<string|null>(null);
  const watching=useRef(0);
  useEffect(()=>()=>{const dropped=landing.current;if(dropped)void saveLanding(dropped);landing.current=null;snap.current=null;cancelAnimationFrame(watching.current);setGesture(false);},[]);
  const sensors=useSensors(useSensor(MousePenSensor,{activationConstraint:{distance:5}}),useSensor(TouchSensor,{activationConstraint:{delay:250,tolerance:6}}));
  const heldRef=useRef(held);heldRef.current=held;
  // dnd-kit's own English hints and ids are replaced: blocks are lifted by pointer only, and results are announced by the app.
  const accessibility=useMemo(()=>({screenReaderInstructions:{draggable:''},announcements:{
    onDragStart:({active}:{active:Active})=>{const id=String(active.data.current?.taskId??active.id),t=getState().snapshot?.tasks.find(x=>x.id===id);return t?`${quotedObject(t.title)} 들었어요`:undefined;},
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
  const resting=useDwell(live,live?`${live.zone}|${live.date}|${live.before}|${live.start}|${live.ok}`:'',live?.zone==='rail'||!!held?.passing);
  const shown=held&&!held.dropping?resting:pending;
  const tasks=useMemo(()=>applyIntent(base,shown?.ok?shown:null),[base,shown]);
  const pushed=useMemo(()=>held&&!held.dropping?pushedBy(base,snapshot?.layouts??[],shown):[],[held,shown,base,snapshot]);

  // `grab` is where along its width the block was taken; `prev` is the last intent, for the latch's hysteresis.
  // `stretch` scales the bite and pull distances (see `steadiness`).
  function zoneAt(task:Task,px:number,py:number,grabY:number,grab:number,prev:Intent,stretch=1,ids:string[]=[task.id],lifted?:Form):{intent:Intent;region?:Region;slot?:Slot;near?:number;boundary?:boolean}{
    const intent:Intent={...noIntent(task.id),ids};
    // `inset`: a place not already under the block must be entered a little, so its shape does not flicker on the edge.
    const inside=(el:HTMLElement,inset=0)=>{
      const r=el.getBoundingClientRect();
      if(px<Math.max(0,r.left)+inset||px>Math.min(innerWidth,r.right)-inset||py<Math.max(0,r.top)+inset||py>Math.min(innerHeight,r.bottom)-inset)return null;
      // Keep the full rect for time coordinates, but only accept its visible portion.
      for(let p=el.parentElement;p;p=p.parentElement){
        const css=getComputedStyle(p),box=p.getBoundingClientRect(),left=box.left+p.clientLeft,top=box.top+p.clientTop;
        if(/auto|scroll|hidden|clip/.test(css.overflowX)&&(px<left||px>left+p.clientWidth)
          ||/auto|scroll|hidden|clip/.test(css.overflowY)&&(py<top||py>top+p.clientHeight))return null;
      }
      return r;
    };
    const all=[...regions.current.values()];
    const floating=all.find(r=>r.el.classList.contains('rail-panel')&&inside(r.el));
    if(floating){
      if(floating.kind==='wait'&&!waiting(task)&&ids.every(id=>!base.find(t=>t.id===id)?.completed))return {intent:{...intent,zone:'wait',since:getState().today},region:floating};
      if(floating.kind==='tray'&&(waiting(task)||task.plan_date&&!task.completed&&ids.length===1))return {intent:{...intent,zone:'tray'},region:floating};
    }
    // A pile from the band goes back to 준비 whole; its blocks reach a day one at a time.
    const pile=ids.length>1&&ids.every(id=>{const t=base.find(x=>x.id===id);return !!t&&waiting(t);});
    for(const region of pile?[]:all.filter(r=>r.kind==='space')){
      const r=inside(region.el);if(!r||!region.axis||!region.geometry||!region.date)continue;
      const zone=spaceZone({task,ids,tasks:base,layouts:snapshot!.layouts??[],date:region.date,rule:dayRule(region.date),axis:region.axis,geometry:region.geometry,
        rect:r,px,py,grabY,grab,prev,stretch,entered:entered.current});
      entered.current=zone.entered;
      return {...zone,region};
    }
    entered.current=null;
    const current=(region:Region)=>region.kind==='date'?prev.zone==='date'&&prev.date===region.date:prev.zone===region.kind;
    for(const kind of ['inbox','shelf','date','tray','wait'] as const)for(const region of all.filter(r=>r.kind===kind&&!(pile&&kind==='date'))){
      const r=inside(region.el,current(region)?0:EDGE);if(!r)continue;
      if((kind==='inbox'||kind==='shelf')&&region.list){
        // Before the first remaining card whose middle is below the held block's middle, as the list draws them.
        const items=region.list.items().filter(i=>!ids.includes(i.id)),h=(region.form?.(task,ids)??lifted)?.height??0;
        const centre=py-(region.list.top?.()??r.top)-grabY*h+h/2;
        return {intent:{...intent,zone:kind,index:listIndex(items,region.list.gap,centre)},region};
      }
      if(kind==='tray')return waiting(task)||task.plan_date&&!task.completed&&ids.length===1?{intent:{...intent,zone:'tray'},region}:{intent};
      // Out to the band: anything open that is not already waiting there.
      if(kind==='wait')return !waiting(task)&&ids.every(id=>!base.find(t=>t.id===id)?.completed)?{intent:{...intent,zone:'wait',since:getState().today},region}:{intent,region};
      return {intent:{...intent,zone:'date',date:region.date},region};
    }
    return {intent};
  }

  function onDragStart(e:DragStartEvent){
    const data=e.active.data.current as {taskId?:string;ids?:string[]}|undefined;
    const id=String(data?.taskId??e.active.id),task=base.find(t=>t.id===id);if(!task)return;
    // The shelf's ceiling carries the whole shelf; a block inside a 준비 selection carries the selection, in screen order.
    const sel=getState().ui.benchSelection;
    const ids=data?.ids?.length?data.ids:sel.length>1&&sel.includes(id)?selectedTasks().map(t=>t.id):[id];
    if(!ids.length)return;
    if(landing.current)return;
    // dnd-kit measures after this callback; read the block's own box so the copy starts exactly on it.
    const node=(e.activatorEvent.target as HTMLElement).closest<HTMLElement>('[data-block]')!,r=node.getBoundingClientRect();
    const {x:px,y:py}=point(e.activatorEvent!);
    pointer.current={x:px,y:py};
    start.current={left:r.left,top:r.top,width:r.width,height:r.height};
    // Lifted from a day's order, it is already in that day: the push toward the rail can start with the lift.
    snap.current=null;passage.current={since:0};
    entered.current=[...regions.current.values()].find(r=>r.kind==='space'&&r.el.contains(node))?.date??null;
    travel.current={x:0,y:0,px,py,t:performance.now()};
    stretch.current=1;
    setGesture(true);setUi({contextMenu:null});
    setHeld({task,ids,intent:{...noIntent(task.id),ids},slot:null,column:false,startRect:start.current,grabX:px-r.left,grabY:py-r.top,width:r.width,height:r.height});
  }
  function onDragMove(e:DragMoveEvent){
    const h=held,s=start.current;if(!h||!s||h.dropping)return;
    const a=point(e.activatorEvent!),{x:px,y:py}=pointer.current??{x:a.x+e.delta.x,y:a.y+e.delta.y};
    stretch.current=steadiness(travel.current,px,py,performance.now());
    moveHeld(h,s,px,py);
  }
  // Passing through a place, it asks again a frame later whether the hand has come to it.
  function arrived(key:string){
    const t=performance.now();
    if(arrive(passage.current,key,t,pace(travel.current,t)))return true;
    watching.current||=requestAnimationFrame(()=>{
      watching.current=0;const h=heldRef.current,s=start.current,q=pointer.current;
      if(h&&!h.dropping&&s&&q)moveRef.current(h,s,q.x,q.y);
    });
    return false;
  }
  function moveHeld(h:Held,s:Held['startRect'],px:number,py:number){
    const {intent,region,slot=null,near=0,boundary=false}=zoneAt(h.task,px,py,h.grabY/s.height,h.grabX/s.width,h.intent,stretch.current,h.ids,s);
    const passing=!arrived(region?.key??'none'),ready=h.ids.length===1?entered.current:null;
    const rect=region?.el.getBoundingClientRect(),g=region?.geometry,axis=region?.axis;
    // Only the rail constrains the hand to a 15-minute tick; the hollow carries the projected order slot.
    snap.current=!passing&&rect&&g&&axis&&intent.zone==='rail'?{left:rect.left+g.fixedLeft+near*g.give,top:rect.top+axis.position(intent.start!)+1}:null;
    const form=region?.form?.(h.task,h.ids)??null;
    const width=form?form.width:rect&&g?(intent.zone==='rail'?rect.width-g.fixedLeft-g.right:intent.zone==='body'?rect.width-g.flowLeft-g.right:s.width):s.width;
    const at=intent.zone==='rail'?intent.start:null;
    const duration=h.ids.reduce((n,id)=>n+(base.find(t=>t.id===id)?.duration??0),0);
    const height=form?form.height:axis?Math.max(10,at!==null?axis.position(at+duration)-axis.position(at)-2:duration*axis.scale-2):s.height;
    const column=g?.ruler===0,density:Density=form?.density??(column?'narrow':'full');
    // Passing through, the copy stays as the last place made it.
    const shape=passing?{column:h.column,density:h.density,width:h.width,height:h.height,axis:h.axis,look:h.look}:{column,density,width,height,axis,look:intent.zone};
    const i=h.intent;
    if(h.column!==shape.column||h.density!==shape.density||i.zone!==intent.zone||i.date!==intent.date||i.before!==intent.before||i.start!==intent.start||i.ok!==intent.ok||shape.width!==h.width||shape.height!==h.height||h.boundary!==boundary
      ||i.index!==intent.index||h.passing!==passing||h.look!==shape.look||h.ready!==ready
      ||h.slot?.start!==slot?.start||h.slot?.end!==slot?.end)setHeld({...h,intent,slot,boundary,passing,ready,...shape});
  }
  const moveRef=useRef(moveHeld);moveRef.current=moveHeld;
  useEffect(()=>{
    const track=(e:Event)=>{if(heldRef.current&&!heldRef.current.dropping)pointer.current=point(e);};
    const scroll=()=>{const h=heldRef.current,s=start.current,p=pointer.current;if(h&&!h.dropping&&s&&p)moveHeld(h,s,p.x,p.y);};
    const events=['pointermove','pointerup','touchmove','touchend'];
    events.forEach(event=>window.addEventListener(event,track,true));
    document.addEventListener('scroll',scroll,true);
    return ()=>{events.forEach(event=>window.removeEventListener(event,track,true));document.removeEventListener('scroll',scroll,true);};
  },[snapshot]);
  function onDragEnd(e:DragEndEvent){
    const h=heldRef.current;
    if(!h)return;
    const a=point(e.activatorEvent!),p=pointer.current??{x:a.x+e.delta.x,y:a.y+e.delta.y};
    const intent=zoneAt(h.task,p.x,p.y,h.grabY/h.startRect.height,h.grabX/h.startRect.width,h.intent,stretch.current,h.ids,h.startRect).intent;
    beginLanding(h,intent,intent.zone!=='none'&&intent.ok);
  }
  function saveLanding(dropped:Landing){
    return dropped.saved??=dropped.valid?drop(dropped.intent):Promise.resolve(false);
  }
  function finishLanding(dropped:Landing){
    if(landing.current===dropped){landing.current=null;snap.current=null;setHeld(null);setPending(null);setGesture(false);}
  }
  function beginLanding(h:Held,intent:Intent,valid:boolean){
    const dropped:Landing={held:h,intent,valid,animating:false};landing.current=dropped;
    // Keep the released copy until persistence and the handoff to the saved destination finish.
    setHeld({...h,intent,dropping:true});
    // dnd-kit can skip animation when the source disappears; saving must still complete once.
    requestAnimationFrame(()=>requestAnimationFrame(async()=>{
      if(dropped.animating)return;
      try{await saveLanding(dropped);}finally{finishLanding(dropped);}
    }));
  }
  const snapModifier:Modifier=({transform})=>{const s=snap.current,o=start.current;return s&&o?{...transform,x:s.left-o.left,y:s.top-o.top}:transform;};
  function savedTarget(h:Held,intent:Intent,saved:boolean){
    const task=getState().snapshot?.tasks.find(t=>t.id===h.task.id);if(!task)return null;
    const id=CSS.escape(task.id),all=[...regions.current.values()];
    const floating=saved?document.querySelector<HTMLElement>(`.rail-panel [data-flight="${id}"]`):null;
    if(floating)return floating;
    for(const r of all){
      if(r.kind==='inbox'||r.kind==='shelf'){const card=r.el.querySelector<HTMLElement>(`[data-card="${id}"]`);if(card)return card;continue;}
      if(r.kind==='wait'){const card=r.el.querySelector<HTMLElement>(`[data-flight="${id}"]`);if(card)return card;continue;}
      if((r.kind==='space'||r.kind==='date')&&r.date!==task.plan_date)continue;
      const block=r.el.querySelector<HTMLElement>(`[data-task="${id}"]`)?.closest<HTMLElement>('[data-block]');if(block)return block;
    }
    return null;
  }
  // dnd-kit's default targets the old draggable. Measure the saved node after the store answers instead.
  const dropAnimation:DropAnimation=async({active,dragOverlay,transform})=>{
    const dropped=landing.current;if(!dropped)return;
    dropped.animating=true;
    try{
      // Start the write after dnd-kit captures the source node, which a successful move may unmount.
      if(dropped.valid)setPending(dropped.intent);
      const saved=await saveLanding(dropped);
      if(landing.current!==dropped)return;
      if(!saved)setPending(null);
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      if(landing.current!==dropped)return;
      const target=savedTarget(dropped.held,dropped.intent,saved)??(!saved&&active.node.isConnected?active.node:null);
      // The copy settles into the saved block's box: its place and its shape together.
      const rect=target?.getBoundingClientRect(),copy=dragOverlay.node.querySelector<HTMLElement>('.held'),box=copy?.getBoundingClientRect()??dragOverlay.rect;
      const translate=(x:number,y:number)=>`translate3d(${x}px,${y}px,0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`;
      if(!reduced()){
        const options:KeyframeAnimationOptions={duration:LAND_MS,easing:'cubic-bezier(.16,1,.3,1)',fill:'forwards'};
        const animation=dragOverlay.node.animate(rect?[
          {transform:translate(transform.x,transform.y)},
          {transform:translate(transform.x+rect.left-box.left,transform.y+rect.top-box.top)}
        ]:[{opacity:1},{opacity:0}],options);
        const reshape=rect&&copy&&(Math.abs(rect.width-box.width)>1||Math.abs(rect.height-box.height)>1)
          ?copy.animate([{width:box.width+'px',height:box.height+'px'},{width:rect.width+'px',height:rect.height+'px'}],options):null;
        await Promise.all([animation.finished,reshape?.finished].map(p=>p?.catch(()=>{})));
      }
    }finally{
      finishLanding(dropped);
    }
  };
  return <DragCtx.Provider value={{held,pending,tasks,pushed,register}}>
    <DndContext sensors={sensors} accessibility={accessibility} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={()=>{const h=heldRef.current;if(h)beginLanding(h,h.intent,false);else setGesture(false);}} autoScroll={false}>
      {children}
      <DragOverlay modifiers={[snapModifier]} dropAnimation={dropAnimation}>{held&&<HeldBlock held={held} out={pushed.length} outside={shownOutside(tasks,snapshot?.layouts??[],shown)}/>}</DragOverlay>
    </DndContext>
  </DragCtx.Provider>;
}

export const isGestureActive=()=>getState().gesture;

// The minutes past working time on a date drop's day, as it would be laid out.
function shownOutside(tasks:Task[],layouts:DayLayout[],intent:Intent|null){
  if(intent?.zone!=='date'||!intent.date)return 0;
  return dayPlan(intent.date,tasks,dayRule(intent.date),layouts).items.reduce((n,i)=>n+i.outside,0);
}

// Blocks that dropping `intent` would newly push past working time on its day.
function pushedBy(tasks:Task[],layouts:DayLayout[],intent:Intent|null){
  if(!intent?.ok||!intent.date)return [];
  const date=intent.date,plan=(list:Task[])=>dayPlan(date,list,dayRule(date),layouts);
  return newlyOver(plan(tasks),plan(applyIntent(tasks,intent)));
}

// A drop settling into its saved box.
const LAND_MS=160;
// How far into a place the block must come before it counts as there.
const EDGE=4;
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
