// Area C (editor): the detail editor as Today's side panel and as a dialog, the block menu and the split chooser.
// All writes go through store/editor.ts and store/tasks.ts.
import {useCallback,useEffect,useId,useRef} from 'react';
import {animate,motion} from 'motion/react';
import {time} from '../../dates.ts';
import {formatDuration} from '../../format.ts';
import type {Task} from '../../types.ts';
import {memoPreview} from '../../detail.ts';
import {getState,useApp} from '../store/state.ts';
import {closeEditor,openEditor} from '../store/editor.ts';
import {completeTasks,planOf,resize,unplan} from '../store/tasks.ts';
import {reduced} from '../ui/motion.ts';
import {Editor} from './Editor.tsx';
import {blockButton,editorModeHere} from './actions.ts';
import './editor.css';

export {ContextMenuHost} from './Menus.tsx';

// Today's side: the open task when the editor is in panel mode, otherwise the next block with what can be done to it.
export function EditorPanel({nextId}:{nextId:string|null}){
  const {drafts,ui,snapshot}=useApp(),e=ui.editorMode==='panel'?drafts.editor:null;
  const nextButton=useRef<HTMLButtonElement|null>(null),memoId=useId();
  const opening=useRef<{panel:HTMLElement;opener:Element|null}|null>(null);
  const attach=useCallback((panel:HTMLElement|null)=>{
    if(!panel)return;
    // StrictMode reattaches the same node after the editor has already taken focus.
    if(opening.current?.panel!==panel)opening.current={panel,opener:nextButton.current??document.activeElement};
    const opener=opening.current.opener,nextOpener=opener instanceof HTMLElement&&opener.matches('.ed-next-open');
    nextButton.current=null;
    return ()=>{
      if(!panel.contains(document.activeElement))return;
      requestAnimationFrame(()=>{
        if(document.activeElement!==document.body)return;
        const target=opener instanceof HTMLElement&&opener.isConnected?opener:nextOpener?document.querySelector<HTMLElement>('.ed-next-open'):null;
        target?.focus({preventScroll:true});
      });
    };
  },[]);
  if(e)return <motion.section key={e.id} ref={attach} className="card ed-panel" aria-label="블록 상세" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{type:'spring',visualDuration:.22,bounce:.15}}>
    <Editor key={e.id} mode="panel"/>
  </motion.section>;
  const next=nextId?snapshot!.tasks.find(t=>t.id===nextId):null;
  if(!next)return null;
  const item=next.plan_date?planOf(next.plan_date).items.find(i=>i.task.id===next.id):null;
  // The next block is the first remaining flow block whatever the clock says, so nothing here counts down or turns late.
  const memo=next.body.trim()?memoPreview(next.body):'';
  return <section className="card ed-next" aria-label="다음 블록" data-task={next.id}>
    <button type="button" className="ed-next-open" aria-label={[next.title,item&&`예상 ${time(item.start)}–${time(item.end)}`,formatDuration(next.duration)].filter(Boolean).join(', ')}
      aria-describedby={memo?memoId:undefined} onClick={event=>{nextButton.current=event.currentTarget;openEditor(next.id,editorModeHere());}}>
      <span className="pill">다음</span>
      <span className="ed-next-title">{next.title}</span>
      {memo&&<span id={memoId} className="ed-next-memo">{memo}</span>}
      {item&&<span className="ed-next-time">예상 {time(item.start)}–{time(item.end)} · {formatDuration(next.duration)}</span>}
    </button>
    <div className="ed-next-acts" role="group" aria-label={next.title+' 처리'}>
      <button type="button" className="btn primary ed-next-done" onClick={()=>void doNext(next)}>완료</button>
      <button type="button" className="btn" aria-label={`${next.title} 15분 늘리기`} onClick={()=>void resize(next,next.duration+15)}>+15분</button>
      <button type="button" className="btn" aria-label={`${next.title} 나중에, 준비 선반 맨 위로`} onClick={()=>void later(next)}>나중에</button>
    </div>
  </section>;
}

// Done or put off from the card, the keyboard stays on the card: the next block's 완료, or the capture field when the day is through.
const keepOnCard=()=>requestAnimationFrame(()=>(document.querySelector<HTMLElement>('.ed-next .ed-next-done')??document.querySelector<HTMLElement>('#tray-capture'))?.focus({preventScroll:true}));
async function doNext(t:Task){if(await completeTasks([t]))keepOnCard();}
async function later(t:Task){if(await unplan(t))keepOnCard();}

export function EditorHost(){
  const {drafts,ui,nav}=useApp();
  // The panel only exists on 오늘; leaving it keeps a dirty draft for ‘이어서 편집’ instead of an invisible editor.
  useEffect(()=>{if(ui.editorMode==='panel'&&nav.view!=='today')closeEditor();},[ui.editorMode,nav.view]);
  if(ui.editorMode!=='dialog'||!drafts.editor)return null;
  return <EditorDialog id={drafts.editor.id}/>;
}

// On the work screen the editor opens beside the block it came from, so the calendar stays where it was and the block stays in sight.
// It is the same modal dialog (confirmations, drafts and conflicts unchanged); only where it stands differs.
// Anywhere else, from the status bar, or when there is no room beside the block, it stays centred.
// It is placed again when the window changes size, and falls back to the centre when the side no longer has room.
function beside(d:HTMLDialogElement,source:HTMLElement|null){
  const centre=()=>{d.classList.remove('beside');for(const k of ['margin','left','top','width','max-height'])d.style.removeProperty(k);};
  if(!source?.isConnected||innerWidth<=760)return centre();
  const r=(source.closest<HTMLElement>('[data-block],.jb-card,.tblk,.cal-cell')??source).getBoundingClientRect(),gap=12,edge=16;
  // The roomier side takes it, narrowed down to 420px before it gives up and centres.
  const right=innerWidth-edge-gap-r.right,left=r.left-gap-edge,w=Math.min(510,Math.max(right,left));
  if(w<420)return centre();
  d.classList.add('beside');
  Object.assign(d.style,{margin:'0',width:w+'px',maxHeight:'none'});
  // Up before smaller: it rises toward the top edge and only scrolls inside when even that is not enough.
  const top=Math.max(edge,Math.min(r.top-8,innerHeight-edge-d.offsetHeight));
  Object.assign(d.style,{left:(right>=w?r.right+gap:r.left-gap-w)+'px',top:top+'px',maxHeight:`calc(100vh - ${top+edge}px)`});
}
// A point on the veil, outside the dialog's own box.
const outside=(d:HTMLElement,e:{clientX:number;clientY:number})=>{const r=d.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};

function EditorDialog({id}:{id:string}){
  const closer=useRef<(()=>void)|null>(null),pressed=useRef(false);
  const opening=useRef<{d:HTMLDialogElement;opener:Element|null}|null>(null);
  // Opens modally on attach and gives focus back to whatever opened it when it goes away.
  const attach=useCallback((d:HTMLDialogElement|null)=>{
    if(!d)return;
    // StrictMode reattaches the same node after the editor has already taken focus.
    if(opening.current?.d!==d)opening.current={d,opener:document.activeElement};
    const opener=opening.current.opener,own=opener instanceof HTMLElement&&!opener.closest('dialog')?opener:null;
    const placed=getState().nav.view==='plan'&&!!own?.closest('.content');
    const place=()=>{if(placed)beside(d,own!.isConnected?own:blockButton(id));};
    if(!d.open){d.showModal();place();if(!reduced())animate(d,{opacity:[0,1],y:[6,0]},{type:'spring',visualDuration:.22,bounce:.2});}
    addEventListener('resize',place);
    return ()=>{
      removeEventListener('resize',place);
      // Once the dialog has really gone (and the page is no longer inert), unless something else already took the keyboard.
      requestAnimationFrame(()=>{
        if(d.isConnected||document.activeElement&&document.activeElement!==document.body)return;
        (own?.isConnected?own:blockButton(id))?.focus({preventScroll:true});
      });
    };
  },[id]);
  return <dialog ref={attach} className="ed-dialog" aria-label="블록 상세"
    onCancel={e=>{e.preventDefault();closer.current?.();}}
    // A press and release both on the veil outside the box asks to close, like Esc: a changed draft still asks first.
    onPointerDown={e=>{pressed.current=e.target===e.currentTarget&&outside(e.currentTarget,e);}}
    onClick={e=>{if(pressed.current&&e.target===e.currentTarget&&outside(e.currentTarget,e))closer.current?.();pressed.current=false;}}
    // A close the page did not ask for (the browser forcing a repeated Esc) keeps the draft, like ‘초안으로 남기고 닫기’.
    onClose={()=>{if(getState().ui.editorMode==='dialog')closeEditor();}}>
    <Editor key={id} mode="dialog" closer={closer}/>
  </dialog>;
}
