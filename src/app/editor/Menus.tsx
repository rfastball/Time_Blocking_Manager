import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {motion} from 'motion/react';
import {dateLabel,time} from '../../dates.ts';
import type {Task} from '../../types.ts';
import {setUi,useApp,type Ui} from '../store/state.ts';
import {openEditor} from '../store/editor.ts';
import {openAvailability} from '../store/schedule.ts';
import {deleteTask,openComposer,toggleComplete,unfix,unplan} from '../store/tasks.ts';
import {completeHere,moveTo,placeOfCard,shipTo} from '../store/bench.ts';

// 준비 shows undated work and overdue work; both are still being placed there.
// A 준비 card offers 준비's menu; the same task on a date offers the date menu.
const inPrep=(t:Task,bench:boolean,today:string)=>bench&&!t.completed&&!t.wait_since&&(!t.plan_date||t.plan_date<today);
import {blockButton,editorModeHere,menuKeys,requestSplit} from './actions.ts';
import {clamp,useDismiss} from '../ui/dismiss.ts';

type Item={label:string;run:()=>void;danger?:boolean;disabled?:boolean};

export function ContextMenuHost(){
  const {ui,snapshot}=useApp(),m=ui.contextMenu;
  const gone=!!m?.taskId&&!snapshot?.tasks.some(t=>t.id===m.taskId);
  useEffect(()=>{if(gone)setUi({contextMenu:null});},[gone]);
  if(!m||gone)return null;
  return <ContextMenu key={`${m.taskId}:${m.date}:${m.x}:${m.y}`} m={m}/>;
}

function ContextMenu({m}:{m:NonNullable<Ui['contextMenu']>}){
  const s=useApp(),t=m.taskId?s.snapshot!.tasks.find(x=>x.id===m.taskId)!:null;
  const ref=useRef<HTMLDivElement>(null),[pos,setPos]=useState({left:m.x,top:m.y});
  // Shift+F10 leaves focus on the block; a right click may not, so the block is looked up again.
  const [opener]=useState(()=>document.activeElement);
  const close=(refocus:boolean)=>{setUi({contextMenu:null});if(refocus)(t?blockButton(t.id,opener):opener instanceof HTMLElement?opener:null)?.focus({preventScroll:true});};
  useLayoutEffect(()=>{const r=ref.current!.getBoundingClientRect();setPos(clamp(m.x,m.y,r.width,r.height));ref.current!.querySelector<HTMLElement>('[role=menuitem]:not(:disabled)')?.focus({preventScroll:true});},[]);
  useDismiss(ref,()=>close(false),{scroll:true,resize:true,blur:true});
  const mode=s.nav.view==='today'?editorModeHere():'dialog';
  let items:Item[];
  // Each place offers only what is not already one gesture away there: a click opens the editor, a drag or Alt+arrows reorder.
  if(t&&inPrep(t,!!m.bench,s.today)){
    const shelved=!t.plan_date&&placeOfCard(t)==='shelf';
    items=[
      ...(!shelved?[{label:'선반으로',run:()=>void moveTo([t.id],'shelf',Infinity)}]:[]),
      {label:'오늘에 싣기',run:()=>void shipTo(s.today,[t.id])},
      {label:'나누기',run:()=>requestSplit(t.id)},
      {label:'완료',run:()=>void completeHere([t])},
      {label:'삭제',danger:true,run:()=>void deleteTask(t)},
    ];
  }else if(t){
    const flow=!!t.plan_date&&!t.starts_at&&!t.completed;
    items=[
      ...(flow?[{label:'시각 고정…',run:()=>openEditor(t.id,mode,'fix')}]:[]),
      ...(t.starts_at&&!t.completed?[{label:'고정 해제',run:()=>void unfix(t)}]:[]),
      ...(!t.completed?[{label:'나누기',run:()=>requestSplit(t.id)}]:[]),
      ...(t.plan_date&&!t.completed?[{label:'준비로 보내기',run:()=>void unplan(t)}]:[]),
      {label:t.completed?'완료 취소':'완료',run:()=>void toggleComplete(t)},
      {label:'삭제',danger:true,run:()=>void deleteTask(t)},
    ];
  }else items=[
    // 오늘 runs the day; new blocks are made where the day is planned.
    ...(s.nav.view==='plan'?[{label:`${time(m.minute)}에 새 블록`,run:()=>{
      if(!openComposer(m.date,m.minute,30,true))return;
      requestAnimationFrame(()=>{const input=document.getElementById('composer-title');input?.focus({preventScroll:true});input?.scrollIntoView({block:'nearest'});});
    }}]:[]),
    {label:'근무시간 조정',run:()=>openAvailability(m.date,'work',m.x,m.y)},
  ];
  const heading=t?t.title:`${dateLabel(m.date)} ${time(m.minute)}`;
  return <motion.div ref={ref} role="menu" aria-label={t?`${t.title} 블록 메뉴`:`${heading} 메뉴`} className="menu ctx-menu" style={pos}
    initial={{opacity:0,scale:.95}} animate={{opacity:1,scale:1}} transition={{type:'spring',visualDuration:.14,bounce:.12}}
    onKeyDown={e=>menuKeys(e,()=>close(true))} onContextMenu={e=>e.preventDefault()}>
    <div className="menu-head" aria-hidden="true">{heading}</div>
    {items.map(i=><button key={i.label} type="button" role="menuitem" tabIndex={-1} disabled={i.disabled} className={i.danger?'danger':''}
      onClick={()=>{close(true);i.run();}}>{i.label}</button>)}
  </motion.div>;
}
