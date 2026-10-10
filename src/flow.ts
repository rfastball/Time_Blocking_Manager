import type {WorkingDay} from './types.ts';
// Flow blocks have no stored start. Their position is derived from the day's
// anchor, their order and the fixed structures, so time passing never moves them.
export type Interval={start:number;end:number};
// `over`: laid out after working time because the work before it filled the day.
export type PlacedBlock<T>={task:T;start:number;end:number;over:boolean};

// Gaps between `busy` from `from` to `to`.
function gaps(busy:Interval[],from:number,to:number):Interval[]{
  const free:Interval[]=[];let cursor=from;
  for(const b of busy.map(b=>({start:Math.max(from,b.start),end:Math.min(to,b.end)})).filter(b=>b.end>b.start).sort((a,b)=>a.start-b.start)){
    if(b.start>cursor)free.push({start:cursor,end:b.start});cursor=Math.max(cursor,b.end);
  }
  if(to>cursor)free.push({start:cursor,end:to});
  return free;
}
export function freeIntervals(rule:WorkingDay,fixed:Interval[]):Interval[]{
  return rule.enabled?gaps([...rule.breaks,...fixed],rule.start,rule.end):[];
}
// Ordered, unsplit, earliest contiguous fit at or after the anchor. Work that no longer fits
// in working time continues after it, still in order, so dated work is always on the timetable.
export function layoutDay<T extends {duration:number}>(rule:WorkingDay,fixed:Interval[],flow:T[],anchor:number|null):PlacedBlock<T>[]{
  const free=freeIntervals(rule,fixed),after=gaps(fixed,rule.enabled?rule.end:rule.start,Infinity),placed:PlacedBlock<T>[]=[];
  let cursor=Math.max(rule.start,anchor??rule.start);
  for(const task of flow){
    const fit=(f:Interval)=>Math.max(f.start,cursor)+task.duration<=f.end;
    const slot=free.find(fit),late=slot?null:after.find(fit)!;
    const start=Math.max((slot??late)!.start,cursor);
    placed.push({task,start,end:start+task.duration,over:!slot});cursor=start+task.duration;
  }
  return placed;
}

export function byFlowOrder<T extends {id:string;flow_order?:number|null}>(a:T,b:T){
  return (a.flow_order??0)-(b.flow_order??0)||(a.id<b.id?-1:a.id>b.id?1:0);
}
// Insert before the first placed block whose middle lies below the pointer.
export function insertionBefore<T extends {id:string}>(placed:PlacedBlock<T>[],minute:number,moving?:string):string|null{
  return placed.find(b=>b.task.id!==moving&&minute<(b.start+b.end)/2)?.task.id??null;
}
export function moveInOrder(ids:string[],id:string,delta:number){
  const index=ids.indexOf(id),target=index+delta;
  if(index<0||target<0||target>=ids.length)return null;
  const next=[...ids];next.splice(index,1);next.splice(target,0,id);return next;
}
