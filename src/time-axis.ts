import type {WorkingDay} from './types';

export type TimeAxis={start:number;end:number;scale:number;height:number;position:(minute:number)=>number;minute:(y:number)=>number};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

export function createTimeAxis(start:number,end:number,scale=1):TimeAxis{
  start=clamp(start,0,1425);end=clamp(end,start+15,1440);
  const tail=(distance:number)=>60*Math.log1p(distance/60)*scale;
  const before=tail(start),middle=(end-start)*scale,height=before+middle+tail(1440-end);
  const position=(minute:number)=>{const m=clamp(minute,0,1440);return m<start?before-tail(start-m):m>end?before+middle+tail(m-end):before+(m-start)*scale;};
  const minute=(y:number)=>{const p=clamp(y,0,height);return clamp(p<before?start-60*Math.expm1((before-p)/(60*scale)):p>before+middle?end+60*Math.expm1((p-before-middle)/(60*scale)):start+(p-before)/scale,0,1440);};
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

export function readTimeAxis(element:HTMLElement):TimeAxis{
  return createTimeAxis(Number(element.dataset.axisStart),Number(element.dataset.axisEnd),Number(element.dataset.axisScale));
}
export function setTimeAxis(element:HTMLElement,axis:TimeAxis){
  element.dataset.axisStart=String(axis.start);element.dataset.axisEnd=String(axis.end);element.dataset.axisScale=String(axis.scale);
}
export const timeAxisAttributes=(axis:TimeAxis)=>`data-axis-start="${axis.start}" data-axis-end="${axis.end}" data-axis-scale="${axis.scale}"`;

export function timeAxisLabelVisible(axis:TimeAxis,minute:number){
  return minute===0||minute===1440||(axis.position(minute)-axis.position(Math.max(0,minute-60))>=24&&axis.position(Math.min(1440,minute+60))-axis.position(minute)>=24);
}

export function paintCalendarAxis(surface:HTMLElement,axis:TimeAxis){
  const container=surface.closest<HTMLElement>('.week-time-grid')||surface;
  container.style.height=axis.height+'px';
  const surfaces=container.matches('[data-calendar-surface]')?[container]:Array.from(container.querySelectorAll<HTMLElement>('[data-calendar-surface]'));
  surfaces.forEach(el=>setTimeAxis(el,axis));
  container.querySelectorAll<HTMLElement>('[data-minute]').forEach(el=>{
    const start=Number(el.dataset.minute);el.style.top=axis.position(start)+'px';
    if(el.dataset.duration)el.style.height=(axis.position(start+Number(el.dataset.duration))-axis.position(start))+'px';
    if(el.hasAttribute('data-hour-label'))el.hidden=!timeAxisLabelVisible(axis,start);
  });
  container.querySelectorAll<HTMLElement>('[data-split]').forEach(el=>{
    const block=el.closest<HTMLElement>('[data-drag]')!,start=Number(block.dataset.minute);
    el.style.top=(axis.position(start+Number(el.dataset.splitDuration))-axis.position(start))+'px';
  });
}
