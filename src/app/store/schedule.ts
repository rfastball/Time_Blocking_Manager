import {invoke} from '@tauri-apps/api/core';
import {WEEKLY_TARGET,WORK_DAYS} from '../../settings.ts';
import type {AvailabilityTarget} from '../../availability-band.ts';
import {minutes,time} from '../../dates.ts';
import type {Routine,Settings} from '../../types.ts';
import {getState,setDrafts,setState,setUi,type RawSchedule,type RoutineDraft} from './state.ts';
import {ask,dispatch,draftChanged,persistDraft,queue,showError} from './session.ts';

const snap=()=>getState().snapshot!;
// The working draft of all schedule settings; the base remembers which stored revision it started from.
export function setSettingsDraft(settings:Settings|null){
  const s=getState();
  setDrafts({settingsDraft:settings,settingsBase:settings?s.drafts.settingsBase??{epoch:snap().epoch,revision:snap().settings.revision}:null});draftChanged();
}
export function stashRawSchedule(key:string,raw:RawSchedule|null){
  const next={...getState().drafts.rawSchedules};if(raw)next[key]=raw;else delete next[key];
  setDrafts({rawSchedules:next});draftChanged();
}
export function resetSettingsDraft(){setDrafts({settingsDraft:null,settingsBase:null,rawSchedules:{}});void persistDraft();}
// Schedule changes preserve explicitly fixed task times.
export async function saveSchedule(settings:Settings,rawKey?:string){
  const d=getState().drafts;
  if(Object.entries(d.rawSchedules).some(([key,raw])=>raw.invalid&&key!==rawKey)){showError(Error('다른 날짜 또는 기본 일정에 입력 중인 시간이 있습니다. 먼저 수정하거나 설정에서 되돌리세요.'));return false;}
  if(queue.failed){showError(Error('이전 저장 오류를 먼저 해결하세요.'));return false;}
  const savedDraft=d.settingsDraft,savedRaw=d.rawSchedules,base=d.settingsBase??{epoch:snap().epoch,revision:snap().settings.revision};
  return dispatch({type:'set_schedule',expected_revision:base.revision,days:settings.days,exceptions:settings.exceptions??[],weekly_target:settings.weekly_target??WEEKLY_TARGET,work_days:settings.work_days??WORK_DAYS,move_conflicts:false},{epoch:base.epoch,done:()=>{
    const now=getState().drafts;
    if(now.settingsDraft===savedDraft)setDrafts({settingsDraft:null,settingsBase:null,rawSchedules:now.rawSchedules===savedRaw?{}:now.rawSchedules});
    else setDrafts({settingsBase:{epoch:snap().epoch,revision:snap().settings.revision}});
    void persistDraft();
  }});
}
export const openAvailability=(date:string,target:AvailabilityTarget='work',x=innerWidth/2,y=150)=>setUi({availability:{date,target,x,y}});

// ── 정기 업무 ──
export function editRoutineDraft(patch:Partial<RoutineDraft>){
  const s=getState(),cur=s.drafts.routineDraft;
  setDrafts({routineDraft:{id:cur?.id??crypto.randomUUID(),epoch:cur?.epoch??snap().epoch,revision:cur?.revision??snap().settings.revision,title:'',body:'',weekdays:[0,1,2,3,4],start:'09:00',duration:'30',...cur,...patch}});draftChanged();
}
export function startRoutineEdit(routine:Routine){
  if(getState().drafts.routineDraft)return '작성 중인 정기 업무를 저장하거나 되돌려 주세요.';
  setDrafts({routineDraft:{...routine,start:time(routine.start),duration:String(routine.duration),epoch:snap().epoch,revision:snap().settings.revision}});draftChanged();return null;
}
export async function cancelRoutineDraft(){if(!await ask('작성 중인 정기 업무 변경을 버릴까요?'))return;setDrafts({routineDraft:null});void persistDraft();}
// Returns an error message for the form, or null after a successful save.
export async function saveRoutine():Promise<string|null>{
  const s=getState(),draft=s.drafts.routineDraft;
  if(queue.busy||queue.failed)return null;
  if(!draft)return '정기 업무 제목을 입력하세요.';
  const start=minutes(draft.start),duration=Number(draft.duration);
  if(!draft.title.trim()||!draft.weekdays.length||!Number.isFinite(start)||start%15||!Number.isInteger(duration)||duration<15||duration%15||start+duration>1440)return '제목과 반복 요일을 선택하고, 하루 안의 시간을 15분 단위로 입력하세요.';
  if(s.drafts.settingsDraft)return '근무시간 변경을 먼저 저장하거나 되돌려 주세요.';
  let target=draft;
  if(draft.epoch!==snap().epoch||draft.revision!==snap().settings.revision){
    if(!await ask('정기 업무 설정이 변경됐습니다. 최신 목록에 지금 입력을 적용할까요?'))return null;
    target={...draft,epoch:snap().epoch,revision:snap().settings.revision};setDrafts({routineDraft:target});
  }
  const routine:Routine={id:target.id,title:target.title.trim(),body:target.body,weekdays:target.weekdays,start,duration};
  const routines=[...(snap().settings.routines??[]).filter(r=>r.id!==routine.id),routine];
  await dispatch({type:'set_routines',expected_revision:target.revision,routines},{epoch:target.epoch,done:()=>{if(getState().drafts.routineDraft===target)setDrafts({routineDraft:null});void persistDraft();}});
  return null;
}
export async function deleteRoutine(routine:Routine):Promise<string|null>{
  if(queue.busy||queue.failed)return null;
  const d=getState().drafts;if(d.routineDraft||d.settingsDraft)return '작성 중인 변경을 먼저 저장하거나 되돌려 주세요.';
  const base=snap();
  if(!await ask(`‘${routine.title}’ 정기 업무를 삭제할까요? 이미 생성된 블록은 유지됩니다.`))return null;
  await dispatch({type:'set_routines',expected_revision:base.settings.revision,routines:(base.settings.routines??[]).filter(r=>r.id!==routine.id)},{epoch:base.epoch});
  return null;
}

// ── 기기 설정 ──
export async function setAutostart(enabled:boolean){try{const value=await invoke<boolean>('autostart',{enabled});setState(s=>({info:{...s.info,autoStart:value}}));}catch(e){showError(e);}}
export async function setExitOnClose(enabled:boolean){try{const value=await invoke<boolean>('exit_on_close',{enabled});setState(s=>({info:{...s.info,exitOnClose:value}}));}catch(e){showError(e);}}
// Returns the message to show next to the shortcut field.
export async function setShortcut(value:string):Promise<{ok:boolean;message:string}>{
  try{
    const stored=getState().native?await invoke<string>('capture_shortcut',{value}):value;
    setState(s=>({info:{...s.info,shortcut:stored}}));setUi({pendingShortcut:null});
    return {ok:true,message:getState().native?'단축키를 변경했습니다.':'미리보기에서 변경됨'};
  }catch(e){return {ok:false,message:(e as {message?:string}).message||String(e)};}
}
