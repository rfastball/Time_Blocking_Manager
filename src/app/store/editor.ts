import type {Task} from '../../types.ts';
import {getState,setDrafts,setUi,type EditorDraft} from './state.ts';
import {announce,ask,dispatch,draftChanged,persistDraft,queue,showError} from './session.ts';
import {toggleComplete} from './tasks.ts';

// The editor holds one task draft. Opening another task while it has unsaved changes keeps the draft and asks first.
export function openEditor(id:string,mode:'panel'|'dialog'='dialog',focus:'fix'|'duration'|null=null){
  const s=getState(),d=s.drafts;
  if(d.editorDirty&&d.editor&&d.editor.id!==id){setDrafts({pendingEditorId:id});setUi({editorMode:mode==='panel'&&s.ui.editorMode==='dialog'?'dialog':mode,editorFocus:null});return;}
  if(!d.editorDirty){
    const saved=s.snapshot?.tasks.find(t=>t.id===id);if(!saved)return;
    setDrafts({editor:{...saved,epoch:s.snapshot!.epoch},editorSequence:0,pendingEditorId:null});
  }else setDrafts({pendingEditorId:null});
  setUi({editorMode:mode,editorFocus:focus});
}
export function changeEditor(patch:Partial<Task>){
  const d=getState().drafts;if(!d.editor)return;
  setDrafts({editor:{...d.editor,...patch},editorDirty:true,editorSequence:d.editorSequence+1});draftChanged();
}
// Closing without discarding keeps a dirty draft; the status bar offers to continue it.
export function closeEditor(discard=false){
  const d=getState().drafts;
  if(discard)setDrafts({editor:null,editorDirty:false});
  else if(!d.editorDirty)setDrafts({editor:null});
  setDrafts({pendingEditorId:null});setUi({editorMode:null,editorFocus:null});void persistDraft();
}
export function switchToPending(){
  const id=getState().drafts.pendingEditorId;if(!id)return;
  setDrafts({editor:null,editorDirty:false,pendingEditorId:null});void persistDraft();openEditor(id,getState().ui.editorMode??'dialog');
}
// With nothing typed, the open draft follows the stored task (drag, resize, menu actions beside the panel) instead of reporting a conflict.
export function syncEditor(){
  const s=getState(),e=s.drafts.editor;if(!e||s.drafts.editorDirty||!s.snapshot)return;
  const saved=s.snapshot.tasks.find(t=>t.id===e.id);
  if(!saved){closeEditor(true);return;}
  if(saved.revision!==e.revision||s.snapshot.epoch!==e.epoch)setDrafts({editor:{...saved,epoch:s.snapshot.epoch}});
}
export const editorConflict=()=>{const s=getState(),e=s.drafts.editor;if(!e||!s.snapshot)return false;const saved=s.snapshot.tasks.find(t=>t.id===e.id);return !saved||saved.revision!==e.revision||s.snapshot.epoch!==e.epoch;};

// Resolves true when the draft was stored and no newer typing remains.
export async function saveEditor(){
  const s=getState(),d=s.drafts;
  if(!d.editor)return false;
  if(queue.failed){showError(Error('이전 저장 오류를 먼저 해결하세요. 입력한 내용은 그대로 있어요.'));return false;}
  const t:EditorDraft=structuredClone(d.editor),seq=d.editorSequence;
  if(!t.title.trim()){showError(Error('제목을 입력해 주세요.'));return false;}
  if(!Number.isInteger(t.duration)||t.duration<15||t.duration>1440||t.duration%15){showError(Error('소요시간은 15분 단위로 입력해 주세요.'));return false;}
  let saved=false;
  void persistDraft();
  // Drafts saved before flow plans existed carry only starts_at.
  await dispatch({type:'update',id:t.id,expected_revision:t.revision,title:t.title,body:t.body,starts_at:t.starts_at,duration:t.duration,plan_date:t.plan_date??t.starts_at?.slice(0,10)??null},{epoch:t.epoch,done:()=>{
    saved=true;const now=getState(),e=now.drafts.editor;
    if(e?.id===t.id){
      const revision=now.snapshot!.tasks.find(x=>x.id===t.id)!.revision,clean=seq===now.drafts.editorSequence;
      setDrafts({editor:{...e,revision,epoch:now.snapshot!.epoch},editorDirty:!clean});void persistDraft();
      announce(clean?(now.native?'로컬 저장 완료':'미리보기에 반영했어요'):'새 변경이 남아 있어요. 다시 저장해 주세요.');
    }
  }});
  return saved&&!getState().drafts.editorDirty;
}
// Overwrite after someone else saved this task: keep the typed fields, adopt the saved revision.
export async function rebaseEditor(){
  if(!await ask('다른 곳에서 저장된 내용 위에 지금 입력을 저장할까요?'))return false;
  const s=getState(),e=s.drafts.editor;if(!e)return false;
  const current=s.snapshot!.tasks.find(x=>x.id===e.id);
  if(!current){showError(Error('삭제된 항목이에요. 내용을 복사해 새 항목으로 저장해 주세요.'));return false;}
  setDrafts({editor:{...e,revision:current.revision,epoch:s.snapshot!.epoch}});
  return saveEditor();
}
export async function discardEditorDraft(){if(await ask('작성 중인 변경을 버리고 저장된 내용으로 돌아갈까요?'))closeEditor(true);}
// Completing from the editor saves typed changes first, then keeps the editor in step with the stored task.
export async function completeFromEditor(){
  const s=getState(),e=s.drafts.editor;if(!e)return false;
  if(s.drafts.editorDirty&&!await saveEditor())return false;
  const seq=getState().drafts.editorSequence,current=getState().snapshot!.tasks.find(x=>x.id===e.id);if(!current)return false;
  const ok=await toggleComplete(current);
  const after=getState(),saved=after.snapshot!.tasks.find(x=>x.id===e.id),editor=after.drafts.editor;
  if(!ok||editor?.id!==e.id||!saved)return ok;
  if(seq===after.drafts.editorSequence)setDrafts({editor:{...saved,epoch:after.snapshot!.epoch}});
  else{setDrafts({editor:{...editor,revision:saved.revision,completed:saved.completed}});void persistDraft();}
  return ok;
}
