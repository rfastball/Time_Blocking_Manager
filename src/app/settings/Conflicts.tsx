import {useState} from 'react';
import {dateOf,time} from '../../dates.ts';
import type {Task} from '../../types.ts';
import {taskMinute} from '../store/tasks.ts';

// Consent belongs to one exact set of affected tasks; a different set asks again.
const keyOf=(tasks:Task[])=>tasks.map(t=>t.id).sort().join(',');
export function useConsent(tasks:Task[]){
  const key=keyOf(tasks),[state,setState]=useState({key:'',checked:false});
  // Asked at save time with the set actually being saved.
  const agreedTo=(list:Task[])=>!!list.length&&state.checked&&state.key===keyOf(list);
  return [!!key&&state.key===key&&state.checked,(checked:boolean)=>setState({key,checked}),agreedTo] as const;
}
const day=(date:string)=>dateOf(date).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric',weekday:'short'});

// Fixed tasks the schedule would leave outside working time; saving needs the explicit move (D8).
export function Conflicts({tasks,agreed,onAgree}:{tasks:Task[];agreed:boolean;onAgree:(checked:boolean)=>void}){
  if(!tasks.length)return null;
  return <div className="st-conflicts" role="group" aria-label="시각이 겹치는 고정 작업">
    <strong>시각이 겹치는 고정 작업 {tasks.length}건</strong>
    <ul>{tasks.map(t=>{const m=taskMinute(t);return <li key={t.id}><span>{t.title}</span><small>{day(t.starts_at!.slice(0,10))} {time(m)}–{time(m+t.duration)}</small></li>;})}</ul>
    <label className="st-check"><input type="checkbox" checked={agreed} onChange={e=>onAgree(e.target.checked)}/>같은 날짜의 유동 작업으로 옮기기</label>
  </div>;
}
