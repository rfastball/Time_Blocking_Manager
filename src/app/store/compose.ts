import {invoke} from '@tauri-apps/api/core';
import {startAt} from '../../dates.ts';
import {createCommand} from '../../capture.ts';
import type {Action} from '../../types.ts';
import {getState,setDrafts,setUi} from './state.ts';
import {acknowledgeCapture,announce,dispatch,draftChanged,persistDraft,queue,showError} from './session.ts';
import {issueAt,land} from './tasks.ts';

const snap=()=>getState().snapshot!;

// Capture text is one draft shared by the 준비 input, the capture window and the timetable composer.
export function editCapture(text:string){setDrafts({capture:text});draftChanged();}
export async function submitCapture(){
  const s=getState();
  if(!s.drafts.captureCommand&&!s.drafts.capture.trim()||!s.ready||!s.draftLoaded||queue.failed)return false;
  const title=s.drafts.capture.trim();
  let command=s.drafts.captureCommand;
  command??=createCommand({type:'create',id:crypto.randomUUID(),title},snap().epoch);
  setDrafts({captureCommand:command,...(!s.drafts.captureCommand?{composer:null}:{})});await persistDraft();
  if(queue.failed)return false;
  const sent=command;
  return dispatch(sent.action,{command:sent,done:()=>{
    if(!acknowledgeCapture(sent)){announce('이전 항목을 저장했습니다. 새 입력은 유지했습니다.');return;}
    announce('저장했어요.');
    if(s.captureWindow&&s.native)void queue.add(async()=>{await invoke('hide_capture');});
  }});
}
// A new block is a date assignment unless the user keeps the time fixed.
export function composerAction(date:string,start:number,duration:number,fixed:boolean,title:string):Action{
  return fixed?{type:'create_scheduled',id:crypto.randomUUID(),title,starts_at:startAt(date,start),duration}:{type:'create_flow',id:crypto.randomUUID(),title,date,duration};
}
export function openComposer(date:string,start:number,duration=30,fixed=false){
  const s=getState();if(!s.ready)return false;
  if(s.drafts.editorDirty){setUi({editorMode:'dialog'});return false;}
  if(fixed){const issue=issueAt('',date,start,duration);if(issue){showError(Error(issue.label));return false;}}
  setDrafts({composer:{date,start,duration,fixed}});return true;
}
export function setComposerFixed(fixed:boolean){const c=getState().drafts.composer;if(c){setDrafts({composer:{...c,fixed}});draftChanged();}}
export function closeComposer(){setDrafts({composer:null});void persistDraft();}
export async function submitComposer(){
  const s=getState(),c=s.drafts.composer,title=s.drafts.capture.trim();
  if(!c||!title&&!s.drafts.captureCommand||queue.busy||queue.failed)return false;
  const fixed=c.fixed??false;
  if(!s.drafts.captureCommand&&fixed){const issue=issueAt('',c.date,c.start,c.duration);if(issue){showError(Error(issue.label+'. 다른 시간을 선택하세요.'));return false;}}
  let command=s.drafts.captureCommand;
  command??=createCommand(composerAction(c.date,c.start,c.duration,fixed,title),snap().epoch);
  setDrafts({captureCommand:command});await persistDraft();
  if(queue.failed)return false;
  const sent=command,a=sent.action,id=a.type==='create_flow'||a.type==='create_scheduled'?a.id:null;
  return dispatch(a,{command:sent,done:()=>{acknowledgeCapture(sent);if(id)reveal(id,a.type==='create_scheduled');}});
}
// A new block can land far from where it was asked for (the end of a full day): bring it into view, then let it settle.
function reveal(id:string,clack:boolean){
  let frames=0;
  const look=()=>{
    const el=document.querySelector<HTMLElement>(`[data-task="${CSS.escape(id)}"]`);
    if(!el){if(++frames<12)requestAnimationFrame(look);return;}
    // The block, not its button: the tile clips and would scroll itself.
    (el.closest<HTMLElement>('[data-block]')??el).scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    land(id,clack);
  };
  requestAnimationFrame(look);
}
