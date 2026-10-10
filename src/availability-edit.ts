import type {DayException,Settings,WorkingDay} from './types.ts';
import type {TimeAxis} from './time-axis.ts';
import {addAvailabilityBreak,changeAvailabilityBand,type AvailabilityEdge,type AvailabilityTarget} from './availability-band.ts';

// A press becomes a gesture only after this much vertical travel; shorter presses only select.
export const GESTURE_THRESHOLD=10;
export type BandMode='work'|'break';
export type BandGesture={drawing:boolean;target:AvailabilityTarget;edge:AvailabilityEdge};

export const bandOf=(day:WorkingDay,target:AvailabilityTarget)=>target==='work'?day:day.breaks[target];
export const bandLabel=(day:WorkingDay,target:AvailabilityTarget)=>target==='work'?'근무':day.breaks[target]?.label??'';

// Empty space draws; in break mode the body of the work band is drawing ground as well.
export function bandGesture(band:AvailabilityTarget|null,edge:'start'|'end'|null,mode:BandMode):BandGesture{
  const drawing=band===null||mode==='break'&&band==='work'&&!edge;
  return {drawing,target:band??'work',edge:edge??(drawing?'draw':'move')};
}
const slot=(m:number)=>Math.min(1425,Math.floor(m/15)*15);
// The day while the pointer is at pointMinute. Throws the user-facing reason when the shape is impossible.
export function gestureDay(source:WorkingDay,g:BandGesture,mode:BandMode,originMinute:number,pointMinute:number):{day:WorkingDay;target:AvailabilityTarget}{
  const delta=Math.round((pointMinute-originMinute)/15)*15;
  if(g.drawing){
    const origin=slot(originMinute),point=Math.max(0,Math.min(1425,origin+delta)),a=Math.min(origin,point),b=Math.max(origin,point)+15;
    return mode==='break'?{day:addAvailabilityBreak(source,a,b),target:source.breaks.length}:{day:changeAvailabilityBand(source,'work','draw',a,b),target:'work'};
  }
  const band=bandOf(source,g.target);
  return {day:changeAvailabilityBand(source,g.target,g.edge,(g.edge==='end'?band.end:band.start)+delta),target:g.target};
}

export const shiftBand=(day:WorkingDay,target:AvailabilityTarget,delta:number)=>changeAvailabilityBand(day,target,'move',bandOf(day,target).start+delta);
export const moveEdge=(day:WorkingDay,target:AvailabilityTarget,edge:'start'|'end',delta:number)=>changeAvailabilityBand(day,target,edge,bandOf(day,target)[edge]+delta);
export function toggleDay(day:WorkingDay):WorkingDay{return {...structuredClone(day),enabled:!day.enabled};}
export function deleteBreak(day:WorkingDay,index:number):WorkingDay{const next=structuredClone(day);next.breaks.splice(index,1);return next;}
export function renameBreak(day:WorkingDay,index:number,label:string):WorkingDay{const next=structuredClone(day);next.breaks[index].label=label;return next;}
// A new 30-minute break: around noon when free, otherwise the first free slot of the working range.
export function addBreak(day:WorkingDay):{day:WorkingDay;target:number}{
  const free=(m:number)=>m+30<=day.end&&!day.breaks.some(b=>m<b.end&&m+30>b.start);
  let start=Math.max(day.start,Math.min(720,day.end-30));
  if(!free(start)){start=day.start;while(start+30<=day.end&&!free(start))start+=15;}
  if(!free(start))throw Error('휴식이 들어갈 빈 시간이 없습니다. 근무 끝을 늘려 주세요.');
  return {day:addAvailabilityBreak(day,start),target:day.breaks.length};
}

export function readTargets(hours:string,days:string){
  const target=Number(hours)*60,count=Number(days);
  if(!hours.trim()||!days.trim()||!Number.isFinite(target)||target<15||target>10080||target%15||!Number.isInteger(count)||count<1||count>7)throw Error('주간 목표는 15분 단위, 근무일은 1–7일로 정하세요.');
  return {weekly_target:target,work_days:count};
}
export const missingBreakName=(days:WorkingDay[])=>days.some(d=>d.breaks.some(b=>!b.label.trim()));
export function rhythmTotal(days:WorkingDay[]){
  let minutes=0,count=0;
  for(const d of days)if(d.enabled){count++;minutes+=d.end-d.start-d.breaks.reduce((n,b)=>n+b.end-b.start,0);}
  return {minutes,days:count};
}

export function withException(settings:Settings,date:string,kind:DayException['kind'],day:WorkingDay):Settings{
  return {...settings,exceptions:[...(settings.exceptions??[]).filter(e=>e.date!==date),{date,kind,day:{...day,enabled:kind==='leave'?false:day.enabled}}]};
}
export function withoutException(settings:Settings,date:string):Settings{return {...settings,exceptions:(settings.exceptions??[]).filter(e=>e.date!==date)};}

// Hour labels that keep at least `gap` pixels between them on a compressed axis.
export function hourLabels(axis:TimeAxis,gap=23){
  const out:number[]=[];let previous=-Infinity;
  for(let h=0;h<=24;h++){const y=axis.position(h*60);if(y-previous<gap)continue;previous=y;out.push(h*60);}
  return out;
}
