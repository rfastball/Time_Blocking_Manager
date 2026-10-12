import type {Action,Pile,Task} from './types.ts';
import {time} from './dates.ts';
import {byFlowOrder} from './flow.ts';
import {benchPiles} from './bench.ts';

// Where a held block would go if it were let go right now.
// body: into that day's order before `before` · rail: fixed at `start` · below/date: end of that day's order · tray: back to 미계획
// · pile: onto the 미계획 bench, into `pile` (null: the 투입구) before the card at `index`, or as a new pile at position `create`.
export type Zone='none'|'body'|'rail'|'below'|'date'|'tray'|'pile'|'canvas';
// `ids`: every block carried, in order (a selection or a whole pile); `carry`: the pile carried by its handle.
export type Intent={id:string;zone:Zone;date:string|null;before:string|null;start:number|null;ok:boolean;reason:string|null;
  ids?:string[];carry?:{pile:string|null};pile?:string|null;index?:number;create?:number|null;positions?:{id:string;x:number;y:number}[]};
export const noIntent=(id:string):Intent=>({id,zone:'none',date:null,before:null,start:null,ok:true,reason:null});
export const carried=(i:Intent)=>i.ids?.length?i.ids:[i.id];

const flowsOn=(tasks:Task[],date:string,except?:string)=>tasks.filter(t=>t.plan_date===date&&!t.starts_at&&!t.completed&&t.id!==except).sort(byFlowOrder);
function orderWith(tasks:Task[],date:string,id:string,before:string|null){
  const ids=flowsOn(tasks,date,id).map(t=>t.id),at=before?ids.indexOf(before):-1;
  ids.splice(at<0?ids.length:at,0,id);
  return ids;
}
const lands=(i:Intent)=>i.zone!=='none'&&!(i.zone==='rail'&&!i.ok)&&(i.zone==='tray'||i.zone==='pile'||i.zone==='canvas'&&!!i.positions?.length||!!i.date);

// The tasks as they would be after the drop. Used to lay the days out while the block is held.
// The bench draws its own landing slot, so a pile drop leaves the tasks as they are.
export function applyIntent(tasks:Task[],intent:Intent|null):Task[]{
  if(!intent||!lands(intent)||intent.zone==='pile')return tasks;
  const {id,date}=intent,ids=carried(intent);
  if(intent.zone==='canvas')return tasks.map(t=>{
    const p=intent.positions?.find(p=>p.id===t.id);return p?{...t,plan_date:null,starts_at:null,flow_order:null,board_x:p.x,board_y:p.y}:t;
  });
  if(intent.zone==='tray')return tasks.map(t=>t.id===id?{...t,plan_date:null,starts_at:null,flow_order:null}:t);
  if(intent.zone==='rail')return tasks.map(t=>t.id===id?{...t,plan_date:date,starts_at:date+'T'+time(intent.start!),flow_order:null}:t);
  if(ids.length>1){
    const next=flowsOn(tasks,date!).map(t=>t.id).filter(x=>!ids.includes(x));
    const at=intent.zone==='body'&&intent.before?next.indexOf(intent.before):-1;
    next.splice(at<0?next.length:at,0,...ids);
    const order=new Map(next.map((x,n)=>[x,n+1]));
    return tasks.map(t=>order.has(t.id)?{...t,plan_date:date,starts_at:null,flow_order:order.get(t.id)!}:t);
  }
  const order=new Map(orderWith(tasks,date!,id,intent.zone==='body'?intent.before:null).map((x,n)=>[x,n+1]));
  return tasks.map(t=>order.has(t.id)?{...t,plan_date:date,starts_at:null,flow_order:order.get(t.id)!}:t);
}

export const updateAction=(t:Task,plan_date:string|null,starts_at:string|null,before:string|null=null,duration=t.duration):Extract<Action,{type:'update'}>=>
  ({type:'update',id:t.id,expected_revision:t.revision,title:t.title,body:t.body,starts_at,duration,plan_date,before});
const revisions=(tasks:Task[],ids:string[])=>ids.map(id=>({id,revision:tasks.find(t=>t.id===id)!.revision}));

// Onto the bench: a card into a pile or a new pile, a whole pile moved or stacked onto another.
function pileAction(tasks:Task[],piles:Pile[],intent:Intent,newPile:()=>string):Action|null{
  const ids=carried(intent),bench=benchPiles(tasks,piles);
  if(intent.carry){
    const from=intent.carry.pile;
    if(intent.create!=null){
      const current=piles.find(p=>p.id===from);
      return from===null||!current||current.position===intent.create?null:{type:'move_pile',pile:from,position:intent.create};
    }
    if((intent.pile??null)===from)return null;
    const target=bench.find(p=>p.id===(intent.pile??null));
    return target?{type:'place_unplanned',items:revisions(tasks,ids),pile:intent.pile??null,index:target.cards.length}:null;
  }
  if(intent.create!=null)return {type:'place_unplanned',items:revisions(tasks,ids),pile:newPile(),create_at:intent.create,index:0};
  const pile=intent.pile??null,index=intent.index??0,target=bench.find(p=>p.id===pile);
  if(!target)return null;
  // Put back where it already is: nothing to store.
  const others=target.cards.filter(t=>!ids.includes(t.id)),after=[...others];after.splice(Math.min(index,others.length),0,...ids.map(id=>tasks.find(t=>t.id===id)!));
  if(after.length===target.cards.length&&after.every((t,n)=>target.cards[n].id===t.id))return null;
  return {type:'place_unplanned',items:revisions(tasks,ids),pile,index};
}

// The single stored command for a drop, or null when nothing would change.
export function intentAction(tasks:Task[],intent:Intent,piles:Pile[]=[],newPile:()=>string=()=>crypto.randomUUID()):Action|null{
  const t=tasks.find(x=>x.id===intent.id);
  if(!t||!lands(intent))return null;
  if(intent.zone==='canvas'){
    const items=intent.positions!.map(p=>({...p,revision:tasks.find(t=>t.id===p.id)!.revision}));
    return items.every(p=>{const t=tasks.find(t=>t.id===p.id)!;return !t.plan_date&&t.board_x===p.x&&t.board_y===p.y;})?null:{type:'place_board',items};
  }
  if(intent.zone==='pile')return pileAction(tasks,piles,intent,newPile);
  if(intent.zone==='tray')return t.plan_date&&!t.completed?updateAction(t,null,null):null;
  const date=intent.date!,ids=carried(intent);
  // Several at once retain their order at the pointed slot; date heads append.
  if(ids.length>1)return {type:'ship_flow',date,items:revisions(tasks,ids),...(intent.zone==='body'?{before:intent.before}:{})};
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
