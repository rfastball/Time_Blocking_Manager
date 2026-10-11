import type {Pile,Task} from './types.ts';
import {formatDuration} from './format.ts';

// The 미계획 bench: the 투입구 (id null) and the user's piles, left to right. A place is stored as a relation
// (which pile, which position in it); coordinates are always computed from it.
export type PileView={id:string|null;cards:Task[];total:number};

export const onBench=(t:Task)=>!t.plan_date&&!t.completed;
const byPileOrder=(a:Task,b:Task)=>(a.pile_order==null?0:1)-(b.pile_order==null?0:1)||(a.pile_order??0)-(b.pile_order??0)||(a.id<b.id?-1:a.id>b.id?1:0);
const byPosition=(a:Pile,b:Pile)=>a.position-b.position||(a.id<b.id?-1:a.id>b.id?1:0);

export function benchPiles(tasks:Task[],piles:Pile[]=[]):PileView[]{
  const open=tasks.filter(onBench),known=new Set(piles.map(p=>p.id));
  const cards=(id:string|null)=>open.filter(t=>(t.pile_id&&known.has(t.pile_id)?t.pile_id:null)===id).sort(byPileOrder);
  return [null,...[...piles].sort(byPosition).map(p=>p.id)].map(id=>{const list=cards(id);return {id,cards:list,total:list.reduce((n,t)=>n+t.duration,0)};});
}
// The 미계획 cell elsewhere reads the bench: the 투입구 first, then each pile left to right, each top to bottom.
export const benchOrder=(tasks:Task[],piles:Pile[]=[])=>benchPiles(tasks,piles).flatMap(p=>p.cards);

// Piles have no stored name; the reading name follows the top card, so moving piles never renames them.
export function pileName(p:PileView){
  const total=p.cards.length?`, ${formatDuration(p.total)}`:'';
  if(p.id===null)return `투입구, ${p.cards.length?p.cards.length+'개':'비어 있음'}${total}`;
  return `${pileLabel(p)}${total}`;
}
export function pileLabel(p:PileView){
  if(p.id===null)return '투입구';
  const [top,...rest]=p.cards;
  return top?`‘${top.title}’${rest.length?` 외 ${rest.length}`:''} 더미`:'빈 더미';
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

// After every change: only open unplanned work has a place or a proto mark, empty piles go, numbers count from 1.
export function normalize(tasks:Task[],piles:Pile[]):{tasks:Task[];piles:Pile[]}{
  let next=tasks.map(t=>onBench(t)?t:t.pile_id!=null||t.pile_order!=null||t.proto?{...t,pile_id:null,pile_order:null,proto:false}:t);
  const known=new Set(piles.map(p=>p.id));
  next=next.map(t=>onBench(t)&&t.pile_id&&!known.has(t.pile_id)?{...t,pile_id:null}:t);
  const used=new Set(next.filter(onBench).map(t=>t.pile_id).filter(Boolean));
  const kept=[...piles].filter(p=>used.has(p.id)).sort(byPosition).map((p,n)=>({id:p.id,position:n+1}));
  const order=new Map<string,number>();
  for(const id of [null,...kept.map(p=>p.id)])next.filter(t=>onBench(t)&&(t.pile_id??null)===id).sort(byPileOrder).forEach((t,n)=>order.set(t.id,n+1));
  next=next.map(t=>order.has(t.id)&&(t.pile_order!==order.get(t.id)||t.pile_id===undefined)?{...t,pile_id:t.pile_id??null,pile_order:order.get(t.id)!}:t);
  return {tasks:next,piles:kept};
}

// A new pile at `position` (1-based among user piles); those at or after it move right.
export function insertPile(piles:Pile[],id:string,position:number):Pile[]{
  return [...piles.map(p=>p.position>=position?{...p,position:p.position+1}:p),{id,position}];
}
export function movePile(piles:Pile[],id:string,position:number):Pile[]{
  const ids=[...piles].sort(byPosition).map(p=>p.id),from=ids.indexOf(id);if(from<0)return piles;
  ids.splice(from,1);ids.splice(Math.max(0,Math.min(position-1,ids.length)),0,id);
  return ids.map((x,n)=>({id:x,position:n+1}));
}
