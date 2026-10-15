import {useRef} from 'react';
import {useDraggable} from '@dnd-kit/core';
import {formatDuration} from '../../format.ts';
import {dateLabel,dateOf,time} from '../../dates.ts';
import type {Task} from '../../types.ts';
import {getState,setNav,useApp,type Period} from '../store/state.ts';
import {dayRule,taskMinute} from '../store/tasks.ts';
import {openEditor} from '../store/editor.ts';
import type {usePanelResize} from '../ui/PanelResize.tsx';
import {DaySpace} from '../space/DaySpace.tsx';
import {aimedAt,useDaysAxis,useDrag,useRegion,type Form} from '../space/drag.tsx';
import {useNewBlock} from './Composer.tsx';
import {openDay} from './Week.tsx';
import {allocation,allocationLabel,allocationShort,dayTag,hours,Meter,Outside} from './day.tsx';
import {SCALE} from '../ui/scales.ts';

const weekdays=['월','화','수','목','금','토','일'];

// 2주 shows titles, 월 shows load. The grid keeps its rows while a date is chosen; the chosen date opens beside it.
export function Calendar({dates,period,panels}:{dates:string[];period:Exclude<Period,'week'|'day'>;panels:ReturnType<typeof usePanelResize>}){
  const {nav}=useApp();
  return <div ref={panels.ref} data-panel-stacked={panels.stacked} className="cal-layout">
    <section id="calendar-summary" className="card cal" aria-label={period==='two'?'2주 작업 목록':'월간 작업량'}>
      <div className="cal-weekdays" aria-hidden="true">{weekdays.map(d=><span key={d}>{d}</span>)}</div>
      <div className={'cal-grid '+period}>{dates.map(date=><Cell key={date} date={date} period={period} outside={period==='month'&&dateOf(date).getMonth()!==dateOf(nav.planAnchor).getMonth()}/>)}</div>
    </section>
    {panels.separator}
    <DatePanel date={nav.selected}/>
  </div>;
}

function Cell({date,period,outside}:{date:string;period:Exclude<Period,'week'>;outside:boolean}){
  const {today,nav}=useApp(),{held,tasks}=useDrag(),box=useRef<HTMLDivElement|null>(null);
  // 2주 shows titles, so a block arrives flattened into one; 월 shows load, so it arrives as its share of the day's bar.
  const ref=useRegion('date',date,{form:(task,ids):Form=>{
    const minutes=ids.reduce((n,id)=>n+(getState().snapshot!.tasks.find(t=>t.id===id)??task).duration,0),cell=box.current;
    if(period==='two')return {width:Math.max(40,(cell?.querySelector('.cal-tasks')?.clientWidth??cell?.clientWidth??120)-2),height:20,density:'line'};
    const track=cell?.querySelector<HTMLElement>('.cal-load')?.clientWidth??cell?.clientWidth??120,avail=allocation(date,getState().snapshot!.tasks).avail||480;
    return {width:Math.max(6,Math.min(track,Math.round(track*minutes/avail))),height:6,density:'bar'};
  }});
  const a=allocation(date,tasks),tag=dayTag(date),d=dateOf(date),sel=date===nav.selected,past=date<today;
  const hot=aimedAt(held,'date',date);
  const select=()=>setNav({selected:date});
  return <div ref={el=>{box.current=el;ref(el);}} data-date={date} onClick={select}
    className={'cal-cell'+(date===today?' today':'')+(past?' past':'')+(sel?' sel':'')+(outside?' outside':'')+(tag==='휴무'||tag==='휴가'?' off':'')+(hot?' hot':'')}>
    <div className="cal-top">
      <button type="button" className="cal-date" aria-pressed={sel} onClick={e=>{e.stopPropagation();select();}}
        aria-label={`${dateLabel(date)}${date===today?', 오늘':''}${past?', 지난 날짜':''}${tag?', '+tag:''}, 작업 ${a.count}건, ${allocationLabel(a)}`}>
        <strong>{d.getDate()===1&&<span className="cal-mon">{d.getMonth()+1}/</span>}{d.getDate()}</strong>{date===today&&<span className="pill">오늘</span>}
      </button>
      {tag&&<span className="tag-chip">{tag}</span>}
    </div>
    {period==='two'?<div className="cal-tasks">
      {a.tasks.slice(0,4).map(t=><Mini key={t.id} task={t}/>)}
      {a.tasks.length>4&&<small className="cal-more">+{a.tasks.length-4}건</small>}
    </div>:<div className="cal-load">
      {a.count>0&&<span className="cal-sum"><span>{a.count}건</span><span className="long">{formatDuration(a.used)}</span><span className="short">{hours(a.used)}h</span><Outside a={a}/></span>}
      {a.used>0&&<Meter a={a} className="thin"/>}
    </div>}
  </div>;
}

// A task title in a 2주 cell: opens the task, and can be carried to another date.
function Mini({task}:{task:Task}){
  const {held}=useDrag();
  const {attributes,listeners,setNodeRef}=useDraggable({id:`mini:${task.id}`,data:{taskId:task.id},disabled:!!held?.dropping});
  const fixed=!!task.starts_at,hollow=held?.task.id===task.id;
  return <span ref={setNodeRef} data-block="true" className={'mini'+(fixed?' fixed':'')+(task.completed?' done':'')+(hollow?' hollow':'')} {...attributes} {...listeners} tabIndex={-1} role="presentation">
    <button type="button" data-task={task.id} onClick={e=>{e.stopPropagation();openEditor(task.id,'dialog');}}
      aria-label={`${task.title}${fixed?`, 시각 고정 ${time(taskMinute(task))}`:''}, ${formatDuration(task.duration)}${task.completed?', 완료':''}`}>
      <span className="mini-t">{fixed&&<small>{time(taskMinute(task))}</small>}{task.title}</span>
    </button>
  </span>;
}

function DatePanel({date}:{date:string}){
  const {tasks}=useDrag();
  const axis=useDaysAxis([date],SCALE.datePanel),nb=useNewBlock(date,axis,'day');
  const a=allocation(date,tasks),tag=dayTag(date);
  return <section id="calendar-day" className="card plan-day" aria-label={`${dateLabel(date)} 블록 공간`}>
    <header className="plan-day-head">
      <h2><button type="button" className="plan-day-link" onClick={()=>openDay(date)}>{dateLabel(date)}</button></h2>{tag&&<span className="tag-chip">{tag}</span>}
      <span className="plan-day-alloc"><span className="sr-only">{allocationLabel(a)}</span><Meter a={a}/><span aria-hidden="true">{allocationShort(a)}</span><Outside a={a}/></span>
    </header>
    <DaySpace date={date} axis={axis} variant="day" bin onOpen={t=>openEditor(t.id,'dialog')} {...nb}/>
  </section>;
}
