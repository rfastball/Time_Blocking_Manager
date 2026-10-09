import type {WorkingDay} from './types.ts';

export type AvailabilityTarget='work'|number;
export type AvailabilityEdge='move'|'start'|'end'|'draw';
const snap=(minute:number)=>Math.max(0,Math.min(1440,Math.round(minute/15)*15));

/** Work and breaks share the same physical boundaries; no band disappears during a gesture. */
export function changeAvailabilityBand(source:WorkingDay,target:AvailabilityTarget,edge:AvailabilityEdge,start:number,end?:number):WorkingDay{
  if(!Number.isFinite(start)||end!==undefined&&!Number.isFinite(end))throw Error('시간을 확인하세요.');
  const day=structuredClone(source),band=target==='work'?day:day.breaks[target];
  if(!band)throw Error('선택한 휴식이 없습니다.');
  const length=band.end-band.start;
  if(edge==='move'){
    const next=Math.min(1440-length,snap(start)),delta=next-band.start;
    band.start=next;band.end=next+length;
    if(target==='work')day.breaks.forEach(b=>{b.start+=delta;b.end+=delta;});
  }else if(edge==='start')band.start=Math.min(band.end-15,snap(start));
  else if(edge==='end')band.end=Math.max(band.start+15,snap(start));
  else {band.start=Math.min(snap(start),1425);band.end=Math.max(band.start+15,snap(end??start+30));}
  if(target==='work'){
    day.start=Math.min(day.start,...day.breaks.map(b=>b.start));
    day.end=Math.max(day.end,...day.breaks.map(b=>b.end));
  }else {
    if(day.breaks.some((b,i)=>i!==target&&band.start<b.end&&band.end>b.start))throw Error('다른 휴식과 겹칩니다. 빈 시간으로 옮기세요.');
    day.start=Math.min(day.start,band.start);day.end=Math.max(day.end,band.end);
  }
  day.enabled=true;
  return day;
}

export function addAvailabilityBreak(source:WorkingDay,start:number,end=start+30):WorkingDay{
  const day=structuredClone(source);
  day.breaks.push({start:Math.min(snap(start),1425),end:Math.max(Math.min(snap(start),1425)+15,snap(end)),label:'휴식'});
  return changeAvailabilityBand(day,day.breaks.length-1,'draw',start,end);
}
