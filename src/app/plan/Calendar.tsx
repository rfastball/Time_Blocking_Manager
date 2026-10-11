import {useDraggable} from '@dnd-kit/core';
import {formatDuration} from '../../format.ts';
import {dateLabel,dateOf,time} from '../../dates.ts';
import type {Task} from '../../types.ts';
import {setNav,useApp,type Period} from '../store/state.ts';
import {dayRule,taskMinute} from '../store/tasks.ts';
import {openEditor} from '../store/editor.ts';
import {DaySpace} from '../space/DaySpace.tsx';
import {useDaysAxis,useDrag,useRegion} from '../space/drag.tsx';
import {useNewBlock} from './Composer.tsx';
import {openDay} from './Week.tsx';
import {allocation,allocationLabel,allocationShort,dayTag,Meter,Outside} from './day.tsx';

const DAY_SCALE=1.05;
const weekdays=['월','화','수','목','금','토','일'];

// 2주 shows titles, 월 shows load. The grid keeps its rows while a date is chosen; the chosen date opens beside it.
export function Calendar({dates,period}:{dates:string[];period:Exclude<Period,'week'|'day'>}){
  const {nav}=useApp();
  return <div className="cal-layout">
    <section className="card cal" aria-label={period==='two'?'2주 작업 목록':'월간 작업량'}>
      <div className="cal-weekdays" aria-hidden="true">{weekdays.map(d=><span key={d}>{d}</span>)}</div>
      <div className={'cal-grid '+period}>{dates.map(date=><Cell key={date} date={date} period={period} outside={period==='month'&&dateOf(date).getMonth()!==dateOf(nav.planAnchor).getMonth()}/>)}</div>
    </section>
    <DatePanel date={nav.selected}/>
  </div>;
}

function Cell({date,period,outside}:{date:string;period:Exclude<Period,'week'>;outside:boolean}){
  const {today,nav}=useApp(),{held,tasks}=useDrag();
  const ref=useRegion('date',date);
  const a=allocation(date,tasks),tag=dayTag(date),d=dateOf(date),sel=date===nav.selected,past=date<today;
  const hot=!!held&&!held.dropping&&held.intent.zone==='date'&&held.intent.ok&&held.intent.date===date;
  const select=()=>setNav({selected:date});
  return <div ref={ref} data-date={date} onClick={select}
    className={'cal-cell'+(date===today?' today':'')+(past?' past':'')+(sel?' sel':'')+(outside?' outside':'')+(tag==='휴무'||tag==='휴가'?' off':'')+(hot?' hot':'')}>
    <div className="cal-top">
      <button type="button" className="cal-date" aria-pressed={sel} onClick={e=>{e.stopPropagation();select();}}
        aria-label={`${dateLabel(date)}${date===today?', 오늘':''}${past?', 지난 날짜':''}${tag?', '+tag:''}, 작업 ${a.count}건, ${allocationLabel(a)}`}>
        <strong>{d.getDate()===1?`${d.getMonth()+1}/`:''}{d.getDate()}</strong>{date===today&&<span className="pill">오늘</span>}
      </button>
      {tag&&<span className="tag-chip">{tag}</span>}
    </div>
    {period==='two'?<div className="cal-tasks">
      {a.tasks.slice(0,4).map(t=><Mini key={t.id} task={t}/>)}
      {a.tasks.length>4&&<small className="cal-more">+{a.tasks.length-4}건</small>}
    </div>:<div className="cal-load">
      {a.count>0&&<span className="cal-sum"><span>{a.count}건</span><span>{formatDuration(a.used)}</span><Outside a={a}/></span>}
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
  const axis=useDaysAxis([date],DAY_SCALE),nb=useNewBlock(date,axis,'day');
  const a=allocation(date,tasks),tag=dayTag(date);
  return <section className="card plan-day" aria-label={`${dateLabel(date)} 블록 공간`}>
    <header className="plan-day-head">
      <h2><button type="button" className="plan-day-link" onClick={()=>openDay(date)}>{dateLabel(date)}</button></h2>{tag&&<span className="tag-chip">{tag}</span>}
      <span className="plan-day-alloc" aria-label={allocationLabel(a)}><Meter a={a}/><span aria-hidden="true">{allocationShort(a)}</span><Outside a={a}/></span>
    </header>
    <DaySpace date={date} axis={axis} variant="day" bin onOpen={t=>openEditor(t.id,'dialog')} {...nb}/>
  </section>;
}
