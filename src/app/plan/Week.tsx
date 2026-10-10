import {useLayoutEffect,useRef} from 'react';
import type {TimeAxis} from '../../time-axis.ts';
import {dateLabel,dateOf} from '../../dates.ts';
import type {Task} from '../../types.ts';
import {setNav,useApp} from '../store/state.ts';
import {dayRule} from '../store/tasks.ts';
import {openEditor} from '../store/editor.ts';
import {DaySpace} from '../space/DaySpace.tsx';
import {useDaysAxis,useDrag,useRegion} from '../space/drag.tsx';
import {useNewBlock} from './Composer.tsx';
import {allocation,allocationLabel,allocationShort,dayTag,Meter,Outside} from './day.tsx';

export const WEEK_SCALE=1;
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
  },[dates[0],target,nav.inboxOpen]);
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

function Head({date}:{date:string}){
  const {today,nav}=useApp(),{held,tasks}=useDrag();
  const ref=useRegion('date',date);
  const a=allocation(date,tasks),tag=dayTag(date),off=!dayRule(date).enabled;
  const hot=!!held&&!held.dropping&&held.intent.zone==='date'&&held.intent.date===date;
  const d=dateOf(date),past=date<today;
  return <div ref={ref} data-date={date} className={'wk-head'+(date===today?' today':'')+(past?' past':'')+(date===nav.selected?' sel':'')+(off?' off':'')+(hot?' hot':'')}>
    <button type="button" className="wk-date" onClick={()=>setNav({view:'today',selected:date})}
      aria-label={`${dateLabel(date)}${date===today?', 오늘':''}${past?', 지난 날짜':''}${tag?', '+tag:''}, ${allocationLabel(a)}`}>
      <span className="wk-day"><small>{d.toLocaleDateString('ko-KR',{weekday:'short'})}</small><strong>{d.getDate()}</strong>{date===today&&<span className="pill">오늘</span>}{tag&&<span className="tag-chip">{tag}</span>}</span>
      <Meter a={a}/>
      <span className="wk-alloc"><span>{allocationShort(a)}</span><Outside a={a}/></span>
    </button>
  </div>;
}

function Column({date,axis,align}:{date:string;axis:TimeAxis;align:'left'|'right'}){
  const {drafts,today}=useApp(),nb=useNewBlock(date,axis,'column',align);
  return <div className={'wk-col'+(date<today?' past':'')+(!dayRule(date).enabled?' off':'')+(drafts.composer?.date===date?' composing':'')} data-date={date}>
    <DaySpace date={date} axis={axis} variant="column" bin onOpen={open} {...nb}/>
  </div>;
}
