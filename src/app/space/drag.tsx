import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {DndContext,DragOverlay,PointerSensor,TouchSensor,useSensor,useSensors,type DragEndEvent,type DragMoveEvent,type DragStartEvent,type DropAnimation,type Modifier,type Active} from '@dnd-kit/core';
import {motion} from 'motion/react';
import {applyIntent,carried,noIntent,type Intent} from '../../intent.ts';
import {benchPiles,BOARD_CARD_WIDTH,BOARD_CARD_HEIGHT,seedBoardPositions} from '../../bench.ts';
import {dayPlan,newlyOver,overrunEnd} from '../../today.ts';
import {insertionBefore} from '../../flow.ts';
import {placementIssue,resistWorkingBoundary} from '../../placement.ts';
import {createTimeAxis,timeAxisForDays,type TimeAxis} from '../../time-axis.ts';
import type {DayLayout,Task} from '../../types.ts';
import {formatDuration} from '../../format.ts';
import {dateOf,time} from '../../dates.ts';
import {getState,setUi,useApp} from '../store/state.ts';
import {dayRule,drop,setGesture} from '../store/tasks.ts';
import {reduced} from '../ui/motion.ts';
import {Lock} from '../ui/icons.tsx';
import {OffHours} from './OffHours.tsx';

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
// The bench is one region; its piles, handles and cards are read from the DOM (data-pile, data-pile-handle, data-card).
export type BoardView={x:number;y:number;zoom:number};
type Region={key:string;kind:'space'|'date'|'tray'|'bench'|'canvas';date:string|null;el:HTMLElement;axis?:TimeAxis;geometry?:Geometry;board?:BoardView};
// The hollow marks the body slot; the held copy follows the hand until it latches onto a rail tick.
type Slot={start:number;end:number;over:boolean};
// `ids`: every block carried (a selection or a whole pile), `carry`: the pile carried by its handle.
export type Held={task:Task;ids:string[];carry?:{pile:string|null};origins?:{id:string;x:number;y:number}[];intent:Intent;slot:Slot|null;column:boolean;boundary?:boolean;axis?:TimeAxis;startRect:{left:number;top:number;width:number;height:number};grabX:number;grabY:number;width:number;height:number;dropping?:boolean};
// `pushed`: blocks the shown change would newly put past working time.
type Ctx={held:Held|null;pending:Intent|null;tasks:Task[];pushed:string[];register:(r:Region)=>()=>void};
const DragCtx=createContext<Ctx>({held:null,pending:null,tasks:[],pushed:[],register:()=>()=>{}});
export const useDrag=()=>useContext(DragCtx);

// Registers an element as a landing region while mounted.
export function useRegion(kind:Region['kind'],date:string|null,extra:{axis?:TimeAxis;geometry?:Geometry;board?:BoardView}={}){
  const {register}=useDrag(),key=useRef(Math.random().toString(36).slice(2)).current,off=useRef<(()=>void)|null>(null);
  const extraRef=useRef(extra);extraRef.current=extra;
  return useCallback((el:HTMLElement|null)=>{
    off.current?.();off.current=null;
    if(el)off.current=register({key,kind,date,el,get axis(){return extraRef.current.axis;},get geometry(){return extraRef.current.geometry;},get board(){return extraRef.current.board;}} as Region);
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
  // Recent motion per axis, px per frame, fading over about 120ms. Its vertical share is the budget up/down travel has taken.
  const travel=useRef({x:0,y:0,px:0,py:0,t:0});
  const stretch=useRef(1);
  const snap=useRef<{left:number;top:number}|null>(null);
  type Landing={held:Held;intent:Intent;valid:boolean;animating:boolean;saved?:Promise<boolean>};
  const landing=useRef<Landing|null>(null);
  const start=useRef<Held['startRect']|null>(null);
  const pointer=useRef<{x:number;y:number}|null>(null);
  useEffect(()=>()=>{const dropped=landing.current;if(dropped)void saveLanding(dropped);landing.current=null;snap.current=null;setGesture(false);},[]);
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
  const shown=held&&!held.dropping?resting:pending;
  const tasks=useMemo(()=>applyIntent(base,shown?.ok?shown:null),[base,shown]);
  const pushed=useMemo(()=>held&&!held.dropping?pushedBy(base,snapshot?.layouts??[],shown):[],[held,shown,base,snapshot]);

  // `grab` is where along its width the block was taken; `prev` is the last intent, for the latch's hysteresis.
  // `near` is how far the block has been pushed toward biting (or, latched, pulled toward letting go), 0–1.
  // `stretch` scales both distances: 1 when the hand is still or moving sideways, up to STRETCH while it travels up or down.
  function zoneAt(task:Task,px:number,py:number,grabY:number,grab:number,prev:Intent,stretch=1,ids:string[]=[task.id],carry?:Held['carry']):{intent:Intent;region?:Region;slot?:Slot;near?:number;boundary?:boolean}{
    const intent:Intent={...noIntent(task.id),ids,carry};
    const inside=(el:HTMLElement)=>{
      const r=el.getBoundingClientRect();
      if(px<Math.max(0,r.left)||px>Math.min(innerWidth,r.right)||py<Math.max(0,r.top)||py>Math.min(innerHeight,r.bottom))return null;
      // Keep the full rect for time coordinates, but only accept its visible portion.
      for(let p=el.parentElement;p;p=p.parentElement){
        const css=getComputedStyle(p),box=p.getBoundingClientRect(),left=box.left+p.clientLeft,top=box.top+p.clientTop;
        if(/auto|scroll|hidden|clip/.test(css.overflowX)&&(px<left||px>left+p.clientWidth)
          ||/auto|scroll|hidden|clip/.test(css.overflowY)&&(py<top||py>top+p.clientHeight))return null;
      }
      return r;
    };
    const all=[...regions.current.values()];
    for(const region of all.filter(r=>r.kind==='space')){
      const r=inside(region.el);if(!r||!region.axis||!region.geometry||!region.date)continue;
      const duration=ids.reduce((n,id)=>n+(base.find(t=>t.id===id)?.duration??0),0);
      const {axis,geometry:g,date}=region,topIn=py-r.top-grabY*Math.max(10,duration*axis.scale-2),rule=dayRule(date),layouts=snapshot!.layouts??[];
      // A fixed block starts latched on its own day; anything latched keeps the wider fixed shape while it is measured.
      const was=prev.zone==='rail'?prev.date===date:prev.zone==='none'&&task.starts_at?.slice(0,10)===date;
      const edge=px-r.left-grab*(r.width-(was?g.fixedLeft:g.flowLeft)-g.right);
      const bite=g.bite*stretch,pull=g.pull*stretch;
      if(ids.length===1&&(px-r.left<g.bodyLeft||(was?edge<g.fixedLeft+pull:edge<=g.flowLeft-bite))){
        const raw=Math.max(0,Math.min(1440-task.duration,axis.minute(py-r.top)-grabY*task.duration));
        const from=prev.date===date&&prev.zone==='rail'?prev.start!:dayPlan(date,base,rule,layouts).items.find(i=>i.task.id===task.id)?.start??rule.start;
        const resisted=resistWorkingBoundary(from,raw,task.duration,rule,axis.position);
        const minute=Math.round(resisted/15)*15;
        const reason=placementIssue(task.id,date,minute,task.duration,rule,base)?.label??null;
        return {intent:{...intent,zone:'rail',date,start:minute,ok:!reason,reason},region,boundary:resisted!==raw,near:was?Math.max(0,Math.min(1,(edge-g.fixedLeft)/pull)):0};
      }
      const rest=dayPlan(date,base.filter(t=>!ids.includes(t.id)),rule,layouts);
      const centre=axis.minute(topIn+duration*axis.scale/2),flows=rest.items.filter(i=>!i.fixed);
      const body:Intent={...intent,zone:'body',date,before:insertionBefore(flows,centre),ok:true,reason:null};
      const near=Math.max(0,Math.min(1,(g.flowLeft-edge)/bite));
      const items=dayPlan(date,applyIntent(base,body),rule,layouts).items.filter(i=>ids.includes(i.task.id));
      return {intent:body,region,near,slot:items.length?{start:items[0].start,end:items[items.length-1].end,over:items.some(i=>i.over)}:undefined};
    }
    for(const kind of ['canvas','bench','date','tray'] as const)for(const region of all.filter(r=>r.kind===kind)){
      const r=inside(region.el);if(!r)continue;
      if(kind==='canvas'&&region.board){
        const v=region.board,origins=heldRef.current?.origins??ids.map((id,n)=>({id,x:n*(BOARD_CARD_WIDTH+24),y:0}));
        const anchor=origins.find(p=>p.id===task.id)??origins[0];
        const dx=(px-r.left-region.el.clientLeft-v.x)/v.zoom-grab*BOARD_CARD_WIDTH-anchor.x,dy=(py-r.top-region.el.clientTop-v.y)/v.zoom-grabY*BOARD_CARD_HEIGHT-anchor.y;
        const mx=Math.max(-100000-Math.min(...origins.map(p=>p.x)),Math.min(100000-Math.max(...origins.map(p=>p.x)),Math.round(dx)));
        const my=Math.max(-100000-Math.min(...origins.map(p=>p.y)),Math.min(100000-Math.max(...origins.map(p=>p.y)),Math.round(dy)));
        return {intent:{...intent,zone:'canvas',positions:origins.map(p=>({id:p.id,x:p.x+mx,y:p.y+my}))},region};
      }
      if(kind==='bench'){const at=benchZone(region.el,px,py,ids,carry);return at?{intent:{...intent,zone:'pile',...at},region}:{intent};}
      if(kind==='tray')return task.plan_date&&!task.completed&&ids.length===1?{intent:{...intent,zone:'tray'}}:{intent};
      return {intent:{...intent,zone:'date',date:region.date},region};
    }
    return {intent};
  }

  function onDragStart(e:DragStartEvent){
    const data=e.active.data.current as {taskId?:string;carry?:{pile:string|null}}|undefined;
    const seeded=seedBoardPositions(base,snapshot?.piles??[]);
    const id=String(data?.taskId??e.active.id),task=seeded.find(t=>t.id===id);if(!task)return;
    // A pile handle carries its cards; a block inside a bench selection carries the selection, in reading order.
    const sel=getState().ui.benchSelection,piles=snapshot?.piles??[];
    const ids=data?.carry?benchPiles(base,piles).find(p=>p.id===data.carry!.pile)?.cards.map(t=>t.id)??[]
      :sel.length>1&&sel.includes(id)?[...base.filter(t=>t.plan_date&&!t.completed&&sel.includes(t.id)),...seeded.filter(t=>!t.plan_date&&!t.completed&&sel.includes(t.id)).sort((a,b)=>a.board_y!-b.board_y!||a.board_x!-b.board_x!||a.id.localeCompare(b.id))].map(t=>t.id):[id];
    if(!ids.length)return;
    if(landing.current)return;
    // dnd-kit measures after this callback; read the block's own box so the copy starts exactly on it.
    const node=(e.activatorEvent.target as HTMLElement).closest<HTMLElement>('[data-block]')!,r=node.getBoundingClientRect();
    if(node.closest('.wb-canvas')&&!sel.includes(id))setUi({benchSelection:[id]});
    const {x:px,y:py}=point(e.activatorEvent!);
    pointer.current={x:px,y:py};
    start.current={left:r.left,top:r.top,width:r.width,height:r.height};
    snap.current=null;
    travel.current={x:0,y:0,px,py,t:performance.now()};
    stretch.current=1;
    setGesture(true);setUi({contextMenu:null});
    const origins=ids.map((id,n)=>{const t=seeded.find(t=>t.id===id)!;return {id,x:t.board_x??n*(BOARD_CARD_WIDTH+24),y:t.board_y??0};});
    setHeld({task,ids,origins,carry:data?.carry,intent:{...noIntent(task.id),ids,carry:data?.carry},slot:null,column:false,startRect:start.current,grabX:px-r.left,grabY:py-r.top,width:r.width,height:r.height});
  }
  function onDragMove(e:DragMoveEvent){
    const h=held,s=start.current;if(!h||!s||h.dropping)return;
    const a=point(e.activatorEvent!),{x:px,y:py}=pointer.current??{x:a.x+e.delta.x,y:a.y+e.delta.y};
    stretch.current=steadiness(travel.current,px,py);
    moveHeld(h,s,px,py);
  }
  function moveHeld(h:Held,s:Held['startRect'],px:number,py:number){
    const {intent,region,slot=null,near=0,boundary=false}=zoneAt(h.task,px,py,h.grabY/s.height,h.grabX/s.width,h.intent,stretch.current,h.ids,h.carry);
    const rect=region?.el.getBoundingClientRect(),g=region?.geometry,axis=region?.axis;
    // Only the rail constrains the hand to a 15-minute tick; the hollow carries the projected order slot.
    snap.current=rect&&g&&axis&&intent.zone==='rail'?{left:rect.left+g.fixedLeft+near*g.give,top:rect.top+axis.position(intent.start!)+1}:null;
    const width=region?.board?BOARD_CARD_WIDTH*region.board.zoom:rect&&g?(intent.zone==='rail'?rect.width-g.fixedLeft-g.right:intent.zone==='body'?rect.width-g.flowLeft-g.right:s.width):s.width;
    const at=intent.zone==='rail'?intent.start:null;
    const duration=h.ids.reduce((n,id)=>n+(base.find(t=>t.id===id)?.duration??0),0);
    const height=region?.board?BOARD_CARD_HEIGHT*region.board.zoom:axis?Math.max(10,at!==null?axis.position(at+duration)-axis.position(at)-2:duration*axis.scale-2):s.height;
    const column=g?.ruler===0;
    const i=h.intent;
    if(h.column!==column||i.zone!==intent.zone||i.date!==intent.date||i.before!==intent.before||i.start!==intent.start||i.ok!==intent.ok||width!==h.width||height!==h.height||h.boundary!==boundary
      ||i.pile!==intent.pile||i.index!==intent.index||i.create!==intent.create||JSON.stringify(i.positions)!==JSON.stringify(intent.positions)
      ||h.slot?.start!==slot?.start||h.slot?.end!==slot?.end)setHeld({...h,intent,slot,column,width,height,boundary,axis});
  }
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
    const intent=zoneAt(h.task,p.x,p.y,h.grabY/h.startRect.height,h.grabX/h.startRect.width,h.intent,stretch.current,h.ids,h.carry).intent;
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
    for(const r of all){
      if(r.kind==='canvas'&&!task.plan_date){const card=r.el.querySelector<HTMLElement>(`[data-card="${id}"]`);if(card)return card;}
      if(r.kind==='bench'){
        if(h.carry&&(!saved||intent.zone==='pile'&&intent.create!=null))return r.el.querySelector<HTMLElement>(`[data-pile="${CSS.escape(h.carry.pile??'')}"] [data-pile-handle]`);
        const scope=task.plan_date?null:r.el.querySelector(`[data-pile="${CSS.escape(task.pile_id??'')}"]`);
        const card=scope?.querySelector<HTMLElement>(`[data-card="${id}"]`);if(card)return card;
      }
      if((r.kind==='space'||r.kind==='date')&&r.date!==task.plan_date||r.kind==='bench')continue;
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
      const rect=target?.getBoundingClientRect(),from=dragOverlay.rect;
      const translate=(x:number,y:number)=>`translate3d(${x}px,${y}px,0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`;
      if(!reduced()){
        const animation=dragOverlay.node.animate(rect?[
          {transform:translate(transform.x,transform.y)},
          {transform:translate(transform.x+rect.left-from.left,transform.y+rect.top-from.top)}
        ]:[{opacity:1},{opacity:0}],{duration:140,easing:'cubic-bezier(.16,1,.3,1)',fill:'forwards'});
        await animation.finished.catch(()=>{});
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

// How much harder biting and letting go are right now. Like a scroll view's directional lock, but soft: the vertical share of
// recent motion (y/(x+y+REST)) takes up to STRETCH× the distance; a pause lets it fade, so a deliberate sideways push still bites.
const STRETCH=3,REST=.6,FADE_MS=120;
function steadiness(m:{x:number;y:number;px:number;py:number;t:number},px:number,py:number){
  const t=performance.now(),dt=Math.max(1,t-m.t),k=1-Math.exp(-dt/FADE_MS),frame=16/dt;
  m.x+=k*(Math.abs(px-m.px)*frame-m.x);m.y+=k*(Math.abs(py-m.py)*frame-m.y);m.px=px;m.py=py;m.t=t;
  return 1+(STRETCH-1)*m.y/(m.x+m.y+REST);
}

function HeldBlock({held,out,outside}:{held:Held;out:number;outside:number}){
  const {task,intent,slot,width,height}=held,rail=intent.zone==='rail',fixedLook=rail||(!!task.starts_at&&intent.zone==='none'),bad=!intent.ok;
  const many=held.ids.length,total=held.ids.reduce((n,id)=>n+(getState().snapshot?.tasks.find(t=>t.id===id)?.duration??0),0);
  // Where it lands, said only where the place itself does not show it: a date column's end, a new or stacked pile.
  const place=intent.zone==='date'&&intent.date&&held.ids.length&&!held.column&&!held.axis?`${dateOf(intent.date).getMonth()+1}월 ${dateOf(intent.date).getDate()}일 순서 끝${outside?` · 근무 외 ${Math.round(outside/60*100)/100}h`:''}`
    :intent.zone==='pile'?(held.carry?(intent.create!=null?'':'더미 합치기'):intent.create!=null?'새 더미':''):'';
  const at=rail?{start:intent.start!,end:intent.start!+task.duration}:intent.zone==='body'?slot:null;
  // Keep the same point under the pointer as the copy changes width or height between surfaces.
  const shiftX=rail?0:-held.grabX*(width/held.startRect.width-1),shiftY=rail?0:-held.grabY*(height/held.startRect.height-1);
  return <motion.div className={'blk held '+(held.column?'column ':'')+(fixedLook?'fixed':'flow')+(height<(held.column?47:56)?' compact':'')+(bad?' bad':'')+(!rail&&slot?.over&&intent.zone==='body'?' over':'')+(task.proto&&many===1?' proto':'')} style={{width,height,marginLeft:shiftX,marginTop:shiftY}}
    initial={false} animate={{x:bad?[0,-4,3,-2,0]:0}} transition={{x:{duration:reduced()?0:.18}}}>
    <div className="tile">
      {at&&intent.date&&<OffHours start={at.start} end={at.end} rule={dayRule(intent.date)} position={rail?held.axis?.position:undefined}/>}
      {/* Latching, the clasp shoots out of the runner and seats on the rail: fast, no overshoot. */}
      {fixedLook&&<motion.span className="latch" style={{transformOrigin:'0 50%'}} initial={rail?{scaleX:.15}:false} animate={{scaleX:1}} transition={{duration:.09,ease:[.2,.9,.3,1]}}><Lock open/></motion.span>}
      <span className="chk"/>
      <span className="main"><span className="ttl-row"><span className="ttl">{held.carry?held.carry.pile===null?'투입구':'더미':task.title}</span>{many>1&&<b className="held-more">{held.carry?`${many}개`:`+${many-1}`}</b>}</span>
        <span className="meta">{at?`${time(at.start)}–${time(at.end)}`:task.proto&&many===1?'':formatDuration(many>1?total:task.duration)}</span></span>
    </div>
    {place&&!bad&&!held.dropping&&<span className="held-why where">{place}</span>}
    {bad&&!held.dropping&&<span className="held-why">{intent.reason}</span>}
    {!bad&&held.boundary&&!held.dropping&&<span className="held-why boundary">근무시간 경계</span>}
    {!bad&&!held.boundary&&out>0&&!held.dropping&&<span className="held-why out">근무 외 {out}개</span>}
  </motion.div>;
}
export const isGestureActive=()=>getState().gesture;

// The minutes past working time on a date drop's day, as it would be laid out.
function shownOutside(tasks:Task[],layouts:DayLayout[],intent:Intent|null){
  if(intent?.zone!=='date'||!intent.date)return 0;
  return dayPlan(intent.date,tasks,dayRule(intent.date),layouts).items.reduce((n,i)=>n+i.outside,0);
}

// The bench target under the pointer. Over a pile: before the first card whose middle is below the pointer (its handle: the top);
// a carried pile stacks onto it. Between piles or in empty space: a new pile there (a carried pile moves there). The 투입구 stays first.
function benchZone(el:HTMLElement,px:number,py:number,ids:string[],carry?:Held['carry']):Partial<Intent>|null{
  const cols=[...el.querySelectorAll<HTMLElement>('[data-pile]')].map((node,visual)=>({node,visual,id:node.dataset.pile||null,r:node.getBoundingClientRect()}));
  if(!cols.length)return null;
  const hit=cols.find(c=>px>=c.r.left&&px<=c.r.right&&py>=c.r.top&&py<=c.r.bottom);
  if(hit){
    if(carry)return hit.id===carry.pile?null:{pile:hit.id};
    const handle=hit.node.querySelector('[data-pile-handle]')?.getBoundingClientRect();
    if(handle&&py<=handle.bottom)return {pile:hit.id,index:0};
    const cards=[...hit.node.querySelectorAll<HTMLElement>('[data-card]')].filter(c=>!ids.includes(c.dataset.card!));
    return {pile:hit.id,index:cards.filter(c=>{const b=c.getBoundingClientRect();return b.top+b.height/2<py;}).length};
  }
  // The row of piles nearest the pointer, then the gap in it.
  const gap=(c:typeof cols[number])=>py<c.r.top?c.r.top-py:py>c.r.bottom?py-c.r.bottom:0;
  const nearest=Math.min(...cols.map(gap)),row=cols.filter(c=>gap(c)===nearest);
  const left=row.filter(c=>c.r.right<=px).pop();
  const before=Math.max(1,left?left.visual+1:row[0].visual);
  if(!carry)return {create:before};
  if(carry.pile===null)return null;
  const from=cols.find(c=>c.id===carry.pile)?.visual??0;
  return {create:before>from?before-1:before};
}

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
