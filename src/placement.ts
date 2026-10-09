import type {Task,WorkingDay} from './types.ts';
export type PlacementIssue={kind:'overlap'|'unavailable'|'outside'|'dayOff'|'grid';label:string};
export function selectionRange(anchor:number,pointer:number){
  return {start:Math.min(anchor,pointer),duration:Math.abs(pointer-anchor)+15};
}
export function splitDuration(duration:number,position:number){
  return Math.max(15,Math.min(duration-15,Math.round(position/15)*15));
}
export function placementIssue(id:string,date:string,start:number,duration:number,rule:WorkingDay,tasks:Task[]):PlacementIssue|null{
  const time=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`,end=start+duration;
  if(!Number.isFinite(start)||!Number.isFinite(duration)||duration<15||duration%15||start%15)return {kind:'grid',label:'15분 단위만 가능'};
  if(!rule.enabled)return {kind:'dayOff',label:'작업하지 않는 날'};
  if(start<rule.start||end>rule.end)return {kind:'outside',label:`근무 시간 ${time(rule.start)}–${time(rule.end)} 밖`};
  const blocked=rule.breaks.find(b=>start<b.end&&end>b.start);
  if(blocked)return {kind:'unavailable',label:`${blocked.label}(작업 불가)과 겹침`};
  const overlaps=tasks.filter(t=>{if(t.id===id||!t.starts_at?.startsWith(date))return false;const m=Number(t.starts_at.slice(11,13))*60+Number(t.starts_at.slice(14,16));return start<m+t.duration&&end>m;});
  return overlaps.length?{kind:'overlap',label:`‘${overlaps[0].title}’${overlaps.length>1?` 외 ${overlaps.length-1}건`:''}과 겹침`}:null;
}
