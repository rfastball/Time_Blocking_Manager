import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {motion} from 'motion/react';
import {dateLabel,time} from '../../dates.ts';
import type {Task} from '../../types.ts';
import {setUi,useApp,type Ui} from '../store/state.ts';
import {openEditor} from '../store/editor.ts';
import {openAvailability} from '../store/schedule.ts';
import {deleteTask,flowOrderOn,openComposer,reorder,toggleComplete,unfix,unplan} from '../store/tasks.ts';
import {blockButton,clamp,menuKeys,requestSplit} from './actions.ts';

type Item={label:string;run:()=>void;danger?:boolean;disabled?:boolean};

// Closes on a press outside the box or when the page moves under it.
function useDismiss(ref:{current:HTMLElement|null},close:()=>void){
  useEffect(()=>{
    const outside=(e:Event)=>{if(!ref.current?.contains(e.target as Node))close();};
    const away=()=>close();
    document.addEventListener('pointerdown',outside,true);addEventListener('resize',away);addEventListener('blur',away);
    return ()=>{document.removeEventListener('pointerdown',outside,true);removeEventListener('resize',away);removeEventListener('blur',away);};
  },[]);
}

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
  useDismiss(ref,()=>close(false));
  const mode=s.nav.view==='today'&&!matchMedia('(max-width:960px)').matches?'panel':'dialog';
  let items:Item[];
  if(t){
    const flow=!!t.plan_date&&!t.starts_at&&!t.completed,order=flow?flowOrderOn(t.plan_date!).map(x=>x.id):[],at=order.indexOf(t.id);
    items=[
      {label:'메모 열기',run:()=>openEditor(t.id,mode)},
      {label:t.completed?'미완료로 되돌리기':'완료로 표시',run:()=>void toggleComplete(t)},
      ...(flow?[{label:'앞으로',disabled:at<=0,run:()=>void reorder(t,-1)},{label:'뒤로',disabled:at<0||at===order.length-1,run:()=>void reorder(t,1)},{label:'시각 고정…',run:()=>openEditor(t.id,mode,'fix')}]:[]),
      ...(t.starts_at?[{label:'고정 해제',run:()=>void unfix(t)}]:[]),
      ...(!t.completed?[{label:'나누기',run:()=>requestSplit(t.id)}]:[]),
      ...(t.plan_date&&!t.completed?[{label:'미계획으로 옮기기',run:()=>void unplan(t)}]:[]),
      {label:'삭제',danger:true,run:()=>void deleteTask(t)},
    ];
  }else items=[
    {label:`${time(m.minute)}에 블록 만들기`,run:()=>openComposer(m.date,m.minute,30,true)},
    {label:'이 날짜의 근무시간 조정',run:()=>openAvailability(m.date,'work',m.x,m.y)},
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
