import type {Task,WorkingDay,DayLayout} from './types.ts';
import {layoutDay,byFlowOrder} from './flow.ts';
import {unavailableParts} from './placement.ts';
import {startMinute} from './dates.ts';
export function calendarRefreshAllowed(state:{view:string;ready:boolean;visible:boolean;dirty:boolean;input:boolean;modal:boolean;gesture:boolean}){
  return (state.view==='today'||state.view==='plan')&&state.ready&&state.visible&&!state.dirty&&!state.input&&!state.modal&&!state.gesture;
}
export type DayItem={task:Task;start:number;end:number;fixed:boolean;over:boolean;outside:number};
export type DayPlan={items:DayItem[];completed:Task[];anchor:number|null};
// Fixed tasks keep their reservation even when completed; completed flow tasks leave the time space.
export function dayPlan(date:string,tasks:Task[],rule:WorkingDay,layouts:DayLayout[]):DayPlan{
  const dated=tasks.filter(t=>t.plan_date===date||t.starts_at?.startsWith(date));
  const fixed=dated.filter(t=>t.starts_at).map(task=>{const start=startMinute(task.starts_at!);return {task,start,end:start+task.duration,fixed:true,over:false};});
  const flow=dated.filter(t=>!t.starts_at).sort(byFlowOrder);
  const anchor=layouts.find(l=>l.date===date)?.anchor??null;
  const placed=layoutDay(rule,fixed,flow.filter(t=>!t.completed),anchor);
  const items=[...fixed,...placed.map(b=>({...b,fixed:false}))].map(i=>{
    const outside=unavailableParts(i.start,i.end,rule).reduce((n,p)=>n+p.end-p.start,0);
    return {...i,over:outside>0,outside};
  }).sort((a,b)=>a.start-b.start);
  return {items,completed:flow.filter(t=>t.completed),anchor};
}
// Where the latest flow block running past working time ends, or null when everything fits.
export const overrunEnd=(plan:DayPlan)=>plan.items.reduce<number|null>((end,i)=>i.over?Math.max(end??0,i.end):end,null);
// Blocks a change would newly push past working time: over in `after`, not already over in `before`.
export function newlyOver(before:DayPlan,after:DayPlan){
  const was=new Set(before.items.filter(i=>i.over).map(i=>i.task.id));
  return after.items.filter(i=>!i.fixed&&i.over&&!was.has(i.task.id)).map(i=>i.task.id);
}
// Time passing never changes a task's state: there is no current, late or missed block.
// The next block is simply the first remaining flow block, whatever the clock says.
export function nextFlowId(items:DayItem[],skip:string[]=[]){
  return items.find(i=>!i.fixed&&!i.task.completed&&!skip.includes(i.task.id))?.task.id??null;
}
