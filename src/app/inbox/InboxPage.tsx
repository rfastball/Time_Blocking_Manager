import {useId,useState} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {isCompositionKey} from '../../capture.ts';
import {formatDuration} from '../../format.ts';
import type {Task} from '../../types.ts';
import {setNav,useApp} from '../store/state.ts';
import {closeComposer,deleteTask,editCapture,submitCapture,toggleComplete} from '../store/tasks.ts';
import {openEditor} from '../store/editor.ts';
import {settle} from '../ui/motion.ts';
import {Icon} from '../ui/icons.tsx';
import './inbox.css';

// The 완료 disclosure keeps the user's choice while they visit other views.
let doneOpenMemory=false;

export function InboxPage(){
  const {snapshot,drafts,ready,draftLoaded,quitSaving,nav}=useApp();
  const [doneOpen,setDoneOpen]=useState(doneOpenMemory);
  const unplanned=snapshot!.tasks.filter(t=>!t.plan_date),open=unplanned.filter(t=>!t.completed),done=unplanned.filter(t=>t.completed);
  const total=open.reduce((n,t)=>n+t.duration,0);
  return <section className="inbox-page" aria-label="미계획 목록">
    <div className="inbox-entry">
      <Icon name="plus" size={18}/>
      <label className="sr-only" htmlFor="inbox-capture">할 일 담기</label>
      <input id="inbox-capture" autoComplete="off" maxLength={650} placeholder="어떤 일을 해야 하나요?" value={drafts.composer?'':drafts.capture} disabled={!ready||!draftLoaded||quitSaving}
        onFocus={()=>{if(drafts.composer)closeComposer();}} onChange={e=>{if(drafts.composer)closeComposer();else editCapture(e.target.value);}}
        onKeyDown={e=>{if(e.key!=='Enter')return;e.preventDefault();if(isCompositionKey(e.nativeEvent))return;void submitCapture();}}/>
    </div>
    {open.length>0&&<div className="inbox-head">
      <h2>배치를 기다리는 일 <span className="cnt">{open.length}</span></h2>
      <span className="inbox-total">{formatDuration(total)} 분량</span>
      <button type="button" className="btn" onClick={()=>setNav({view:'plan',planAnchor:nav.selected,inboxOpen:true})}>계획에 배치하기<Icon name="right" size={15}/></button>
    </div>}
    <Rows tasks={open}/>
    {done.length>0&&<details className="inbox-done" open={doneOpen} onToggle={e=>{const o=e.currentTarget.open;doneOpenMemory=o;setDoneOpen(o);}}>
      <summary>완료 {done.length}</summary>
      <Rows tasks={done}/>
    </details>}
  </section>;
}

function Rows({tasks}:{tasks:Task[]}){
  return <ul className="inbox-rows">
    <AnimatePresence initial={false} mode="popLayout">{tasks.map(t=><Row key={t.id} task={t}/>)}</AnimatePresence>
  </ul>;
}

// A row arrives from above and settles, so a captured item reads as a block dropped into the list.
function Row({task:t}:{task:Task}){
  const memoId=useId(),memo=t.body.split('\n').find(l=>l.trim())?.trim()??'';
  return <motion.li layout className={'irow'+(t.completed?' done':'')} initial={{opacity:0,y:-18}} animate={{opacity:1,y:0}} exit={{opacity:0,scale:.98,transition:{duration:.12}}} transition={settle}>
    <label className="irow-check"><input type="checkbox" checked={t.completed} aria-label={`${t.title} 완료`} onChange={()=>void toggleComplete(t)}/></label>
    <button type="button" className="irow-main" aria-label={`${t.title} 편집`} aria-describedby={memo?memoId:undefined} onClick={()=>openEditor(t.id,'dialog')}>
      <strong>{t.title}</strong>{memo&&<small id={memoId}>{memo}</small>}
    </button>
    <button type="button" className="irow-size" aria-label={`${t.title} 블록 크기 ${formatDuration(t.duration)}, 변경`} onClick={()=>openEditor(t.id,'dialog','duration')}>
      <span>{formatDuration(t.duration)}</span><span className="irow-bar" aria-hidden="true"><i style={{width:`${Math.min(t.duration,240)/240*100}%`}}/></span>
    </button>
    <button type="button" className="ibtn irow-del" aria-label={`${t.title} 삭제`} title="삭제" onClick={()=>void deleteTask(t)}><Icon name="delete" size={17}/></button>
  </motion.li>;
}
