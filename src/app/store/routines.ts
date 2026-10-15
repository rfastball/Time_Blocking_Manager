import {periodDates} from '../../dates.ts';
import {getState,openDrafts} from './state.ts';
import {afterIdle,announce,dispatch,queue} from './session.ts';

const snap=()=>getState().snapshot!;

const routineRanges=new Set<string>();let routinePending=false;
// Generates routine blocks for the visible days once per range and settings revision.
export async function ensureVisibleRoutines(){
  const s=getState(),d=s.drafts;
  if(!s.ready||!s.draftLoaded||s.captureWindow||s.quitSaving||routinePending||queue.busy||queue.failed||openDrafts(d)||s.gesture||!s.snapshot?.settings.routines?.length||!['today','plan'].includes(s.nav.view))return;
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
  const dates=periodDates(period,planAnchor);
  return [dates[0],dates[dates.length-1]];
}
