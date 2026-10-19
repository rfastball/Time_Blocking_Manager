import type {Action,Pile,Task} from './types.ts';
import {startAt} from './dates.ts';
import {byFlowOrder} from './flow.ts';
import {SHELF,cardsIn,pileOf,place,waiting} from './bench.ts';
import {waitOrderAction} from './waiting.ts';

// Where a held block would go if it were let go right now.
// body: into that day's order before `before` · rail: fixed at `start` · below/date: end of that day's order · tray: back to 준비 (top of the shelf)
// · inbox/shelf: into the 준비 tab's 들어옴 or shelf, before the card now at `index` among the others · wait: out to the 기다림 band.
export type Zone='none'|'body'|'rail'|'below'|'date'|'tray'|'inbox'|'shelf'|'wait';
// `ids`: every block carried, in order (a selection). `since`: today, for a push to the band.
export type Intent={id:string;zone:Zone;date:string|null;before:string|null;start:number|null;ok:boolean;reason:string|null;ids?:string[];index?:number;since?:string};
export const noIntent=(id:string):Intent=>({id,zone:'none',date:null,before:null,start:null,ok:true,reason:null});
export const carried=(i:Intent)=>i.ids?.length?i.ids:[i.id];
const toBench=(z:Zone):z is 'inbox'|'shelf'=>z==='inbox'||z==='shelf';

const flowsOn=(tasks:Task[],date:string,except?:string)=>tasks.filter(t=>t.plan_date===date&&!t.starts_at&&!t.completed&&t.id!==except).sort(byFlowOrder);
function orderWith(tasks:Task[],date:string,id:string,before:string|null){
  const ids=flowsOn(tasks,date,id).map(t=>t.id),at=before?ids.indexOf(before):-1;
  ids.splice(at<0?ids.length:at,0,id);
  return ids;
}
const lands=(i:Intent)=>i.zone!=='none'&&!(i.zone==='rail'&&!i.ok)&&(i.zone==='tray'||i.zone==='wait'||toBench(i.zone)||!!i.date);
const unwaited=(t:Task):Task=>t.wait_since?{...t,wait_for:null,wait_until:null,wait_since:null}:t;

// The tasks as they would be after the drop. Used to lay the days and the 준비 lists out while the block is held.
export function applyIntent(tasks:Task[],intent:Intent|null):Task[]{
  if(!intent||!lands(intent))return tasks;
  const {id,date}=intent,ids=carried(intent);
  // Leaving a date or the band: no date, no trigger.
  const undated=(list:Task[])=>list.map(t=>!ids.includes(t.id)?t:unwaited(t.plan_date?{...t,plan_date:null,starts_at:null,flow_order:null}:t));
  if(intent.zone==='wait'){
    if(intent.index!==undefined){
      const action=waitOrderAction(tasks,id,intent.index);
      if(action?.type!=='reorder_wait')return tasks;
      const order=new Map(action.expected.map((t,n)=>[t.id,n+1]));
      return tasks.map(t=>order.has(t.id)?{...t,pile_order:order.get(t.id)!}:t);
    }
    return tasks.map(t=>ids.includes(t.id)&&!waiting(t)&&!t.completed?{...t,plan_date:null,starts_at:null,flow_order:null,pile_id:null,pile_order:null,wait_for:'',wait_until:null,wait_since:intent.since??''}:t);
  }
  if(toBench(intent.zone)){
    const next=place(undated(tasks),ids,pileOf(intent.zone),intent.index??Infinity);
    return intent.zone==='shelf'?next.map(t=>ids.includes(t.id)&&t.proto?{...t,proto:false}:t):next;
  }
  if(intent.zone==='tray')return place(undated(tasks),ids,SHELF,0);
  if(intent.zone==='rail')return tasks.map(t=>t.id===id?unwaited({...t,plan_date:date,starts_at:startAt(date!,intent.start!),flow_order:null}):t);
  if(ids.length>1){
    const next=flowsOn(tasks,date!).map(t=>t.id).filter(x=>!ids.includes(x));
    const at=intent.zone==='body'&&intent.before?next.indexOf(intent.before):-1;
    next.splice(at<0?next.length:at,0,...ids);
    const order=new Map(next.map((x,n)=>[x,n+1]));
    return tasks.map(t=>order.has(t.id)?unwaited({...t,plan_date:date,starts_at:null,flow_order:order.get(t.id)!}):t);
  }
  const order=new Map(orderWith(tasks,date!,id,intent.zone==='body'?intent.before:null).map((x,n)=>[x,n+1]));
  return tasks.map(t=>order.has(t.id)?unwaited({...t,plan_date:date,starts_at:null,flow_order:order.get(t.id)!}):t);
}

export const updateAction=(t:Task,plan_date:string|null,starts_at:string|null,before:string|null=null,duration=t.duration):Extract<Action,{type:'update'}>=>
  ({type:'update',id:t.id,expected_revision:t.revision,title:t.title,body:t.body,starts_at,duration,plan_date,before});
const revisions=(tasks:Task[],ids:string[])=>ids.map(id=>({id,revision:tasks.find(t=>t.id===id)!.revision}));

// Into the 들어옴 or the shelf before the card now at `index` among the others; the shelf is created by its first card.
export function benchAction(tasks:Task[],piles:Pile[],ids:string[],to:'inbox'|'shelf',index:number):Action|null{
  const cards=cardsIn(to,tasks,piles),others=cards.filter(t=>!ids.includes(t.id)).map(t=>t.id);
  const at=Math.max(0,Math.min(index,others.length)),after=[...others];after.splice(at,0,...ids);
  // Put back where it already is: nothing to store.
  if(after.length===cards.length&&after.every((id,n)=>cards[n].id===id))return null;
  const exists=to==='inbox'||piles.some(p=>p.id===SHELF);
  return {type:'place_unplanned',items:revisions(tasks,ids),pile:pileOf(to),index:at,...(exists?{}:{create_at:1})};
}

// The single stored command for a drop, or null when nothing would change.
export function intentAction(tasks:Task[],intent:Intent,piles:Pile[]=[]):Action|null{
  const t=tasks.find(x=>x.id===intent.id);
  if(!t||!lands(intent))return null;
  if(toBench(intent.zone))return benchAction(tasks,piles,carried(intent),intent.zone,intent.index??Infinity);
  // The band's own moves (push out, revive to the shelf's top) go through the waiting store, not a single command here.
  if(intent.zone==='wait')return intent.index===undefined?null:waitOrderAction(tasks,t.id,intent.index);
  if(intent.zone==='tray')return waiting(t)?{type:'revive',items:revisions(tasks,carried(intent))}:t.plan_date&&!t.completed?updateAction(t,null,null):null;
  const date=intent.date!,ids=carried(intent);
  // Several at once retain their order at the pointed slot; date heads append.
  if(ids.length>1)return {type:'ship_flow',date,items:revisions(tasks,ids),...(intent.zone==='body'?{before:intent.before}:{})};
  if(intent.zone==='rail'){
    const at=startAt(date,intent.start!);
    return t.starts_at===at?null:updateAction(t,date,at);
  }
  const before=intent.zone==='body'?intent.before:null;
  if(t.plan_date===date&&!t.starts_at&&!t.completed){
    const current=flowsOn(tasks,date).map(x=>x.id),next=orderWith(tasks,date,t.id,before);
    if(next.every((id,i)=>current[i]===id))return null;
    return {type:'reorder_flow',date,expected:next.map(id=>({id,revision:tasks.find(x=>x.id===id)!.revision}))};
  }
  return updateAction(t,date,null,before);
}
