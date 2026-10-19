import {dayPlan} from '../../today.ts';
import {effectiveDay} from '../../settings.ts';
import {byFlowOrder,moveInOrder} from '../../flow.ts';
import {placementIssue} from '../../placement.ts';
import {time,startAt,startMinute,dateLabel} from '../../dates.ts';
import {formatDuration,quotedObject} from '../../format.ts';
import {carried,intentAction,updateAction,type Intent} from '../../intent.ts';
import {onBench,waiting} from '../../bench.ts';
import type {Task,Trashed,WorkingDay} from '../../types.ts';
import {getState,setDrafts,setState,setUi} from './state.ts';
import {fly} from '../ui/flight.ts';
import {pushOut,revive,revived} from './wait.ts';
import {announce,dispatch,persistDraft,showError,stamp} from './session.ts';

const snap=()=>getState().snapshot!;
const find=(id:string)=>snap().tasks.find(t=>t.id===id);
export const taskMinute=(t:Task)=>startMinute(t.starts_at!);
export function dayRule(date:string):WorkingDay{const s=getState();return effectiveDay(s.drafts.settingsDraft??s.snapshot!.settings,date);}
export const planOf=(date:string,tasks=snap().tasks)=>dayPlan(date,tasks,dayRule(date),snap().layouts??[]);
export const flowOrderOn=(date:string)=>snap().tasks.filter(t=>t.plan_date===date&&!t.starts_at&&!t.completed).sort(byFlowOrder);
export const benchTasks=()=>snap().tasks.filter(onBench);
export const overdueTasks=()=>{const day=getState().today;return snap().tasks.filter(t=>!t.completed&&t.plan_date&&t.plan_date<day);};
export function available(date:string){const d=dayRule(date);return d.enabled?d.end-d.start-d.breaks.reduce((n,b)=>n+b.end-b.start,0):0;}
export const issueAt=(id:string,date:string,start:number,duration:number)=>placementIssue(id,date,start,duration,dayRule(date),snap().tasks);
export function land(id:string,clack=false){setUi({landed:{id,clack}});setTimeout(()=>{if(getState().ui.landed?.id===id)setUi({landed:null});},520);}

// ── 완료 ──
// Finishing the last of today's blocks says so in the same announcement.
const dayEnd=(date:string)=>date===getState().today&&!planOf(date).items.some(i=>!i.task.completed)?' · 오늘 끝':'';
// Completed flow work leaves the time space; today's remaining flow is laid out again from now.
export async function completeTasks(tasks:Task[]){
  const flow=tasks.filter(t=>!t.completed&&t.plan_date&&!t.starts_at),other=tasks.filter(t=>!t.completed&&!flow.includes(t));
  let ok=true;
  for(const date of [...new Set(flow.map(t=>t.plan_date!))]){
    const items=flow.filter(t=>t.plan_date===date).map(({id,revision})=>({id,revision}));
    ok=await dispatch({type:'complete_flow',date,items,at:date===getState().today?stamp():null},{done:()=>announce((items.length>1?`${items.length}개를 완료했어요`:'완료했어요')+dayEnd(date))})&&ok;
  }
  // 준비 work done now is recorded as today's completion; nothing is laid out again.
  const today=getState().today,unplanned=other.filter(t=>!t.plan_date);
  for(const t of other)ok=await dispatch({type:'set_completed',id:t.id,expected_revision:t.revision,completed:true,...(t.plan_date?{}:{date:today})},
    {done:()=>{if(!t.plan_date&&unplanned.length===1)announce(`${quotedObject(t.title)} 오늘 완료로 기록했어요`);else if(t.plan_date)announce('완료했어요'+dayEnd(t.plan_date));}})&&ok;
  if(unplanned.length>1&&ok)announce(`${unplanned.length}개를 오늘 완료로 기록했어요`);
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
  return dispatch(updateAction(t,date,startAt(date,start),null,duration),{done:()=>{land(t.id,true);announce(`‘${t.title}’ ${time(start)}–${time(start+duration)}에 고정했어요`);}});
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
  return dispatch(updateAction(t,t.plan_date,t.starts_at,null,duration),{done:()=>{land(t.id);announce(`‘${t.title}’ ${formatDuration(duration)}`);}});
}
export const unplan=(t:Task)=>t.plan_date&&!t.completed?fly([t.id],()=>dispatch(updateAction(t,null,null),{done:()=>announce(`‘${t.title}’ 준비 선반 맨 위로 옮겼어요`)})):Promise.resolve(false);
// One stored command for a drop: order, date, time or back to 준비. Out to the band, or back from it, goes through the waiting store.
export function drop(intent:Intent){
  if(intent.zone==='wait'){
    if(intent.index===undefined)return pushOut(carried(intent),{flown:true});
    const action=intentAction(snap().tasks,intent);
    return action?dispatch(action,{done:()=>announce('기다림 순서를 옮겼어요')}):Promise.resolve(false);
  }
  const from=carried(intent).map(find).filter((t):t is Task=>!!t&&waiting(t));
  if(from.length&&intent.zone==='tray')return revive(from.map(t=>t.id),{flown:true});
  const action=intentAction(snap().tasks,intent,snap().piles??[]);
  if(!action)return Promise.resolve(false);
  return dispatch(action,{done:()=>{
    land(intent.id,intent.zone==='rail');
    if(from.length)revived(from,intent.date?`${dateLabel(intent.date)}에`:intent.zone==='inbox'?'들어옴으로':'선반으로');
  }});
}
// ── 휴지통 ──
// Deleting needs no question: the task waits in the trash (store retention) until restored or removed.
export function deleteTask(t:Task){
  return dispatch({type:'delete',id:t.id,expected_revision:t.revision},{done:()=>{
    const d=getState().drafts;if(d.editor?.id===t.id){setDrafts({editor:null,editorDirty:false});setUi({editorMode:null});void persistDraft();}
    announce(`${quotedObject(t.title)} 휴지통으로 옮겼어요`);
  }});
}
// Completions stored without a date before every completion had one: the user empties them, into the trash.
export async function clearArchive(items:Task[]){
  let ok=true;
  for(const t of items)ok=await dispatch({type:'delete',id:t.id,expected_revision:t.revision})&&ok;
  if(ok)announce(`날짜 없는 완료 ${items.length}개를 휴지통으로 옮겼어요`);
  return ok;
}
export function restoreTrashed(t:Trashed){
  return dispatch({type:'restore_trashed',id:t.id},{done:()=>{
    const back=find(t.id);
    announce(t.starts_at&&!back?.starts_at?`${quotedObject(t.title)} 복원했어요. 그 시각이 차 있어 고정 없이 그날 순서에 넣었어요`:`${quotedObject(t.title)} 복원했어요`);
  }});
}
export function purgeTrashed(items:Trashed[]){
  if(!items.length)return Promise.resolve(false);
  return dispatch({type:'purge_trashed',ids:items.map(t=>t.id)},{done:()=>announce(items.length>1?'휴지통을 비웠어요':`${quotedObject(items[0].title)} 영구 삭제했어요`)});
}

export const setGesture=(gesture:boolean)=>setState({gesture});
export {find as findTask};
