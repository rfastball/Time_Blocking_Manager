import {useSyncExternalStore} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {errorText} from '../../backup-format.ts';
import type {BackupInspection,ManagedBackup,Snapshot} from '../../types.ts';
import {getState,setDrafts,setNav,setUi} from '../store/state.ts';
import {ask,enqueue,loadStoredDraft,queue,refreshAppInfo,replaceSnapshot,unsaved} from '../store/session.ts';

// Lives outside the component: a recovery restore unmounts the recovery screen and must report in settings.
export type Backups={
  items:ManagedBackup[];loaded:boolean;loading:boolean;error:string;
  selected:string|null;inspection:BackupInspection|null;inspecting:boolean;inspectionError:string;
  busy:'create'|'restore'|null;status:string;statusError:boolean;
  open:boolean;recoveryOpen:boolean;scroll:number;focusSummary:number;
};
let state:Backups={items:[],loaded:false,loading:false,error:'',selected:null,inspection:null,inspecting:false,inspectionError:'',busy:null,status:'',statusError:false,open:false,recoveryOpen:true,scroll:0,focusSummary:0};
const listeners=new Set<()=>void>();
const set=(patch:Partial<Backups>)=>{state={...state,...patch};listeners.forEach(l=>l());};
export const getBackups=()=>state;
export const useBackups=()=>useSyncExternalStore(l=>{listeners.add(l);return ()=>{listeners.delete(l);};},getBackups);

let listSequence=0,inspectSequence=0;
const report=(status:string,statusError=false)=>set({status,statusError});
const clearReview=()=>{++inspectSequence;set({selected:null,inspection:null,inspecting:false,inspectionError:''});};
export const setOpen=(recovery:boolean,open:boolean)=>set(recovery?{recoveryOpen:open}:{open});
export const rememberScroll=(scroll:number)=>{state.scroll=scroll;};

export async function loadBackups(){
  if(!getState().native)return;
  const sequence=++listSequence;set({loading:true,error:''});
  try{
    const items=await invoke<ManagedBackup[]>('list_backups');if(sequence!==listSequence)return;
    set({items,loaded:true});
    if(state.selected&&!items.some(b=>b.id===state.selected&&!b.error))clearReview();
  }catch(e){if(sequence===listSequence)set({error:errorText(e)});}
  finally{if(sequence===listSequence)set({loading:false});}
}
export async function inspectBackup(id:string){
  if(!getState().native||state.busy||queue.failed)return;
  const sequence=++inspectSequence;set({selected:id,inspection:null,inspectionError:'',inspecting:true});
  const current=()=>sequence===inspectSequence&&state.selected===id;
  try{const inspection=await invoke<BackupInspection>('inspect_backup',{id});if(current())set({inspection});}
  catch(e){if(current())set({inspectionError:errorText(e)});}
  finally{if(current())set({inspecting:false});}
}
export function cancelReview(){if(!state.busy&&!queue.failed)clearReview();}

export async function createBackup(){
  const s=getState();
  if(!s.native||!s.ready||state.busy||queue.busy||queue.failed)return;
  await enqueue(async()=>{
    set({busy:'create'});report('');
    try{await invoke<ManagedBackup>('create_backup');report('백업을 보관했습니다.');await loadBackups();}
    catch(e){report(errorText(e),true);throw e;}
    finally{set({busy:null});}
  }).catch(()=>{});
}

// A healthy store restores against its epoch; a store that failed to load is replaced through the recovery command.
export async function restoreBackup(){
  if(state.busy||queue.failed||!state.selected||!state.inspection)return;
  if(unsaved()){report('초안을 불러오고 작성 중인 내용을 저장하거나 되돌린 뒤 복원하세요.',true);return;}
  const id=state.selected,s=getState(),recovery=!s.ready,epoch=s.snapshot?.epoch;
  if(recovery&&!await ask('현재 손상 기록은 복구 자료로 보존됩니다. 선택한 백업으로 현재 기록을 교체할까요?'))return;
  await enqueue(async()=>{
    set({busy:'restore'});report('');
    try{
      if(state.selected!==id)throw Error('복원할 백업을 다시 확인하세요.');
      const now=getState(),d=now.drafts;
      if(d.capture||d.captureCommand||d.editorDirty||Object.keys(d.rawSchedules).length||d.settingsDraft||d.routineDraft||now.draftPending)throw Error('작성 중인 내용을 저장하거나 되돌린 뒤 복원하세요.');
      const snapshot=await invoke<Snapshot>(recovery?'recover_backup':'restore',recovery?{id}:{id,epoch});
      replaceSnapshot(snapshot);
      setDrafts({editor:null,editorDirty:false,pendingEditorId:null});setUi({editorMode:null,editorFocus:null});
      if(recovery){await loadStoredDraft(true);setNav({view:'settings'});set({open:true});}
      clearReview();
      report(recovery?'기록을 복구했습니다. 손상 기록은 복구 자료로 보존했습니다.':'기록을 복원했습니다. 교체 전 기록도 백업에 보관했습니다.');
      await refreshAppInfo();await loadBackups();
      set({focusSummary:state.focusSummary+1});
    }catch(e){report(errorText(e),true);throw e;}
    finally{set({busy:null});}
  }).catch(()=>{});
}
