import {useState} from 'react';
import {motion} from 'motion/react';
import {timeAxisForDays} from '../../time-axis.ts';
import {nextFlowId} from '../../today.ts';
import {formatDuration} from '../../format.ts';
import {time} from '../../dates.ts';
import type {Task} from '../../types.ts';
import {useApp} from '../store/state.ts';
import {available,clearDay,completeTasks,dayRule,overdueTasks,planOf,reflowToday} from '../store/tasks.ts';
import {openEditor} from '../store/editor.ts';
import {settle} from '../ui/motion.ts';
import {Icon} from '../ui/icons.tsx';
import {DaySpace} from '../space/DaySpace.tsx';
import {InboxTray} from '../space/InboxTray.tsx';
import {EditorPanel} from '../editor/hosts.tsx';
import {useNewBlock} from '../plan/Composer.tsx';
import './today.css';

const SCALE=1.2;

// The day as one block space. Selecting a block opens it beside the space; the list is the space itself.
export function Today(){
  const {snapshot,nav,today,drafts,ui}=useApp();
  const [multi,setMulti]=useState<string[]>([]);
  const date=nav.selected,rule=dayRule(date),axis=timeAxisForDays([rule],SCALE),plan=planOf(date);
  const dayTasks=snapshot!.tasks.filter(t=>t.plan_date===date);
  const sum=(f:(t:Task)=>boolean)=>dayTasks.filter(f).reduce((n,t)=>n+t.duration,0);
  const aDone=sum(t=>!t.starts_at&&t.completed),aFlow=sum(t=>!t.starts_at&&!t.completed),aFixed=sum(t=>!!t.starts_at),avail=available(date);
  const total=Math.max(avail,aDone+aFlow+aFixed,1),pct=(n:number)=>`${n/total*100}%`;
  const anchor=Math.max(rule.start,plan.anchor??rule.start);
  const editing=ui.editorMode==='panel'?drafts.editor?.id??null:null;
  const toggleMulti=(t:Task)=>{if(!t.completed)setMulti(m=>m.includes(t.id)?m.filter(x=>x!==t.id):[...m,t.id]);};
  const label=`배분 ${formatDuration(aDone+aFlow+aFixed)} / 가용 ${formatDuration(avail)}`;
  const newBlock=useNewBlock(date,axis,'day');
  return <div className="today">
    <div className="today-bar">
      <div className="cap" aria-label={label}>
        <span className="meter" aria-hidden="true">{([['done',aDone],['flow',aFlow],['fixed',aFixed]] as const).map(([k,n])=><motion.i key={k} className={'m-'+k} animate={{width:pct(n)}} transition={settle}/>)}</span>
        <span>{label}</span>
      </div>
      <span className="grow"/>
      {multi.length>0?<div className="multi-bar"><span>{multi.length}개 선택</span>
        <button type="button" className="btn primary" onClick={()=>{const tasks=snapshot!.tasks.filter(t=>multi.includes(t.id));setMulti([]);void completeTasks(tasks);}}>완료</button>
        <button type="button" className="btn" onClick={()=>setMulti([])}>취소</button></div>
      :<>
        {date===today&&(plan.items.some(i=>!i.fixed)||plan.unplaced.length>0)&&<><span className="anchor">{time(anchor)} 기준</span>
          <button type="button" className="btn" onClick={()=>void reflowToday()}><Icon name="reflow" size={15}/>지금 기준으로 다시 배치</button></>}
        <button type="button" className="btn text" disabled={!dayTasks.length} aria-label={`${date} 일정 비우기`} onClick={()=>void clearDay(date)}>하루 비우기</button>
      </>}
    </div>
    <div className="today-cols">
      <section className="card today-day" aria-label="블록 공간">
        <DaySpace date={date} axis={axis} variant="day" bin shelf selected={editing} multi={multi} onOpen={t=>openEditor(t.id,'panel')} onMulti={toggleMulti} {...newBlock}/>
      </section>
      <aside className="today-side">
        <EditorPanel nextId={nextFlowId(plan.items)}/>
        <InboxTray scale={SCALE} overdue={overdueTasks()} selected={editing} onOpen={t=>openEditor(t.id,'panel')}/>
      </aside>
    </div>
  </div>;
}
