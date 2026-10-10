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
// The next block is simply the first remaining flow block, whatever the clock says.
export function nextFlowId(items:DayItem[],skip:string[]=[]){
  return items.find(i=>!i.fixed&&!i.task.completed&&!skip.includes(i.task.id))?.task.id??null;
}
