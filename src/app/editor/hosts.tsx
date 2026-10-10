// Foundation placeholders for area C (editor). Contract:
// - EditorPanel({nextId}): Today's side panel. Shows drafts.editor when ui.editorMode==='panel', otherwise the next block (or nothing).
// - EditorHost: the editor as a modal dialog when ui.editorMode==='dialog'.
// - ContextMenuHost: menu for ui.contextMenu (block when taskId, empty time otherwise). SplitHost: split chooser for ui.split.
// All writes go through store/editor.ts and store/tasks.ts.
import {useApp,setUi} from '../store/state.ts';
import {changeEditor,closeEditor,openEditor,saveEditor} from '../store/editor.ts';
import {completeTasks,findTask,unfix,unplan} from '../store/tasks.ts';
import {formatDuration} from '../../format.ts';

export function EditorPanel({nextId}:{nextId:string|null}){
  const {drafts,ui,snapshot}=useApp();
  const e=ui.editorMode==='panel'?drafts.editor:null,next=!e&&nextId?snapshot!.tasks.find(t=>t.id===nextId):null;
  if(!e&&!next)return null;
  if(!e)return <section className="card" aria-label="다음 블록"><p className="pill">다음</p><h2>{next!.title}</h2><button type="button" className="btn" onClick={()=>openEditor(next!.id,'panel')}>열기</button></section>;
  return <section className="card" aria-label="블록 상세">
    <input aria-label="제목" value={e.title} onChange={x=>changeEditor({title:x.target.value})}/>
    <textarea aria-label="메모" value={e.body} onChange={x=>changeEditor({body:x.target.value})}/>
    <p>{formatDuration(e.duration)}</p>
    <button type="button" className="btn primary" onClick={()=>void saveEditor()}>저장</button>
    <button type="button" className="btn" onClick={()=>closeEditor()}>닫기</button>
  </section>;
}
export function EditorHost(){
  const {drafts,ui}=useApp();
  if(ui.editorMode!=='dialog'||!drafts.editor)return null;
  const e=drafts.editor;
  return <dialog open aria-label="항목 상세"><input aria-label="제목" value={e.title} onChange={x=>changeEditor({title:x.target.value})}/>
    <button type="button" className="btn primary" onClick={()=>void saveEditor().then(ok=>{if(ok)closeEditor();})}>저장</button>
    <button type="button" className="btn" onClick={()=>closeEditor()}>닫기</button></dialog>;
}
export function ContextMenuHost(){
  const {ui}=useApp(),m=ui.contextMenu;
  if(!m)return null;
  const t=m.taskId?findTask(m.taskId):null,close=()=>setUi({contextMenu:null});
  return <div role="menu" className="card" style={{position:'fixed',left:m.x,top:m.y,zIndex:50}} onKeyDown={e=>{if(e.key==='Escape')close();}}>
    {t&&<button role="menuitem" type="button" className="btn" onClick={()=>{close();openEditor(t.id,'dialog');}}>메모 열기</button>}
    {t&&!t.completed&&<button role="menuitem" type="button" className="btn" onClick={()=>{close();void completeTasks([t]);}}>완료로 표시</button>}
    {t?.starts_at&&<button role="menuitem" type="button" className="btn" onClick={()=>{close();void unfix(t);}}>고정 해제</button>}
    {t?.plan_date&&<button role="menuitem" type="button" className="btn" onClick={()=>{close();void unplan(t);}}>미계획으로 옮기기</button>}
    <button role="menuitem" type="button" className="btn" onClick={close}>닫기</button>
  </div>;
}
export function SplitHost(){return null;}
