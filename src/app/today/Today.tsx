import {useState,type MouseEvent} from 'react';
import {motion} from 'motion/react';
import {nextFlowId,type DayItem} from '../../today.ts';
import {time} from '../../dates.ts';
import {formatDuration} from '../../format.ts';
import type {Task} from '../../types.ts';
import {useApp} from '../store/state.ts';
import {available,completeTasks,dayRule,overdueTasks,planOf,reflowToday} from '../store/tasks.ts';
import {openEditor} from '../store/editor.ts';
import {settle} from '../ui/motion.ts';
import {Icon,Lock} from '../ui/icons.tsx';
import {usePanelResize} from '../ui/PanelResize.tsx';
import {DaySpace} from '../space/DaySpace.tsx';
import {useDaysAxis} from '../space/drag.tsx';
import {allocationLabel,allocationShort,Outside,outsideOf} from '../plan/day.tsx';
import {InboxTray} from '../space/InboxTray.tsx';
import {EditorPanel} from '../editor/hosts.tsx';
import './today.css';

const SCALE=1.2;
// The single-column fallback opens detail over the timetable.
const open=(t:Task)=>openEditor(t.id,matchMedia('(max-width:760px)').matches?'dialog':'panel');

// 오늘 is for doing the day, not planning it: a slim timetable strip, what comes next, and the queue of what is left.
// Planning a day in full (new blocks, clearing it) is the plan tab's 일 view.
export function Today(){
  const {snapshot,nav,today,drafts,ui}=useApp();
  const panels=usePanelResize('today',.3,'시간표와 상세 패널 크기','today-timetable today-detail');
  const [multi,setMulti]=useState<string[]>([]);
  const date=nav.selected,rule=dayRule(date),axis=useDaysAxis([date],SCALE),plan=planOf(date);
  const dayTasks=snapshot!.tasks.filter(t=>t.plan_date===date);
  const sum=(f:(t:Task)=>boolean)=>dayTasks.filter(f).reduce((n,t)=>n+t.duration,0);
  const aDone=sum(t=>!t.starts_at&&t.completed),aFlow=sum(t=>!t.starts_at&&!t.completed),aFixed=sum(t=>!!t.starts_at),avail=available(date);
  const total=Math.max(avail,aDone+aFlow+aFixed,1),pct=(n:number)=>`${n/total*100}%`;
  const anchor=Math.max(rule.start,plan.anchor??rule.start);
  const editing=ui.editorMode==='panel'?drafts.editor?.id??null:null;
  const toggleMulti=(t:Task)=>{if(!t.completed)setMulti(m=>m.includes(t.id)?m.filter(x=>x!==t.id):[...m,t.id]);};
  const load={used:aDone+aFlow+aFixed,avail,outside:outsideOf(plan.items)};
  const nextId=nextFlowId(plan.items),queue=plan.items.filter(i=>!i.task.completed);
  return <div className="today">
    <div className="today-bar">
      <div className="cap" aria-label={allocationLabel(load)}>
        <span className="meter" aria-hidden="true">{([['done',aDone],['flow',aFlow],['fixed',aFixed]] as const).map(([k,n])=><motion.i key={k} className={'m-'+k} animate={{width:pct(n)}} transition={settle}/>)}</span>
        <span aria-hidden="true">{allocationShort(load)}</span><Outside a={load}/>
      </div>
      <span className="grow"/>
      {multi.length>0?<div className="multi-bar"><span>{multi.length}개 선택</span>
        <button type="button" className="btn primary" onClick={()=>{const tasks=snapshot!.tasks.filter(t=>multi.includes(t.id));setMulti([]);void completeTasks(tasks);}}>완료</button>
        <button type="button" className="btn" onClick={()=>setMulti([])}>취소</button></div>
      :date===today&&plan.items.some(i=>!i.fixed)&&<><span className="anchor">{time(anchor)} 기준</span>
        <button type="button" className="btn" onClick={()=>void reflowToday()}><Icon name="reflow" size={15}/>재배치</button></>}
    </div>
    <div ref={panels.ref} style={panels.style} data-panel-stacked={panels.stacked} className="today-cols">
      <section id="today-timetable" className="card today-day" aria-label="시간표">
        <DaySpace date={date} axis={axis} variant="day" bin selected={editing} multi={multi} onOpen={open} onMulti={toggleMulti}/>
      </section>
      {panels.separator}
      <div id="today-detail" className="today-flow">
        <div className="today-main">
          <EditorPanel nextId={nextId}/>
          {queue.length>0&&<Queue items={queue} nextId={nextId} selected={editing}/>}
        </div>
        <aside className="today-side">
          <InboxTray scale={SCALE} overdue={overdueTasks()} selected={editing} onOpen={open}/>
        </aside>
      </div>
    </div>
  </div>;
}

// What is left today, in the order it will be done. Each row completes or opens its block.
function Queue({items,nextId,selected}:{items:DayItem[];nextId:string|null;selected:string|null}){
  async function complete(e:MouseEvent<HTMLButtonElement>,t:Task,index:number){
    const button=e.currentTarget,neighbours=[...items.slice(index+1),...items.slice(0,index).reverse()];
    let moved=document.activeElement!==button;
    const notice=(event:FocusEvent)=>{if(event.target!==button)moved=true;};
    document.addEventListener('focusin',notice);
    try{
      if(!await completeTasks([t]))return;
      requestAnimationFrame(()=>{
        if(moved||(document.activeElement!==document.body&&document.activeElement!==button))return;
        const next=neighbours.map(({task})=>document.querySelector<HTMLButtonElement>(`.queue [data-task="${CSS.escape(task.id)}"] .chk`)).find(el=>el);
        (next??document.querySelector<HTMLInputElement>('.today-side #tray-capture'))?.focus();
      });
    }finally{document.removeEventListener('focusin',notice);}
  }
  return <section className="card queue" aria-label="남은 블록">
    <h2>남은 블록 <b>{items.length}</b></h2>
    <ol>{items.map(({task:t,start,end,fixed,over},index)=><li key={t.id} data-task={t.id} className={'q-row'+(t.id===nextId?' next':'')+(fixed?' fixed':'')+(over?' over':'')+(t.id===selected?' sel':'')}>
      <button type="button" className="chk" aria-label={t.title+' 완료'} onClick={e=>void complete(e,t,index)}><Icon name="check" size={12} stroke={3}/></button>
      <button type="button" className="q-main" onClick={()=>open(t)} aria-label={`${t.title}, ${fixed?'시각 고정':'예상'} ${time(start)}–${time(end)}, ${formatDuration(t.duration)}${over?', 근무 외':''}`}>
        <span className="q-time">{time(start)}</span>
        <span className="q-title">{fixed&&<Lock size={12}/>}<span className="q-title-text">{t.title}</span></span>
        <span className="q-dur">{formatDuration(t.duration)}</span>
      </button>
    </li>)}</ol>
  </section>;
}
