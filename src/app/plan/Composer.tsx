import {useEffect,useRef,useState,type CSSProperties,type PointerEvent as ReactPointerEvent} from 'react';
import {motion} from 'motion/react';
import {selectionRange} from '../../placement.ts';
import {dayPlan} from '../../today.ts';
import {isCompositionKey} from '../../capture.ts';
import {formatDuration} from '../../format.ts';
import {time} from '../../dates.ts';
import type {TimeAxis} from '../../time-axis.ts';
import type {Task} from '../../types.ts';
import {useApp,type Composer} from '../store/state.ts';
import {closeComposer,dayRule,editCapture,issueAt,openComposer,setComposerFixed,setGesture,submitComposer} from '../store/tasks.ts';
import {Icon,Lock} from '../ui/icons.tsx';
import {useDrag} from '../space/drag.tsx';
import {COLUMN_GEOMETRY,DAY_GEOMETRY} from '../../drag-zone.ts';
import {OffHours} from '../space/OffHours.tsx';
import './composer.css';

type Range={start:number;duration:number;fixed:boolean;issue:string|null};
const snap=(minute:number)=>Math.max(0,Math.min(1425,Math.floor((minute+.000001)/15)*15));
// Only the composer opened by the user's own gesture takes focus; one restored from a draft waits.
let focusNext=false;

// New blocks on a day space: a click is 30 minutes at the end of that day's order, a range drag or the rail reserves the time.
// Spread the result onto <DaySpace>.
export function useNewBlock(date:string,axis:TimeAxis,variant:'day'|'column',align:'left'|'right'='left'){
  const {drafts}=useApp();
  const [range,setRange]=useState<Range|null>(null);
  const g=variant==='day'?DAY_GEOMETRY:COLUMN_GEOMETRY;
  function onBackgroundPointerDown(e:ReactPointerEvent<HTMLDivElement>,minute:number,onRail:boolean){
    if(e.button!==0||!e.isPrimary)return;
    e.preventDefault();
    const space=e.currentTarget,origin=snap(minute),x0=e.clientX,y0=e.clientY,id=e.pointerId;
    let moved=false,last:Range|null=null;
    const at=(y:number)=>snap(axis.minute(y-space.getBoundingClientRect().top));
    const move=(ev:PointerEvent)=>{
      if(ev.pointerId!==id||!moved&&Math.hypot(ev.clientX-x0,ev.clientY-y0)<5)return;
      if(!moved){moved=true;setGesture(true);}
      ev.preventDefault();
      // A jittered click stays a flow block; only a deliberate range (or the rail) reserves a time.
      const r=selectionRange(origin,at(ev.clientY)),fixed=onRail||r.duration>15;
      last=fixed?{...r,fixed,issue:issueAt('',date,r.start,r.duration)?.label??null}:null;
      setRange(last);
    };
    const cleanup=()=>{
      document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',escape);window.removeEventListener('blur',cancel);
      if(moved)setGesture(false);setRange(null);
    };
    const up=(ev:PointerEvent)=>{
      if(ev.pointerId!==id)return;cleanup();focusNext=true;
      if(!(last?openComposer(date,last.start,last.duration,true):openComposer(date,origin,30,onRail)))focusNext=false;
    };
    const cancel=()=>cleanup(),escape=(ev:KeyboardEvent)=>{if(ev.key==='Escape'){ev.preventDefault();cancel();}};
    document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',up);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',escape);window.addEventListener('blur',cancel);
  }
  const c=drafts.composer?.date===date?drafts.composer:null;
  const band=(start:number,duration:number)=>({top:axis.position(start)+1,height:Math.max(8,axis.position(start+duration)-axis.position(start)-2)});
  return {
    onBackgroundPointerDown,
    children:<>
      {range&&<div className={'range'+(range.issue?' bad':'')} aria-hidden="true" style={{left:g.fixedLeft,right:g.right,...band(range.start,range.duration)}}>
        <OffHours start={range.start} end={range.start+range.duration} rule={dayRule(date)} position={axis.position}/>
        <span className="range-label">{time(range.start)}–{time(range.start+range.duration)}{range.issue?' · '+range.issue:''}</span></div>}
      {c&&!range&&<Ghost c={c} axis={axis} left={c.fixed?g.fixedLeft:g.flowLeft} right={g.right}/>}
    </>,
    overlay:c&&!range?<ComposerForm c={c} axis={axis} style={variant==='day'?{left:g.bodyLeft+8,right:g.right,width:'auto',maxWidth:300}:align==='left'?{left:0}:{right:0}}/>:null
  };
}

// The slot a flow composer would take: after the day's last flow block, laid out like the day itself.
function useFlowSlot(c:Composer){
  const {snapshot}=useApp(),{tasks}=useDrag();
  if(c.fixed)return null;
  const phantom:Task={id:'\u0000composer',title:'',body:'',starts_at:null,duration:c.duration,completed:false,revision:0,plan_date:c.date,flow_order:Number.MAX_SAFE_INTEGER};
  return dayPlan(c.date,[...tasks,phantom],dayRule(c.date),snapshot?.layouts??[]).items.find(i=>i.task.id===phantom.id)??null;
}

// Where the new block would land: the reserved range, or the slot after the day's last flow block.
function Ghost({c,axis,left,right}:{c:Composer;axis:TimeAxis;left:number;right:number}){
  const slot=useFlowSlot(c);
  if(!c.fixed&&!slot)return null;
  const start=slot?.start??c.start,end=slot?.end??c.start+c.duration;
  return <motion.div className={'ghost'+(c.fixed?' fixed':'')} aria-hidden="true" style={{left,right}}
    initial={false} animate={{top:axis.position(start)+1,height:Math.max(8,axis.position(end)-axis.position(start)-2)}} transition={{type:'spring',visualDuration:.25,bounce:.2}}>
      <OffHours start={start} end={end} rule={dayRule(c.date)} position={axis.position}/>
    </motion.div>;
}

function ComposerForm({c,axis,style}:{c:Composer;axis:TimeAxis;style:CSSProperties}){
  const {drafts,busy,failed}=useApp();
  const input=useRef<HTMLInputElement>(null);
  const fixed=!!c.fixed,issue=fixed&&!drafts.captureCommand?issueAt('',c.date,c.start,c.duration):null,slot=useFlowSlot(c);
  useEffect(()=>{if(focusNext){focusNext=false;input.current?.focus({preventScroll:true});}},[c.date,c.start,c.duration]);
  // Sits under the chosen range; near the floor it opens above it instead.
  const below=axis.position(c.start+(fixed?c.duration:0))+6,top=below+150>axis.height?Math.max(0,axis.position(c.start)-150):below;
  return <form className="composer" aria-label="새 블록" style={{top,...style}}
    onSubmit={e=>{e.preventDefault();void submitComposer();}}
    onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeComposer();}}}>
    <div className="cm-head"><span>{fixed?`${time(c.start)}–${time(c.start+c.duration)}`:slot?<>순서 끝 · {time(slot.start)}–{time(slot.end)}{slot.over&&<em className="cm-over"> · 근무 외</em>}</>:`순서 끝 · ${formatDuration(c.duration)}`}</span>
      <button type="button" className="cm-x" aria-label="입력 닫기" onClick={closeComposer}><Icon name="close" size={14}/></button></div>
    <label className="sr-only" htmlFor="composer-title">새 블록 제목</label>
    <input id="composer-title" ref={input} className="cm-title" value={drafts.capture} maxLength={650} autoComplete="off" placeholder="할 일"
      onChange={e=>editCapture(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&isCompositionKey(e.nativeEvent))e.preventDefault();}}/>
    <div className="cm-row">
      <label className="cm-fix"><input type="checkbox" checked={fixed} onChange={e=>setComposerFixed(e.target.checked)}/><Lock/>{time(c.start)} 고정</label>
      <button type="submit" className="btn primary" disabled={!drafts.captureCommand&&!drafts.capture.trim()||busy||!!failed||!!issue}>배치</button>
    </div>
    {issue&&<p className="error" role="alert">{issue.label}. 다른 시간을 선택하세요.</p>}
  </form>;
}
