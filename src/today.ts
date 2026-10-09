import type {Task,WorkingDay} from './types.ts';
export function calendarRefreshAllowed(state:{view:string;ready:boolean;visible:boolean;dirty:boolean;input:boolean;modal:boolean;gesture:boolean}){
  return (state.view==='today'||state.view==='plan')&&state.ready&&state.visible&&!state.dirty&&!state.input&&!state.modal&&!state.gesture;
}
export type AgendaItem={kind:'task';start:number;end:number;task:Task;state:'done'|'current'|'overdue'|'upcoming'}|{kind:'unavailable'|'gap';start:number;end:number;label:string};
export function agenda(date:string,tasks:Task[],rule:WorkingDay,nowMinute:number|null):AgendaItem[]{
  const items:AgendaItem[]=tasks.filter(t=>t.starts_at?.startsWith(date)).map(task=>{
    const start=Number(task.starts_at!.slice(11,13))*60+Number(task.starts_at!.slice(14,16)),end=start+task.duration;
    return {kind:'task',start,end,task,state:task.completed?'done':nowMinute===null?'upcoming':nowMinute>=end?'overdue':nowMinute>=start?'current':'upcoming'};
  });
  if(rule.enabled)items.push(...rule.breaks.map(b=>({kind:'unavailable' as const,...b})));
  else return items.sort((a,b)=>a.start-b.start);
  items.sort((a,b)=>a.start-b.start);
  const gaps:AgendaItem[]=[];let cursor=rule.start;
  for(const item of items){if(item.start-cursor>=15)gaps.push({kind:'gap',start:cursor,end:item.start,label:'빈 시간'});cursor=Math.max(cursor,item.end);}
  if(rule.end-cursor>=15)gaps.push({kind:'gap',start:cursor,end:rule.end,label:'빈 시간'});
  return [...items,...gaps].sort((a,b)=>a.start-b.start);
}
