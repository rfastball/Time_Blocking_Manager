import {motion} from 'motion/react';
import {dayPlan,type DayItem} from '../../today.ts';
import {formatDuration} from '../../format.ts';
import {dateKey,dateOf,plusDays} from '../../dates.ts';
import type {Task} from '../../types.ts';
import {getState,type Period} from '../store/state.ts';
import {available,dayRule} from '../store/tasks.ts';
import {settle} from '../ui/motion.ts';

export function periodDates(period:Period,anchor:string){
  const first=dateOf(anchor);if(period==='month')first.setDate(1);first.setDate(first.getDate()-(first.getDay()+6)%7);
  const monthStart=dateOf(anchor),monthEnd=dateOf(anchor);monthStart.setDate(1);monthEnd.setMonth(monthEnd.getMonth()+1,0);
  const count=period==='week'?7:period==='two'?14:Math.ceil(((monthStart.getDay()+6)%7+monthEnd.getDate())/7)*7;
  return Array.from({length:count},(_,i)=>plusDays(dateKey(first),i));
}

// 휴가·조퇴 come from the date's exception; a day without work is 휴무. Changed hours show on the timetable itself.
export function dayTag(date:string){
  const s=getState(),e=(s.drafts.settingsDraft??s.snapshot!.settings).exceptions?.find(x=>x.date===date);
  if(e?.kind==='leave')return '휴가';
  if(e?.kind==='early')return '조퇴';
  return dayRule(date).enabled?null:'휴무';
}

export type Allocation={done:number;flow:number;fixed:number;used:number;avail:number;over:number;outside:number;count:number;tasks:Task[]};
// Minutes of flow work laid out after working time.
export const outsideOf=(items:DayItem[])=>items.reduce((n,i)=>i.over?n+i.end-i.start:n,0);
// What the day holds against what it can hold. `tasks` may include a held block's preview.
export function allocation(date:string,tasks:Task[]):Allocation{
  const plan=dayPlan(date,tasks,dayRule(date),getState().snapshot!.layouts??[]);
  const sum=(list:Task[])=>list.reduce((n,t)=>n+t.duration,0);
  const fixedTasks=plan.items.filter(i=>i.fixed).map(i=>i.task),flowTasks=plan.items.filter(i=>!i.fixed).map(i=>i.task);
  const done=sum(plan.completed),flow=sum(flowTasks),fixed=sum(fixedTasks),used=done+flow+fixed,avail=available(date);
  // In time order. Completed flow work has left the space.
  const ordered=plan.items.map(i=>i.task);
  return {done,flow,fixed,used,avail,over:Math.max(0,used-avail),outside:outsideOf(plan.items),count:ordered.length,tasks:ordered};
}
type Load={used:number;avail:number;outside?:number};
export const allocationLabel=(a:Load)=>`배분 ${formatDuration(a.used)} / 가용 ${formatDuration(a.avail)}${a.outside?`, 근무 외 ${formatDuration(a.outside)}`:''}`;
// The same pair as numbers only, in hours: "7.75 / 8h".
const hours=(minutes:number)=>String(Math.round(minutes/60*100)/100);
export const allocationShort=(a:Load)=>`${hours(a.used)} / ${hours(a.avail)}h`;
// Work running past the end of the day, beside the pair: "근무 외 2.5h". Nothing when it all fits.
export const Outside=({a}:{a:{outside?:number}})=>a.outside?<span className="alloc-out" aria-hidden="true">근무 외 {hours(a.outside)}h</span>:null;

// Done, flow and fixed share the bar; what goes past the available time is hatched, not alarmed.
export function Meter({a,className=''}:{a:Allocation;className?:string}){
  const total=Math.max(a.avail,a.used,1),pct=(n:number)=>`${n/total*100}%`;
  return <span className={'pm '+className} aria-hidden="true">
    {([['done',a.done],['flow',a.flow],['fixed',a.fixed]] as const).map(([k,n])=><motion.i key={k} className={'pm-'+k} initial={false} animate={{width:pct(n)}} transition={settle}/>)}
    {a.over>0&&<motion.b className="pm-over" initial={false} animate={{left:pct(a.avail)}} transition={settle}/>}
  </span>;
}
