import {motion} from 'motion/react';
import {formatDuration} from '../../format.ts';
import {dateOf,time} from '../../dates.ts';
import {getState} from '../store/state.ts';
import {dayRule} from '../store/tasks.ts';
import {reduced} from '../ui/motion.ts';
import {Lock} from '../ui/icons.tsx';
import {OffHours} from './OffHours.tsx';
import type {Held} from './drag.tsx';

// A held block's shape change toward its destination.
const MORPH_MS=150,MORPH_EASE=[.2,.8,.2,1] as const;

// The copy under the hand: the place follows the hand at once, the shape eases into the destination's.
export function HeldBlock({held,out,outside}:{held:Held;out:number;outside:number}){
  // Passing through, it looks as the last place made it and says nothing about the place under the hand.
  const {task,intent,slot,width,height,density='full',passing=false}=held,zone=passing?held.look??'none':intent.zone;
  const rail=zone==='rail',snapped=rail&&!passing,fixedLook=rail||(!!task.starts_at&&zone==='none'),bad=!intent.ok&&!passing;
  const many=held.ids.length,total=held.ids.reduce((n,id)=>n+(getState().snapshot?.tasks.find(t=>t.id===id)?.duration??0),0);
  // Where it lands, said only where the place itself does not show it: a date column's end.
  const place=!passing&&intent.zone==='date'&&intent.date&&held.ids.length&&!held.column&&!held.axis?`${dateOf(intent.date).getMonth()+1}월 ${dateOf(intent.date).getDate()}일 순서 끝${outside?` · 근무 외 ${Math.round(outside/60*100)/100}h`:''}`:'';
  // Still a proto only where it stays one: lifted, in the 들어옴, or headed back to 준비.
  const proto=task.proto&&many===1&&['none','inbox','tray','wait'].includes(zone);
  const at=passing?null:rail?{start:intent.start!,end:intent.start!+task.duration}:intent.zone==='body'?slot:null;
  // Keep the same point under the pointer as the copy changes width or height between surfaces.
  const shiftX=snapped?0:-held.grabX*(width/held.startRect.width-1),shiftY=snapped?0:-held.grabY*(height/held.startRect.height-1);
  // The place follows the hand at once; only the shape eases into the destination's: width first, height a little after.
  const shape=reduced()?{duration:0}:{duration:MORPH_MS/1000,ease:MORPH_EASE},late={...shape,delay:reduced()?0:MORPH_MS/4000};
  // Bypass the animated grab offsets while snapped, including the first frame on the rail.
  return <motion.div className={'blk held '+(held.folded?'rail-token ':'')+(zone==='wait'?'waits ':'')+(held.column?'column ':'')+(fixedLook?'fixed':'flow')+(height<(held.column?47:56)?' compact':'')+(density!=='full'?' '+density:'')+(bad?' bad':'')+(!rail&&!passing&&slot?.over&&intent.zone==='body'?' over':'')+(proto?' proto':'')}
    style={{marginLeft:snapped?0:'var(--grab-x)',marginTop:snapped?0:'var(--grab-y)'}}
    initial={false} animate={{x:bad?[0,-4,3,-2,0]:0,width,height,'--grab-x':shiftX+'px','--grab-y':shiftY+'px'}}
    transition={{x:{duration:reduced()?0:.18},width:shape,'--grab-x':shape,height:late,'--grab-y':late}}>
    <div className="tile">
      {at&&intent.date&&<OffHours start={at.start} end={at.end} rule={dayRule(intent.date)} position={rail?held.axis?.position:undefined}/>}
      {/* Latching, the clasp shoots out of the runner and seats on the rail: fast, no overshoot. */}
      {fixedLook&&<motion.span className="latch" style={{transformOrigin:'0 50%'}} initial={snapped?{scaleX:.15}:false} animate={{scaleX:1}} transition={{duration:.09,ease:[.2,.9,.3,1]}}><Lock open/></motion.span>}
      <span className="chk"/>
      <span className="main"><span className="ttl-row"><span className="ttl">{task.title}</span>{many>1&&<b className="held-more">+{many-1}</b>}</span>
        <span className="meta">{at?`${time(at.start)}–${time(at.end)}`:proto?'':formatDuration(many>1?total:task.duration)}</span></span>
    </div>
    {place&&!bad&&!held.dropping&&<span className="held-why where">{place}</span>}
    {bad&&!held.dropping&&<span className="held-why">{intent.reason}</span>}
    {!bad&&!passing&&held.boundary&&!held.dropping&&<span className="held-why boundary">근무시간 경계</span>}
    {!bad&&!passing&&!held.boundary&&!place&&out>0&&!held.dropping&&<span className="held-why out">근무 외 {out}개</span>}
  </motion.div>;
}
