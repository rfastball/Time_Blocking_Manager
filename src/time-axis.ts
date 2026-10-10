import type {WorkingDay} from './types';

export type TimeAxis={start:number;end:number;scale:number;height:number;position:(minute:number)=>number;minute:(y:number)=>number};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

// `end` may pass midnight only to show flow work that runs over; the axis then stops at `end`.
export function createTimeAxis(start:number,end:number,scale=1):TimeAxis{
  start=clamp(start,0,1425);end=Math.max(end,start+15);
  const last=Math.max(1440,end),tail=(distance:number)=>15*Math.log1p(distance/15)*scale;
  const before=tail(start),middle=(end-start)*scale,height=before+middle+tail(last-end);
  const position=(minute:number)=>{const m=clamp(minute,0,last);return m<start?before-tail(start-m):m>end?before+middle+tail(m-end):before+(m-start)*scale;};
  const minute=(y:number)=>{const p=clamp(y,0,height);if(p===0)return 0;if(p===height)return last;return clamp(p<before?start-15*Math.expm1((before-p)/(15*scale)):p>before+middle?end+15*Math.expm1((p-before-middle)/(15*scale)):start+(p-before)/scale,0,last);};
  return {start,end,scale,height,position,minute};
}

export function timeAxisForDays(days:WorkingDay[],scale=1):TimeAxis{
  const enabled=days.filter(day=>day.enabled);
  return createTimeAxis(Math.max(0,(enabled.length?Math.min(...enabled.map(day=>day.start)):540)-30),Math.min(1440,(enabled.length?Math.max(...enabled.map(day=>day.end)):1080)+30),scale);
}

export function expandTimeAxis(axis:TimeAxis,minute:number):TimeAxis{
  if(minute>=axis.start&&minute<=axis.end)return axis;
  return createTimeAxis(Math.min(axis.start,Math.max(0,Math.floor(minute/60)*60-60)),Math.max(axis.end,Math.min(1440,Math.ceil(minute/60)*60+60)),axis.scale);
}

// Hour labels in the compressed outer hours would overlap; show one only where it has room.
export function timeAxisLabelVisible(axis:TimeAxis,minute:number){
  return minute===0||minute===1440||(axis.position(minute)-axis.position(Math.max(0,minute-60))>=24&&axis.position(Math.min(1440,minute+60))-axis.position(minute)>=24);
}
