import {unavailableParts} from '../../placement.ts';
import type {WorkingDay} from '../../types.ts';

// One shared mask for resting, resizing and held blocks; time-axis geometry may be compressed.
export function OffHours({start,end,rule,position=(m:number)=>m}:{start:number;end:number;rule:WorkingDay;position?:(m:number)=>number}){
  const top=position(start),height=position(end)-top;
  if(height<=0)return null;
  return unavailableParts(start,end,rule).map(p=><span key={p.start} className="off-part" aria-hidden="true"
    style={{top:`${(position(p.start)-top)/height*100}%`,height:`${(position(p.end)-position(p.start))/height*100}%`}}/>);
}
