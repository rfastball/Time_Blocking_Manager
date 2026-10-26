// The cutting board: opened on a block, edited as a draft, committed by closing (닫기·Esc), thrown away by 취소.
import {initialSegs,piecesOf} from '../../cut.ts';
import {updateAction} from '../../intent.ts';
import {placeLabel} from '../../bench.ts';
import {time,monthDay} from '../../dates.ts';
import {getState,setDrafts,setUi,type CutDraft} from './state.ts';
import {announce,dispatch,draftChanged,persistDraft,queue,showError} from './session.ts';
import {closeEditor,openEditor,saveEditor} from './editor.ts';
import {flowOrderOn,taskMinute} from './tasks.ts';
import {focusLater,taskSelector} from '../ui/focus.ts';

const snap=()=>getState().snapshot!;
// The block the board was opened from: the same task can stand in the week and in 준비 at once (지난 미완료).
let origin:HTMLElement|null=null;

// Typed changes in the detail editor come first: the board works from the stored task.
export function openCut(id:string){
  const s=getState(),d=s.drafts,t=snap().tasks.find(x=>x.id===id);
  if(!t||t.completed)return;
  if(d.editorDirty&&d.editor?.id===id){
    if(s.ui.editorAutoSave){void saveEditor().then(ok=>{if(ok)openCut(id);});return;}
    openEditor(id,s.ui.editorMode??'dialog');showError(Error('변경을 저장한 뒤 블록을 나눠 주세요.'));return;
  }
  if(d.cut&&d.cut.taskId!==id){setUi({split:d.cut.taskId});return;}
  if(s.ui.editorMode==='dialog'&&d.editor?.id===id)closeEditor();
  if(!d.cut){
    const a=document.activeElement;origin=a instanceof HTMLElement&&a.dataset.task===id?a:null;
    setDrafts({cut:{taskId:id,epoch:snap().epoch,revision:t.revision,title:t.title,body:t.body,segs:initialSegs(t)}});
  }
  setUi({split:id,contextMenu:null,benchSelection:[]});
}
export function editCut(patch:Partial<CutDraft>){
  const c=getState().drafts.cut;if(!c)return;
  setDrafts({cut:{...c,...patch}});draftChanged();
}
const refocus=(id:string)=>{
  const from=origin;origin=null;
  focusLater([()=>from?.dataset.task===id?from:null,taskSelector(id)]);
};
function close(id:string){setDrafts({cut:null});setUi({split:null});void persistDraft();refocus(id);}
export function cancelCut(){const c=getState().drafts.cut;if(c)close(c.taskId);else setUi({split:null});}

// Where the block came from, as the board says it.
export function cutPlace(id:string){
  const t=snap().tasks.find(x=>x.id===id);if(!t)return '';
  if(!t.plan_date)return placeLabel(t,snap().tasks,snap().piles??[]);
  if(t.plan_date<getState().today)return `${monthDay(t.plan_date)} 미완료`;
  if(t.starts_at)return `${monthDay(t.plan_date)} · ${time(taskMinute(t))} 고정`;
  return `${monthDay(t.plan_date)} · 순서 ${flowOrderOn(t.plan_date).findIndex(x=>x.id===id)+1}`;
}

// Closing keeps the work: one piece is an edit of the block, more become their own blocks where it stood.
export async function commitCut(){
  const c=getState().drafts.cut;if(!c||queue.failed)return false;
  const t=snap().tasks.find(x=>x.id===c.taskId);
  if(!t){showError(Error('블록이 이미 삭제됐어요. 도마를 취소해 주세요.'));return false;}
  if(!c.title.trim()){showError(Error('제목을 입력해 주세요.'));return false;}
  const [first]=c.segs,single=c.segs.length===1&&!first.done;
  if(single){
    const title=first.name.trim()||c.title.trim(),sized=first.sized&&(t.proto||first.duration!==t.duration);
    if(title===t.title&&c.body===t.body&&!sized){close(t.id);return true;}
    const ok=await dispatch({...updateAction({...t,revision:c.revision},t.plan_date,t.starts_at,null,first.sized?first.duration:t.duration),title,body:c.body,...(sized?{sized:true}:{})},{epoch:c.epoch,done:()=>close(t.id)});
    return ok;
  }
  const pieces=piecesOf(t,c.title,c.body,c.segs,()=>crypto.randomUUID()),done=pieces.filter(p=>p.completed).length;
  return dispatch({type:'split_pieces',id:t.id,expected_revision:c.revision,pieces,...(done&&!t.plan_date?{date:getState().today}:{})},{epoch:c.epoch,done:()=>{
    close(t.id);
    announce(`${pieces.length>1?`${pieces.length}개로 나눴어요`:'저장했어요'}${done?`. ${done}개는 ${t.plan_date?`${monthDay(t.plan_date)} 완료로 남겼어요`:'오늘 완료로 기록했어요'}`:''}`);
  }});
}
