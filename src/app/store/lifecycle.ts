import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {readTheme,themeStorageKey} from '../../theme.ts';
import {calendarRefreshAllowed} from '../../today.ts';
import {getState,openDrafts,setDrafts,setState} from './state.ts';
import {flushDraftTimer,loadStoredDraft,persistDraft,previewSnapshot,queue,refreshAppInfo,reload,requestRefresh,showError,storedDraft,tick,unsaved,dispatch} from './session.ts';
import {saveEditor} from './editor.ts';
import {commitCut} from './cut.ts';
import {submitCapture,submitComposer} from './compose.ts';
import {ensureVisibleRoutines} from './routines.ts';
import {WEEKLY_TARGET,WORK_DAYS} from '../../settings.ts';

export function syncTheme(){
  try{document.documentElement.dataset.theme=readTheme(window.localStorage);}
  catch{document.documentElement.dataset.theme='default';}
}
export async function hideCapture(){
  void persistDraft();
  if(getState().native)await invoke('hide_capture').catch(showError);
}

// Calendar refresh on clock ticks and window return, never under the user's hands.
function refreshCalendar(reloadData:boolean){
  const s=getState(),d=s.drafts;
  if(s.captureWindow)return;
  const allowed=calendarRefreshAllowed({view:s.nav.view,ready:s.ready&&s.draftLoaded,visible:document.visibilityState==='visible',
    dirty:openDrafts(d)||!!d.composer,
    input:!!document.activeElement?.matches('input,textarea,[contenteditable]'),modal:!!document.querySelector('dialog[open]'),gesture:s.gesture});
  tick();
  if(allowed&&reloadData&&s.native)requestRefresh();
}

// Quit: store every open input in order, then tell the shell whether it may exit.
export async function saveBeforeQuit(requestId:string){
  if(getState().quitSaving){await invoke('finish_quit',{requestId,error:'이전 자동 저장이 진행 중입니다. 잠시 후 다시 종료해 주세요.'});return;}
  let succeeded=false;
  const current=()=>activeQuit===requestId;
  activeQuit=requestId;setState({quitSaving:true});
  try{
    const s=getState();
    if(!s.ready||!s.draftLoaded)throw Error('기록과 초안을 불러오지 못했습니다. 다시 불러온 뒤 종료해 주세요.');
    flushDraftTimer();
    await queue.whenIdle();await persistDraft();await queue.whenIdle();
    if(!current())return;
    if(getState().drafts.editorDirty){
      if(!await saveEditor())throw Error(getState().error||'항목을 저장하지 못했습니다. 입력을 확인해 주세요.');
      await queue.whenIdle();
    }
    if(!current())return;
    // An open cutting board closes the way its close button does: committed.
    if(getState().drafts.cut){
      if(!await commitCut())throw Error(getState().error||'도마의 조각을 저장하지 못했습니다. 확인해 주세요.');
      await queue.whenIdle();
    }
    if(!current())return;
    const d=getState().drafts;
    if(d.settingsDraft&&!Object.values(d.rawSchedules).some(raw=>raw.invalid)){
      const draft=d.settingsDraft,base=d.settingsBase??{epoch:s.snapshot!.epoch,revision:s.snapshot!.settings.revision};
      await dispatch({type:'set_schedule',expected_revision:base.revision,days:draft.days,exceptions:draft.exceptions??[],weekly_target:draft.weekly_target??WEEKLY_TARGET,work_days:draft.work_days??WORK_DAYS,move_conflicts:false},{epoch:base.epoch,done:()=>setDrafts({settingsDraft:null,settingsBase:null,rawSchedules:{}})});
      await queue.whenIdle();
    }
    if(!current())return;
    while(getState().drafts.capture.trim()||getState().drafts.captureCommand){
      if(!await (getState().drafts.composer?submitComposer():submitCapture()))throw Error(getState().error||'입력을 저장하지 못했습니다. 다시 시도해 주세요.');
      await queue.whenIdle();
    }
    if(!current())return;
    const pending=getState().ui.pendingShortcut;
    if(pending&&pending!==getState().info.shortcut){const value=await invoke<string>('capture_shortcut',{value:pending});setState(st=>({info:{...st.info,shortcut:value}}));}
    flushDraftTimer();
    await persistDraft();await queue.whenIdle();
    if(current()){await invoke('finish_quit',{requestId,error:null});succeeded=true;}
  }catch(e){
    showError(e);
    await invoke('finish_quit',{requestId,error:getState().error}).catch(showError);
  }finally{
    if(activeQuit===requestId)activeQuit=null;
    // A successful request keeps inputs locked while the app exits.
    setState({quitSaving:succeeded});
  }
}
let activeQuit:string|null=null;

export async function start(){
  syncTheme();
  window.addEventListener('storage',e=>{if(e.key===themeStorageKey||e.key===null)syncTheme();});
  window.addEventListener('focus',()=>{syncTheme();refreshCalendar(true);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshCalendar(true);});
  window.addEventListener('beforeunload',e=>{if(unsaved())e.preventDefault();});
  const minute=()=>{setTimeout(()=>{refreshCalendar(false);minute();},60_000-Date.now()%60_000);};minute();
  const s=getState();
  if(!s.native){setState({snapshot:previewSnapshot(),ready:true});void ensureVisibleRoutines();return;}
  try{setState({snapshot:await invoke('load'),ready:true});}
  catch(e){setState({ready:false,loadError:(e as {message?:string}).message||String(e)});}
  if(getState().ready)await loadStoredDraft();
  setState({draftLoaded:storedDraft.loaded});
  await refreshAppInfo();
  const label=getCurrentWindow().label;
  await listen<string|null>('data-changed',event=>{if(event.payload!==label)requestRefresh();});
  await listen('window-shown',()=>{syncTheme();if(getState().captureWindow){void reload();document.querySelector<HTMLElement>('#capture')?.focus();}else refreshCalendar(true);});
  if(s.captureWindow)await listen('capture-hide-request',()=>void hideCapture());
  await listen<string>('quit-request',event=>{void saveBeforeQuit(event.payload);});
  await listen<string>('quit-cancelled',event=>{activeQuit=null;setState({quitSaving:false,error:event.payload});});
  await listen('backup-warning',async()=>{
    const info=await invoke<{warning:string|null;last_backup:string|null}>('diagnostics');
    setState(st=>({info:{...st.info,warning:info.warning||'',lastBackup:info.last_backup||''}}));
  });
  void ensureVisibleRoutines();
}
