import {useEffect,useRef,useState,type KeyboardEvent,type MouseEvent as ReactMouseEvent,type PointerEvent as ReactPointerEvent,type ReactNode} from 'react';
import {useDraggable} from '@dnd-kit/core';
import {AnimatePresence,motion,useAnimate} from 'motion/react';
import {dayPlan,nextFlowId,type DayItem} from '../../today.ts';
import {unplacedLabel} from '../../flow.ts';
import {formatDuration} from '../../format.ts';
import {time} from '../../dates.ts';
import type {TimeAxis} from '../../time-axis.ts';
import type {Task} from '../../types.ts';
import {setUi,useApp} from '../store/state.ts';
import {completeTasks,dayRule,issueAt,resize,setGesture,taskMinute,uncomplete} from '../store/tasks.ts';
import {openAvailability} from '../store/schedule.ts';
import {settle,reduced} from '../ui/motion.ts';
import {Icon,Lock} from '../ui/icons.tsx';
import {COLUMN_GEOMETRY,DAY_GEOMETRY,useDrag,useRegion,type Geometry} from './drag.tsx';
import './space.css';

type Props={
  date:string;axis:TimeAxis;variant:'day'|'column';
  // The intake above the space and the shelf below it.
  bin?:boolean;shelf?:boolean;
  selected?:string|null;multi?:string[];
  onOpen:(t:Task)=>void;onMulti?:(t:Task)=>void;
  // Areas may layer their own overlays (new-block composer) over the space.
  // `children` draw inside the clipped space; `overlay` sits on the same coordinates but may spill past a narrow column.
  children?:ReactNode;overlay?:ReactNode;onBackgroundPointerDown?:(e:ReactPointerEvent<HTMLDivElement>,minute:number,onRail:boolean)=>void;
};

// One day as a space: rail and fixed latches on the left, flow blocks in order, completed work leaves through the top.
export function DaySpace({date,axis,variant,bin,shelf,selected,multi=[],onOpen,onMulti,children,overlay,onBackgroundPointerDown}:Props){
  const {snapshot,today,now,ui}=useApp();
  const {held,tasks}=useDrag();
  const geometry=variant==='day'?DAY_GEOMETRY:COLUMN_GEOMETRY;
  const rule=dayRule(date);
  const [squash,setSquash]=useState<string[]>([]);
  const [sizing,setSizing]=useState<{id:string;dur:number}|null>(null);
  const spaceRef=useRegion('space',date,{axis,geometry}),shelfRef=useRegion('shelf',date);
  const shown=sizing?tasks.map(t=>t.id===sizing.id?{...t,duration:sizing.dur}:t):tasks;
  const plan=dayPlan(date,shown,rule,snapshot?.layouts??[]);
  const nextId=date===today?nextFlowId(plan.items,squash):null;
  const doneIds=new Set((snapshot?.tasks??[]).filter(t=>t.completed).map(t=>t.id));
  const holding=held&&!held.dropping?held:null;
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
      const next=Math.max(15,Math.min(480,Math.round((d0+(ev.clientY-y0)/axis.scale)/15)*15));
      if(next===dur||t.starts_at&&issueAt(t.id,date,taskMinute(t),next))return;
      dur=next;setSizing({id:t.id,dur});
    };
    const up=async()=>{
      el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);setGesture(false);
      if(dur!==d0)await resize(t,dur);
      setSizing(null);
    };
    el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
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
    <div ref={spaceRef} data-surface="true" className={'space'+(holding?' armed':'')} style={{height:axis.height}} onPointerDown={background}
      onContextMenu={e=>{if(e.target!==e.currentTarget)return;e.preventDefault();const r=e.currentTarget.getBoundingClientRect();menu(e,null,Math.round(axis.minute(e.clientY-r.top)/15)*15);}}>
      <Ground axis={axis} rule={rule} geometry={geometry} date={date}/>
      <motion.div className="shutter" aria-hidden="true" style={{left:geometry.railLeft+1,width:geometry.railWidth-2,top:axis.position(rule.start),visibility:anchor>rule.start?'visible':'hidden'}}
        animate={{height:Math.max(0,axis.position(anchor)-axis.position(rule.start))}} transition={{type:'spring',visualDuration:.55,bounce:0}}/>
      {date===today&&<AnchorFlash top={axis.position(anchor)} left={geometry.railLeft} anchor={anchor}/>}
      <AnimatePresence initial={false} custom={doneIds}>
        {plan.items.map(item=><Block key={item.task.id} item={item} axis={axis} geometry={geometry} variant={variant} next={item.task.id===nextId}
          hollow={holding?.task.id===item.task.id} selected={selected===item.task.id&&!multi.length} multi={multi.includes(item.task.id)} squash={squash.includes(item.task.id)}
          landed={ui.landed?.id===item.task.id?ui.landed:null}
          onCheck={()=>void check(byId(item.task.id))} onGrip={e=>grip(e,byId(item.task.id))}
          onOpen={e=>{if((e.shiftKey||e.ctrlKey||e.metaKey)&&onMulti){onMulti(byId(item.task.id));return;}onOpen(byId(item.task.id));}}
          onMenu={e=>menu(e,byId(item.task.id),item.start)}/>)}
      </AnimatePresence>
      {holding?.intent.zone==='rail'&&holding.intent.date===date&&<span className={'railtag'+(holding.intent.ok?'':' bad')} style={{top:axis.position(holding.intent.start!),left:geometry.railLeft-46}}>{time(holding.intent.start!)}</span>}
      {date===today&&now>=axis.start&&now<=axis.end&&<div className="nowline" style={{top:axis.position(now),left:Math.max(0,geometry.railLeft-22)}}>{variant==='day'&&<span>{time(now)}</span>}</div>}
      {children}
    </div>
    {overlay}
    </div>
    {shelf&&<div ref={shelfRef} className={'shelf'+(holding?.intent.zone==='below'&&holding.intent.date===date?' hot':'')} style={{paddingLeft:geometry.flowLeft}}>
      {plan.unplaced.length>0&&<h2 style={{marginLeft:-geometry.flowLeft+14}}>배치되지 않음 <span className="cnt">{plan.unplaced.length}</span></h2>}
      {plan.unplaced.map(u=><Unplaced key={u.task.id} task={u.task} scale={axis.scale} reason={unplacedLabel[u.reason]} hollow={holding?.task.id===u.task.id}
        onOpen={()=>onOpen(byId(u.task.id))} onCheck={()=>void check(byId(u.task.id))}/>)}
    </div>}
  </div>;
}

function Ground({axis,rule,geometry:g,date}:{axis:TimeAxis;rule:ReturnType<typeof dayRule>;geometry:Geometry;date:string}){
  const hours=Array.from({length:25},(_,i)=>i*60).filter(m=>m>=axis.start-60&&m<=axis.end+60);
  const band=(start:number,end:number)=>({top:axis.position(start),height:Math.max(0,axis.position(end)-axis.position(start))});
  return <>
    {rule.enabled?<>
      <button type="button" className="off" style={{left:g.bodyLeft-4,...band(0,rule.start)}} aria-label={`${time(rule.start)} 이전 근무 외 시간 조정`} onClick={e=>openAvailability(date,'work',e.clientX,e.clientY)}/>
      <button type="button" className="off" style={{left:g.bodyLeft-4,...band(rule.end,1440)}} aria-label={`${time(rule.end)} 이후 근무 외 시간 조정`} onClick={e=>openAvailability(date,'work',e.clientX,e.clientY)}/>
    </>:<button type="button" className="off" style={{left:g.bodyLeft-4,...band(0,1440)}} aria-label="휴무일 근무시간 조정" onClick={e=>openAvailability(date,'work',e.clientX,e.clientY)}><span>휴무</span></button>}
    {hours.map(m=><div key={m} className="hl" style={{top:axis.position(m),left:g.bodyLeft}}/>)}
    {g.ruler>0&&<div className="ruler" aria-hidden="true" style={{width:g.ruler}}>{hours.map(m=><span key={m} style={{top:axis.position(m)}}>{String(m/60).padStart(2,'0')}</span>)}</div>}
    <div className="rail" data-surface="true" aria-hidden="true" style={{left:g.railLeft,width:g.railWidth}}/>
    {rule.enabled&&rule.breaks.map((b,i)=><button type="button" key={b.start} className="brk" style={{left:g.railLeft+g.railWidth,...band(b.start,b.end)}}
      aria-label={`${b.label} ${time(b.start)}–${time(b.end)} 조정`} onClick={e=>openAvailability(date,i,e.clientX,e.clientY)}><span>{b.label}</span></button>)}
    {rule.enabled&&<div className="floor" style={{left:g.railLeft,top:axis.position(rule.end)}}/>}
  </>;
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
    <div className="bin" aria-label="완료">
      {tasks.length>0&&<span className="bin-label">완료 <b>{tasks.length}</b></span>}
      <AnimatePresence initial={false}>
        {tasks.map(t=><motion.span key={t.id} className="chip" layout initial={{opacity:0,y:18,scaleX:.8,scaleY:1.15}} animate={{opacity:1,y:0,scaleX:1,scaleY:1}} exit={{opacity:0,y:14}} transition={{type:'spring',visualDuration:.4,bounce:.35}}>
          <button type="button" className="chip-title" onClick={()=>onOpen(t)}><Icon name="check" size={13} stroke={2.6}/>{t.title}<small>{formatDuration(t.duration)}</small></button>
          <button type="button" className="chip-undo" aria-label={t.title+' 완료 취소'} title="완료 취소" onClick={()=>void uncomplete(t)}><Icon name="undo" size={14}/></button>
        </motion.span>)}
      </AnimatePresence>
    </div>
    <div className="slit" ref={scope} aria-hidden="true"/>
  </>;
}

type BlockProps={item:DayItem;axis:TimeAxis;geometry:Geometry;variant:'day'|'column';next:boolean;hollow:boolean;selected:boolean;multi:boolean;squash:boolean;landed:{clack:boolean}|null;
  onCheck:()=>void;onOpen:(e:ReactMouseEvent)=>void;onMenu:(e:{clientX:number;clientY:number})=>void;onGrip:(e:ReactPointerEvent<HTMLButtonElement>)=>void};
// Blocks are placed with `top`, never a transform: dnd-kit measures boxes without transforms.
// Only completion pulls a block up into the intake; any other departure just fades.
function Block({item,axis,geometry:g,variant,next,hollow,selected,multi,squash,landed,onCheck,onOpen,onMenu,onGrip}:BlockProps){
  const t=item.task,{attributes,listeners,setNodeRef}=useDraggable({id:`${variant}:${t.id}`,data:{taskId:t.id},disabled:item.fixed&&t.completed});
  const top=axis.position(item.start)+1,h=Math.max(10,axis.position(item.end)-axis.position(item.start)-2);
  const range=`${time(item.start)}–${time(item.end)}`;
  const cls=['blk',item.fixed?'fixed':'flow',next?'next':'',t.completed?'done':'',hollow?'hollow':'',selected?'sel':'',multi?'multi':'',h<34?'compact':'',h<20?'tiny':''].join(' ');
  const key=(e:KeyboardEvent)=>{
    if((e.shiftKey&&e.key==='F10')||e.key==='ContextMenu'){e.preventDefault();const r=(e.currentTarget as HTMLElement).getBoundingClientRect();onMenu({clientX:r.left+12,clientY:r.top+12});}
  };
  return <motion.div ref={setNodeRef} data-block="true" className={cls} style={{left:item.fixed?g.fixedLeft:g.flowLeft,right:g.right}}
    initial={{top,height:h,opacity:0}} animate={{top,height:h,opacity:1}}
    variants={{leave:(done:Set<string>)=>done?.has(t.id)
      ?{y:-(top+h+40),scaleX:.5,scaleY:1.4,opacity:0,transition:{duration:reduced()?0:.3,ease:[.6,0,.9,.35]}}
      :{opacity:0,transition:{duration:.12}}}}
    exit="leave" transition={settle} {...attributes} {...listeners} tabIndex={-1} role="presentation" onContextMenu={e=>{e.preventDefault();onMenu(e);}}>
    <motion.div className="tile" animate={squash?{scaleX:1.05,scaleY:.86}:landed?{scaleX:[1.03,1.025,.99,1],scaleY:[1.03,.93,1.025,1]}:{scaleX:1,scaleY:1}}
      transition={squash?{duration:.1}:landed?{duration:.45}:{duration:.15}} style={{transformOrigin:'50% 100%'}}>
      {item.fixed&&<Latch clack={!!landed?.clack}/>}
      <button type="button" className="chk" aria-label={t.title+(t.completed?' 완료 취소':' 완료')} aria-pressed={t.completed} onPointerDown={e=>e.stopPropagation()} onClick={onCheck}><Icon name="check" size={12} stroke={3}/></button>
      <button type="button" className="main" aria-label={`${t.title}, ${item.fixed?'시각 고정':'예상'} ${range}, ${formatDuration(t.duration)}${next?', 다음':''}${t.completed?', 완료':''}`} onClick={onOpen} onKeyDown={key} data-task={t.id}>
        <span className="ttl-row">{next&&<span className="tag">다음</span>}<span className="ttl">{t.title}</span></span>
        <span className="meta"><span className="tm">{item.fixed?range:'예상 '+range}</span><span>{formatDuration(t.duration)}</span></span>
      </button>
    </motion.div>
    {!t.completed&&<button type="button" className="grip" aria-label={t.title+' 크기 조절'} onPointerDown={onGrip}
      onKeyDown={e=>{if(e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;e.preventDefault();void resize(t,Math.max(15,t.duration+(e.key==='ArrowUp'?-15:15)));}}/>}
  </motion.div>;
}

function Latch({clack}:{clack:boolean}){
  return <motion.span className="latch" title="시각 고정" animate={clack?{x:[-5,1.5,0],scaleX:[1.2,.94,1]}:{x:0,scaleX:1}} transition={{duration:.36,ease:[.3,1.6,.5,1]}}>
    <Lock/>{clack&&<motion.i className="ring" initial={{opacity:.9,scale:.4}} animate={{opacity:0,scale:1.6}} transition={{duration:.5}}/>}
  </motion.span>;
}

function Unplaced({task,scale,reason,hollow,onOpen,onCheck}:{task:Task;scale:number;reason:string;hollow:boolean;onOpen:()=>void;onCheck:()=>void}){
  const {attributes,listeners,setNodeRef}=useDraggable({id:`shelf:${task.id}`,data:{taskId:task.id}});
  return <motion.div ref={setNodeRef} data-block="true" layout className={'ublk'+(hollow?' hollow':'')} style={{height:Math.max(30,task.duration*scale-2)}} transition={settle} {...attributes} {...listeners} tabIndex={-1} role="presentation">
    <div className="tile">
      <button type="button" className="chk" aria-label={task.title+' 완료'} onPointerDown={e=>e.stopPropagation()} onClick={onCheck}><Icon name="check" size={12} stroke={3}/></button>
      <button type="button" className="main" onClick={onOpen} aria-label={`${task.title}, ${formatDuration(task.duration)}, 배치되지 않음, ${reason}`}><span className="ttl">{task.title}</span><span className="meta"><span>{formatDuration(task.duration)}</span><span className="why">{reason}</span></span></button>
    </div>
  </motion.div>;
}
