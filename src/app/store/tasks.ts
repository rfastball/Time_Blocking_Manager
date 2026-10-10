import {invoke} from '@tauri-apps/api/core';
import {dayPlan} from '../../today.ts';
import {effectiveDay} from '../../settings.ts';
import {byFlowOrder,moveInOrder} from '../../flow.ts';
import {placementIssue,splitDuration} from '../../placement.ts';
import {dateKey,dateLabel,dateOf,plusDays,time} from '../../dates.ts';
import {intentAction,updateAction,type Intent} from '../../intent.ts';
import type {Action,Task,WorkingDay} from '../../types.ts';
import {getState,setDrafts,setState,setUi} from './state.ts';
import {afterIdle,announce,ask,dispatch,draftChanged,persistDraft,queue,showError,stamp} from './session.ts';

const snap=()=>getState().snapshot!;
const find=(id:string)=>snap().tasks.find(t=>t.id===id);
export const taskMinute=(t:Task)=>Number(t.starts_at!.slice(11,13))*60+Number(t.starts_at!.slice(14,16));
export function dayRule(date:string):WorkingDay{const s=getState();return effectiveDay(s.drafts.settingsDraft??s.snapshot!.settings,date);}
export const planOf=(date:string,tasks=snap().tasks)=>dayPlan(date,tasks,dayRule(date),snap().layouts??[]);
export const flowOrderOn=(date:string)=>snap().tasks.filter(t=>t.plan_date===date&&!t.starts_at&&!t.completed).sort(byFlowOrder);
export const inboxTasks=()=>snap().tasks.filter(t=>!t.plan_date&&!t.completed);
export const overdueTasks=()=>{const day=getState().today;return snap().tasks.filter(t=>!t.completed&&t.plan_date&&t.plan_date<day);};
export function available(date:string){const d=dayRule(date);return d.enabled?d.end-d.start-d.breaks.reduce((n,b)=>n+b.end-b.start,0):0;}
export const issueAt=(id:string,date:string,start:number,duration:number)=>placementIssue(id,date,start,duration,dayRule(date),snap().tasks);
export function land(id:string,clack=false){setUi({landed:{id,clack}});setTimeout(()=>{if(getState().ui.landed?.id===id)setUi({landed:null});},520);}

// ── 완료 ──
// Completed flow work leaves the time space; today's remaining flow is laid out again from now.
export async function completeTasks(tasks:Task[]){
  const flow=tasks.filter(t=>!t.completed&&t.plan_date&&!t.starts_at),other=tasks.filter(t=>!t.completed&&!flow.includes(t));
  let ok=true;
  for(const date of [...new Set(flow.map(t=>t.plan_date!))]){
    const items=flow.filter(t=>t.plan_date===date).map(({id,revision})=>({id,revision}));
    ok=await dispatch({type:'complete_flow',date,items,at:date===getState().today?stamp():null},{done:()=>announce(items.length>1?`${items.length}개를 완료했어요`:'완료했어요')})&&ok;
  }
  for(const t of other)ok=await dispatch({type:'set_completed',id:t.id,expected_revision:t.revision,completed:true})&&ok;
  return ok;
}
export const uncomplete=(t:Task)=>dispatch({type:'set_completed',id:t.id,expected_revision:t.revision,completed:false},{done:()=>announce(`‘${t.title}’ 완료를 취소했어요`)});
export const toggleComplete=(t:Task)=>t.completed?uncomplete(t):completeTasks([t]);
export const reflowToday=()=>dispatch({type:'reflow',date:getState().today,at:stamp()},{done:()=>announce('지금 기준으로 다시 배치했어요')});

// ── 순서·배정·고정 ──
export async function saveOrder(date:string,ids:string[]){
  const order=flowOrderOn(date);if(ids.every((id,i)=>order[i]?.id===id))return true;
  return dispatch({type:'reorder_flow',date,expected:ids.map(id=>({id,revision:order.find(o=>o.id===id)!.revision}))});
}
export function reorder(t:Task,delta:number){
  const ids=moveInOrder(flowOrderOn(t.plan_date!).map(x=>x.id),t.id,delta);
  return ids?saveOrder(t.plan_date!,ids).then(ok=>{if(ok)announce(`‘${t.title}’ 순서를 옮겼어요`);return ok;}):Promise.resolve(false);
}
// Moving within the same day's flow is a pure order change; anything else assigns the date.
export async function assign(t:Task,date:string,before:string|null){
  if(before===t.id)return false;
  if(t.plan_date===date&&!t.starts_at&&!t.completed){
    const ids=flowOrderOn(date).map(x=>x.id).filter(id=>id!==t.id),index=before?ids.indexOf(before):ids.length;
    ids.splice(index<0?ids.length:index,0,t.id);return saveOrder(date,ids);
  }
  return dispatch(updateAction(t,date,null,before),{done:()=>{land(t.id);announce(`‘${t.title}’ ${dateLabel(date)} 계획에 넣었어요`);}});
}
export async function fix(t:Task,date:string,start:number,duration=t.duration){
  const issue=issueAt(t.id,date,start,duration);if(issue){showError(Error(issue.label));return false;}
  return dispatch(updateAction(t,date,date+'T'+time(start),null,duration),{done:()=>{land(t.id,true);announce(`‘${t.title}’ ${time(start)}–${time(start+duration)}에 고정했어요`);}});
}
export function unfix(t:Task){
  if(!t.starts_at)return Promise.resolve(false);
  // Released at the same place in the order: before the first flow block that starts after it.
  const start=taskMinute(t),before=planOf(t.plan_date!).items.find(i=>!i.fixed&&!i.task.completed&&i.start>=start)?.task.id??null;
  return dispatch(updateAction(t,t.plan_date,null,before),{done:()=>{land(t.id);announce(`‘${t.title}’ 시각 고정을 해제했어요`);}});
}
export function resize(t:Task,duration:number){
  if(duration<15||duration===t.duration)return Promise.resolve(false);
  if(t.starts_at){const issue=issueAt(t.id,t.plan_date!,taskMinute(t),duration);if(issue){showError(Error(issue.label));return Promise.resolve(false);}}
  return dispatch(updateAction(t,t.plan_date,t.starts_at,null,duration),{done:()=>land(t.id)});
}
export const unplan=(t:Task)=>t.plan_date?dispatch(updateAction(t,null,null),{done:()=>announce(`‘${t.title}’ 미계획으로 옮겼어요`)}):Promise.resolve(false);
// One stored command for a drop: order, date, time or back to 미계획.
export function drop(intent:Intent){
  const action=intentAction(snap().tasks,intent);
  if(!action)return Promise.resolve(false);
  return dispatch(action,{done:()=>land(intent.id,intent.zone==='rail')});
}
export async function deleteTask(t:Task){
  if(!await ask(`‘${t.title}’ 항목을 삭제할까요? 이 작업은 되돌릴 수 없어요.`))return false;
  return dispatch({type:'delete',id:t.id,expected_revision:t.revision},{done:()=>{const d=getState().drafts;if(d.editor?.id===t.id){setDrafts({editor:null,editorDirty:false});setUi({editorMode:null});void persistDraft();}}});
}
export function split(t:Task,first:number){
  const duration=splitDuration(t.duration,first);
  return dispatch({type:'split',id:t.id,expected_revision:t.revision,new_id:crypto.randomUUID(),first_duration:duration},{done:()=>{setUi({split:null});announce(`‘${t.title}’을 나눴어요. 뒤 블록은 미계획에 있어요`);}});
}
export async function clearDay(date:string){
  const s=getState(),d=s.drafts;
  if(queue.busy||queue.failed)return false;
  if(d.capture||d.editorDirty||d.settingsDraft||d.routineDraft||Object.keys(d.rawSchedules).length){showError(Error('작성 중인 내용을 저장하거나 되돌린 뒤 하루 일정을 비워 주세요.'));return false;}
  const epoch=snap().epoch,expected_tasks=snap().tasks.filter(t=>t.plan_date===date).map(({id,revision})=>({id,revision}));
  if(!expected_tasks.length||!await ask(`${dateLabel(date)}의 블록 ${expected_tasks.length}개를 미계획으로 돌릴까요? 제목·메모·완료 상태는 유지됩니다.`))return false;
  return dispatch({type:'clear_day',date,expected_tasks},{epoch,done:()=>announce('하루 일정을 비웠습니다. 작업은 미계획에 보관했습니다.')});
}

// ── 담기·새 블록 ──
// Capture text is one draft shared by the 미계획 input, the capture window and the timetable composer.
export function editCapture(text:string){setDrafts({capture:text,captureCommand:null});draftChanged();}
export async function submitCapture(){
  const s=getState();
  if(!s.drafts.capture.trim()||!s.ready||!s.draftLoaded||queue.failed)return false;
  const title=s.drafts.capture.trim();
  let command=s.drafts.captureCommand?.action.type==='create'?s.drafts.captureCommand:null;
  command??={request_id:crypto.randomUUID(),epoch:snap().epoch,action:{type:'create',id:crypto.randomUUID(),title}};
  setDrafts({composer:null,captureCommand:command});void persistDraft();
  const sent=command;
  return dispatch(sent.action,{epoch:sent.epoch,requestId:sent.request_id,done:()=>{
    if(getState().drafts.captureCommand!==sent){announce('이전 항목을 저장했습니다. 새 입력은 유지했습니다.');return;}
    setDrafts({capture:'',captureCommand:null});void persistDraft();announce('저장했어요.');
    if(s.captureWindow&&s.native)void queue.add(async()=>{await invoke('hide_capture');});
  }});
}
// A new block is a date assignment unless the user keeps the time fixed.
export function composerAction(date:string,start:number,duration:number,fixed:boolean,title:string):Action{
  return fixed?{type:'create_scheduled',id:crypto.randomUUID(),title,starts_at:date+'T'+time(start),duration}:{type:'create_flow',id:crypto.randomUUID(),title,date,duration};
}
function sameComposerAction(action:Action,date:string,start:number,duration:number,fixed:boolean){
  return fixed?action.type==='create_scheduled'&&action.starts_at===date+'T'+time(start)&&action.duration===duration:action.type==='create_flow'&&action.date===date&&action.duration===duration;
}
export function openComposer(date:string,start:number,duration=30,fixed=false){
  const s=getState();if(!s.ready)return;
  if(s.drafts.editorDirty){setUi({editorMode:'dialog'});return;}
  if(fixed){const issue=issueAt('',date,start,duration);if(issue){showError(Error(issue.label));return;}}
  setDrafts({composer:{date,start,duration,fixed}});
}
export function setComposerFixed(fixed:boolean){const c=getState().drafts.composer;if(c){setDrafts({composer:{...c,fixed}});draftChanged();}}
export function closeComposer(){setDrafts({composer:null});void persistDraft();}
export async function submitComposer(){
  const s=getState(),c=s.drafts.composer,title=s.drafts.capture.trim();
  if(!c||!title||queue.busy||queue.failed)return false;
  const fixed=c.fixed??false;
  if(fixed){const issue=issueAt('',c.date,c.start,c.duration);if(issue){showError(Error(issue.label+'. 다른 시간을 선택하세요.'));return false;}}
  let command=s.drafts.captureCommand;
  if(!command||!sameComposerAction(command.action,c.date,c.start,c.duration,fixed))command=null;
  command??={request_id:crypto.randomUUID(),epoch:snap().epoch,action:composerAction(c.date,c.start,c.duration,fixed,title)};
  setDrafts({captureCommand:command});void persistDraft();
  const sent=command,a=sent.action,id=a.type==='create_flow'||a.type==='create_scheduled'?a.id:null;
  return dispatch(a,{epoch:sent.epoch,requestId:sent.request_id,done:()=>{if(getState().drafts.captureCommand===sent)setDrafts({capture:'',captureCommand:null,composer:null});void persistDraft();if(id)reveal(id,fixed);}});
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

// ── 정기 업무 생성 ──
const routineRanges=new Set<string>();let routinePending=false;
// Generates routine blocks for the visible days once per range and settings revision.
export async function ensureVisibleRoutines(){
  const s=getState(),d=s.drafts;
  if(!s.ready||!s.draftLoaded||s.captureWindow||s.quitSaving||routinePending||queue.busy||queue.failed||d.settingsDraft||d.routineDraft||Object.keys(d.rawSchedules).length||d.editorDirty||d.capture||s.gesture||!s.snapshot?.settings.routines?.length||!['today','plan'].includes(s.nav.view))return;
  let [from,to]=visibleRange();
  from=from<s.today?s.today:from;if(from>to)return;
  const key=[s.snapshot.epoch,s.snapshot.settings.revision,from,to].join(':');if(routineRanges.has(key))return;
  routinePending=true;
  const existing=new Set(s.snapshot.tasks.map(t=>t.id));
  try{await dispatch({type:'ensure_routines',from,to},{done:()=>{routineRanges.add(key);const moved=snap().tasks.filter(t=>!existing.has(t.id)&&!t.starts_at);if(moved.length)announce(`시각이 겹치거나 근무 외인 정기 업무 ${moved.length}건은 시각 고정 없이 그날 순서에 넣었습니다.`);}});}
  finally{routinePending=false;void ensureVisibleRoutines();}
}
afterIdle.add(()=>void ensureVisibleRoutines());
export function visibleRange():[string,string]{
  const {view,selected,planAnchor,period}=getState().nav;
  if(view!=='plan')return [selected,selected];
  const first=dateOf(planAnchor);if(period==='month')first.setDate(1);first.setDate(first.getDate()-(first.getDay()+6)%7);
  const from=dateKey(first),last=dateOf(planAnchor);last.setMonth(last.getMonth()+1,0);
  const monthStart=dateOf(planAnchor);monthStart.setDate(1);
  return [from,plusDays(from,period==='week'?6:period==='two'?13:Math.ceil(((monthStart.getDay()+6)%7+last.getDate())/7)*7-1)];
}
export const setGesture=(gesture:boolean)=>setState({gesture});
export {find as findTask};
