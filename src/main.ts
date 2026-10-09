import {invoke,isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {confirm} from '@tauri-apps/plugin-dialog';
import {SaveQueue} from './queue';
import {CaptureDraft,captureEnterAction,isCompositionKey} from './capture';
import {effectiveDay,shortcutFromKey} from './settings';
import {availabilityHTML,dayAvailabilityHTML,bindAvailability,weeklySummary,calendarAvailabilityHTML,focusAvailabilityBand,changeAvailabilityBand} from './availability';
import {formatDuration,rangeTitle} from './format';
import {agenda,calendarRefreshAllowed} from './today';
import {placementIssue as checkPlacement,splitDuration} from './placement';
import {bindCalendarGestures} from './calendar-gestures';
import type {RawSchedule} from './availability';
import type {AvailabilityTarget,AvailabilityEdge} from './availability-band';
import type {Task,Snapshot,Action,Command,AppError,WorkingDay,Settings,ManagedBackup,BackupInspection} from './types';
import {resolveTheme,readTheme,saveTheme,themePickerHTML,themeStorageKey} from './theme';
import './fonts.css';
import './tokens.css';
import './style.css';
import './workspace.css';

const native=isTauri(), captureWindow=new URLSearchParams(location.search).has('capture');
function syncTheme(){
  try{document.documentElement.dataset.theme=readTheme(window.localStorage);}
  catch{document.documentElement.dataset.theme='default';}
  document.querySelectorAll<HTMLInputElement>('input[name=theme]').forEach(input=>input.checked=input.value===document.documentElement.dataset.theme);
}
syncTheme();
window.addEventListener('storage',e=>{if(e.key===themeStorageKey||e.key===null)syncTheme();});
window.addEventListener('focus',syncTheme);
const $=<T extends HTMLElement>(s:string)=>document.querySelector<T>(s)!;
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const dateKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today=()=>dateKey(new Date());
const dateOf=(s:string)=>new Date(s+'T12:00:00');
const time=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const minutes=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3,5));
const taskMinute=(t:Task)=>minutes(t.starts_at!.slice(11));
const dateLabel=(s:string)=>dateOf(s).toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long'});
const plusDays=(date:string,n:number)=>{const d=dateOf(date);d.setDate(d.getDate()+n);return dateKey(d);};
const icon=(name:string)=>`<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${({today:'<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M4 9h16M8 2v4M16 2v4M8 13h3M8 17h7"/>',plan:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M9 9v12M15 9v12M3 15h18"/>',inbox:'<path d="M3 13l3-8h12l3 8v7H3zM3 13h5l2 3h4l2-3h5"/>',settings:'<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',left:'<path d="M15 5l-7 7 7 7"/>',right:'<path d="M9 5l7 7-7 7"/>',plus:'<path d="M12 5v14M5 12h14"/>',close:'<path d="M6 6l12 12M18 6L6 18"/>',check:'<path d="M5 12l4 4L19 6"/>'} as Record<string,string>)[name]}</svg>`;

let snapshot:Snapshot|null=null,view:'today'|'plan'|'inbox'|'settings'='today',selected=today(),period='week',inboxOpen=true;
const captureDraft=new CaptureDraft();
let calendarComposer:{date:string;start:number;duration:number}|null=null,calendarComposing=false,calendarRefreshPending=false;
let editor:(Task&{epoch:string})|null=null,editorDirty=false,editorSequence=0;
let draftSequence=0,draftTimer:ReturnType<typeof setTimeout>|undefined,settingsDraft:Settings|null=null;
let rawSchedules:Record<string,RawSchedule>={};
let shortcut="Ctrl+Shift+Space";
let settingsBase:{epoch:string;revision:number}|null=null,lastBackup='';
let message='',errorMessage='',loadError='',warning='',dbPath='',autoStart=false,dragId='';
let ready=false,refreshNeeded=false;
const backups={items:[] as ManagedBackup[],loaded:false,loading:false,error:'',selected:null as string|null,inspection:null as BackupInspection|null,inspecting:false,inspectionError:'',busy:null as 'create'|'restore'|null,status:'',statusError:false};
let backupListSequence=0,backupInspectionSequence=0,backupListScroll=0;
let pendingEditorId:string|null=null,resizing=false,placedId='';
let statusTimer:ReturnType<typeof setTimeout>|undefined,lastAnnouncement='';
const nowMinute=()=>{const mock=!native&&(import.meta as ImportMeta&{env:{DEV:boolean}}).env.DEV?new URLSearchParams(location.search).get('now'):null;const now=new Date();return mock&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(mock)?minutes(mock):now.getHours()*60+now.getMinutes();};
const inboxTasks=()=>snapshot?.tasks.filter(t=>!t.starts_at&&!t.completed)??[];
const placementIssue=(id:string,date:string,start:number,duration:number)=>checkPlacement(id,date,start,duration,dayRule(date),snapshot!.tasks);
const queue=new SaveQueue(()=>{
  updateStatus();
  if(native)void invoke('set_dirty',{dirty:unsaved()}).catch(()=>{errorMessage='종료 보호 상태를 전달하지 못했습니다.';updateStatus();});
  if(!queue.busy&&refreshNeeded){refreshNeeded=false;void reload();}
});
function unsaved(){return !!(captureDraft.text||editorDirty||Object.keys(rawSchedules).length||settingsDraft||queue.busy||draftTimer);}
const draftContent=()=>captureDraft.text||editorDirty||Object.keys(rawSchedules).length||settingsDraft ? JSON.stringify({capture:captureDraft.text,captureCommand:captureDraft.command,calendarComposer:captureDraft.text?calendarComposer:null,editor:editorDirty?editor:null,rawSchedules,settingsBase,settingsDraft,epoch:snapshot?.epoch}):'';
function draftChanged(){
  clearTimeout(draftTimer); draftTimer=setTimeout(()=>{draftTimer=undefined;persistDraft();},200);updateStatus();
  if(native)void invoke('set_dirty',{dirty:true});
}
function persistDraft(){
  const content=draftContent(),sequence=++draftSequence;
  void queue.add(async()=>{if(native)await invoke('save_draft',{sequence,content});}).catch(showError);
}
function showError(e:unknown){errorMessage=typeof e==='object'&&e&&'message'in e?String(e.message):String(e);updateStatus();}
function updateStatus(){
  updateBackupControls();
  const el=document.querySelector<HTMLElement>('#status');if(!el)return;
  const failed=queue.failed as AppError|null,dialogOpen=!!document.querySelector('dialog[open]');
  const issue=errorMessage|| (failed?'저장하지 못했어요. 입력한 내용은 그대로 있어요.':'');
  const state=!ready?'기록 불러오는 중 · 편집 잠시 중지':queue.busy?'저장 중…':'';
  const resume=editorDirty&&!captureWindow&&!dialogOpen;
  el.innerHTML=`<span class="${issue&&!dialogOpen?'error':''}" ${issue&&!dialogOpen?'role="alert"':''}>${esc(issue&&!dialogOpen?issue:state)}</span>${failed&&!dialogOpen?'<button id="retry">다시 시도</button><button id="release">입력 유지하고 수정</button>':''}${resume?`<button id="resume-editor">‘${esc(editor!.title)}’ 이어서 편집</button>`:''}`;
  el.hidden=!issue&&!resume&&!state;
  document.querySelector('#resume-editor')?.addEventListener('click',()=>openEditor(editor!.id));
  const retry=()=>{if(failed?.code==='conflict'||failed?.code==='epoch'){void refreshForConflict();return;}errorMessage='';queue.retry();};
  const release=()=>{queue.discardFailed();errorMessage='';message='입력한 내용은 그대로 있어요. 확인한 뒤 다시 저장해 주세요.';updateStatus();};
  document.querySelector('#retry')?.addEventListener('click',retry);document.querySelector('#release')?.addEventListener('click',release);
  const recovery=document.querySelector('#editor-recovery');
  if(recovery){recovery.innerHTML=issue?`<p class="error" role="alert">${esc(issue)}</p>${failed?`<button type="button" id="editor-retry">${failed.code==='conflict'||failed.code==='epoch'?'저장된 내용 확인':'다시 시도'}</button> <button type="button" id="editor-release">입력 유지하고 수정</button>`:''}`:'';document.querySelector('#editor-retry')?.addEventListener('click',retry);document.querySelector('#editor-release')?.addEventListener('click',release);}
  if(message&&!issue&&message!==lastAnnouncement){lastAnnouncement=message;clearTimeout(statusTimer);el.classList.remove('settled');statusTimer=setTimeout(()=>el.classList.add('settled'),3000);}
}

async function refreshForConflict(){
  queue.discardFailed();await reload();
  errorMessage='다른 곳에서 이 항목이 바뀌었어요. 입력한 내용은 그대로 있어요. 저장된 내용을 확인한 뒤 내 입력으로 저장할 수 있어요.';
  renderEditor();updateStatus();
}
async function dispatch(action:Action, epoch=snapshot!.epoch, requestId:string=crypto.randomUUID(), done?:()=>void){
  if(!ready)throw Error('저장소 로드가 끝나지 않았습니다.');
  const command:Command={request_id:requestId,epoch,action};
  return queue.add(async()=>{
    const result=native?await invoke<Snapshot>('mutate',{command}):previewMutation(command);
    snapshot=result;errorMessage='';message=native?'변경을 저장했어요.':'미리보기에 반영했어요.';done?.();renderContent();updateStatus();const live=document.querySelector('#announcer');if(live)live.textContent=message;
  }).catch(showError);
}
function previewMutation(command:Command):Snapshot {
  const s=structuredClone(snapshot!),a=command.action;
  if(a.type==='create'||a.type==='create_scheduled'){
    const start=a.type==='create_scheduled'?a.starts_at:null,duration=a.type==='create_scheduled'?a.duration:30;
    if(start&&!canPlace(a.id,start.slice(0,10),minutes(start.slice(11)),duration))throw Error('다른 작업 또는 금지시간과 겹칩니다.');
    s.tasks.push({id:a.id,title:a.title,body:'',starts_at:start,duration,completed:false,revision:1});
  }
  else if(a.type==='set_settings'||a.type==='set_schedule'){
    s.settings={...s.settings,...a,revision:s.settings.revision+1};
    for(const t of s.tasks){if(t.starts_at&&checkPlacement(t.id,t.starts_at.slice(0,10),taskMinute(t),t.duration,effectiveDay(s.settings,t.starts_at.slice(0,10)),[])){
      if(a.type==='set_schedule'&&a.move_conflicts){t.starts_at=null;t.revision++;}else throw Error('배치된 작업과 겹칩니다.');
    }}
  }
  else {const t=s.tasks.find(t=>t.id===a.id)!;
    if(a.type==='delete')s.tasks=s.tasks.filter(t=>t.id!==a.id);
    else if(a.type==='set_completed'){t.completed=a.completed;t.revision++;}
    else if(a.type==='split'){if(t.completed||a.first_duration<15||a.first_duration%15||a.first_duration>t.duration-15)throw Error('각 블록은 15분 이상이어야 해요.');s.tasks.push({...t,id:a.new_id,starts_at:null,duration:t.duration-a.first_duration,revision:1});t.duration=a.first_duration;t.revision++;}
    else {if(a.starts_at&&!canPlace(a.id,a.starts_at.slice(0,10),minutes(a.starts_at.slice(11)),a.duration))throw Error('다른 항목 또는 작업 불가 시간과 겹칩니다.');Object.assign(t,a,{revision:t.revision+1});}
  } return s;
}
async function reload(){
  try{if(native)snapshot=await invoke<Snapshot>('load');ready=true;loadError='';renderContent();const input=document.querySelector<HTMLTextAreaElement>('#capture');if(input)input.disabled=false;}
  catch(e){ready=false;loadError=(e as AppError).message||String(e);render();}
}
function dayRule(date:string){return effectiveDay(settingsDraft??snapshot!.settings,date);}
function refreshCalendar(reloadData=false){
  if(captureWindow)return;
  if(reloadData&&native)refreshNeeded=true;
  if(!calendarRefreshAllowed({view,ready,visible:document.visibilityState==='visible',dirty:editorDirty||!!Object.keys(rawSchedules).length||!!settingsDraft||calendarComposing,input:!!document.activeElement?.matches('input,textarea,[contenteditable]'),modal:!!document.querySelector('dialog[open]'),gesture:!!dragId||resizing}))return;
  if(refreshNeeded&&!queue.busy){refreshNeeded=false;void reload();}else renderContent();
}
function tasksOn(date:string){return snapshot!.tasks.filter(t=>t.starts_at?.startsWith(date)).sort((a,b)=>a.starts_at!.localeCompare(b.starts_at!));}
function overdue(){return snapshot!.tasks.filter(t=>!t.completed&&t.starts_at&&t.starts_at.slice(0,10)<today());}
function available(date:string){const d=dayRule(date);return d.enabled?d.end-d.start-d.breaks.reduce((sum,b)=>sum+b.end-b.start,0):0;}
function canPlace(id:string,date:string,start:number,duration:number){
  return placementIssue(id,date,start,duration)===null;
}
function captureForm(){return `<form id="capture-form" class="capture-form"><label class="sr-only" for="capture">빠른 캡처</label><textarea id="capture" autocomplete="off" placeholder="할 일" maxlength="650" rows="2" ${!ready?'disabled':''}>${esc(captureDraft.text)}</textarea><button class="icon-button" aria-label="미계획에 저장" type="submit">${icon('check')}</button><button class="icon-button" aria-label="빠른 캡처 닫기" type="button" id="close-capture">${icon('close')}</button></form>`;}
function hideCapture(){persistDraft();if(native)void invoke('hide_capture').catch(showError);else document.querySelector<HTMLElement>('.capture-window')!.hidden=true;}

function render(){
  document.querySelector('#calendar-availability-editor')?.remove();
  $('#app').innerHTML=captureWindow?`<main class="capture-window">${captureForm()}<div id="status"></div></main>`:
    `<div class="app-shell"><nav class="rail" aria-label="주 메뉴"><button class="brand" id="brand-home" aria-label="BLOKKY 오늘로 이동" title="오늘로 이동"><svg class="brand-mark" aria-hidden="true" viewBox="0 0 64 64"><rect x="14" y="14" width="12" height="36" rx="3"/><rect x="32" y="14" width="18" height="14" rx="3"/><rect x="32" y="34" width="12" height="16" rx="3"/></svg></button>${(['today','plan','inbox','settings']as const).map(v=>`<button class="nav-button ${view===v?'active':''}" data-view="${v}" aria-label="${{today:'오늘',plan:'계획',inbox:'미계획',settings:'설정'}[v]}" title="${{today:'오늘',plan:'계획',inbox:'미계획',settings:'설정'}[v]}">${icon(v)}<span>${{today:'오늘',plan:'계획',inbox:'미계획',settings:'설정'}[v]}</span></button>`).join('')}</nav>
    <main class="workspace"><header class="topbar"><div class="date-nav" ${view==='settings'||view==='inbox'?'hidden':''}><button class="icon-button" id="prev" aria-label="이전 기간">${icon('left')}</button><button class="icon-button" id="next" aria-label="다음 기간">${icon('right')}</button><button id="go-today" aria-label="오늘 날짜로 이동">오늘</button></div><h1 id="heading"></h1></header><div id="notice"></div><div id="content"></div><footer id="status"></footer></main></div><dialog id="editor-dialog" aria-labelledby="editor-heading"></dialog>`;
  $('#app').insertAdjacentHTML('beforeend','<div id="announcer" class="sr-only" role="status" aria-live="polite"></div>');
  if(captureWindow)bindCapture();
  if(!captureWindow){
    document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>{const v=b.dataset.view!;view=v as typeof view;if(v==='today')selected=today();render();});
    $('#brand-home').onclick=()=>{selected=today();view='today';render();};
    $('#prev').onclick=()=>navigate(-1);$('#next').onclick=()=>navigate(1);$('#go-today').onclick=()=>{selected=today();renderContent();};
  }
  renderContent();updateStatus();
}
function navigate(direction:number){
  if(view==='plan'&&period==='month'){const d=dateOf(selected);d.setDate(1);d.setMonth(d.getMonth()+direction);selected=dateKey(d);}
  else selected=plusDays(selected,direction*(view==='plan'?(period==='week'?7:14):1));renderContent();
}
function bindCapture(){
  const input=$<HTMLTextAreaElement>('#capture');
  input.oninput=()=>{captureDraft.edit(input.value);const inline=document.querySelector<HTMLInputElement>('#inbox-capture');if(inline)inline.value=input.value;draftChanged();};
  input.onkeydown=e=>{const action=captureEnterAction(e);if(action==='compose')e.preventDefault();if(action==='submit'){e.preventDefault();void submitCapture();}};
  $('#close-capture').onclick=hideCapture;
  $('#capture-form').onsubmit=e=>{e.preventDefault();void submitCapture();};
}
async function submitCapture(){
  if(!captureDraft.text.trim()||!ready||queue.failed)return;
  const title=captureDraft.text.trim();calendarComposer=null;if(captureDraft.command?.action.type!=='create')captureDraft.command=null;captureDraft.command??={request_id:crypto.randomUUID(),epoch:snapshot!.epoch,action:{type:'create',id:crypto.randomUUID(),title}};
  const command=captureDraft.command;persistDraft();
  const captureInput=document.querySelector<HTMLTextAreaElement>('#capture');if(captureInput)captureInput.disabled=true;
  await dispatch(command.action,command.epoch,command.request_id,()=>{
    if(!captureDraft.acknowledge(command)){message='이전 항목을 저장했습니다. 새 입력은 유지했습니다.';return;}
    if(captureInput)captureInput.value='';const inline=document.querySelector<HTMLInputElement>('#inbox-capture');if(inline)inline.value='';persistDraft();message='미계획에 저장했어요.';
    if(captureWindow&&native)void queue.add(async()=>{await invoke('hide_capture');});
  });
  if(captureInput){captureInput.disabled=false;captureInput.focus();}
}
function renderContent(){
  if(calendarComposing&&document.querySelector('#calendar-composer')){calendarRefreshPending=true;updateStatus();return;}
  calendarRefreshPending=false;
  document.querySelector('.split-feedback')?.remove();
  if(captureWindow){updateStatus();return;}
  const content=$('#content'),active=document.activeElement as HTMLElement|null;
  const caret=active?.id==='calendar-title'?{start:(active as HTMLInputElement).selectionStart,end:(active as HTMLInputElement).selectionEnd}:null;
  const focusKey=active&&content.contains(active)?['id','data-date','data-period','data-complete','data-resize','data-task','data-backup-action','data-backup-id'].find(key=>active.hasAttribute(key)):undefined;
  const focusSelector=focusKey?`[${focusKey}="${CSS.escape(active!.getAttribute(focusKey)!)}"]`:null;
  const scrollPositions=['.timeline-scroll','.inbox-panel','.week-view'].map(selector=>({selector,top:content.querySelector(selector)?.scrollTop??0}));
  $('#heading').textContent=view==='settings'?'설정':view==='inbox'?'미계획':view==='plan'?rangeTitle(period,selected):dateLabel(selected);
  $('#notice').innerHTML=!native?'<div class="notice">미리보기 · 예시 데이터</div>':warning?`<div class="notice warning">${esc(warning)}</div>`:'';
  if(!ready||!snapshot){$('#content').innerHTML=`<section class="load-state"><h2>${loadError?'저장소를 열지 못했습니다':'로컬 기록을 불러오는 중입니다'}</h2><p>${esc(loadError||'기록을 불러오는 중이에요. 잠시 후 편집할 수 있어요.')}</p>${loadError?'<button id="reload">다시 불러오기</button>':''}</section>`;document.querySelector('#reload')?.addEventListener('click',()=>{if(editorDirty||captureDraft.text||Object.keys(rawSchedules).length)void reload();else location.reload();});return;}
  $('#content').innerHTML=view==='settings'?settingsHTML():view==='inbox'?inboxHTML():view==='today'?todayHTML():planHTML();
  content.dataset.view=view;
  document.querySelectorAll<HTMLElement>('.rail [data-view]').forEach(b=>{const active=b.dataset.view===view;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');if(b.dataset.view==='inbox'){b.setAttribute('aria-label','미계획 '+inboxTasks().length+'건');b.querySelector('span')!.textContent='미계획'+(inboxTasks().length?' '+inboxTasks().length:'');}});
  $<HTMLButtonElement>('#go-today').disabled=selected===today();
  const unit=view==='today'?'날':period==='month'?'달':period==='two'?'2주':'주';$('#prev').setAttribute('aria-label','이전 '+unit);$('#next').setAttribute('aria-label','다음 '+unit);
  bindContent();fitTimeline();
  if(calendarComposer)openComposer(calendarComposer.date,calendarComposer.start,calendarComposer.duration,true);
  updateStatus();
  for(const {selector,top} of scrollPositions){const pane=content.querySelector(selector);if(pane)pane.scrollTop=top;}
  if(focusSelector)content.querySelector<HTMLElement>(focusSelector)?.focus({preventScroll:true});
  if(caret){const input=content.querySelector<HTMLInputElement>('#calendar-title');if(input&&caret.start!==null&&caret.end!==null)input.setSelectionRange(caret.start,caret.end);}
}
function taskRow(t:Task,old=false,state=''){
  const current=state==='current',past=old||state==='overdue';
  return `<div class="agenda-task ${current?'current':''}" ${current?'aria-current="true"':''}><div class="task-row ${t.completed?'completed':''}" data-drag="${esc(t.id)}"><label class="check-target"><input aria-label="${esc(t.title)} 완료" type="checkbox" data-complete="${esc(t.id)}" ${t.completed?'checked':''}></label><span class="row-time">${t.starts_at?time(taskMinute(t)):'미배치'}</span><button class="task-title" data-task="${esc(t.id)}">${esc(t.title)}${old?`<small>${dateLabel(t.starts_at!.slice(0,10))}${t.body.trim()?' · '+esc(t.body.split('\n').find(Boolean)):''}</small>`:''}</button>${past?'<span class="badge overdue-badge">지남</span>':''}<span class="duration">${formatDuration(t.duration)}</span></div>${current?`<div class="current-detail"><span class="badge">진행 중</span>${t.body?`<p class="memo-preview">${esc(t.body.split('\n').slice(0,3).join('\n'))}</p>`:''}<div class="detail-actions"><button class="primary" data-complete="${esc(t.id)}">완료로 표시</button><button data-task="${esc(t.id)}">상세 열기</button></div></div>`:''}</div>`;
}
function todayHTML(){
  const tasks=tasksOn(selected),old=overdue(),items=agenda(selected,snapshot!.tasks,dayRule(selected),selected===today()?nowMinute():null);
  const done=tasks.filter(t=>t.completed).length,remaining=tasks.filter(t=>!t.completed).reduce((sum,t)=>sum+t.duration,0);
  return `${tasks.length?`<div class="today-summary">배치 ${tasks.length}건${done?` · 완료 ${done}`:''}${remaining?` · 남은 배치 ${formatDuration(remaining)}`:''}</div>`:''}<div class="today-layout"><section class="panel task-list"><div class="section-header"><h2>${selected===today()?'오늘 순서':dateLabel(selected)+' 순서'}</h2></div>${!tasks.length?'<p class="empty-small">아직 배치한 일이 없어요. <button id="go-plan">계획 열기</button></p>':''}${items.map(item=>item.kind==='task'?taskRow(item.task,false,item.state):`<div class="agenda-interval ${item.kind}"><span class="row-time">${time(item.start)}</span><span>${item.kind==='unavailable'?esc(item.label)+' · 작업 불가 ':''}${formatDuration(item.end-item.start)}</span></div>`).join('')}${old.length?`<section class="overdue"><div class="section-header"><h3>지난 미완료 ${old.length}</h3><button id="review">계획에서 옮기기</button></div>${old.map(t=>taskRow(t,true)).join('')}</section>`:''}</section><section class="panel timeline-panel"><div class="section-header"><h2>시간표</h2></div>${dayAvailabilityHTML(snapshot!.settings,selected)}${timelineHTML(selected)}</section></div>`;
}
function inboxChip(t:Task,old=false){return `<button class="inbox-chip ${old?'past':''} ${dragId===t.id?'dragging':''}" data-drag="${esc(t.id)}" data-task="${esc(t.id)}" aria-label="${esc(t.title)}, ${formatDuration(t.duration)}, 상세 열기"><svg aria-hidden="true" viewBox="0 0 12 20" fill="currentColor"><path d="M3 4h2v2H3zm4 0h2v2H7zM3 9h2v2H3zm4 0h2v2H7zM3 14h2v2H3zm4 0h2v2H7z"/></svg><span>${esc(t.title)}</span><small>${old?dateLabel(t.starts_at!.slice(0,10)):formatDuration(t.duration)}</small></button>`;}
function inboxHTML(){
  const tasks=inboxTasks(),total=tasks.reduce((sum,t)=>sum+t.duration,0);
  return `<section class="inbox-page"><form id="inbox-form" class="inbox-entry"><label class="sr-only" for="inbox-capture">할 일 담기</label>${icon('plus')}<input id="inbox-capture" autocomplete="off" maxlength="650" placeholder="어떤 일을 해야 하나요?" value="${esc(captureDraft.text)}"><button type="submit">담기</button></form>${tasks.length?`<div class="inbox-list-heading"><h3>배치를 기다리는 일 <span>${tasks.length}</span></h3><span>${formatDuration(total)} 분량</span><button id="go-plan">계획에 배치하기 ${icon('right')}</button></div>`:''}<div class="inbox-list">${tasks.map(t=>`<div class="inbox-item"><button class="inbox-item-main" data-task="${esc(t.id)}"><span class="task-block-mark" aria-hidden="true"></span><span><strong>${esc(t.title)}</strong><small>${t.body?esc(t.body.split('\n')[0]):''}</small></span></button><button class="size-button" data-edit-time="${esc(t.id)}" aria-label="${esc(t.title)} 블록 크기 변경">${formatDuration(t.duration)}</button><button class="text-button" data-plan-task="${esc(t.id)}">배치</button></div>`).join('')||'<div class="empty"><p>미계획이 비어 있어요.</p></div>'}</div></section>`;
}
function planHTML(){
  const first=dateOf(selected);if(period==='month')first.setDate(1);first.setDate(first.getDate()-(first.getDay()+6)%7);
  const monthEnd=new Date(dateOf(selected).getFullYear(),dateOf(selected).getMonth()+1,0),monthStart=dateOf(selected);monthStart.setDate(1);
  const count=period==='week'?7:period==='two'?14:Math.ceil(((monthStart.getDay()+6)%7+monthEnd.getDate())/7)*7,inbox=inboxTasks(),old=overdue();
  const dates=Array.from({length:count},(_,i)=>plusDays(dateKey(first),i));
  const calendar=period==='week'?weekHTML(dates):`<div class="weekdays">${['월','화','수','목','금','토','일'].map(d=>`<span>${d}</span>`).join('')}</div><div class="calendar-grid ${period}">${dates.map(key=>{
    const d=dateOf(key),tasks=tasksOn(key),capacity=available(key),off=!dayRule(key).enabled,exception=snapshot!.settings.exceptions?.find(e=>e.date===key),used=tasks.reduce((n,t)=>n+t.duration,0);
    return `<button data-date="${key}" aria-pressed="${key===selected}" aria-label="${dateLabel(key)}, 작업 ${tasks.length}건" class="day-cell ${key===today()?'is-today':''} ${off?'off-day':''} ${d.getMonth()!==dateOf(selected).getMonth()?'outside-month':''}"><span class="day-number">${d.getDate()===1?d.getMonth()+1+'/':''}${d.getDate()}${key===today()?'<small>오늘</small>':''}</span>${exception?`<small class="day-exception">${exception.kind==='leave'?'휴가':exception.kind==='early'?'조퇴':'시간 변경'}</small>`:''}${period==='two'?`<span class="day-tasks">${tasks.slice(0,4).map(t=>`<span role="button" tabindex="0" data-task="${t.id}" class="mini-task ${t.completed?'done':''}"><small>${time(taskMinute(t))}</small>${esc(t.title)}</span>`).join('')}${tasks.length>4?`<small>+${tasks.length-4}건</small>`:''}</span>`:tasks.length?`<span class="day-summary">${tasks.length}건 · ${formatDuration(used)}</span>`:''}${off?`<small>${exception?.kind==='leave'?'':'휴무'}</small>`:period==='month'?`<span class="occupancy" style="--segments:1" aria-label="배치 ${formatDuration(used)}"><i style="width:${capacity?Math.min(100,used/capacity*100):0}%"></i></span>`:''}</button>`;
  }).join('')}</div>`;
  return `<div class="plan-toolbar"><div class="segmented" aria-label="계획 기간">${[['week','주'],['two','2주'],['month','월']].map(([key,label])=>`<button data-period="${key}" aria-pressed="${period===key}">${label}</button>`).join('')}</div><span class="week-summary">${weeklySummary(snapshot!.settings,selected)}</span><button id="toggle-inbox" aria-expanded="${inboxOpen}" aria-controls="inbox-drawer">${icon('inbox')} 미계획 ${inbox.length?`<span>${inbox.length}</span>`:''}</button></div><div class="planning-desk ${inboxOpen?'with-inbox':''}"><div class="plan-layout ${period==='week'?'week-layout':''}"><section class="panel month-panel" aria-label="${period==='week'?'주간 시간표':period==='two'?'2주 작업 목록':'월간 작업량'}">${calendar}</section>${period==='week'?'':`<section class="panel day-panel"><div class="section-header"><h2>${dateLabel(selected)}</h2></div>${dayAvailabilityHTML(settingsDraft??snapshot!.settings,selected)}${timelineHTML(selected)}</section>`}</div><aside class="inbox-panel" id="inbox-drawer" data-inbox-drop ${inboxOpen?'':'hidden'}><div class="section-header"><h2>미계획 ${inbox.length?`<span>${inbox.length}</span>`:''}</h2><button class="icon-button" id="close-inbox" aria-label="미계획 패널 닫기">${icon('close')}</button></div><form id="inbox-form" class="tray-entry"><label class="sr-only" for="inbox-capture">미계획에 추가</label><input id="inbox-capture" autocomplete="off" maxlength="650" placeholder="새 할 일" value="${esc(captureDraft.text)}"><button type="submit" class="icon-button" aria-label="미계획에 추가">${icon('plus')}</button></form><div class="inbox-chips">${inbox.map(t=>inboxChip(t)).join('')||'<p class="empty-small">미계획 없음</p>'}</div>${old.length?`<h3 class="carryover-title">지난 미완료 <span>${old.length}</span></h3><div class="inbox-chips">${old.map(t=>inboxChip(t,true)).join('')}</div>`:''}</aside></div>`;

}
function splitSeam(t:Task){
  if(t.completed||t.duration<30)return '';
  const first=splitDuration(t.duration,t.duration/2);
  return `<div class="split-seam" data-split="${esc(t.id)}" data-split-duration="${first}" role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${esc(t.title)} 나누기 경계" aria-valuemin="15" aria-valuemax="${t.duration-15}" aria-valuenow="${first}" aria-valuetext="앞 ${formatDuration(first)}, 뒤 ${formatDuration(t.duration-first)}" style="top:${first/t.duration*100}%"><span>${formatDuration(first)} + ${formatDuration(t.duration-first)}</span></div>`;
}
function weekHTML(dates:string[]){
  const rules=dates.map(dayRule),start=Math.max(0,Math.floor((Math.min(540,...rules.map(d=>d.start))-60)/60)*60),end=Math.min(1440,Math.ceil((Math.max(1080,...rules.map(d=>d.end))+60)/60)*60),scale=.85;
  return `<div class="week-view"><div class="week-head"><span></span>${dates.map(date=>`<button data-date="${date}" class="day-cell week-date ${date===today()?'is-today':''}" aria-pressed="${date===selected}"><small>${dateOf(date).toLocaleDateString('ko-KR',{weekday:'short'})}</small><strong class="day-number">${dateOf(date).getDate()}${date===today()?' · 오늘':''}</strong></button>`).join('')}</div><div class="week-scroll"><div class="week-time-grid" style="height:${(end-start)*scale}px"><div class="week-hours">${Array.from({length:(end-start)/60},(_,i)=>`<span style="top:${i*60*scale}px">${time(start+i*60)}</span>`).join('')}</div>${dates.map(date=>{const rule=dayRule(date);return `<div class="week-column" data-calendar-surface data-date="${date}" data-start="${start}" data-end="${end}" data-px-per-min="${scale}">${Array.from({length:(end-start)/30},(_,i)=>{const m=start+i*30,blocked=checkPlacement('',date,m,30,rule,[])!==null;return `<button class="week-slot ${blocked?'blocked':''}" style="top:${i*30*scale}px;height:${30*scale}px" ${blocked?`data-adjust-date="${date}"`:`data-add-date="${date}" data-add-minute="${m}"`} aria-label="${dateLabel(date)} ${time(m)} ${blocked?'금지시간 조정':'할 일 추가'}"></button>`;}).join('')}${calendarAvailabilityHTML(rule,date,start,end,scale)}${tasksOn(date).map(t=>`<div class="week-task ${t.completed?'completed':''}" data-drag="${t.id}" style="top:${(taskMinute(t)-start)*scale}px;height:${t.duration*scale}px" title="${esc(t.title)}"><button class="block-title" data-task="${t.id}"><span>${esc(t.title)}</span>${t.duration>=60?`<small>${time(taskMinute(t))}</small>`:''}</button>${splitSeam(t)}<span class="resize-handle" role="separator" tabindex="0" aria-orientation="horizontal" aria-valuenow="${t.duration}" aria-valuemin="15" aria-valuemax="1440" aria-label="${esc(t.title)} 소요시간 조절" data-resize="${t.id}"></span></div>`).join('')}</div>`;}).join('')}</div></div></div>`;
}
function timelineHTML(date:string){
  const rule=dayRule(date),start=Math.max(0,Math.min(540,rule.start)-60),end=Math.min(1440,Math.max(1080,rule.end)+60),scale=view==='today'?1.2:.8;
  const position=(s:number,e:number)=>`data-minute="${s}" data-duration="${e-s}" style="top:${(s-start)*scale}px;height:${(e-s)*scale}px"`;
  const shade=(s:number,e:number,label:string)=>e>s?`<div class="unavailable" ${position(s,e)}>${esc(label)}</div>`:'';
  const now=nowMinute(),items=agenda(date,snapshot!.tasks,rule,date===today()?now:null);
  const status=date===today()?(now<rule.start?`근무 시작 전 · ${time(rule.start)} 시작`:now>=rule.end?'근무 시간 종료':''):'';
  return `${status?`<p class="work-boundary">${status}</p>`:''}<div class="timeline-scroll"><div class="timeline" data-calendar-surface data-start="${start}" data-end="${end}" data-px-per-min="${scale}" data-date="${date}" style="height:${(end-start)*scale}px">${Array.from({length:Math.floor((end-start)/60)+1},(_,i)=>{const m=start+i*60;return `<div class="hour-line" data-minute="${m}" style="top:${(m-start)*scale}px"><span>${String(Math.floor(m/60)).padStart(2,'0')}</span></div>`;}).join('')}${Array.from({length:Math.floor((end-start)/60)},(_,i)=>`<div class="half-hour-line" data-minute="${start+i*60+30}" style="top:${(i*60+30)*scale}px" aria-hidden="true"></div>`).join('')}${!rule.enabled?shade(start,end,'작업 불가'):shade(start,rule.start,'')+shade(rule.end,end,'')}${calendarAvailabilityHTML(rule,date,start,end,scale)}${items.map(item=>{
    if(item.kind==='unavailable')return '';
    if(item.kind==='gap')return view==='today'?`<div class="time-gap" ${position(item.start,item.end)}>${formatDuration(item.end-item.start)}</div>`:'';
    if(item.kind!=='task')return '';
    const t=item.task,state=item.state,label=state==='current'?'진행 중':state==='overdue'?'지남':t.completed?'완료':'';
    return `<div class="time-block ${t.duration===15?'compact':''} ${state} ${t.completed?'completed':''} ${placedId===t.id?'placed':''}" ${position(item.start,item.end)} data-drag="${esc(t.id)}"><button class="block-title" data-task="${esc(t.id)}" aria-label="${esc(t.title)}, ${time(item.start)}–${time(item.end)}, ${formatDuration(t.duration)}${label?', '+label:''}" title="${esc(t.title)} · ${time(item.start)}–${time(item.end)}"><span>${label?label+' · ':''}${esc(t.title)}</span>${t.duration>=45?`<small>${time(item.start)}–${time(item.end)}</small>`:''}</button>${splitSeam(t)}<div role="separator" aria-label="${esc(t.title)} 소요시간 조절" aria-orientation="horizontal" aria-valuemin="15" aria-valuemax="1440" aria-valuenow="${t.duration}" aria-valuetext="${formatDuration(t.duration)}" tabindex="0" class="resize-handle" data-resize="${esc(t.id)}"></div></div>`;
  }).join('')}${date===today()&&now>=rule.start&&now<rule.end?`<div class="now-line" data-minute="${now}" style="top:${(now-start)*scale}px"><span>${time(now)}</span></div>`:''}</div></div>`;
}
function fitTimeline(){
  const tl=document.querySelector<HTMLElement>('.timeline');if(!tl||view!=='plan')return;
  const pane=tl.parentElement!,range=Number(tl.dataset.end)-Number(tl.dataset.start),scale=Math.max(.8,Math.min(1.2,(pane.clientHeight-30)/range));
  tl.dataset.pxPerMin=String(scale);tl.style.height=range*scale+'px';
  tl.querySelectorAll<HTMLElement>('[data-minute]').forEach(el=>{el.style.top=(Number(el.dataset.minute)-Number(tl.dataset.start))*scale+'px';if(el.dataset.duration)el.style.height=Number(el.dataset.duration)*scale+'px';});
}

function bindContent(){
  document.querySelectorAll<HTMLButtonElement>('[data-edit-time]').forEach(b=>b.onclick=()=>{openEditor(b.dataset.editTime!);$<HTMLDetailsElement>('.editor-schedule').open=true;$('#edit-duration').focus();});
  document.querySelectorAll<HTMLButtonElement>('[data-task]').forEach(b=>b.onclick=e=>{e.stopPropagation();openEditor(b.dataset.task!);});
  document.querySelectorAll<HTMLElement>('[data-complete]').forEach(b=>{const complete=()=>{const t=snapshot!.tasks.find(t=>t.id===b.dataset.complete)!;if(b instanceof HTMLInputElement)b.checked=t.completed;void dispatch({type:'set_completed',id:t.id,expected_revision:t.revision,completed:!t.completed});};if(b instanceof HTMLInputElement)b.onchange=complete;else b.onclick=complete;});
  document.querySelectorAll<HTMLButtonElement>('.day-cell[data-date]').forEach(b=>b.onclick=()=>{selected=b.dataset.date!;if(b.classList.contains('week-date')){view='today';render();}else renderContent();});
  document.querySelectorAll<HTMLButtonElement>('[data-period]').forEach(b=>b.onclick=()=>{period=b.dataset.period!;renderContent();});
  document.querySelectorAll<HTMLElement>('.mini-task[data-task]').forEach(el=>el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();openEditor(el.dataset.task!);}});
  for(const id of ['toggle-inbox','close-inbox'])document.querySelector('#'+id)?.addEventListener('click',()=>{inboxOpen=!inboxOpen;renderContent();});
  for(const id of ['go-plan','review'])document.querySelector('#'+id)?.addEventListener('click',()=>{view='plan';inboxOpen=true;render();});
  document.querySelectorAll<HTMLElement>('[data-day-step]').forEach(b=>b.onclick=()=>{selected=plusDays(selected,Number(b.dataset.dayStep));renderContent();});
  const inboxInput=document.querySelector<HTMLInputElement>('#inbox-capture');
  if(inboxInput){inboxInput.oninput=()=>{captureDraft.edit(inboxInput.value);draftChanged();};inboxInput.onkeydown=e=>{if(e.key==='Enter'&&isCompositionKey(e))e.preventDefault();};$('#inbox-form').onsubmit=e=>{e.preventDefault();void submitCapture();};}
  document.querySelectorAll<HTMLElement>('[data-plan-task]').forEach(b=>b.onclick=()=>{view='plan';inboxOpen=true;render();const block=document.querySelector<HTMLElement>(`[data-drag="${CSS.escape(b.dataset.planTask!)}"]`);block?.focus();});
  document.querySelectorAll<HTMLElement>('[data-add-date]').forEach(b=>b.onclick=e=>{if(e.detail===0)openComposer(b.dataset.addDate!,Number(b.dataset.addMinute));});
  bindCalendarGestures($('#content'),{
    task:id=>snapshot!.tasks.find(t=>t.id===id),
    issue:(id,date,start,duration)=>placementIssue(id,date,start,duration)?.label,
    move:(task,date,start,duration)=>{selected=date;void moveTask(task,start,duration);},
    create:(date,start,duration)=>openComposer(date,start,duration),
    unschedule:task=>void returnToInbox(task),
    split:(task,first)=>void splitTask(task,first),
    context:(task,date,start,x,y)=>openContextMenu(task,date,start,x,y),
    active:value=>{resizing=value;},
    error:label=>showError(Error(label)),
    availabilityDay:dayRule,
    availabilitySelect:openCalendarAvailability,
    availabilityChange:changeCalendarAvailability
  });
  if(view==='settings')bindSettings();
  else {const region=document.querySelector<HTMLElement>('.day-availability');if(region)bindSchedule(region,selected);}

  document.querySelectorAll<HTMLElement>('[data-adjust-date]').forEach(b=>b.onclick=e=>openCalendarAvailability(b.dataset.adjustDate!,'work',e.clientX,e.clientY));
  document.querySelectorAll<HTMLElement>('.timeline .unavailable').forEach(b=>{b.tabIndex=0;b.setAttribute('role','button');b.setAttribute('aria-label',(b.textContent||'근무 외 시간')+' 조정');const adjust=()=>{const rect=b.getBoundingClientRect();openCalendarAvailability(b.closest<HTMLElement>('[data-calendar-surface]')!.dataset.date!,'work',rect.left,rect.top);};b.onclick=adjust;b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();adjust();}};});
}
async function moveTask(t:Task,start:number,duration:number){
  const date=selected,issue=placementIssue(t.id,date,start,duration);if(issue){showError(Error(issue.label));return;}
  await dispatch({type:'update',id:t.id,expected_revision:t.revision,title:t.title,body:t.body,starts_at:date+'T'+time(start),duration},snapshot!.epoch,undefined,()=>{placedId=t.id;message=`‘${t.title}’ ${time(start)}–${time(start+duration)}에 배치했어요`;setTimeout(()=>{placedId='';document.querySelectorAll('.placed').forEach(el=>el.classList.remove('placed'));},600);});
}

function openCalendarAvailability(date:string,target:AvailabilityTarget,x=innerWidth/2,y=150){
  document.querySelector('#calendar-availability-editor')?.remove();
  selected=date;const panel=document.createElement('section');panel.id='calendar-availability-editor';panel.className='calendar-availability-editor';panel.setAttribute('popover','auto');panel.setAttribute('aria-label',dateLabel(date)+' 근무시간 조정');
  panel.innerHTML=`<div class="section-header"><h3>${esc(dateLabel(date))}</h3><button type="button" class="icon-button" data-close-availability aria-label="시간 조정 닫기">${icon('close')}</button></div>${dayAvailabilityHTML(settingsDraft??snapshot!.settings,date)}`;
  document.body.append(panel);bindSchedule(panel,date);panel.showPopover();focusAvailabilityBand(panel,target);
  panel.style.left=Math.max(8,Math.min(x,innerWidth-panel.offsetWidth-8))+'px';panel.style.top=Math.max(8,Math.min(y,innerHeight-panel.offsetHeight-8))+'px';
  panel.querySelector<HTMLButtonElement>('[data-close-availability]')!.onclick=()=>{panel.hidePopover();panel.remove();};
  panel.addEventListener('toggle',e=>{if((e as ToggleEvent).newState==='closed')panel.remove();});
}
function changeCalendarAvailability(date:string,target:AvailabilityTarget,edge:AvailabilityEdge,value:number,x:number,y:number){
  try{
    if(rawSchedules[date]?.invalid)throw Error('작성 중인 시간을 먼저 확인하세요.');
    const day=changeAvailabilityBand(dayRule(date),target,edge,value),draft=structuredClone(settingsDraft??snapshot!.settings);
    draft.exceptions=[...(draft.exceptions??[]).filter(e=>e.date!==date),{date,kind:'custom',day}];
    settingsBase??={epoch:snapshot!.epoch,revision:snapshot!.settings.revision};settingsDraft=draft;delete rawSchedules[date];draftChanged();selected=date;renderContent();openCalendarAvailability(date,target,x,y);
  }catch(e){showError(e);}
}
function openComposer(date:string,start=540,duration=30,restoring=false){
  if(!ready)return;
  if(editorDirty){if(!restoring)openEditor(editor!.id);return;}
  const issue=placementIssue('',date,start,duration);if(issue&&!restoring){showError(Error(issue.label));return;}
  document.querySelector('#calendar-composer')?.remove();
  const surface=Array.from(document.querySelectorAll<HTMLElement>('[data-calendar-surface]')).find(el=>el.dataset.date===date);if(!surface)return;
  calendarComposer={date,start,duration};
  const form=document.createElement('form');form.id='calendar-composer';form.className='calendar-composer';
  form.style.top=(start-Number(surface.dataset.start))*Number(surface.dataset.pxPerMin)+'px';
  form.style.setProperty('--selection-height',duration*Number(surface.dataset.pxPerMin)+'px');
  form.innerHTML=`<div class="composer-time">${time(start)}–${time(start+duration)}<button type="button" class="icon-button" aria-label="입력 닫기">${icon('close')}</button></div><label class="sr-only" for="calendar-title">새 블록 제목</label><input id="calendar-title" placeholder="할 일" value="${esc(captureDraft.text)}" maxlength="650" autocomplete="off" required><button type="submit" class="primary">배치</button><p class="error" role="alert">${issue?esc(issue.label)+'. 다른 시간을 선택하세요.':''}</p>`;
  surface.append(form);const input=form.querySelector<HTMLInputElement>('input')!;
  input.oninput=()=>{captureDraft.edit(input.value);draftChanged();};
  input.addEventListener('compositionstart',()=>{calendarComposing=true;});input.addEventListener('compositionend',()=>{calendarComposing=false;if(calendarRefreshPending)queueMicrotask(renderContent);});
  input.onkeydown=e=>{if(e.key==='Enter'&&isCompositionKey(e))e.preventDefault();};
  form.querySelector<HTMLButtonElement>('[type=button]')!.onclick=()=>{calendarComposer=null;calendarComposing=false;persistDraft();form.remove();};
  form.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();calendarComposer=null;calendarComposing=false;persistDraft();form.remove();}};
  form.onsubmit=async e=>{
    e.preventDefault();if(queue.busy||queue.failed||!input.value.trim())return;
    const conflict=placementIssue('',date,start,duration);if(conflict){form.querySelector<HTMLElement>('.error')!.textContent=conflict.label+'. 다른 시간을 선택하세요.';return;}
    if(captureDraft.command?.action.type!=='create_scheduled'||captureDraft.command.action.starts_at!==date+'T'+time(start)||captureDraft.command.action.duration!==duration)captureDraft.command=null;
    captureDraft.command??={request_id:crypto.randomUUID(),epoch:snapshot!.epoch,action:{type:'create_scheduled',id:crypto.randomUUID(),title:input.value.trim(),starts_at:date+'T'+time(start),duration}};
    const command=captureDraft.command;persistDraft();form.inert=true;
    await dispatch(command.action,command.epoch,command.request_id,()=>{if(captureDraft.acknowledge(command)){calendarComposer=null;form.remove();}persistDraft();});
    form.inert=false;if(form.isConnected)form.querySelector<HTMLElement>('.error')!.textContent=errorMessage;
  };
  if(!restoring)input.focus();
}

function durationPicker(prefix:string,duration:number){
  return `<div class="block-size"><div class="block-size-heading"><span>블록 크기</span><span id="${prefix}-size-label">${formatDuration(duration)}</span></div><div class="block-ruler" aria-label="15분 단위 소요시간">${Array.from({length:8},(_,i)=>`<button type="button" data-duration="${(i+1)*15}" aria-label="${formatDuration((i+1)*15)}" aria-pressed="${(i+1)*15===duration}" class="${i<duration/15?'filled':''}"></button>`).join('')}</div><div class="duration-options" aria-label="블록 소요시간">${[15,30,60,90,120].map(n=>`<button type="button" data-duration="${n}" aria-pressed="${n===duration}">${formatDuration(n)}</button>`).join('')}<label class="custom-duration"><input aria-label="블록 소요시간 직접 입력" id="${prefix}-duration" type="number" min="15" max="1440" step="15" value="${duration}" required><span>분</span></label></div></div>`;
}
function bindDurationPicker(prefix:string){
  const input=$<HTMLInputElement>('#'+prefix+'-duration'),region=input.closest<HTMLElement>('.block-size')!;
  const sync=()=>{const duration=Number(input.value);$('#'+prefix+'-size-label').textContent=Number.isFinite(duration)&&duration>0?formatDuration(duration):'15분 단위';region.querySelectorAll<HTMLElement>('[data-duration]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.duration)===duration)));region.querySelectorAll('.block-ruler button').forEach((b,i)=>b.classList.toggle('filled',i<duration/15));};
  region.querySelectorAll<HTMLButtonElement>('[data-duration]').forEach(b=>b.onclick=()=>{input.value=b.dataset.duration!;input.dispatchEvent(new Event('input',{bubbles:true}));});input.addEventListener('input',sync);
}
async function returnToInbox(task:Task){
  if(!task.starts_at)return;
  await dispatch({type:'update',id:task.id,expected_revision:task.revision,title:task.title,body:task.body,starts_at:null,duration:task.duration});
}
async function splitTask(task:Task,first?:number){
  if(editorDirty&&editor?.id===task.id){openEditor(task.id);showError(Error('변경을 저장한 뒤 블록을 나눠 주세요.'));return;}
  if(first===undefined){
    const seam=document.querySelector<HTMLElement>(`[data-split="${CSS.escape(task.id)}"]`);
    if(seam){if($<HTMLDialogElement>('#editor-dialog').open)closeEditor();seam.focus();return;}
    document.querySelector('#split-choice')?.remove();
    const panel=document.createElement('section');panel.id='split-choice';panel.className='split-choice';panel.setAttribute('popover','auto');panel.setAttribute('aria-label',task.title+' 나누기');
    const value=splitDuration(task.duration,task.duration/2);
    panel.innerHTML=`<h3>${esc(task.title)}</h3><output>${formatDuration(value)} + ${formatDuration(task.duration-value)}</output><input type="range" min="15" max="${task.duration-15}" step="15" value="${value}" aria-label="나누기 위치"><button type="button" class="primary">나누기</button>`;
    document.body.append(panel);panel.showPopover();const range=panel.querySelector<HTMLInputElement>('input')!;
    range.oninput=()=>{const first=splitDuration(task.duration,Number(range.value));panel.querySelector('output')!.textContent=`${formatDuration(first)} + ${formatDuration(task.duration-first)}`;};
    panel.querySelector<HTMLButtonElement>('button')!.onclick=()=>{panel.hidePopover();panel.remove();void splitTask(task,Number(range.value));};
    panel.addEventListener('toggle',e=>{if((e as ToggleEvent).newState==='closed')panel.remove();});range.focus();return;
  }
  const duration=splitDuration(task.duration,first);
  await dispatch({type:'split',id:task.id,expected_revision:task.revision,new_id:crypto.randomUUID(),first_duration:duration},snapshot!.epoch,undefined,()=>{if(editor?.id===task.id)closeEditor(true);inboxOpen=true;});
}
function openContextMenu(task:Task|undefined,date:string,start:number,x:number,y:number){
  document.querySelector<HTMLElement>('#calendar-menu')?.remove();
  const menu=document.createElement('div');menu.id='calendar-menu';menu.className='calendar-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label',task?'블록 작업':'시간 작업');menu.setAttribute('popover','auto');
  const items: {label:string;run:()=>void}[]=task?[
    {label:'메모 열기',run:()=>openEditor(task.id)},
    {label:task.completed?'미완료로 되돌리기':'완료로 표시',run:()=>{void dispatch({type:'set_completed',id:task.id,expected_revision:task.revision,completed:!task.completed});}},
    ...(!task.completed&&task.duration>=30?[{label:'나누기 위치 정하기',run:()=>{void splitTask(task);}}]:[]),
    ...(task.starts_at?[{label:'미계획으로 옮기기',run:()=>{void returnToInbox(task);}}]:[])
  ]:[{label:`${time(start)}에 블록 만들기`,run:()=>openComposer(date,start)},{label:'이 날짜의 근무시간 조정',run:()=>openCalendarAvailability(date,'work',x,y)}];
  menu.innerHTML=`<div class="context-heading">${task?esc(task.title):esc(dateLabel(date))}</div>`+items.map((item,i)=>`<button role="menuitem" data-menu-action="${i}">${esc(item.label)}</button>`).join('');document.body.append(menu);menu.showPopover();
  menu.style.left=Math.max(8,Math.min(x,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-menu.offsetHeight-8))+'px';
  const buttons=Array.from(menu.querySelectorAll<HTMLButtonElement>('button'));buttons.forEach((b,i)=>b.onclick=()=>{menu.hidePopover();menu.remove();items[i].run();});buttons[0]?.focus();
  menu.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(index+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length].focus();}if(e.key==='Escape'){menu.hidePopover();menu.remove();}};
}
function openEditor(id:string){
  pendingEditorId=editorDirty&&editor?.id!==id?id:null;
  if(!editorDirty){const saved=snapshot!.tasks.find(t=>t.id===id);if(!saved)return;editor={...saved,epoch:snapshot!.epoch};editorSequence=0;}
  renderEditor();const dialog=$<HTMLDialogElement>('#editor-dialog');if(!dialog.open)dialog.showModal();$('#edit-title').focus();updateStatus();
}
function closeEditor(discard=false){
  if(discard){editorDirty=false;editor=null;}persistDraft();pendingEditorId=null;$<HTMLDialogElement>('#editor-dialog').close();updateStatus();
}
function requestEditorClose(){
  if(!editorDirty){closeEditor();return;}
  const bar=$('#close-confirm');bar.hidden=false;$('#save-close').focus();
}
function checklistHTML(body:string){
  const lines=body.split('\n').flatMap((line,i)=>{const m=line.match(/^\s*(?:-\s*)?\[([ xX])\]\s*(.*)$/);return m?[{i,checked:m[1]!==' ',label:m[2]}]:[];});
  return lines.length?`<details><summary>체크리스트 ${lines.filter(l=>l.checked).length}/${lines.length}</summary>${lines.map(l=>`<label class="check-line"><input type="checkbox" data-check-line="${l.i}" ${l.checked?'checked':''}>${esc(l.label)}</label>`).join('')}</details>`:'';
}
function editorSummary(){
  if(!editor)return;const t=editor,count=t.body.match(/^\s*(?:-\s*)?\[[ xX]\]/gm)||[],done=t.body.match(/^\s*(?:-\s*)?\[[xX]\]/gm)||[];
  const ended=!!t.starts_at&&(t.starts_at.slice(0,10)<today()||t.starts_at.slice(0,10)===today()&&taskMinute(t)+t.duration<=nowMinute());
  $('#editor-badges').innerHTML=`<span class="badge ${ended&&!t.completed?'overdue-badge':''}">${t.completed?'완료':!t.starts_at?'미계획':ended?'지남':'예정'}</span>${count.length?`<span>체크 ${done.length}/${count.length}</span>`:''}`;
  $('#editor-end').textContent=t.starts_at?`종료 ${time(taskMinute(t)+t.duration)}`:'미계획';
  $('#editor-schedule-summary').textContent=`시간 · ${formatDuration(t.duration)}${t.starts_at?' · '+t.starts_at.slice(0,10)+' '+t.starts_at.slice(11):' · 미계획'}`;
}
function renderEditor(){
  if(!editor)return;const t=editor,d=$<HTMLDialogElement>('#editor-dialog'),pending=snapshot!.tasks.find(x=>x.id===pendingEditorId);
  d.setAttribute('aria-labelledby','editor-heading');d.removeAttribute('aria-label');d.innerHTML=`<div class="detail-header"><h2 id="editor-heading" class="sr-only">항목 상세</h2><label class="sr-only" for="edit-title">제목</label><input id="edit-title" form="editor-form" value="${esc(t.title)}" maxlength="650" required><button class="icon-button" id="close-editor" aria-label="상세 닫기">${icon('close')}</button></div><form id="editor-form"><div class="editor-fields">${pending?`<div class="conflict">먼저 ‘${esc(t.title)}’의 변경을 정리해 주세요.<button type="button" id="switch-editor">버리고 ‘${esc(pending.title)}’ 열기</button></div>`:''}<div id="editor-badges"></div><label class="sr-only" for="edit-body">메모</label><textarea id="edit-body" rows="8" placeholder="메모">${esc(t.body)}</textarea><div id="checklist">${checklistHTML(t.body)}</div><details class="editor-schedule"><summary id="editor-schedule-summary">시간 · ${formatDuration(t.duration)}${t.starts_at?' · '+t.starts_at.slice(0,10)+' '+t.starts_at.slice(11):' · 미계획'}</summary>${durationPicker('edit',t.duration)}<div class="schedule-box"><div class="schedule-line"><div><label for="edit-date">예정 날짜</label><input id="edit-date" type="date" value="${t.starts_at?.slice(0,10)||''}"></div><div><label for="edit-time">시작 시각</label><input id="edit-time" type="time" step="900" value="${t.starts_at?.slice(11)||''}"></div></div><p id="editor-end" class="hint"></p></div></details><button type="button" id="discard-draft" class="text-button" ${editorDirty?'':'hidden'}>초안 버리기</button>${snapshot?.tasks.find(x=>x.id===t.id)?.revision!==t.revision||snapshot.epoch!==t.epoch?'<div class="conflict"><p>다른 곳에서 이 항목이 바뀌었어요. 입력한 내용은 그대로 있어요.</p><button type="button" id="rebase">내 입력으로 저장</button></div>':''}<div id="editor-recovery"></div></div><div class="editor-save"><div id="close-confirm" hidden><p>저장하지 않은 변경이 있어요.</p><div class="detail-actions"><button type="button" id="save-close" class="primary">저장하고 닫기</button><button type="button" id="keep-close">초안으로 남기고 닫기</button><button type="button" id="discard-close">변경 버리기</button></div></div><div class="detail-actions editor-primary"><button type="submit" class="primary">저장</button><button type="button" id="editor-complete">${t.completed?'미완료로 되돌리기':'완료로 표시'}</button><div class="more-actions"><button type="button" id="editor-more" aria-haspopup="menu" aria-expanded="false" aria-controls="editor-menu">⋯ 더보기</button><div id="editor-menu" role="menu" hidden>${!t.completed&&t.duration>=30?'<button role="menuitem" type="button" id="split-task">블록 나누기</button>':''}<button role="menuitem" type="button" id="unschedule">미계획으로 돌리기</button><button role="menuitem" type="button" id="delete-task" class="danger">삭제</button></div></div></div><p id="editor-status"></p></div></form>`;
  const changed=()=>{const date=$<HTMLInputElement>('#edit-date').value,start=$<HTMLInputElement>('#edit-time').value;editor!.title=$<HTMLInputElement>('#edit-title').value;editor!.starts_at=date&&start?date+'T'+start:null;editor!.duration=Number($<HTMLInputElement>('#edit-duration').value);editor!.body=$<HTMLTextAreaElement>('#edit-body').value;editorDirty=true;editorSequence++;$('#discard-draft').hidden=false;$('#editor-status').textContent='';editorSummary();draftChanged();};
  bindDurationPicker('edit');
  d.querySelectorAll('input:not([data-check-line]),textarea').forEach(el=>el.addEventListener('input',changed));
  $('#edit-body').addEventListener('change',()=>{$('#checklist').innerHTML=checklistHTML(editor!.body);bindChecklist(changed);});bindChecklist(changed);editorSummary();updateStatus();
  $('#editor-form').onsubmit=async e=>{e.preventDefault();if(await saveEditor())closeEditor();};
  $('#close-editor').onclick=requestEditorClose;d.oncancel=e=>{e.preventDefault();requestEditorClose();};d.onclose=()=>updateStatus();
  d.onkeydown=e=>{if(e.key==='Enter'&&isCompositionKey(e)){e.preventDefault();return;}if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();$<HTMLFormElement>('#editor-form').requestSubmit();}};
  $('#save-close').onclick=async()=>{if($<HTMLFormElement>('#editor-form').reportValidity()&&await saveEditor())closeEditor();};
  $('#keep-close').onclick=()=>closeEditor();$('#discard-close').onclick=()=>closeEditor(true);
  $('#discard-draft').onclick=async()=>{if(await ask('작성 중인 변경을 버리고 저장된 내용으로 돌아갈까요?'))closeEditor(true);};
  document.querySelector('#switch-editor')?.addEventListener('click',()=>{const id=pendingEditorId!;editorDirty=false;editor=null;persistDraft();openEditor(id);});
  $('#editor-more').onclick=()=>{const menu=$('#editor-menu');menu.hidden=!menu.hidden;$('#editor-more').setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)menu.querySelector<HTMLElement>('button')?.focus();};
  $('#editor-menu').onkeydown=e=>{const buttons=Array.from($('#editor-menu').querySelectorAll<HTMLButtonElement>('button'));if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(buttons.indexOf(document.activeElement as HTMLButtonElement)+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length].focus();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();$('#editor-menu').hidden=true;$('#editor-more').setAttribute('aria-expanded','false');$('#editor-more').focus();}};
  document.querySelector('#split-task')?.addEventListener('click',()=>{if(editorDirty){showError(Error('변경을 저장한 뒤 블록을 나눠 주세요.'));return;}void splitTask(t);});
  $('#unschedule').onclick=()=>{$<HTMLInputElement>('#edit-date').value='';$<HTMLInputElement>('#edit-time').value='';changed();$('#editor-menu').hidden=true;$('#editor-more').setAttribute('aria-expanded','false');};
  $('#editor-complete').onclick=async()=>{
    if(editorDirty){showError(Error('변경을 저장한 뒤에 완료로 표시할 수 있어요.'));return;}
    const seq=editorSequence;
    await dispatch({type:'set_completed',id:t.id,expected_revision:t.revision,completed:!t.completed},t.epoch,undefined,()=>{
      if(editor?.id!==t.id)return;const saved=snapshot!.tasks.find(x=>x.id===t.id)!;
      if(seq===editorSequence){editor={...saved,epoch:snapshot!.epoch};renderEditor();}
      else{editor.revision=saved.revision;editor.completed=saved.completed;$('#editor-complete').textContent=saved.completed?'미완료로 되돌리기':'완료로 표시';persistDraft();}
    });
  };
  $('#delete-task').onclick=async()=>{if(await ask('이 항목을 삭제할까요? 이 작업은 되돌릴 수 없어요.'))await dispatch({type:'delete',id:t.id,expected_revision:t.revision},t.epoch,undefined,()=>closeEditor(true));};
  document.querySelector('#rebase')?.addEventListener('click',async()=>{if(!await ask('다른 곳에서 저장된 내용 위에 지금 입력을 저장할까요?'))return;const current=snapshot!.tasks.find(x=>x.id===t.id);if(!current){showError(Error('삭제된 항목이에요. 내용을 복사해 새 항목으로 저장해 주세요.'));return;}editor!.revision=current.revision;editor!.epoch=snapshot!.epoch;await saveEditor();});
}
function bindChecklist(changed:()=>void){document.querySelectorAll<HTMLInputElement>('[data-check-line]').forEach(el=>el.onchange=()=>{const lines=$<HTMLTextAreaElement>('#edit-body').value.split('\n'),i=Number(el.dataset.checkLine);lines[i]=lines[i].replace(/\[[ xX]\]/,el.checked?'[x]':'[ ]');$<HTMLTextAreaElement>('#edit-body').value=lines.join('\n');changed();const checks=Array.from(document.querySelectorAll<HTMLInputElement>('[data-check-line]'));const summary=document.querySelector('#checklist summary');if(summary)summary.textContent=`체크리스트 ${checks.filter(c=>c.checked).length}/${checks.length}`;});}
async function saveEditor(){
  if(!editor)return false;
  if(queue.failed){updateStatus();document.querySelector<HTMLElement>('#editor-release')?.focus();return false;}
  const date=$<HTMLInputElement>('#edit-date'),start=$<HTMLInputElement>('#edit-time');if(!!date.value!==!!start.value){showError(Error('날짜와 시작 시각을 함께 입력해 주세요. 미계획으로 돌리려면 둘 다 비워 주세요.'));(!date.value?date:start).focus();return false;}
  const button=$<HTMLButtonElement>('#editor-form button[type=submit]');if(button.disabled)return false;button.disabled=true;const t=structuredClone(editor),seq=editorSequence;let saved=false;
  persistDraft();
  await dispatch({type:'update',id:t.id,expected_revision:t.revision,title:t.title,body:t.body,starts_at:t.starts_at,duration:t.duration},t.epoch,undefined,()=>{
    saved=true;if(editor?.id===t.id){editor.revision=snapshot!.tasks.find(x=>x.id===t.id)!.revision;if(seq===editorSequence)editorDirty=false;persistDraft();$('#editor-status').textContent=editorDirty?'새 변경이 남아 있어요. 다시 저장해 주세요.':native?'로컬 저장 완료':'미리보기에 반영했어요';$('#discard-draft').hidden=!editorDirty;$('#close-confirm').hidden=true;}
  });
  button.disabled=false;return saved&&!editorDirty;
}

async function ask(text:string){return native?confirm(text,{title:'BLOKKY',kind:'warning'}):window.confirm(text);}

const backupKind=(kind:ManagedBackup['kind'])=>({hour:'시간별',day:'일별',manual:'직접',safety:'복원 전'}[kind]);
const backupDate=(value:string|null)=>value?new Date(value).toLocaleString('ko-KR',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'시각 정보 없음';
const backupError=(e:unknown)=>typeof e==='object'&&e&&'message'in e?String(e.message):String(e);
function backupManagerHTML(){return `<section id="backup-manager" class="backup-manager" aria-labelledby="backup-heading">${backupManagerBody()}</section>`;}
function backupManagerBody(){
  const selectedBackup=backups.items.find(b=>b.id===backups.selected),info=backups.inspection;
  return `<div class="backup-heading"><h3 id="backup-heading">백업·복원</h3><button type="button" data-backup-action="create" ${!native||backups.busy||queue.busy||queue.failed?'disabled':''}>${backups.busy==='create'?'백업 중…':'지금 백업'}</button></div>${native?`<p class="backup-retention">자동 백업 · ${lastBackup?esc(backupDate(lastBackup)):'아직 없음'}</p>`:'<p class="backup-retention">데스크톱 앱에서 백업을 관리합니다.</p>'}
  ${backups.status?`<p class="backup-result ${backups.statusError?'error':''}" role="${backups.statusError?'alert':'status'}">${esc(backups.status)}</p>`:''}
  ${native?`${backups.loading?'<p class="backup-loading" role="status">백업 불러오는 중…</p>':''}${backups.error?`<div class="backup-list-error"><p class="error" role="alert">${esc(backups.error)}</p><button type="button" data-backup-action="retry-list" ${backups.loading?'disabled':''}>다시 불러오기</button></div>`:''}
  ${backups.items.length?`<ul class="backup-list" aria-label="보관된 백업" aria-busy="${backups.loading}">${backups.items.map(b=>`<li class="${b.error?'backup-damaged':''}"><button type="button" data-backup-id="${esc(b.id)}" aria-pressed="${b.id===backups.selected}" ${b.error||backups.busy||queue.failed?'disabled':''} ${b.error?`aria-describedby="backup-damage-${esc(b.id)}"`:''}><span class="backup-kind">${backupKind(b.kind)}</span><time ${b.created_at?`datetime="${esc(b.created_at)}"`:''}>${esc(backupDate(b.created_at))}</time><span class="backup-count">${b.tasks===null?'손상됨':`작업 ${b.tasks}건`}</span></button>${b.error?`<p id="backup-damage-${esc(b.id)}" class="backup-damage">복원할 수 없음 · ${esc(b.error)}</p>`:''}</li>`).join('')}</ul>`:backups.loaded&&!backups.error&&!backups.loading?'<p class="backup-empty">보관된 백업이 없습니다.</p>':''}
  ${selectedBackup&&!selectedBackup.error?`<section class="restore-review" aria-labelledby="restore-heading" aria-busy="${backups.inspecting}"><h4 id="restore-heading">${backupKind(selectedBackup.kind)} 백업</h4><p>${esc(backupDate(info?.created_at??selectedBackup.created_at))}</p>${backups.inspecting?'<p role="status">백업 확인 중…</p>':backups.inspectionError?`<p class="error" role="alert">${esc(backups.inspectionError)}</p><button type="button" data-backup-action="retry-inspect">다시 확인</button>`:info?`<dl><div><dt>전체 작업</dt><dd>${info.tasks}건</dd></div><div><dt>배치</dt><dd>${info.scheduled}건</dd></div><div><dt>완료</dt><dd>${info.completed}건</dd></div></dl><p class="restore-warning">현재 기록을 이 백업으로 교체합니다. 교체 전 기록은 ‘복원 전’ 백업으로 보존됩니다.</p><p id="restore-blocked" class="error" ${unsaved()&&!backups.busy?'':'hidden'}>작성 중인 내용을 저장하거나 되돌린 뒤 복원하세요.</p><div class="detail-actions"><button type="button" data-backup-action="cancel" ${backups.busy||queue.failed?'disabled':''}>취소</button><button type="button" data-backup-action="restore" class="primary" aria-describedby="restore-blocked" ${backups.busy||unsaved()||queue.failed?'disabled':''}>${backups.busy==='restore'?'복원 중…':'현재 기록을 교체하고 복원'}</button></div>`:''}</section>`:''}`:''}`;
}
function paintBackupManager(){
  const root=document.querySelector<HTMLElement>('#backup-manager');
  if(!root||!root.isConnected||view!=='settings')return;
  const focused=(document.activeElement as HTMLElement)?.closest<HTMLElement>('[data-backup-action],[data-backup-id]');
  const action=focused?.dataset.backupAction,id=focused?.dataset.backupId;
  const list=root.querySelector<HTMLElement>('.backup-list');if(list)backupListScroll=list.scrollTop;
  root.innerHTML=backupManagerBody();
  bindBackupScroll(root);
  if(action||id)Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(b=>action?b.dataset.backupAction===action:b.dataset.backupId===id)?.focus({preventScroll:true});
}
function bindBackupScroll(root:HTMLElement){const list=root.querySelector<HTMLElement>('.backup-list');if(list){list.scrollTop=backupListScroll;list.onscroll=()=>{backupListScroll=list.scrollTop;};}}
function updateBackupControls(){
  const root=document.querySelector('#backup-manager');if(!root)return;
  const create=root.querySelector<HTMLButtonElement>('[data-backup-action=create]');if(create)create.disabled=!native||!!backups.busy||queue.busy||!!queue.failed;
  const restore=root.querySelector<HTMLButtonElement>('[data-backup-action=restore]');if(restore)restore.disabled=!!backups.busy||unsaved()||!!queue.failed;
  root.querySelectorAll<HTMLButtonElement>('[data-backup-id]').forEach(button=>button.disabled=!!backups.busy||!!queue.failed||!!backups.items.find(b=>b.id===button.dataset.backupId)?.error);
  const cancel=root.querySelector<HTMLButtonElement>('[data-backup-action=cancel]');if(cancel)cancel.disabled=!!backups.busy||!!queue.failed;
  const blocked=root.querySelector<HTMLElement>('#restore-blocked');if(blocked)blocked.hidden=!unsaved()||!!backups.busy;
}
function backupReport(text:string,error=false){backups.status=text;backups.statusError=error;paintBackupManager();}
async function loadBackups(){
  if(!native)return;
  const sequence=++backupListSequence;backups.loading=true;backups.error='';paintBackupManager();
  try{
    const items=await invoke<ManagedBackup[]>('list_backups');if(sequence!==backupListSequence)return;
    backups.items=items;backups.loaded=true;
    if(backups.selected&&!items.some(b=>b.id===backups.selected&&!b.error)){backups.selected=null;backups.inspection=null;backups.inspectionError='';backups.inspecting=false;++backupInspectionSequence;}
  }catch(e){if(sequence===backupListSequence)backups.error=backupError(e);}
  finally{if(sequence===backupListSequence){backups.loading=false;paintBackupManager();}}
}
async function inspectBackup(id:string){
  const sequence=++backupInspectionSequence;backups.selected=id;backups.inspection=null;backups.inspectionError='';backups.inspecting=true;paintBackupManager();
  try{const info=await invoke<BackupInspection>('inspect_backup',{id});if(sequence===backupInspectionSequence&&backups.selected===id)backups.inspection=info;}
  catch(e){if(sequence===backupInspectionSequence&&backups.selected===id)backups.inspectionError=backupError(e);}
  finally{if(sequence===backupInspectionSequence&&backups.selected===id){backups.inspecting=false;paintBackupManager();}}
}
function bindBackupManager(){
  bindBackupScroll($('#backup-manager'));
  $('#backup-manager').onclick=e=>{
    const button=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||button.disabled||!native)return;
    const id=button.dataset.backupId,action=button.dataset.backupAction;
    if(id){if(!queue.failed)void inspectBackup(id);return;}
    if(action==='retry-list')void loadBackups();
    if(action==='retry-inspect'&&backups.selected)void inspectBackup(backups.selected);
    if(action==='cancel'&&!queue.failed){++backupInspectionSequence;backups.selected=null;backups.inspection=null;backups.inspecting=false;paintBackupManager();}
    if(action==='create')void createBackup();
    if(action==='restore')void restoreBackup();
  };
  if(native&&!backups.loading)void loadBackups();
}
async function createBackup(){
  if(backups.busy||queue.busy||queue.failed)return;
  await queue.add(async()=>{
    backups.busy='create';backupReport('');
    try{await invoke<ManagedBackup>('create_backup');backupReport('백업을 보관했습니다.');await loadBackups();}
    catch(e){backupReport(backupError(e),true);throw e;}
    finally{backups.busy=null;paintBackupManager();}
  }).catch(()=>{});
}
async function restoreBackup(){
  if(backups.busy||queue.failed||!backups.selected||!backups.inspection)return;
  if(unsaved()){backupReport('작성 중인 내용을 저장하거나 되돌린 뒤 복원하세요.',true);return;}
  const id=backups.selected,epoch=snapshot!.epoch;
  await queue.add(async()=>{
    backups.busy='restore';backupReport('');
    try{if(backups.selected!==id)throw Error('복원할 백업을 다시 확인하세요.');if(captureDraft.text||editorDirty||Object.keys(rawSchedules).length||settingsDraft||draftTimer)throw Error('작성 중인 내용을 저장하거나 되돌린 뒤 복원하세요.');snapshot=await invoke<Snapshot>('restore',{id,epoch});editor=null;backups.selected=null;backups.inspection=null;++backupInspectionSequence;backupReport('기록을 복원했습니다. 교체 전 기록도 백업에 보관했습니다.');await loadBackups();renderContent();}
    catch(e){backupReport(backupError(e),true);throw e;}
    finally{backups.busy=null;paintBackupManager();}
  }).catch(()=>{});
}

function settingsHTML(){return `<div class="settings-layout"><section class="panel" id="availability-settings">${availabilityHTML(settingsDraft??snapshot!.settings)}</section><section class="panel operations">${themePickerHTML(resolveTheme(document.documentElement.dataset.theme))}<hr><h2>빠른 캡처</h2><form id="shortcut-form"><label for="shortcut">단축키</label><div class="shortcut-control"><input id="shortcut" value="${esc(shortcut)}" readonly aria-label="빠른 캡처 단축키"><button type="submit">변경</button></div><p id="shortcut-result" role="status"></p></form><hr><h2>실행과 기록 보관</h2><label class="check-line"><input id="autostart" type="checkbox" ${autoStart?'checked':''} ${native?'':'disabled'}>Windows 로그인 시 자동실행</label><hr>${backupManagerHTML()}<details class="diagnostics"><summary>진단 정보</summary><label>저장소 위치<input readonly value="${esc(dbPath||'데스크톱 앱에서 확인')}" aria-label="저장소 위치"></label><p>시간별 24개 · 일별 30개 보관</p></details></section></div>`;}
function bindSchedule(root:HTMLElement,date:string|null){
  root.addEventListener('click',e=>{if((e.target as HTMLElement).closest('#select-exception-date')){view='plan';render();}});
  bindAvailability(root,settingsDraft??snapshot!.settings,snapshot!.tasks,date,{
    raw:rawSchedules[date??'weekly'],
    stash:raw=>{rawSchedules={...rawSchedules,[date??'weekly']:raw};draftChanged();},
    changed:value=>{settingsBase??={epoch:snapshot!.epoch,revision:snapshot!.settings.revision};settingsDraft=value;draftChanged();if(root.id==='calendar-availability-editor')queueMicrotask(renderContent);},
    reset:()=>{settingsDraft=null;settingsBase=null;rawSchedules={};persistDraft();renderContent();},
    save:(settings,move,done)=>{if(Object.entries(rawSchedules).some(([key,raw])=>raw.invalid&&key!==(date??'weekly'))){showError(Error('다른 날짜 또는 기본 일정에 입력 중인 시간이 있습니다. 먼저 수정하거나 설정에서 되돌리세요.'));done();return;}if(queue.failed){showError(Error('이전 저장 오류를 먼저 해결하세요.'));done();return;}const savedDraft=settingsDraft,savedRaw=rawSchedules;const base=settingsBase??{epoch:snapshot!.epoch,revision:snapshot!.settings.revision};void dispatch({type:'set_schedule',expected_revision:base.revision,days:settings.days,exceptions:settings.exceptions??[],weekly_target:settings.weekly_target??2400,work_days:settings.work_days??5,move_conflicts:move},base.epoch,undefined,()=>{if(settingsDraft===savedDraft){settingsDraft=null;settingsBase=null;if(rawSchedules===savedRaw)rawSchedules={};}else{settingsBase={epoch:snapshot!.epoch,revision:snapshot!.settings.revision};}persistDraft();if(root.id==='calendar-availability-editor')root.remove();}).finally(done);}
  });
}
function bindSettings(){
  bindSchedule($('#availability-settings'),null);
  document.querySelectorAll<HTMLInputElement>('input[name=theme]').forEach(input=>input.onchange=()=>{
    try{
      document.documentElement.dataset.theme=saveTheme(localStorage,input.value);
      $('#theme-result').textContent='';
      requestAnimationFrame(fitTimeline);
    }catch{
      syncTheme();
      $('#theme-result').textContent='테마를 저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 선택해 주세요.';
    }
  });
  const shortcutInput=$<HTMLInputElement>('#shortcut');
  shortcutInput.onkeydown=e=>{if(e.key==='Tab')return;e.preventDefault();const value=shortcutFromKey(e);if(value){shortcutInput.value=value;$('#shortcut-result').textContent='';}else if(!['Control','Alt','Shift','Meta'].includes(e.key))$('#shortcut-result').textContent='Ctrl 또는 Alt와 문자, 숫자, 기능 키를 함께 누르세요.';};
  $('#shortcut-form').onsubmit=async e=>{e.preventDefault();try{shortcut=native?await invoke<string>('capture_shortcut',{value:shortcutInput.value}):shortcutInput.value;$('#shortcut-result').textContent=native?'단축키를 변경했습니다.':'미리보기에서 변경됨';}catch(e){$('#shortcut-result').textContent=(e as AppError).message||String(e);}};
  $<HTMLInputElement>('#autostart').onchange=async e=>{try{autoStart=await invoke<boolean>('autostart',{enabled:(e.target as HTMLInputElement).checked});}catch(e){showError(e);$<HTMLInputElement>('#autostart').checked=autoStart;}};
  bindBackupManager();
}
async function start(){
  render();
  if(native){
    try{
      snapshot=await invoke<Snapshot>('load');const [sequence,content]=await invoke<[number,string]>('load_draft');draftSequence=sequence;
      if(content){const draft=JSON.parse(content);captureDraft.text=draft.capture||'';captureDraft.command=draft.captureCommand||null;calendarComposer=draft.calendarComposer||null;editor=draft.editor||null;editorDirty=!!editor;rawSchedules=draft.rawSchedules||{};settingsBase=draft.settingsBase||null;settingsDraft=draft.settingsDraft||null;message='';}
      ready=true;const info=await invoke<{db_path:string;warning:string|null;last_backup:string|null}>('diagnostics');dbPath=info.db_path;warning=info.warning||'';lastBackup=info.last_backup||'';
      autoStart=await invoke<boolean>('autostart',{enabled:null});shortcut=await invoke<string>('capture_shortcut',{value:null});
      await listen('data-changed',()=>{if(queue.busy)refreshNeeded=true;else void reload();});
      await listen('window-shown',()=>{syncTheme();if(captureWindow){void reload();$('#capture')?.focus();}else refreshCalendar(true);});
      if(captureWindow)await listen('capture-hide-request',hideCapture);
      await listen('quit-blocked',()=>{errorMessage='저장하지 않은 입력이 있어 종료하지 않았어요. 본 창과 캡처 창의 변경을 저장하거나 버려 주세요.';updateStatus();});
      await listen('backup-warning',async()=>{const info=await invoke<{warning:string|null;last_backup:string|null}>('diagnostics');warning=info.warning||'';lastBackup=info.last_backup||'';if(!Object.keys(rawSchedules).length&&!settingsDraft)renderContent();});
    }catch(e){loadError=(e as AppError).message||String(e);ready=false;}
  }else{
    const days=Array.from({length:7},(_,i)=>({enabled:i<5,start:540,end:1080,breaks:[{start:720,end:780,label:'점심'}]}));
    snapshot={epoch:'preview',settings:{revision:1,days},tasks:[
      {id:'sample-1',title:'설계 문서 자료 조사',body:'[x] 요구사항 확인\n[ ] 초안에 반영',starts_at:today()+'T09:30',duration:90,completed:true,revision:1},
      {id:'sample-2',title:'설계 문서 초안 작성',body:'진행 상황과 필요한 맥락을 이곳에 남깁니다.\n[ ] 계획 화면 정리\n[ ] 검토 의견 반영',starts_at:today()+'T13:00',duration:90,completed:false,revision:1},
      {id:'sample-3',title:'분리망 배포 의존성 검토',body:'',starts_at:today()+'T15:00',duration:60,completed:false,revision:1},
      {id:'sample-4',title:'회의록 템플릿 업데이트',body:'',starts_at:null,duration:30,completed:false,revision:1},
      {id:'sample-5',title:'SQLite 백업 방식 조사',body:'',starts_at:null,duration:30,completed:false,revision:1}
    ]};ready=true;
  }
  render();
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&captureWindow){e.preventDefault();e.stopImmediatePropagation();hideCapture();}},{capture:true});
  window.addEventListener('beforeunload',e=>{if(unsaved()){e.preventDefault();}});
  window.addEventListener('focus',()=>refreshCalendar(true));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshCalendar(true);});
  const tick=()=>{setTimeout(()=>{refreshCalendar();tick();},60_000-Date.now()%60_000);};tick();
  void document.fonts.ready.then(()=>fitTimeline());
  const content=document.querySelector('#content');if(content)new ResizeObserver(()=>fitTimeline()).observe(content);
  if(captureWindow)$('#capture').focus();
}
void start();
