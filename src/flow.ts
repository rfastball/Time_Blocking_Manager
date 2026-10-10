import type {WorkingDay} from './types.ts';
// Flow blocks have no stored start. Their position is derived from the day's
// anchor, their order and the fixed structures, so time passing never moves them.
export type Interval={start:number;end:number};
export type PlacedBlock<T>={task:T;start:number;end:number};
export type UnplacedReason='dayOff'|'total'|'contiguous'|'queued';
export type UnplacedBlock<T>={task:T;reason:UnplacedReason};
export type DayLayoutResult<T>={placed:PlacedBlock<T>[];unplaced:UnplacedBlock<T>[]};

export function freeIntervals(rule:WorkingDay,fixed:Interval[]):Interval[]{
  if(!rule.enabled)return [];
  const busy=[...rule.breaks,...fixed].map(b=>({start:Math.max(rule.start,b.start),end:Math.min(rule.end,b.end)})).filter(b=>b.end>b.start).sort((a,b)=>a.start-b.start);
  const free:Interval[]=[];let cursor=rule.start;
  for(const b of busy){if(b.start>cursor)free.push({start:cursor,end:b.start});cursor=Math.max(cursor,b.end);}
  if(rule.end>cursor)free.push({start:cursor,end:rule.end});
  return free;
}
export function freeMinutesFrom(free:Interval[],from:number){
  return free.reduce((sum,f)=>sum+Math.max(0,f.end-Math.max(f.start,from)),0);
}
// Ordered, unsplit, earliest contiguous fit at or after the anchor. The first
// block that cannot fit stops placement so later blocks never overtake it.
export function layoutDay<T extends {duration:number}>(rule:WorkingDay,fixed:Interval[],flow:T[],anchor:number|null):DayLayoutResult<T>{
  if(!rule.enabled)return {placed:[],unplaced:flow.map(task=>({task,reason:'dayOff'}))};
  const free=freeIntervals(rule,fixed),placed:PlacedBlock<T>[]=[],unplaced:UnplacedBlock<T>[]=[];
  let cursor=Math.max(rule.start,anchor??rule.start);
  for(const task of flow){
    if(!unplaced.length){
      const slot=free.find(f=>Math.max(f.start,cursor)+task.duration<=f.end);
      if(slot){const start=Math.max(slot.start,cursor);placed.push({task,start,end:start+task.duration});cursor=start+task.duration;continue;}
      unplaced.push({task,reason:freeMinutesFrom(free,cursor)>=task.duration?'contiguous':'total'});continue;
    }
    const fits=free.some(f=>Math.max(f.start,cursor)+task.duration<=f.end);
    unplaced.push({task,reason:fits?'queued':freeMinutesFrom(free,cursor)>=task.duration?'contiguous':'total'});
  }
  return {placed,unplaced};
}
export const unplacedLabel:Record<UnplacedReason,string>={dayOff:'휴무일',total:'공간 부족',contiguous:'연속 공간 부족',queued:'앞 작업 대기'};

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
