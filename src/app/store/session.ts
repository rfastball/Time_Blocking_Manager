import {invoke} from '@tauri-apps/api/core';
import {confirm} from '@tauri-apps/plugin-dialog';
import {SaveQueue} from '../../queue.ts';
import {StoredDraft,captureMatchesCommand,createCommand,needsSavedReview,releaseCaptureCommand} from '../../capture.ts';
import {previewAcknowledgement,previewMutation} from '../../preview.ts';
import {plusDays,today as todayKey} from '../../dates.ts';
import type {Action,AppError,Command,Snapshot,Task} from '../../types.ts';
import {clockMinute,emptyDrafts,getState,pinnedClock,setDrafts,setState} from './state.ts';

// One lane for every durable write. A failed write stays at the head until retried or released.
export const queue=new SaveQueue(()=>{
  const s=getState();
  setState({busy:queue.busy,failed:(queue.failed as AppError|null)??null});
  if(s.native)void invoke('set_dirty',{dirty:unsaved()}).catch(()=>showError(Error('종료 보호 상태를 전달하지 못했습니다.')));
  if(!queue.busy&&refreshNeeded){refreshNeeded=false;void reload();}
  else if(!queue.busy)afterIdle.forEach(f=>f());
});
// Hooks run when the lane goes idle (visible routine generation registers here).
export const afterIdle=new Set<()=>void>();
export const storedDraft=new StoredDraft();storedDraft.loaded=!getState().native;
const previewOccurrences=new Set<string>();
let refreshNeeded=false,draftTimer:ReturnType<typeof setTimeout>|undefined;
let failedCommand:Command|null=null;
let failedDone:(()=>void)|undefined;

export function showError(e:unknown){setState({error:typeof e==='object'&&e&&'message' in e?String((e as {message:unknown}).message):String(e)});}
export const announce=(message:string)=>setState({message});
export async function ask(text:string){return getState().native?confirm(text,{title:'BLOKKY',kind:'warning'}):window.confirm(text);}

type DispatchOptions={epoch?:string;command?:Command;done?:()=>void};
// Resolves true only after the store answered and the snapshot was replaced.
export async function dispatch(action:Action,{epoch,command:savedCommand,done}:DispatchOptions={}):Promise<boolean>{
  const s=getState();
  if(!s.ready||!s.draftLoaded||!s.snapshot){showError(Error('기록과 초안을 불러온 뒤 입력해 주세요.'));return false;}
  const command=savedCommand??createCommand(action,epoch??s.snapshot.epoch);
  return queue.add(async()=>{
    let result:Snapshot;
    try{
      result=s.native?await invoke<Snapshot>('mutate',{command}):previewMutation(getState().snapshot!,command,previewOccurrences);
    }catch(e){failedCommand=command;failedDone=done;throw e;}
    failedCommand=null;failedDone=undefined;
    setState({snapshot:result,error:'',message:s.native?'변경을 저장했어요.':'미리보기에 반영했어요.'});
    done?.();
  }).then(()=>true,e=>{showError(e);return false;});
}
export const enqueue=(run:()=>Promise<void>)=>queue.add(run);

// ── 초안 ──
export function unsaved(){
  const {ready,draftLoaded,drafts:d}=getState();
  return !!(ready&&!draftLoaded||d.capture||d.captureCommand||d.editorDirty||Object.keys(d.rawSchedules).length||d.settingsDraft||d.routineDraft||d.cut||queue.busy||draftTimer);
}
// The stored JSON keeps the shape written by the earlier app so existing drafts survive the update.
function draftContent(){
  const {drafts:d,snapshot}=getState();
  return d.capture||d.captureCommand||d.editorDirty||Object.keys(d.rawSchedules).length||d.settingsDraft||d.routineDraft||d.cut?JSON.stringify({
    capture:d.capture,captureCommand:d.captureCommand,calendarComposer:d.capture?d.composer:null,editor:d.editorDirty?d.editor:null,
    rawSchedules:d.rawSchedules,settingsBase:d.settingsBase,settingsDraft:d.settingsDraft,routineDraft:d.routineDraft,cut:d.cut,epoch:snapshot?.epoch
  }):'';
}
export function persistDraft():Promise<void>|undefined{
  if(!storedDraft.loaded)return;
  const content=draftContent(),sequence=storedDraft.nextSequence(),native=getState().native;
  return queue.add(async()=>{if(native)await invoke('save_draft',{sequence,content});}).catch(showError);
}
export function draftChanged(){
  clearTimeout(draftTimer);setState({draftPending:true});
  draftTimer=setTimeout(()=>{draftTimer=undefined;setState({draftPending:false});void persistDraft();},200);
  if(getState().native)void invoke('set_dirty',{dirty:true});
}
export function flushDraftTimer(){clearTimeout(draftTimer);draftTimer=undefined;setState({draftPending:false});}

export async function loadStoredDraft(allowBusy=false){
  try{
    const [sequence,content]=await invoke<[number,string]>('load_draft');
    const d=getState().drafts;
    if(d.capture||d.captureCommand||d.editorDirty||Object.keys(d.rawSchedules).length||d.settingsDraft||d.routineDraft||d.cut||(!allowBusy&&queue.busy)||draftTimer)return;
    const draft=storedDraft.read(sequence,content);
    if(draft)setDrafts({capture:draft.capture||'',captureCommand:draft.captureCommand||null,composer:draft.calendarComposer||null,editor:draft.editor||null,editorDirty:!!draft.editor,
      rawSchedules:draft.rawSchedules||{},settingsBase:draft.settingsBase||null,settingsDraft:draft.settingsDraft||null,routineDraft:draft.routineDraft||null,cut:draft.cut||null});
    setState({draftLoaded:true,draftLoadFailed:false,draftSequenceKnown:true,message:''});
  }catch{setState({draftLoaded:storedDraft.loaded,draftLoadFailed:true,draftSequenceKnown:storedDraft.sequenceKnown});}
  if(getState().draftLoaded)await reconcileCapture().catch(showError);
  void invoke('set_dirty',{dirty:unsaved()});
}
export function acknowledgeCapture(command:Command){
  const d=getState().drafts;
  if(releaseCaptureCommand(d.captureCommand,command)!==null||!d.captureCommand)return false;
  const matching=captureMatchesCommand(command,d.capture,d.composer);
  setDrafts({captureCommand:null,...(matching?{capture:'',composer:null}:{})});
  void persistDraft();
  return matching;
}
async function reconcileCapture(command=getState().drafts.captureCommand,done?:()=>void){
  if(!command)return false;
  const s=getState(),snapshot=s.native?await invoke<Snapshot|null>('acknowledge',{command}):previewAcknowledgement(s.snapshot!,command,previewOccurrences);
  if(!snapshot)return false;
  setState({snapshot,error:'',message:'이전 저장이 완료된 것을 확인했어요.'});
  if(done)done();else acknowledgeCapture(command);return true;
}
export async function discardStoredDraft(){
  if(queue.busy||!storedDraft.sequenceKnown||!await ask('읽을 수 없는 보관 초안을 버릴까요? 저장된 작업은 유지됩니다.'))return;
  const sequence=storedDraft.discardSequence();
  await queue.add(async()=>{await invoke('save_draft',{sequence,content:''});storedDraft.loaded=true;setState({draftLoaded:true,draftLoadFailed:false});}).catch(showError);
}

// ── 불러오기 ──
export async function refreshAppInfo(){
  const results=await Promise.allSettled([
    invoke<{db_path:string;warning:string|null;last_backup:string|null}>('diagnostics'),
    invoke<boolean>('autostart',{enabled:null}),invoke<string>('capture_shortcut',{value:null}),invoke<boolean>('exit_on_close',{enabled:null})
  ]);
  setState(s=>{
    const info={...s.info,failed:results.some(r=>r.status==='rejected')};
    if(results[0].status==='fulfilled'){info.dbPath=results[0].value.db_path;info.warning=results[0].value.warning||'';info.lastBackup=results[0].value.last_backup||'';}
    if(results[1].status==='fulfilled')info.autoStart=results[1].value;
    if(results[2].status==='fulfilled')info.shortcut=results[2].value;
    if(results[3].status==='fulfilled')info.exitOnClose=results[3].value;
    return {info};
  });
}
export async function reload(){
  const s=getState();
  try{if(s.native)setState({snapshot:await invoke<Snapshot>('load'),ready:true,loadError:''});else setState({ready:true});}
  catch(e){setState({ready:false,loadError:(e as AppError).message||String(e)});return;}
  if(s.native){if(!storedDraft.loaded)await loadStoredDraft();await refreshAppInfo();}
}
export function requestRefresh(){if(queue.busy)refreshNeeded=true;else void reload();}
export function replaceSnapshot(snapshot:Snapshot){setState({snapshot,ready:true,loadError:''});}

// A conflict keeps the user's input and shows what is now saved.
export async function retry(){
  const failed=getState().failed;
  if(failed?.code==='expired'){await reviewExpired();return;}
  if(needsSavedReview(failed?.code)){
    const command=failedCommand;failedCommand=null;failedDone=undefined;queue.discardFailed();await reload();
    if(getState().ready){setDrafts({captureCommand:releaseCaptureCommand(getState().drafts.captureCommand,command)});void persistDraft();}
    setState({error:'다른 곳에서 이 항목이 바뀌었어요. 입력한 내용은 그대로 있어요. 저장된 내용을 확인한 뒤 내 입력으로 저장할 수 있어요.'});return;
  }
  setState({error:''});queue.retry();
}
async function reviewExpired(){
  const command=failedCommand??getState().drafts.captureCommand;
  await reload();
  if(!getState().ready)return false;
  if(await reconcileCapture(command,failedDone).catch(e=>{showError(e);return false;})){
    failedCommand=null;failedDone=undefined;queue.discardFailed();return true;
  }
  setState({error:'이전 저장의 완료 여부를 확인할 수 없습니다. 입력은 유지됩니다. 저장된 내용을 확인한 뒤 ‘입력 유지하고 수정’을 선택해 주세요.'});
  return false;
}
export async function release(){
  const command=failedCommand??getState().drafts.captureCommand,code=getState().failed?.code;
  if(code==='expired'||command&&!['validation','overlap','conflict','epoch'].includes(code??'')){
    if(await reviewExpired()||!getState().ready)return;
    if(!await ask('이전 저장이 완료됐는지 확인할 수 없습니다. 저장된 작업을 확인하셨나요? 입력을 유지하고 수정하면 다음 저장은 새 요청으로 처리되어 작업이 중복될 수 있습니다. 계속할까요?'))return;
  }
  setDrafts({captureCommand:releaseCaptureCommand(getState().drafts.captureCommand,command)});failedCommand=null;failedDone=undefined;
  queue.discardFailed();setState({error:'',message:'입력한 내용은 그대로 있어요. 확인한 뒤 다시 저장해 주세요.'});
  void persistDraft();
}

export function tick(){
  const s=getState(),now=clockMinute(),day=todayKey();
  if(now!==s.now||day!==s.today)setState({now,today:day});
}
export const stamp=()=>{const s=getState();return s.today+'T'+String(Math.floor(s.now/60)).padStart(2,'0')+':'+String(s.now%60).padStart(2,'0');};
export const clockIsPinned=pinnedClock;

export function previewSnapshot():Snapshot{
  // Redesign §10 example: a fixed workshop and four flow blocks, usable on any weekday.
  const days=Array.from({length:7},()=>({enabled:true,start:540,end:1080,breaks:[{start:720,end:780,label:'점심'}]})),day=todayKey();
  const flow=(id:string,title:string,duration:number,order:number,body=''):Task=>({id,title,body,starts_at:null,duration,completed:false,revision:1,plan_date:day,flow_order:order});
  // 준비: a fresh capture in the 들어옴 and four sized blocks on the shelf.
  const wait=(id:string,title:string,duration:number,wait_for:string,wait_until:string|null,since:number):Task=>({id,title,body:'',starts_at:null,duration,completed:false,revision:1,plan_date:null,flow_order:null,wait_for,wait_until,wait_since:plusDays(day,since)});
  const card=(id:string,title:string,duration:number,pile_id:string|null,pile_order:number,proto=false):Task=>({id,title,body:'',starts_at:null,duration,completed:false,revision:1,plan_date:null,flow_order:null,proto,pile_id,pile_order});
  return {epoch:'preview',layouts:[],trash:[],settings:{revision:1,days},piles:[{id:'shelf',position:1}],tasks:[
    flow('sample-a','설계 문서 자료 조사',60,1,'[x] 요구사항 확인\n[ ] 초안에 반영'),
    flow('sample-b','설계 문서 초안 작성',45,2,'진행 상황과 필요한 맥락을 이곳에 남깁니다.\n[ ] 계획 화면 정리\n[ ] 검토 의견 반영'),
    flow('sample-c','회의록 정리',30,3),
    flow('sample-d','분리망 배포 의존성 검토',60,4),
    {id:'sample-w',title:'설계 워크숍',body:'',starts_at:day+'T14:00',duration:60,completed:false,revision:1,plan_date:day,flow_order:null},
    flow('sample-e','신규 입사자 교육 자료',90,5),
    flow('sample-f','경쟁사 자료 조사',120,6),
    {id:'sample-past',title:'경쟁사 동향 정리',body:'',starts_at:null,duration:60,completed:false,revision:1,plan_date:plusDays(day,-2),flow_order:1},
    card('sample-6','주간 보고 초안',30,null,1,true),
    card('sample-4','회의록 템플릿 업데이트',30,'shelf',1),
    card('sample-5','SQLite 백업 방식 조사',45,'shelf',2),
    card('sample-m','메일 답장',15,'shelf',3),
    card('sample-r','결재 처리',15,'shelf',4),
    // 기다림: two on the same trigger (a pile), one unnamed, one on a date that has come and one still ahead.
    wait('sample-w1','상신 문서 보완',60,'김부장 결재',null,-5),
    wait('sample-w2','출장비 정산',30,'김부장 결재',null,-3),
    wait('sample-w3','물품 구매 요청',30,'김부장 결재',null,-1),
    wait('sample-w4','협약서 문안',60,'법무팀 검토',null,-4),
    wait('sample-w5','교육 결과 보고',45,'',day,-6),
    wait('sample-w6','분기 실적 취합',90,'',plusDays(day,6),-1)
  ]};
}
export const resetDrafts=()=>setDrafts(emptyDrafts());
