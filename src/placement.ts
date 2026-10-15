import type {Task,WorkingDay} from './types.ts';
import {freeIntervals,type Interval} from './flow.ts';
import {startMinute} from './dates.ts';
export type PlacementIssue={kind:'overlap'|'outside'|'grid';label:string};

// The complement of working time, clipped to this block; overlapping reasons count only once.
export function unavailableParts(start:number,end:number,rule:WorkingDay):Interval[]{
  const parts:Interval[]=[];let cursor=start;
  for(const free of freeIntervals(rule,[])){
    if(free.end<=cursor||free.start>=end)continue;
    if(free.start>cursor)parts.push({start:cursor,end:Math.min(end,free.start)});
    cursor=Math.max(cursor,Math.min(end,free.end));
  }
  if(cursor<end)parts.push({start:cursor,end});
  return parts;
}

// A deliberate extra 24px clears the working-time lip. Already-outside blocks can move back freely.
export function resistWorkingBoundary(from:number,to:number,duration:number,rule:WorkingDay,position:(minute:number)=>number){
  const free=freeIntervals(rule,[]).find(f=>from>=f.start&&from+duration<=f.end);
  if(!free)return to;
  const edge=to<free.start?free.start:to+duration>free.end?free.end-duration:null;
  if(edge===null)return to;
  const tip=to>edge?duration:0;
  return Math.abs(position(to+tip)-position(edge+tip))<24?edge:to;
}
export function selectionRange(anchor:number,pointer:number){
  return {start:Math.min(anchor,pointer),duration:Math.abs(pointer-anchor)+15};
}
export function placementIssue(id:string,date:string,start:number,duration:number,_rule:WorkingDay,tasks:Task[]):PlacementIssue|null{
  const end=start+duration;
  if(!Number.isFinite(start)||!Number.isFinite(duration)||duration<15||duration%15||start%15)return {kind:'grid',label:'15분 단위만 가능'};
  if(start<0||end>1440)return {kind:'outside',label:'같은 날짜 안에 배치해 주세요'};
  const overlaps=tasks.filter(t=>{if(t.id===id||!t.starts_at?.startsWith(date))return false;const m=startMinute(t.starts_at);return start<m+t.duration&&end>m;});
  return overlaps.length?{kind:'overlap',label:`‘${overlaps[0].title}’${overlaps.length>1?` 외 ${overlaps.length-1}건`:''}과 겹침`}:null;
}
