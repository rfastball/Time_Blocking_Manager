import {useLayoutEffect,useRef} from 'react';
import type {TimeAxis} from '../../time-axis.ts';
import {dateLabel,dateOf,time} from '../../dates.ts';
import type {Task} from '../../types.ts';
import {getState,setNav,useApp} from '../store/state.ts';
import {dayRule,planOf} from '../store/tasks.ts';
import {openEditor} from '../store/editor.ts';
import {overflowOf,returnOverflow} from '../store/bench.ts';
import {DaySpace} from '../space/DaySpace.tsx';
import {useDaysAxis,useDrag,useRegion} from '../space/drag.tsx';
import {COLUMN_GEOMETRY} from '../../drag-zone.ts';
import {useNewBlock} from './Composer.tsx';
import {allocation,allocationLabel,allocationShort,dayTag,Meter,Outside} from './day.tsx';

export const WEEK_SCALE=1;
export const openDay=(date:string)=>setNav({view:'plan',period:'day',selected:date,planAnchor:date});
const open=(t:Task)=>openEditor(t.id,'dialog');

// Seven day spaces on one time axis. The hour ruler is shared; each date head is also a place to drop work.
export function Week({dates}:{dates:string[]}){
  const axis=useDaysAxis(dates,WEEK_SCALE);
  const hours=Array.from({length:25},(_,i)=>i*60).filter(m=>m>=axis.start-60&&m<=axis.end+60);
  const {today,nav}=useApp(),scroll=useRef<HTMLDivElement>(null),shown=useRef(false);
  const target=dates.includes(today)?today:dates.includes(nav.selected)?nav.selected:null;
  // A grid wider than the card would start with today cut off: bring its column in sideways, never vertically.
  useLayoutEffect(()=>{
    const el=scroll.current,col=target?el?.querySelector<HTMLElement>(`.wk-col[data-date="${target}"]`):null,first=!shown.current;shown.current=true;
    if(!el||!col||el.scrollWidth<=el.clientWidth)return;
    const box=el.getBoundingClientRect(),c=col.getBoundingClientRect(),ruler=el.querySelector<HTMLElement>('.wk-ruler')?.offsetWidth??0;
    const left=c.left-box.left+el.scrollLeft-ruler,right=c.right-box.left+el.scrollLeft-el.clientWidth;
    const to=el.scrollLeft>left?left:el.scrollLeft<right?Math.min(left,right):el.scrollLeft;
    if(Math.abs(to-el.scrollLeft)<1)return;
    el.scrollTo({left:to,behavior:first||matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  },[dates[0],target,nav.dock]);
  return <section className="card wk" aria-label="주간 블록 공간">
    <div ref={scroll} className="wk-scroll">
      <div className="wk-grid">
        <div className="wk-corner"/>
        {dates.map(date=><Head key={date} date={date}/>)}
        <div className="wk-ruler" aria-hidden="true"><div className="wk-hours" style={{height:axis.height}}>{hours.map(m=><span key={m} style={{top:axis.position(m)}}>{String(m/60).padStart(2,'0')}</span>)}</div></div>
        {dates.map((date,i)=><Column key={date} date={date} axis={axis} align={i<4?'left':'right'}/>)}
      </div>
    </div>
  </section>;
}

// A date head: its allocation at a glance, a place to drop work, and the way into that day's 일 view.
export function Head({date}:{date:string}){
  const {today,nav}=useApp(),{held,tasks}=useDrag(),box=useRef<HTMLDivElement|null>(null),head=useRef<HTMLButtonElement>(null);
  // Work dropped on a head goes to the end of that day's column, so it takes the column's shape on the week's scale.
  const ref=useRegion('date',date,{form:(task,ids)=>{
    const minutes=ids.reduce((n,id)=>n+(getState().snapshot!.tasks.find(t=>t.id===id)??task).duration,0);
    return {width:(box.current?.clientWidth??100)-COLUMN_GEOMETRY.flowLeft-COLUMN_GEOMETRY.right,height:Math.max(10,minutes*WEEK_SCALE-2),density:'narrow'};
  }});
  const a=allocation(date,tasks),tag=dayTag(date),off=!dayRule(date).enabled;
  const hot=!!held&&!held.dropping&&!held.passing&&held.intent.zone==='date'&&held.intent.ok&&held.intent.date===date;
  const d=dateOf(date),past=date<today,saved=past?null:planOf(date);
  // Today says when its remaining plan ends, as planned: the last unfinished block's end, not a countdown.
  // From the saved day, not a held block's preview, so the head keeps its height and the axis stays put under the hand.
  const end=date===today?saved!.items.filter(i=>!i.task.completed).reduce<number|null>((e,i)=>Math.max(e??0,i.end),null):null;
  // The fix belongs to the saved day: while a block is held it keeps its place in the head but steps out of sight.
  const spill=saved?overflowOf(date,saved):[];
  const fix=()=>void returnOverflow(date).then(ok=>{if(ok)head.current?.focus({preventScroll:true});});
  return <div ref={el=>{box.current=el;ref(el);}} data-date={date} className={'wk-head'+(date===today?' today':'')+(past?' past':'')+(date===nav.selected?' sel':'')+(off?' off':'')+(hot?' hot':'')}>
    <button ref={head} type="button" className="wk-date" onClick={()=>openDay(date)}
      aria-label={`${dateLabel(date)}${date===today?', 오늘':''}${past?', 지난 날짜':''}${tag?', '+tag:''}, ${allocationLabel(a)}${end!==null?`, 예상 끝 ${time(end)}`:''}`}>
      <span className="wk-day"><small>{d.toLocaleDateString('ko-KR',{weekday:'short'})}</small><strong>{d.getDate()}</strong>{date===today&&<span className="pill">오늘</span>}{tag&&<span className="tag-chip">{tag}</span>}</span>
      <Meter a={a}/>
      <span className="wk-alloc"><span>{allocationShort(a)}</span><Outside a={a}/>{end!==null&&<span className="wk-end" aria-hidden="true">끝 {time(end)}</span>}</span>
    </button>
    {spill.length>0&&<button type="button" className="btn text wk-return" aria-label={`${dateLabel(date)} 근무 외 블록 ${spill.length}개 준비로`} style={held?{visibility:'hidden'}:undefined} onClick={fix}>준비로</button>}
  </div>;
}

function Column({date,axis,align}:{date:string;axis:TimeAxis;align:'left'|'right'}){
  const {drafts,today}=useApp(),nb=useNewBlock(date,axis,'column',align);
  return <div className={'wk-col'+(date<today?' past':'')+(!dayRule(date).enabled?' off':'')+(drafts.composer?.date===date?' composing':'')} data-date={date}>
    <DaySpace date={date} axis={axis} variant="column" bin onOpen={open} {...nb}/>
  </div>;
}
