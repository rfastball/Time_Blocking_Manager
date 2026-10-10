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

// 미계획 work drawn at the same scale as the timetable, so its size reads against free space.
export function InboxTray({scale,overdue=[],onOpen,selected,heading='미계획',className=''}:{scale:number;overdue?:Task[];onOpen:(t:Task)=>void;selected?:string|null;heading?:string;className?:string}){
  const {drafts,ready,draftLoaded}=useApp(),{held,tasks}=useDrag();
  const ref=useRegion('tray',null);
  const inbox=tasks.filter(t=>!t.plan_date&&!t.completed);
  const holding=held&&!held.dropping?held:null;
  return <section ref={ref} className={'card tray'+(holding?.intent.zone==='tray'?' hot':'')+(className?' '+className:'')} aria-label={heading}>
    <h2>{heading} {inbox.length>0&&<span className="cnt">{inbox.length}</span>}</h2>
    <label className="sr-only" htmlFor="tray-capture">미계획에 추가</label>
    <input id="tray-capture" className="capture-line" autoComplete="off" maxLength={650} placeholder="새 할 일" value={drafts.composer?'':drafts.capture} disabled={!ready||!draftLoaded}
      onFocus={()=>{if(drafts.composer)closeComposer();}} onChange={e=>{if(drafts.composer)closeComposer();else editCapture(e.target.value);}}
      onKeyDown={e=>{if(e.key!=='Enter')return;e.preventDefault();if(isCompositionKey(e.nativeEvent))return;void submitCapture();}}/>
    <div className={'well'+(inbox.length?'':' empty')}>
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
  const {listeners,setNodeRef}=useDraggable({id:`tray:${task.id}`,data:{taskId:task.id}});
  // Title over meta needs about 52px; anything shorter is one row with the meta beside the title.
  const h=Math.max(24,task.duration*scale-2),compact=h<52;
  return <motion.div ref={setNodeRef} data-block="true" layout className={'tblk'+(hollow?' hollow':'')+(selected?' sel':'')+(compact?' compact':'')} style={{height:h}}
    initial={{opacity:0,scale:.96}} animate={{opacity:1,scale:1}} exit={{opacity:0,transition:{duration:0}}} transition={settle} {...listeners} tabIndex={-1} role="presentation">
    <div className="tile"><Dots/><button type="button" className="main" onClick={onOpen} aria-label={`${task.title}, ${formatDuration(task.duration)}, ${past?dateLabel(task.plan_date!):'미계획'}`}>
      <span className="ttl">{task.title}</span><span className="meta">{past?dateLabel(task.plan_date!)+' · ':''}{formatDuration(task.duration)}</span></button></div>
  </motion.div>;
}
