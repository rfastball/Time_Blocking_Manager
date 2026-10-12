import {useRef} from 'react';
import {useDraggable} from '@dnd-kit/core';
import {AnimatePresence,motion} from 'motion/react';
import {isCompositionKey} from '../../capture.ts';
import {formatDuration} from '../../format.ts';
import {dateLabel} from '../../dates.ts';
import type {Task} from '../../types.ts';
import {useApp} from '../store/state.ts';
import {closeComposer,editCapture,submitCapture} from '../store/tasks.ts';
import {settle} from '../ui/motion.ts';
import {Dots} from '../ui/icons.tsx';
import {useDrag,useRegion} from './drag.tsx';
import {benchOrder} from '../../bench.ts';

// 준비 work drawn at the same scale as the timetable, so its size reads against free space.
export function InboxTray({scale,overdue=[],onOpen,selected,heading='준비',className=''}:{scale:number;overdue?:Task[];onOpen:(t:Task)=>void;selected?:string|null;heading?:string;className?:string}){
  const {drafts,ready,draftLoaded,snapshot}=useApp(),{held,tasks}=useDrag();
  const well=useRef<HTMLDivElement>(null);
  // Back to 준비 a block keeps its length and takes the tray's width.
  const ref=useRegion('tray',null,{form:task=>({width:well.current?.clientWidth?well.current.clientWidth-16:200,height:Math.max(24,task.duration*scale-2)})});
  // The shelf first (sized work ready to fill a gap), then the 들어옴.
  const inbox=benchOrder(tasks,snapshot?.piles??[]);
  const holding=held;
  return <section ref={ref} className={'card tray'+(holding?.intent.zone==='tray'?' hot':'')+(className?' '+className:'')} aria-label={heading}>
    <h2>{heading} {inbox.length>0&&<span className="cnt">{inbox.length}</span>}</h2>
    <label className="sr-only" htmlFor="tray-capture">준비에 담기</label>
    <input id="tray-capture" className="capture-line" autoComplete="off" maxLength={650} placeholder="새 할 일" value={drafts.composer?'':drafts.capture} disabled={!ready||!draftLoaded}
      onFocus={()=>{if(drafts.composer)closeComposer();}} onChange={e=>{if(drafts.composer)closeComposer();else editCapture(e.target.value);}}
      onKeyDown={e=>{if(e.key!=='Enter')return;e.preventDefault();if(isCompositionKey(e.nativeEvent))return;void submitCapture();}}/>
    <div ref={well} className={'well'+(inbox.length?'':' empty')}>
      <AnimatePresence initial={false}>
        {inbox.map(t=><TrayBlock key={t.id} task={t} scale={scale} hollow={holding?.task.id===t.id} selected={selected===t.id} onOpen={()=>onOpen(t)}/>)}
      </AnimatePresence>
    </div>
    {overdue.length>0&&<>
      <h3>지난 미완료 <span className="cnt">{overdue.length}</span></h3>
      <div className="well">{overdue.map(t=><TrayBlock key={t.id} task={t} scale={scale} hollow={holding?.task.id===t.id} selected={selected===t.id} onOpen={()=>onOpen(t)} past/>)}</div>
    </>}
  </section>;
}

function TrayBlock({task,scale,hollow,selected,onOpen,past}:{task:Task;scale:number;hollow:boolean;selected:boolean;onOpen:()=>void;past?:boolean}){
  // No dnd-kit attributes: the block is presentation; its button carries the name and the drag stays a pointer gesture.
  const {held}=useDrag();
  const {listeners,setNodeRef}=useDraggable({id:`tray:${task.id}`,data:{taskId:task.id},disabled:!!held?.dropping});
  // Title over meta needs about 52px; anything shorter is one row with the meta beside the title.
  const h=Math.max(24,task.duration*scale-2),compact=h<52;
  return <motion.div ref={setNodeRef} data-block="true" layout={!hollow} className={'tblk'+(task.proto?' proto':'')+(hollow?' hollow':'')+(selected?' sel':'')+(compact?' compact':'')} style={{height:h}}
    initial={hollow?false:{opacity:0,scale:.96}} animate={{opacity:1,scale:1}} exit={{opacity:0,transition:{duration:0}}} transition={settle} {...listeners} tabIndex={-1} role="presentation">
    <div className="tile"><Dots/><button type="button" className="main" data-task={task.id} onClick={onOpen} aria-label={`${task.title}, ${task.proto?'길이 미정':formatDuration(task.duration)}, ${past?dateLabel(task.plan_date!):'준비'}`}>
      <span className="ttl">{task.title}</span><span className="meta">{past?dateLabel(task.plan_date!)+(task.proto?'':' · '):''}{task.proto?'':formatDuration(task.duration)}</span></button></div>
  </motion.div>;
}
