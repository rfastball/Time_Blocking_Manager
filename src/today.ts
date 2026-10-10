import type {Task,WorkingDay,DayLayout} from './types.ts';
import {layoutDay,byFlowOrder} from './flow.ts';
import type {UnplacedBlock} from './flow.ts';
export function calendarRefreshAllowed(state:{view:string;ready:boolean;visible:boolean;dirty:boolean;input:boolean;modal:boolean;gesture:boolean}){
  return (state.view==='today'||state.view==='plan')&&state.ready&&state.visible&&!state.dirty&&!state.input&&!state.modal&&!state.gesture;
}
const minuteOf=(startsAt:string)=>Number(startsAt.slice(11,13))*60+Number(startsAt.slice(14,16));
export type DayItem={task:Task;start:number;end:number;fixed:boolean};
export type DayPlan={items:DayItem[];unplaced:UnplacedBlock<Task>[];completed:Task[];anchor:number|null};
// Fixed tasks keep their reservation even when completed; completed flow tasks leave the time space.
export function dayPlan(date:string,tasks:Task[],rule:WorkingDay,layouts:DayLayout[]):DayPlan{
  const dated=tasks.filter(t=>t.plan_date===date||t.starts_at?.startsWith(date));
  const fixed=dated.filter(t=>t.starts_at).map(task=>{const start=minuteOf(task.starts_at!);return {task,start,end:start+task.duration,fixed:true};});
  const flow=dated.filter(t=>!t.starts_at).sort(byFlowOrder);
  const anchor=layouts.find(l=>l.date===date)?.anchor??null;
  const layout=layoutDay(rule,fixed,flow.filter(t=>!t.completed),anchor);
  const items=[...fixed,...layout.placed.map(b=>({...b,fixed:false}))].sort((a,b)=>a.start-b.start);
  return {items,unplaced:layout.unplaced,completed:flow.filter(t=>t.completed),anchor};
}
// Time passing never changes a task's state: there is no current, late or missed block.
export type AgendaItem={kind:'task';start:number;end:number;task:Task;fixed:boolean;state:'done'|'next'|'upcoming'}|{kind:'unavailable'|'gap';start:number;end:number;label:string};
// Gaps before the anchor are space already left behind by the last reflow, not free time.
export function agenda(items:DayItem[],rule:WorkingDay,anchor:number|null=null):AgendaItem[]{
  const next=items.find(i=>!i.fixed&&!i.task.completed)?.task.id;
  const result:AgendaItem[]=items.map(i=>({kind:'task',...i,state:i.task.completed?'done':i.task.id===next?'next':'upcoming'}));
  if(!rule.enabled)return result;
  result.push(...rule.breaks.map(b=>({kind:'unavailable' as const,...b})));
  result.sort((a,b)=>a.start-b.start);
  const gaps:AgendaItem[]=[];let cursor=Math.max(rule.start,anchor??rule.start);
  for(const item of result){if(item.end<=cursor)continue;if(item.start-cursor>=15)gaps.push({kind:'gap',start:cursor,end:item.start,label:'빈 시간'});cursor=Math.max(cursor,item.end);}
  if(rule.end-cursor>=15)gaps.push({kind:'gap',start:cursor,end:rule.end,label:'빈 시간'});
  return [...result,...gaps].sort((a,b)=>a.start-b.start);
}
