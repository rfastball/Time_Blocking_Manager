import type {Action,Task} from './types.ts';
import {time} from './dates.ts';
import {byFlowOrder} from './flow.ts';

// Where a held block would go if it were let go right now.
// body: into that day's order before `before` · rail: fixed at `start` · below/date: end of that day's order · tray: back to 미계획.
export type Zone='none'|'body'|'rail'|'below'|'date'|'tray';
export type Intent={id:string;zone:Zone;date:string|null;before:string|null;start:number|null;ok:boolean;reason:string|null};
export const noIntent=(id:string):Intent=>({id,zone:'none',date:null,before:null,start:null,ok:true,reason:null});

const flowsOn=(tasks:Task[],date:string,except?:string)=>tasks.filter(t=>t.plan_date===date&&!t.starts_at&&!t.completed&&t.id!==except).sort(byFlowOrder);
function orderWith(tasks:Task[],date:string,id:string,before:string|null){
  const ids=flowsOn(tasks,date,id).map(t=>t.id),at=before?ids.indexOf(before):-1;
  ids.splice(at<0?ids.length:at,0,id);
  return ids;
}
const lands=(i:Intent)=>i.zone!=='none'&&!(i.zone==='rail'&&!i.ok)&&(i.zone==='tray'||!!i.date);

// The tasks as they would be after the drop. Used to lay the days out while the block is held.
export function applyIntent(tasks:Task[],intent:Intent|null):Task[]{
  if(!intent||!lands(intent))return tasks;
  const {id,date}=intent;
  if(intent.zone==='tray')return tasks.map(t=>t.id===id?{...t,plan_date:null,starts_at:null,flow_order:null}:t);
  if(intent.zone==='rail')return tasks.map(t=>t.id===id?{...t,plan_date:date,starts_at:date+'T'+time(intent.start!),flow_order:null}:t);
  const order=new Map(orderWith(tasks,date!,id,intent.zone==='body'?intent.before:null).map((x,n)=>[x,n+1]));
  return tasks.map(t=>order.has(t.id)?{...t,plan_date:date,starts_at:null,flow_order:order.get(t.id)!}:t);
}

export const updateAction=(t:Task,plan_date:string|null,starts_at:string|null,before:string|null=null,duration=t.duration):Action=>
  ({type:'update',id:t.id,expected_revision:t.revision,title:t.title,body:t.body,starts_at,duration,plan_date,before});

// The single stored command for a drop, or null when nothing would change.
export function intentAction(tasks:Task[],intent:Intent):Action|null{
  const t=tasks.find(x=>x.id===intent.id);
  if(!t||!lands(intent))return null;
  if(intent.zone==='tray')return t.plan_date?updateAction(t,null,null):null;
  const date=intent.date!;
  if(intent.zone==='rail'){
    const startsAt=date+'T'+time(intent.start!);
    return t.starts_at===startsAt?null:updateAction(t,date,startsAt);
  }
  const before=intent.zone==='body'?intent.before:null;
  if(t.plan_date===date&&!t.starts_at&&!t.completed){
    const current=flowsOn(tasks,date).map(x=>x.id),next=orderWith(tasks,date,t.id,before);
    if(next.every((id,i)=>current[i]===id))return null;
    return {type:'reorder_flow',date,expected:next.map(id=>({id,revision:tasks.find(x=>x.id===id)!.revision}))};
  }
  return updateAction(t,date,null,before);
}
