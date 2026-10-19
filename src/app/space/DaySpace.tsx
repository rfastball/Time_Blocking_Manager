import {useEffect,useMemo,useRef,useState,type KeyboardEvent,type MouseEvent as ReactMouseEvent,type PointerEvent as ReactPointerEvent,type ReactNode} from 'react';
import {useDraggable} from '@dnd-kit/core';
import {AnimatePresence,motion,useAnimate} from 'motion/react';
import {dayPlan,nextFlowId,type DayItem} from '../../today.ts';
import {snapDuration} from '../../detail.ts';
import {formatDuration} from '../../format.ts';
import {time} from '../../dates.ts';
import {unavailableParts,resistWorkingBoundary} from '../../placement.ts';
import type {TimeAxis} from '../../time-axis.ts';
import type {Task} from '../../types.ts';
import {setUi,useApp} from '../store/state.ts';
import {completeTasks,dayRule,issueAt,reorder,resize,setGesture,taskMinute,uncomplete} from '../store/tasks.ts';
import {blockButton} from '../editor/actions.ts';
import {openAvailability} from '../store/schedule.ts';
import {reflow,reduced} from '../ui/motion.ts';
import {follow} from '../ui/gesture.ts';
import {Icon,Lock} from '../ui/icons.tsx';
import {isGestureActive,useDrag,useDwell,useRegion} from './drag.tsx';
import {COLUMN_GEOMETRY,DAY_GEOMETRY,runnerReach,type Geometry} from '../../drag-zone.ts';
import './space.css';
import {OffHours} from './OffHours.tsx';
import {axisHours} from '../../time-axis.ts';

type Props={
  date:string;axis:TimeAxis;variant:'day'|'column';
  // The intake above the space.
  bin?:boolean;
  selected?:string|null;multi?:string[];
  onOpen:(t:Task)=>void;onMulti?:(t:Task)=>void;
  // Areas may layer their own overlays (new-block composer) over the space.
  // `children` draw inside the clipped space; `overlay` sits on the same coordinates but may spill past a narrow column.
  children?:ReactNode;overlay?:ReactNode;onBackgroundPointerDown?:(e:ReactPointerEvent<HTMLDivElement>,minute:number,onRail:boolean)=>void;
};

// One day as a space: rail and fixed latches on the left, flow blocks in order, completed work leaves through the top.
export function DaySpace({date,axis,variant,bin,selected,multi=[],onOpen,onMulti,children,overlay,onBackgroundPointerDown}:Props){
  const snapshot=useApp(s=>s.snapshot),today=useApp(s=>s.today),now=useApp(s=>s.now),landed=useApp(s=>s.ui.landed);
  const settings=useApp(s=>s.drafts.settingsDraft??s.snapshot?.settings);
  const {held,tasks,pushed}=useDrag();
  const geometry=variant==='day'?DAY_GEOMETRY:COLUMN_GEOMETRY;
  const rule=dayRule(date);
  const [squash,setSquash]=useState<string[]>([]);
  // `done`: let go, waiting for the store; the length is then shown at once.
  const [sizing,setSizing]=useState<{id:string;dur:number;done?:boolean}|null>(null);
  const spaceRef=useRegion('space',date,{axis,geometry});
  // The block being sized follows the hand; the others make way only for a length it rests on, as on the rail.
  const settled=useDwell(sizing,sizing?`${sizing.id}:${sizing.dur}`:'',!!sizing&&!sizing.done);
  const shown=useMemo(()=>settled?tasks.map(t=>t.id===settled.id?{...t,duration:settled.dur}:t):tasks,[settled,tasks]);
  const plan=useMemo(()=>dayPlan(date,shown,dayRule(date),snapshot?.layouts??[]),[date,shown,settings,snapshot?.layouts]);
  const sized=(item:DayItem)=>{
    if(sizing?.id!==item.task.id)return item;
    const end=item.start+sizing.dur,outside=unavailableParts(item.start,end,rule).reduce((n,p)=>n+p.end-p.start,0);
    return {...item,end,outside,over:outside>0};
  };
  const nextId=date===today?nextFlowId(plan.items,squash):null;
  const doneIds=new Set((snapshot?.tasks??[]).filter(t=>t.completed).map(t=>t.id));
  const holding=held;
  const anchor=Math.max(rule.start,plan.anchor??rule.start);
  const byId=(id:string)=>snapshot!.tasks.find(t=>t.id===id)!;

  async function check(t:Task){
    if(t.completed){void uncomplete(t);return;}
    if(!t.starts_at)setSquash(s=>[...s,t.id]);
    await completeTasks([t]);
    setSquash(s=>s.filter(x=>x!==t.id));
  }
  function grip(e:ReactPointerEvent<HTMLButtonElement>,t:Task){
    e.stopPropagation();e.preventDefault();
    const el=e.currentTarget,y0=e.clientY,d0=t.duration;let dur=d0;
    el.setPointerCapture(e.pointerId);setGesture(true);
    const move=(ev:PointerEvent)=>{
      let next=snapDuration(d0+(ev.clientY-y0)/axis.scale);
      if(t.starts_at&&next>dur){
        const end=taskMinute(t)+dur;
        next=resistWorkingBoundary(end-15,taskMinute(t)+next-15,15,rule,axis.position)+15-taskMinute(t);
      }
      if(next===dur||t.starts_at&&issueAt(t.id,date,taskMinute(t),next))return;
      dur=next;setSizing({id:t.id,dur});
    };
    const up=async()=>{
      setGesture(false);
      setSizing(s=>s&&{...s,done:true});
      if(dur!==d0)await resize(t,dur);
      setSizing(null);
    };
    follow(e,{move,end:()=>void up()});
  }
  // Arrow keys on a block: Alt moves a flow block in its order, otherwise the length changes by 15 minutes.
  async function nudge(id:string,delta:number,order:boolean,from:HTMLElement){
    const t=byId(id);if(t.completed)return;
    if(!order){void resize(t,Math.max(15,t.duration+delta*15));return;}
    if(t.starts_at||!t.plan_date||!await reorder(t,delta))return;
    requestAnimationFrame(()=>{const button=blockButton(id,from);button?.focus({preventScroll:true});if(button?.closest('.today-day'))button.scrollIntoView({block:'nearest'});});
  }
  function menu(e:{clientX:number;clientY:number},t:Task|null,minute:number){setUi({contextMenu:{taskId:t?.id??null,date,minute,x:e.clientX,y:e.clientY}});}
  function background(e:ReactPointerEvent<HTMLDivElement>){
    if(!onBackgroundPointerDown||e.target!==e.currentTarget&&!(e.target as HTMLElement).dataset.surface)return;
    const r=e.currentTarget.getBoundingClientRect();
    onBackgroundPointerDown(e,axis.minute(e.clientY-r.top),e.clientX-r.left<geometry.bodyLeft);
  }

  return <div className={'dayspace '+variant}>
    {bin&&<Bin tasks={plan.completed} onOpen={onOpen}/>}
    <div className="space-wrap">
    <div ref={spaceRef} data-surface="true" className={'space'+(holding?.ready===date?' armed':'')+(!holding?.passing&&holding?.intent.zone==='rail'&&holding.intent.date===date?' latched':'')} style={{height:axis.height}} onPointerDown={background}
      onContextMenu={e=>{if(e.target!==e.currentTarget)return;e.preventDefault();const r=e.currentTarget.getBoundingClientRect();menu(e,null,Math.round(axis.minute(e.clientY-r.top)/15)*15);}}>
      <Ground axis={axis} rule={rule} geometry={geometry} date={date}/>
      <motion.div className="shutter" aria-hidden="true" style={{left:geometry.railLeft+1,width:geometry.railWidth-2,top:axis.position(rule.start),visibility:anchor>rule.start?'visible':'hidden'}}
        animate={{height:Math.max(0,axis.position(anchor)-axis.position(rule.start))}} transition={reduced()?{duration:0}:reflow}/>
      {/* The ceiling flow work is drawn up against: the shutter's edge carried across the body. */}
      {plan.items.some(i=>!i.fixed)&&<motion.div className="ceiling" aria-hidden="true" style={{left:geometry.railLeft+geometry.railWidth}}
        initial={false} animate={{top:axis.position(anchor)}} transition={reduced()?{duration:0}:reflow}/>}
      {date===today&&<AnchorFlash top={axis.position(anchor)} left={geometry.railLeft} anchor={anchor}/>}
      <AnimatePresence initial={false} custom={doneIds}>
        {plan.items.map(item=><Block key={item.task.id} date={date} item={sized(item)} pushed={pushed.includes(item.task.id)} axis={axis} geometry={geometry} variant={variant} next={item.task.id===nextId}
          hollow={!!holding?.ids.includes(item.task.id)} resizing={sizing?.id===item.task.id} selected={selected===item.task.id&&!multi.length} multi={multi.includes(item.task.id)} squash={squash.includes(item.task.id)}
          landed={landed?.id===item.task.id?landed:null}
          onCheck={()=>void check(byId(item.task.id))} onGrip={e=>grip(e,byId(item.task.id))} onNudge={(d,order,el)=>void nudge(item.task.id,d,order,el)}
          onOpen={e=>{if((e.shiftKey||e.ctrlKey||e.metaKey)&&onMulti){onMulti(byId(item.task.id));return;}onOpen(byId(item.task.id));}}
          onMenu={e=>menu(e,byId(item.task.id),item.start)}/>)}
      </AnimatePresence>
      {rule.enabled&&<AfterHours axis={axis} rule={rule} geometry={geometry} date={date}/>}
      {!holding?.passing&&holding?.intent.zone==='rail'&&holding.intent.date===date&&<span className={'railtag'+(holding.intent.ok?'':' bad')} style={{top:axis.position(holding.intent.start!),left:geometry.railLeft-46}}>{time(holding.intent.start!)}</span>}
      {date===today&&now>=axis.start&&now<=axis.end&&<div className="nowline" style={{top:axis.position(now),left:Math.max(0,geometry.railLeft-22)}}>{variant==='day'&&<span>{time(now)}</span>}</div>}
      {children}
    </div>
    {overlay}
    </div>
  </div>;
}

type GroundProps={axis:TimeAxis;rule:ReturnType<typeof dayRule>;geometry:Geometry;date:string};
const bandOf=(axis:TimeAxis,start:number,end:number)=>({top:axis.position(start),height:Math.max(0,axis.position(end)-axis.position(start))});
function Ground({axis,rule,geometry:g,date}:GroundProps){
  const hours=axisHours(axis);
  const band=(start:number,end:number)=>bandOf(axis,start,end);
  return <>
    {rule.enabled?<button type="button" className="off" style={{left:g.bodyLeft-4,...band(0,rule.start)}} aria-label={`${time(rule.start)} 이전 근무 외 시간 조정`} onClick={e=>openAvailability(date,'work',e.clientX,e.clientY)}/>
    :<button type="button" className="off" style={{left:g.bodyLeft-4,...band(0,1440)}} aria-label="휴무일 근무시간 조정" onClick={e=>openAvailability(date,'work',e.clientX,e.clientY)}><span>휴무</span></button>}
    {hours.map(m=><div key={m} className="hl" style={{top:axis.position(m),left:g.bodyLeft}}/>)}
    {g.ruler>0&&<div className="ruler" aria-hidden="true" style={{width:g.ruler}}>{hours.map(m=><span key={m} style={{top:axis.position(m)}}>{String(m/60).padStart(2,'0')}</span>)}</div>}
    <div className="rail" data-surface="true" aria-hidden="true" style={{left:g.railLeft,width:g.railWidth}}/>
    {rule.enabled&&rule.breaks.map((b,i)=><button type="button" key={i} className="brk" style={{left:g.railLeft+g.railWidth,...band(b.start,b.end)}}
      aria-label={`${b.label} ${time(b.start)}–${time(b.end)} 조정`} onClick={e=>openAvailability(date,i,e.clientX,e.clientY)}><span>{b.label}</span></button>)}
    {rule.enabled&&<div className="floor" style={{left:g.railLeft,top:axis.position(rule.end)}}/>}
  </>;
}
// After the blocks in the DOM, so the keyboard reaches the evening after the day's work.
function AfterHours({axis,rule,geometry:g,date}:GroundProps){
  return <button type="button" className="off" style={{left:g.bodyLeft-4,...bandOf(axis,rule.end,1440)}} aria-label={`${time(rule.end)} 이후 근무 외 시간 조정`} onClick={e=>openAvailability(date,'work',e.clientX,e.clientY)}/>;
}

function AnchorFlash({top,left,anchor}:{top:number;left:number;anchor:number}){
  const last=useRef(anchor),[show,setShow]=useState(false);
  useEffect(()=>{if(anchor>last.current){setShow(true);const t=setTimeout(()=>setShow(false),1200);last.current=anchor;return()=>clearTimeout(t);}last.current=anchor;},[anchor]);
  return <AnimatePresence>{show&&<motion.div className="flash" style={{top,left}} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}><span>{time(anchor)} 기준</span></motion.div>}</AnimatePresence>;
}

function Bin({tasks,onOpen}:{tasks:Task[];onOpen:(t:Task)=>void}){
  const [scope,animate]=useAnimate(),count=useRef(tasks.length);
  useEffect(()=>{if(tasks.length>count.current&&scope.current&&!reduced())void animate(scope.current,{scaleY:[1,2,1]},{duration:.36,ease:[.3,1.6,.5,1]});count.current=tasks.length;},[tasks.length]);
  return <>
    <div className={'bin'+(tasks.length?'':' empty')} aria-label="완료">
      {tasks.length>0&&<span className="bin-label">완료 <b>{tasks.length}</b></span>}
      <AnimatePresence initial={false}>
        {tasks.map(t=><motion.span key={t.id} className="chip" layout initial={{opacity:0,y:18,scaleX:.8,scaleY:1.15}} animate={{opacity:1,y:0,scaleX:1,scaleY:1}} exit={{opacity:0,y:14}} transition={{type:'spring',visualDuration:.4,bounce:.35}}>
          <button type="button" className="chip-title" data-task={t.id} onClick={()=>onOpen(t)}><Icon name="check" size={13} stroke={2.6}/>{t.title}<small>{formatDuration(t.duration)}</small></button>
          <button type="button" className="chip-undo" aria-label={t.title+' 완료 취소'} title="완료 취소" onClick={()=>void uncomplete(t)}><Icon name="undo" size={14}/></button>
        </motion.span>)}
      </AnimatePresence>
    </div>
    <div className="slit" ref={scope} aria-hidden="true"/>
  </>;
}

type BlockProps={date:string;item:DayItem;pushed:boolean;axis:TimeAxis;geometry:Geometry;variant:'day'|'column';next:boolean;hollow:boolean;resizing:boolean;selected:boolean;multi:boolean;squash:boolean;landed:{clack:boolean}|null;
  onCheck:()=>void;onOpen:(e:ReactMouseEvent)=>void;onMenu:(e:{clientX:number;clientY:number})=>void;onGrip:(e:ReactPointerEvent<HTMLButtonElement>)=>void;onNudge:(delta:number,order:boolean,el:HTMLElement)=>void};
// Blocks are placed with `top`, never a transform: dnd-kit measures boxes without transforms.
// Only completion pulls a block up into the intake; any other departure just fades.
function Block({date,item,pushed,axis,geometry:g,variant,next,hollow,resizing,selected,multi,squash,landed,onCheck,onOpen,onMenu,onGrip,onNudge}:BlockProps){
  const {held}=useDrag();
  // Date copies overlap during exit animations; each space must own its draggable registration.
  const t=item.task,{listeners,setNodeRef}=useDraggable({id:`${variant}:${date}:${t.id}`,data:{taskId:t.id},disabled:item.fixed&&t.completed||!!held?.dropping});
  const top=axis.position(item.start)+1,h=Math.max(10,axis.position(item.end)-axis.position(item.start)-2);
  const range=`${time(item.start)}–${time(item.end)}`;
  // Title over meta takes about 56px in a day and 47px in a week column; anything shorter is one row with the meta beside the title.
  const cls=['blk',item.fixed?'fixed':'flow',item.over?'over':'',pushed?'pushed':'',next?'next':'',t.completed?'done':'',hollow?'hollow':'',selected?'sel':'',multi?'multi':'',h<(variant==='day'?56:47)?'compact':'',h<20?'tiny':''].join(' ');
  const orderable=!item.fixed&&!t.completed;
  const key=(e:KeyboardEvent<HTMLButtonElement>)=>{
    if((e.shiftKey&&e.key==='F10')||e.key==='ContextMenu'){e.preventDefault();const r=e.currentTarget.getBoundingClientRect();onMenu({clientX:r.left+12,clientY:r.top+12});return;}
    if(e.key!=='ArrowUp'&&e.key!=='ArrowDown'||e.ctrlKey||e.metaKey||e.shiftKey||t.completed||e.altKey&&!orderable)return;
    e.preventDefault();onNudge(e.key==='ArrowUp'?-1:1,e.altKey,e.currentTarget);
  };
  const keys=t.completed?'Shift+F10':(orderable?'Alt+ArrowUp Alt+ArrowDown ':'')+'ArrowUp ArrowDown Shift+F10';
  const immediate=hollow||reduced();
  return <motion.div ref={setNodeRef} data-block="true" className={cls} style={{left:item.fixed?g.fixedLeft:g.flowLeft,right:g.right}}
    initial={{top,height:h,opacity:0}} animate={{top,height:h,opacity:1}}
    onAnimationComplete={()=>{const button=document.activeElement;if(button instanceof HTMLElement&&button.dataset.task===t.id&&button.closest('.today-day'))button.scrollIntoView({block:'nearest'});}}
    variants={{leave:(done:Set<string>)=>done?.has(t.id)
      ?{y:-(top+h+40),scaleX:.5,scaleY:1.4,opacity:0,transition:{duration:reduced()?0:.3,ease:[.6,0,.9,.35]}}
      :{opacity:0,transition:{duration:.12}}}}
    exit="leave" transition={{...reflow,duration:immediate?0:reflow.duration,height:{...reflow,duration:immediate||resizing?0:reflow.duration}}} {...listeners} tabIndex={-1} role="presentation" onContextMenu={e=>{e.preventDefault();if(!isGestureActive())onMenu(e);}}>
    {/* A flow block rides the rail on a runner in its groove: free to slide, and pushed further it latches to a time. */}
    {orderable&&<span className="runner" aria-hidden="true" style={{width:runnerReach(g)}}><i className="stem"/><i className="shoe"/></span>}
    <motion.div className="tile" animate={squash?{scaleX:1.05,scaleY:.86}:{scaleX:1,scaleY:1}}
      transition={{duration:reduced()?0:.1}} style={{transformOrigin:'50% 100%'}}>
      <OffHours start={item.start} end={item.end} rule={dayRule(t.plan_date!)} position={axis.position}/>
      {item.fixed&&<Latch clack={!!landed?.clack}/>}
      <button type="button" className="chk" aria-label={t.title+(t.completed?' 완료 취소':' 완료')} aria-pressed={t.completed} onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onClick={onCheck}><Icon name="check" size={12} stroke={3}/></button>
      <button type="button" className="main" aria-label={`${t.title}, ${item.fixed?'시각 고정':'예상'} ${range}, ${formatDuration(t.duration)}${item.over?', 근무 외 '+formatDuration(item.outside):''}${next?', 다음':''}${t.completed?', 완료':''}${multi?', 선택됨':''}`} onClick={onOpen} onKeyDown={key} aria-keyshortcuts={keys} data-task={t.id}>
        <span className="ttl-row">{next&&<span className="tag">다음</span>}<span className="ttl">{t.title}</span></span>
        <span className="meta"><span className="tm">{item.fixed?range:'예상 '+range}</span><span>{formatDuration(t.duration)}</span></span>
      </button>
    </motion.div>
    {/* Pointer only: the block's own button takes the arrow keys. */}
    {!t.completed&&<button type="button" className="grip" tabIndex={-1} aria-hidden="true" onPointerDown={onGrip} onTouchStart={e=>e.stopPropagation()}/>}
  </motion.div>;
}

function Latch({clack}:{clack:boolean}){
  // Seated on the rail: the clasp closes with one short press and a quick ring, never a bounce.
  return <motion.span className="latch" title="시각 고정" animate={clack?{x:[-2,0],scaleX:[1.06,1]}:{x:0,scaleX:1}} transition={{duration:.12,ease:[.2,.9,.3,1]}}>
    <Lock/>{clack&&<motion.i className="ring" initial={{opacity:.7,scale:.6}} animate={{opacity:0,scale:1.3}} transition={{duration:.3,ease:'easeOut'}}/>}
  </motion.span>;
}
