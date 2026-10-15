// The schedule as the user is typing it. Invalid input stays in rawSchedules (survives restarts) and the
// valid part goes to the settings draft, so the calendar shows every edit that can be shown.
import {missingBreakName,readTargets,withException,withoutException} from '../../availability-edit.ts';
import type {DayException,Settings,WorkingDay} from '../../types.ts';
import {getState,type AppState} from '../store/state.ts';
import {setSettingsDraft,stashRawSchedule} from '../store/schedule.ts';
import {WEEKLY_TARGET,WORK_DAYS} from '../../settings.ts';

const base=(s:AppState)=>s.drafts.settingsDraft??s.snapshot!.settings;

export function weeklyDraft(s:AppState=getState()){
  const settings=base(s),raw=s.drafts.rawSchedules.weekly;
  const draft:Settings=raw?.invalid&&raw.settings?{...settings,days:raw.settings.days}:settings;
  return {draft,hours:raw?.values[0]?.value??String((settings.weekly_target??WEEKLY_TARGET)/60),count:raw?.values[1]?.value??String(settings.work_days??WORK_DAYS)};
}
export function weeklyProblem(draft:Settings,hours:string,count:string){
  try{readTargets(hours,count);}catch(e){return (e as Error).message;}
  return missingBreakName(draft.days)?'휴식 이름을 입력하세요.':'';
}
export function publishWeekly(days:WorkingDay[],hours:string,count:string){
  const {draft}=weeklyDraft(),next={...draft,days};
  try{
    const targets=readTargets(hours,count);if(missingBreakName(days))throw Error();
    setSettingsDraft({...next,...targets});stashRawSchedule('weekly',null);
  }catch{stashRawSchedule('weekly',{values:[{value:hours,checked:false},{value:count,checked:false}],invalid:true,settings:next});}
}

export function dateDraft(date:string,s:AppState=getState()){
  const settings=base(s),raw=s.drafts.rawSchedules[date];
  let draft=settings;
  if(raw?.invalid&&raw.settings){const own=raw.settings.exceptions?.find(e=>e.date===date);draft=own?withException(settings,date,own.kind,own.day):withoutException(settings,date);}
  const kind=(raw?.values[0]?.value??draft.exceptions?.find(e=>e.date===date)?.kind??'custom') as DayException['kind'];
  return {draft,kind};
}
export function publishDate(date:string,kind:DayException['kind'],day:WorkingDay){
  const next=withException(dateDraft(date).draft,date,kind,day);
  if(missingBreakName([day]))stashRawSchedule(date,{values:[{value:kind,checked:false}],invalid:true,settings:next});
  else{setSettingsDraft(next);stashRawSchedule(date,null);}
}
