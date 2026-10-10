import {useEffect,useId,useRef,useState,type KeyboardEvent as ReactKeyboardEvent,type MutableRefObject} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {isCompositionKey} from '../../capture.ts';
import {formatDuration} from '../../format.ts';
import {time} from '../../dates.ts';
import {checkCount,checklist,durationValid,quarter,scheduleHint,scheduleSummary,taskState,toggleCheck,withSchedule} from '../../detail.ts';
import type {Task} from '../../types.ts';
import {getState,setUi,useApp} from '../store/state.ts';
import {changeEditor,closeEditor,completeFromEditor,discardEditorDraft,editorConflict,rebaseEditor,saveEditor,switchToPending,syncEditor} from '../store/editor.ts';
import {release,retry,showError} from '../store/session.ts';
import {dayRule,deleteTask,issueAt,planOf,taskMinute} from '../store/tasks.ts';
import {Icon,Lock} from '../ui/icons.tsx';
import {menuKeys,requestSplit} from './actions.ts';

const SIZES=[15,30,60,90,120];
type Want='title'|'time'|'date'|'duration'|'confirm'|'more'|null;

// One task's detail: title and memo first, schedule folded below, actions pinned at the bottom.
// The same body serves the 오늘 side panel and the dialog; `closer` lets the dialog route its own close requests here.
export function Editor({mode,closer}:{mode:'panel'|'dialog';closer?:MutableRefObject<(()=>void)|null>}){
  const s=useApp(),{drafts,ui,snapshot}=s,e=drafts.editor!,dirty=drafts.editorDirty;
  const saved=snapshot!.tasks.find(t=>t.id===e.id)??null;
  const pending=drafts.pendingEditorId?snapshot!.tasks.find(t=>t.id===drafts.pendingEditorId)??null:null;
  const [confirming,setConfirming]=useState(false),[scheduleOpen,setScheduleOpen]=useState(false),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
  // A fixed box ticked before the date or time exists has no starts_at yet; it lives here until both are typed.
  const [fix,setFix]=useState({on:!!e.starts_at,at:e.starts_at?.slice(11,16)??''});
  const [want,setWant]=useState<Want>(null);
  const form=useRef<HTMLFormElement>(null),titleRef=useRef<HTMLInputElement>(null),timeRef=useRef<HTMLInputElement>(null),dateRef=useRef<HTMLInputElement>(null),durationRef=useRef<HTMLInputElement>(null),confirmRef=useRef<HTMLButtonElement>(null),moreRef=useRef<HTMLButtonElement>(null);
  const ids=useId(),fixOn=!!e.starts_at||fix.on,at=e.starts_at?.slice(11,16)??fix.at;
  const conflict=dirty&&editorConflict(),items=checklist(e.body),count=checkCount(e.body);
  const issue=e.starts_at&&durationValid(e.duration)?issueAt(e.id,e.starts_at.slice(0,10),taskMinute(e),e.duration):null;
  const planned=!e.starts_at&&e.plan_date&&saved?.plan_date===e.plan_date?planOf(e.plan_date).items.find(i=>i.task.id===e.id&&i.end-i.start===e.duration)??null:null;
  const failure=s.error||(s.failed?'저장하지 못했어요. 입력한 내용은 그대로 있어요.':'');

  useEffect(()=>{syncEditor();},[snapshot,dirty]);
  useEffect(()=>{if(!dirty){setConfirming(false);setFix({on:!!e.starts_at,at:e.starts_at?.slice(11,16)??''});}},[dirty,e.revision,e.starts_at]);
  useEffect(()=>{if(!getState().ui.editorFocus)setWant('title');},[]);
  // Opened to fix or resize: unfold the schedule and start from the block's current place.
  useEffect(()=>{
    const f=ui.editorFocus;if(!f)return;
    setScheduleOpen(true);
    if(f==='fix'&&!e.completed){if(!fixOn)setFixed(true);setWant('time');}else setWant('duration');
    setUi({editorFocus:null});
  },[ui.editorFocus]);
  useEffect(()=>{
    if(!want)return;
    const el={title:titleRef,time:timeRef,date:dateRef,duration:durationRef,confirm:confirmRef,more:moreRef}[want].current;
    el?.focus();setWant(null);
  },[want]);
  if(closer)closer.current=requestClose;

  function edit(patch:Partial<Task>){changeEditor(patch);setStatus('');}
  function prefill(){
    if(!e.plan_date)return '';
    const item=planOf(e.plan_date).items.find(i=>i.task.id===e.id);
    return time(Math.min(1425,quarter(item?.start??dayRule(e.plan_date).start)));
  }
  function setFixed(on:boolean){
    const next=on?at||prefill():at;
    setFix({on,at:next});edit(withSchedule(e.plan_date??'',on,next));
  }
  function setDate(date:string){edit(withSchedule(date,fixOn,at));}
  function setAt(value:string){setFix({on:true,at:value});edit(withSchedule(e.plan_date??'',true,value));}
  function requestClose(){if(!getState().drafts.editorDirty){closeEditor();return;}setConfirming(true);setWant('confirm');}
  // Browser validation first (title, 15-minute steps), then the rule the fields cannot express.
  function ready(){
    if(!form.current!.reportValidity())return false;
    if(fixOn&&!e.starts_at){showError(Error('시각을 고정하려면 날짜와 시작 시각을 함께 입력해 주세요.'));setScheduleOpen(true);setWant(e.plan_date?'time':'date');return false;}
    return true;
  }
  async function save(){
    if(busy||!ready())return false;
    setBusy(true);const ok=await saveEditor();setBusy(false);
    if(!getState().error)setStatus(getState().message);
    return ok;
  }
  async function submit(){if(await save()&&mode==='dialog')closeEditor();}
  async function complete(){if(getState().drafts.editorDirty&&!ready())return;setBusy(true);await completeFromEditor();setBusy(false);}
  async function rebase(){if(await rebaseEditor()&&mode==='dialog')closeEditor();}
  function keys(ev:ReactKeyboardEvent<HTMLFormElement>){
    const target=ev.target as HTMLElement;
    // An Enter that commits Korean composition must not submit the title.
    if(ev.key==='Enter'&&isCompositionKey(ev.nativeEvent)){if(target.tagName==='INPUT')ev.preventDefault();return;}
    if(ev.key==='Enter'&&(ev.ctrlKey||ev.metaKey)){ev.preventDefault();form.current!.requestSubmit();return;}
    if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();if(confirming){setConfirming(false);setWant('title');}else requestClose();}
  }
  const more=[
    ...(saved&&!saved.completed&&saved.duration>=30?[{label:'블록 나누기',run:()=>requestSplit(e.id,mode)}]:[]),
    ...(e.plan_date?[{label:'미계획으로 돌리기',run:()=>{setFix({on:false,at:''});edit({plan_date:null,starts_at:null});}}]:[]),
    ...(saved?[{label:'삭제',danger:true,run:()=>void deleteTask(saved)}]:[]),
  ];

  return <form ref={form} className={'ed ed-'+mode} onSubmit={ev=>{ev.preventDefault();void submit();}} onKeyDown={keys}>
    <header className="ed-head">
      <input ref={titleRef} className="ed-title" aria-label="제목" placeholder="제목" required maxLength={650} autoComplete="off" value={e.title} onChange={x=>edit({title:x.target.value})}/>
      <button type="button" className="ibtn ed-close" aria-label="상세 닫기" title="닫기" onClick={requestClose}><Icon name="close"/></button>
    </header>
    <div className="ed-body">
      <div className="ed-badges">
        <span className={'ed-state'+(e.completed?' done':e.starts_at?' fixed':'')}>{taskState(e)}</span>
        {count.total>0&&<span className="ed-count">체크 {count.done}/{count.total}</span>}
        {dirty&&<span className="ed-dirty">저장 안 됨</span>}
      </div>
      {pending&&<div className="ed-note" role="alert"><p>먼저 ‘{e.title||'제목 없음'}’의 변경을 정리해 주세요.</p><button type="button" className="btn" onClick={switchToPending}>버리고 ‘{pending.title}’ 열기</button></div>}
      {conflict&&<div className="ed-note" role="alert"><p>다른 곳에서 이 항목이 바뀌었어요. 입력한 내용은 그대로 있어요.</p><button type="button" className="btn" onClick={()=>void rebase()}>내 입력으로 저장</button></div>}
      <textarea className="ed-memo" aria-label="메모" placeholder="메모" rows={mode==='dialog'?9:7} value={e.body} onChange={x=>edit({body:x.target.value})}/>
      {items.length>0&&<details className="ed-fold ed-checklist">
        <summary>체크리스트 <b>{count.done}/{count.total}</b></summary>
        <div className="ed-checks">{items.map(i=><label key={i.line} className="ed-check"><input type="checkbox" checked={i.checked} onChange={x=>edit({body:toggleCheck(e.body,i.line,x.target.checked)})}/><span>{i.label||'항목'}</span></label>)}</div>
      </details>}
      <details className="ed-fold ed-schedule" open={scheduleOpen} onToggle={x=>setScheduleOpen(x.currentTarget.open)}>
        <summary>{scheduleSummary(e)}</summary>
        <div className="ed-size" role="group" aria-labelledby={ids+'size'}>
          <div className="ed-size-head"><span id={ids+'size'}>블록 크기</span><b>{durationValid(e.duration)?formatDuration(e.duration):'15분 단위'}</b></div>
          <div className="ed-ruler" aria-hidden="true">{Array.from({length:8},(_,i)=><span key={i} className={i<e.duration/15?'on':''} onClick={()=>edit({duration:(i+1)*15})}/>)}</div>
          <div className="ed-sizes">
            {SIZES.map(n=><button key={n} type="button" aria-pressed={n===e.duration} onClick={()=>edit({duration:n})}>{formatDuration(n)}</button>)}
            <label className="ed-custom"><input ref={durationRef} type="number" min={15} max={1440} step={15} required aria-label="블록 소요시간 직접 입력" value={Number.isFinite(e.duration)&&e.duration>0?e.duration:''} onChange={x=>edit({duration:Number(x.target.value)})}/><span>분</span></label>
          </div>
        </div>
        <div className="ed-when">
          <label className="ed-field"><span>계획 날짜</span><input ref={dateRef} type="date" value={e.plan_date??''} onChange={x=>setDate(x.target.value)}/></label>
          <div className="ed-field">
            <label className="ed-check ed-fix"><input type="checkbox" checked={fixOn} onChange={x=>setFixed(x.target.checked)}/><Lock open={!fixOn} size={14}/>시각 고정</label>
            <input ref={timeRef} type="time" step={900} aria-label="고정 시각" value={fixOn?at:''} disabled={!fixOn} onChange={x=>setAt(x.target.value)}/>
          </div>
        </div>
        <p className={'ed-hint'+(issue?' error':'')}>{issue?issue.label:scheduleHint(e,planned)}</p>
      </details>
      {dirty&&!confirming&&<button type="button" className="btn text ed-discard" onClick={()=>void discardEditorDraft()}>초안 버리기</button>}
      {mode==='dialog'&&failure&&<div className="ed-recovery"><p className="error" role="alert">{failure}</p>
        {s.failed&&<div className="ed-row"><button type="button" className="btn" onClick={()=>void retry()}>{s.failed.code==='conflict'||s.failed.code==='epoch'?'저장된 내용 확인':'다시 시도'}</button><button type="button" className="btn" onClick={release}>입력 유지하고 수정</button></div>}
      </div>}
    </div>
    <footer className="ed-foot">
      {confirming?<motion.div className="ed-confirm" role="group" aria-label="저장하지 않은 변경" initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} transition={{duration:.14}}>
        <p>저장하지 않은 변경이 있어요.</p>
        <div className="ed-row">
          <button ref={confirmRef} type="button" className="btn primary" disabled={busy} onClick={async()=>{if(await save())closeEditor();}}>저장하고 닫기</button>
          <button type="button" className="btn" onClick={()=>closeEditor()}>초안으로 남기고 닫기</button>
          <button type="button" className="btn danger" onClick={()=>closeEditor(true)}>변경 버리기</button>
        </div>
      </motion.div>
      :<div className="ed-row ed-actions">
        <button type="button" className="btn" disabled={busy} onClick={()=>void complete()}>{e.completed?'미완료로 되돌리기':'완료로 표시'}</button>
        <More items={more} buttonRef={moreRef} onClose={()=>setWant('more')}/>
        <span className="ed-status" role="status">{status}</span>
        <button type="submit" className="btn primary" disabled={busy} aria-keyshortcuts="Control+Enter">저장</button>
      </div>}
    </footer>
  </form>;
}

type Item={label:string;run:()=>void;danger?:boolean};
function More({items,buttonRef,onClose}:{items:Item[];buttonRef:MutableRefObject<HTMLButtonElement|null>;onClose:()=>void}){
  const [open,setOpen]=useState(false),menu=useRef<HTMLDivElement>(null),id=useId();
  useEffect(()=>{if(open)menu.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();},[open]);
  const close=()=>{setOpen(false);onClose();};
  if(!items.length)return null;
  return <div className="ed-more" onBlur={x=>{if(open&&!x.currentTarget.contains(x.relatedTarget as Node))setOpen(false);}}>
    <button ref={buttonRef} type="button" className="btn" aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} aria-label="더보기"
      onClick={()=>setOpen(o=>!o)} onKeyDown={x=>{if(x.key==='ArrowDown'||x.key==='ArrowUp'){x.preventDefault();setOpen(true);}}}><Icon name="more" size={16} stroke={3}/>더보기</button>
    <AnimatePresence>
      {open&&<motion.div ref={menu} id={id} role="menu" aria-label="더보기" className="menu ed-menu" onKeyDown={x=>menuKeys(x,close)}
        initial={{opacity:0,scale:.96,y:4}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,transition:{duration:.08}}} transition={{type:'spring',visualDuration:.16,bounce:.15}}>
        {items.map(i=><button key={i.label} type="button" role="menuitem" tabIndex={-1} className={i.danger?'danger':''} onClick={()=>{setOpen(false);buttonRef.current?.focus();i.run();}}>{i.label}</button>)}
      </motion.div>}
    </AnimatePresence>
  </div>;
}
