// Area C (editor): the detail editor as Today's side panel and as a dialog, the block menu and the split chooser.
// All writes go through store/editor.ts and store/tasks.ts.
import {useCallback,useEffect,useRef} from 'react';
import {animate,motion} from 'motion/react';
import {time} from '../../dates.ts';
import {memoPreview} from '../../detail.ts';
import {getState,useApp} from '../store/state.ts';
import {closeEditor,openEditor} from '../store/editor.ts';
import {planOf} from '../store/tasks.ts';
import {reduced} from '../ui/motion.ts';
import {Editor} from './Editor.tsx';
import './editor.css';

export {ContextMenuHost} from './Menus.tsx';

// Today's side: the open task when the editor is in panel mode, otherwise a glance at the next block.
export function EditorPanel({nextId}:{nextId:string|null}){
  const {drafts,ui,snapshot}=useApp(),e=ui.editorMode==='panel'?drafts.editor:null;
  const nextButton=useRef<HTMLButtonElement|null>(null);
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
  return <section className="card ed-next" aria-label="다음 블록">
    <button type="button" className="ed-next-open" onClick={event=>{nextButton.current=event.currentTarget;openEditor(next.id,matchMedia('(max-width:760px)').matches?'dialog':'panel');}}>
      <span className="pill">다음</span>
      <span className="ed-next-title">{next.title}</span>
      {next.body.trim()&&<span className="ed-next-memo">{memoPreview(next.body)}</span>}
      {item&&<span className="ed-next-time">예상 {time(item.start)}–{time(item.end)}</span>}
    </button>
  </section>;
}

export function EditorHost(){
  const {drafts,ui,nav}=useApp();
  // The panel only exists on 오늘; leaving it keeps a dirty draft for ‘이어서 편집’ instead of an invisible editor.
  useEffect(()=>{if(ui.editorMode==='panel'&&nav.view!=='today')closeEditor();},[ui.editorMode,nav.view]);
  if(ui.editorMode!=='dialog'||!drafts.editor)return null;
  return <EditorDialog id={drafts.editor.id}/>;
}

function EditorDialog({id}:{id:string}){
  const closer=useRef<(()=>void)|null>(null);
  // Opens modally on attach and gives focus back to whatever opened it when it goes away.
  const attach=useCallback((d:HTMLDialogElement|null)=>{
    if(!d)return;
    const opener=document.activeElement;
    if(!d.open){d.showModal();if(!reduced())animate(d,{opacity:[0,1],y:[6,0]},{type:'spring',visualDuration:.22,bounce:.2});}
    return ()=>{if(opener instanceof HTMLElement&&opener.isConnected&&!opener.closest('dialog'))opener.focus({preventScroll:true});};
  },[]);
  return <dialog ref={attach} className="ed-dialog" aria-label="항목 상세"
    onCancel={e=>{e.preventDefault();closer.current?.();}}
    // A close the page did not ask for (the browser forcing a repeated Esc) keeps the draft, like ‘초안으로 남기고 닫기’.
    onClose={()=>{if(getState().ui.editorMode==='dialog')closeEditor();}}>
    <Editor key={id} mode="dialog" closer={closer}/>
  </dialog>;
}
