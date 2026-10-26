import {getState,setDrafts,setUi,type EditorDraft} from './state.ts';
import {announce,ask,dispatch,draftChanged,persistDraft,queue,showError} from './session.ts';
import {toggleComplete} from './tasks.ts';
import {durationValid} from '../../detail.ts';
import {parseTrigger} from '../../waiting.ts';

let autoSaveTimer:ReturnType<typeof setTimeout>|undefined,saving:Promise<boolean>|undefined,completing:Promise<boolean>|undefined,composing=false;
let pendingOpen:{id:string;mode:'panel'|'dialog';focus:'fix'|'duration'|null;summary?:boolean}|null=null;
function openPending(){
  const next=pendingOpen;if(!next||getState().drafts.pendingEditorId!==next.id)return;
  pendingOpen=null;if(next.summary)selectFocusTask(next.id);else openEditor(next.id,next.mode,next.focus);
}
// Selecting a focus block shows its summary; a dirty editor stays visible until its write succeeds.
export function selectFocusTask(id:string){
  const s=getState();if(!s.snapshot?.tasks.some(t=>t.id===id))return;
  if(s.drafts.editorDirty&&s.ui.editorAutoSave){
    pendingOpen={id,mode:s.ui.editorMode??'panel',focus:null,summary:true};
    setDrafts({pendingEditorId:id});void saveEditor();return;
  }
  if(s.ui.editorMode)closeEditor();setUi({focusTaskId:id});
}
export function setEditorComposing(value:boolean){composing=value;scheduleEditorSave(value);}
// Composition pauses automatic writes; the next edit or composition end restarts the debounce.
export function scheduleEditorSave(paused=false){
  clearTimeout(autoSaveTimer);autoSaveTimer=undefined;
  if(!paused&&!composing&&getState().ui.editorAutoSave&&getState().drafts.editorDirty)
    autoSaveTimer=setTimeout(()=>{autoSaveTimer=undefined;if(getState().drafts.editorDirty)void saveEditor();},400);
}

// Focus changes are stored before switching tasks; other editors keep their explicit draft choice.
export function openEditor(id:string,mode:'panel'|'dialog'='dialog',focus:'fix'|'duration'|null=null){
  const s=getState(),d=s.drafts;
  if(d.editorDirty&&d.editor&&d.editor.id!==id&&s.ui.editorAutoSave){
    pendingOpen={id,mode,focus};
    setDrafts({pendingEditorId:id});
    void saveEditor();return;
  }
  if(d.editorDirty&&d.editor&&d.editor.id!==id){setDrafts({pendingEditorId:id});setUi({editorMode:mode==='panel'&&s.ui.editorMode==='dialog'?'dialog':mode,editorFocus:null});return;}
  if(!d.editorDirty){
    const saved=s.snapshot?.tasks.find(t=>t.id===id);if(!saved)return;
    setDrafts({editor:{...saved,epoch:s.snapshot!.epoch},editorSequence:0,pendingEditorId:null});
  }else setDrafts({pendingEditorId:null});
  setUi({editorMode:mode,editorFocus:focus,editorAutoSave:s.nav.view==='today',...(s.nav.view==='today'?{focusTaskId:id}:{})});
}
export function changeEditor(patch:Partial<EditorDraft>){
  const d=getState().drafts;if(!d.editor)return;
  setDrafts({editor:{...d.editor,...patch},editorDirty:true,editorSequence:d.editorSequence+1});draftChanged();
  scheduleEditorSave();
}
// Closing without discarding keeps a dirty draft; the status bar offers to continue it.
export function closeEditor(discard=false){
  const d=getState().drafts;
  composing=false;pendingOpen=null;
  scheduleEditorSave(true);
  if(!discard&&d.editorDirty&&getState().ui.editorAutoSave)void saveEditor();
  if(discard)setDrafts({editor:null,editorDirty:false});
  else if(!d.editorDirty)setDrafts({editor:null});
  setDrafts({pendingEditorId:null});setUi({editorMode:null,editorFocus:null,editorAutoSave:false});void persistDraft();
}
export function switchToPending(){
  const id=getState().drafts.pendingEditorId;if(!id)return;
  const next=pendingOpen?.id===id?pendingOpen:null;pendingOpen=null;
  setDrafts({editor:null,editorDirty:false,pendingEditorId:null});void persistDraft();
  if(next?.summary)selectFocusTask(id);else openEditor(id,next?.mode??getState().ui.editorMode??'dialog',next?.focus);
}
// With nothing typed, the open draft follows the stored task (drag, resize, menu actions beside the panel) instead of reporting a conflict.
export function syncEditor(){
  const s=getState(),e=s.drafts.editor;if(!e||s.drafts.editorDirty||!s.snapshot)return;
  const saved=s.snapshot.tasks.find(t=>t.id===e.id);
  if(!saved){closeEditor(true);return;}
  if(saved.revision!==e.revision||s.snapshot.epoch!==e.epoch)setDrafts({editor:{...saved,epoch:s.snapshot.epoch}});
}
export const editorConflict=()=>{const s=getState(),e=s.drafts.editor;if(!e||!s.snapshot)return false;const saved=s.snapshot.tasks.find(t=>t.id===e.id);return !saved||saved.revision!==e.revision||s.snapshot.epoch!==e.epoch;};

// Every caller joins the same write, then stores typing made while its response was pending.
export function saveEditor():Promise<boolean>{
  scheduleEditorSave(true);
  if(completing)return completing.then(ok=>ok&&(!getState().drafts.editorDirty||saveEditor()));
  if(saving)return saving;
  if(composing)return Promise.resolve(false);
  saving=(async()=>{
    const id=getState().drafts.editor?.id,autoSave=getState().ui.editorAutoSave;if(!id)return false;
    do{if(!await storeEditor())return false;}while(autoSave&&!composing&&getState().drafts.editor?.id===id&&getState().drafts.editorDirty);
    if(!getState().drafts.editorDirty){scheduleEditorSave(true);openPending();}
    return !getState().drafts.editorDirty;
  })().finally(()=>{saving=undefined;});
  return saving;
}
async function storeEditor(){
  const s=getState(),d=s.drafts;
  if(!d.editor)return false;
  if(queue.failed){showError(Error('이전 저장 오류를 먼저 해결하세요. 입력한 내용은 그대로 있어요.'));return false;}
  const t:EditorDraft=structuredClone(d.editor),seq=d.editorSequence;
  if(!t.title.trim()){showError(Error('제목을 입력해 주세요.'));return false;}
  if(!durationValid(t.duration)){showError(Error('소요시간은 15분 단위로 입력해 주세요.'));return false;}
  if(t.scheduleIncomplete){showError(Error('시각을 고정하려면 날짜와 시작 시각을 함께 입력해 주세요.'));return false;}
  let saved=false;
  void persistDraft();
  const wait=t.wait_since&&!t.plan_date&&!t.starts_at&&t.triggerInput!==undefined?parseTrigger(t.triggerInput,s.today):undefined;
  // Drafts saved before flow plans existed carry only starts_at.
  await dispatch({type:'update',id:t.id,expected_revision:t.revision,title:t.title,body:t.body,starts_at:t.starts_at,duration:t.duration,plan_date:t.plan_date??t.starts_at?.slice(0,10)??null,...(wait?{wait}:{})},{epoch:t.epoch,done:()=>{
    saved=true;const now=getState(),e=now.drafts.editor;
    if(e?.id===t.id){
      const stored=now.snapshot!.tasks.find(x=>x.id===t.id)!,clean=seq===now.drafts.editorSequence;
      setDrafts({editor:{...(clean?stored:e),revision:stored.revision,epoch:now.snapshot!.epoch},editorDirty:!clean});void persistDraft();
      if(clean)announce(now.native?'로컬 저장 완료':'미리보기에 반영했어요');
      else if(!now.ui.editorAutoSave)announce('새 변경이 남아 있어요. 다시 저장해 주세요.');
      if(clean&&!saving)openPending();
      else if(!clean)scheduleEditorSave();
    }
  }});
  return saved;
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
// Completing from the editor saves typed changes first, then keeps the editor in step with the stored task.
export async function completeFromEditor(){
  if(completing)return completing;
  const s=getState(),e=s.drafts.editor;if(!e)return false;
  if(s.drafts.editorDirty&&!await saveEditor())return false;
  completing=completeStoredEditor(e.id).finally(()=>{completing=undefined;});
  return completing;
}
async function completeStoredEditor(id:string){
  const seq=getState().drafts.editorSequence,current=getState().snapshot!.tasks.find(x=>x.id===id);if(!current)return false;
  const ok=await toggleComplete(current);
  const after=getState(),saved=after.snapshot!.tasks.find(x=>x.id===id),editor=after.drafts.editor;
  if(!ok||editor?.id!==id||!saved)return ok;
  if(seq===after.drafts.editorSequence)setDrafts({editor:{...saved,epoch:after.snapshot!.epoch}});
  else{setDrafts({editor:{...editor,revision:saved.revision,completed:saved.completed}});void persistDraft();}
  return ok;
}
