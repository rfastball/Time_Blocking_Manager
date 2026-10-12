import type {Pile,Task} from './types.ts';
import {formatDuration} from './format.ts';

// The 준비 tab keeps open unplanned work in two places: the 들어옴 (no pile) and one ordered shelf (the reserved pile).
// Older piles only survive in files not yet migrated; they read as part of the shelf, after it, left to right.
export const SHELF='shelf';
export type Place='inbox'|'shelf';

export const onBench=(t:Task)=>!t.plan_date&&!t.completed;
export const placeOf=(t:Task):Place=>t.pile_id?'shelf':'inbox';
export const pileOf=(place:Place):string|null=>place==='shelf'?SHELF:null;
const byPileOrder=(a:Task,b:Task)=>(a.pile_order==null?0:1)-(b.pile_order==null?0:1)||(a.pile_order??0)-(b.pile_order??0)||(a.id<b.id?-1:a.id>b.id?1:0);

export function inboxCards(tasks:Task[]):Task[]{return tasks.filter(t=>onBench(t)&&!t.pile_id).sort(byPileOrder);}
export function shelfCards(tasks:Task[],piles:Pile[]=[]):Task[]{
  const rank=(t:Task)=>t.pile_id===SHELF?0:piles.find(p=>p.id===t.pile_id)?.position??Infinity;
  return tasks.filter(t=>onBench(t)&&!!t.pile_id).sort((a,b)=>rank(a)-rank(b)||byPileOrder(a,b));
}
export const cardsIn=(place:Place,tasks:Task[],piles:Pile[]=[])=>place==='shelf'?shelfCards(tasks,piles):inboxCards(tasks);
// The 준비 cell elsewhere reads the shelf first (work ready to fill a gap), then the 들어옴.
export const benchOrder=(tasks:Task[],piles:Pile[]=[])=>[...shelfCards(tasks,piles),...inboxCards(tasks)];

// Where a card sits, in the words the screens use.
export function placeLabel(t:Task,tasks:Task[],piles:Pile[]=[]){
  if(placeOf(t)==='inbox')return '들어옴';
  return `선반 · ${shelfCards(tasks,piles).findIndex(x=>x.id===t.id)+1}번째`;
}
export function placeName(place:Place,tasks:Task[],piles:Pile[]=[]){
  const cards=cardsIn(place,tasks,piles),total=cards.reduce((n,t)=>n+t.duration,0);
  return `${place==='shelf'?'선반':'들어옴'}, ${cards.length?`${cards.length}개, ${formatDuration(total)}`:'비어 있음'}`;
}

// Puts `ids`, in order, into `pile` before the card now at `index` among the others; returns new task objects.
// The same rule the store applies, so a held block can show where it lands.
export function place(tasks:Task[],ids:string[],pile:string|null,index:number):Task[]{
  const members=tasks.filter(t=>onBench(t)&&(t.pile_id??null)===pile&&!ids.includes(t.id)).sort(byPileOrder).map(t=>t.id);
  const at=Math.max(0,Math.min(index,members.length));
  members.splice(at,0,...ids);
  const slot=new Map(members.map((id,n)=>[id,n+1]));
  return tasks.map(t=>slot.has(t.id)?{...t,pile_id:pile,pile_order:slot.get(t.id)!}:t);
}

// After every change, as the store does: only open unplanned work has a place or a proto mark; sized work that lost its date
// without a chosen place goes on top of the shelf; the shelf holds no protos; empty piles go; numbers count from 1.
export function normalize(tasks:Task[],piles:Pile[]):{tasks:Task[];piles:Pile[]}{
  let next=tasks.map(t=>onBench(t)?t:t.pile_id!=null||t.pile_order!=null||t.proto?{...t,pile_id:null,pile_order:null,proto:false}:t);
  const orphan=(t:Task)=>onBench(t)&&!t.proto&&t.pile_id==null&&t.pile_order==null;
  if(next.some(orphan)){
    if(!piles.some(p=>p.id===SHELF))piles=[...piles,{id:SHELF,position:Math.max(0,...piles.map(p=>p.position))+1}];
    next=next.map(t=>orphan(t)?{...t,pile_id:SHELF}:t);
  }
  next=next.map(t=>onBench(t)&&t.proto&&t.pile_id===SHELF?{...t,proto:false}:t);
  const known=new Set(piles.map(p=>p.id));
  next=next.map(t=>onBench(t)&&t.pile_id&&!known.has(t.pile_id)?{...t,pile_id:null}:t);
  const used=new Set(next.filter(onBench).map(t=>t.pile_id).filter(Boolean));
  const kept=[...piles].filter(p=>used.has(p.id)).sort((a,b)=>a.position-b.position||(a.id<b.id?-1:1)).map((p,n)=>({id:p.id,position:n+1}));
  const order=new Map<string,number>();
  for(const id of [null,...kept.map(p=>p.id)])next.filter(t=>onBench(t)&&(t.pile_id??null)===id).sort(byPileOrder).forEach((t,n)=>order.set(t.id,n+1));
  next=next.map(t=>order.has(t.id)&&(t.pile_order!==order.get(t.id)||t.pile_id===undefined)?{...t,pile_id:t.pile_id??null,pile_order:order.get(t.id)!}:t);
  return {tasks:next,piles:kept};
}

// A new pile at `position` (1-based); those at or after it move right. Only the shelf is ever created now.
export function insertPile(piles:Pile[],id:string,position:number):Pile[]{
  return [...piles.map(p=>p.position>=position?{...p,position:p.position+1}:p),{id,position}];
}
