import {useSyncExternalStore} from 'react';
import {isTauri} from '@tauri-apps/api/core';
import type {AppError,Command,Settings,Snapshot,Task} from '../../types.ts';
import type {AvailabilityTarget} from '../../availability-band.ts';
import {minutes,today} from '../../dates.ts';
import type {Seg} from '../../cut.ts';

// plan is the work screen (준비 dock beside the calendar), today the focus screen; settings opens from the gear.
export type View='today'|'plan'|'settings';
// The 준비 dock: a list beside the calendar, the full bench for shaping work, or folded to its counts.
export type Dock='narrow'|'wide'|'hidden';
// The 기다림 band at the right edge: open, or folded to its count. Like the dock, only its own control changes it.
export type Band='open'|'closed';
// 일 is one day's editor with its week as a strip above it, so it spans the same seven dates as 주.
export type Period='day'|'week'|'two'|'month';
// The task as typed in the editor. epoch/revision are the saved state it started from.
export type EditorDraft=Task&{epoch:string};
export type Composer={date:string;start:number;duration:number;fixed?:boolean};
// The cutting board in progress: the task it started from and the pieces as laid out so far.
export type CutDraft={taskId:string;epoch:string;revision:number;title:string;body:string;segs:Seg[]};
export type RoutineDraft={id:string;title:string;body:string;weekdays:number[];start:string;duration:string;epoch:string;revision:number};
// Raw schedule inputs kept while they are invalid, keyed by date or 'weekly'. `settings` is the last valid draft behind them.
export type RawSchedule={values:{value:string;checked:boolean}[];invalid:boolean;settings?:Settings};

export type Drafts={
  capture:string;captureCommand:Command|null;composer:Composer|null;
  editor:EditorDraft|null;editorDirty:boolean;editorSequence:number;pendingEditorId:string|null;
  rawSchedules:Record<string,RawSchedule>;settingsBase:{epoch:string;revision:number}|null;settingsDraft:Settings|null;routineDraft:RoutineDraft|null;
  cut:CutDraft|null;
};
// Cross-area UI requests: a block asks, the owning area draws.
export type Ui={
  editorMode:'panel'|'dialog'|null;editorFocus:'fix'|'duration'|null;
  // bench: opened on a 준비 card, which offers 준비's own menu.
  contextMenu:{taskId:string|null;date:string;minute:number;x:number;y:number;bench?:boolean}|null;
  availability:{date:string;target:AvailabilityTarget;x:number;y:number}|null;
  // The task the cutting board is open for (inline on 준비, a dialog elsewhere).
  split:string|null;
  pendingShortcut:string|null;
  landed:{id:string;clack:boolean}|null;
  // Blocks picked on 준비 (Shift/Ctrl+click); a drag of one of them carries them all.
  benchSelection:string[];
  // Work completed on 준비 this session, newest first, with where it stood (null: overdue work, which keeps its date).
  doneHere:{id:string;place:'inbox'|'shelf'|null;index:number}[];
  // Global search: the panel, and the block a chosen result points at while it is briefly ringed.
  search:boolean;found:{id:string;kind:'bench'|'dated'|'done'|'archive'|'trash'|'wait';at:number}|null;
  // The trigger field for blocks just pushed out (fresh) or whose trigger is being changed. `at`: where it floats when the band
  // does not show it (folded, or the focus screen), in viewport px.
  naming:{ids:string[];value:string;hi:number;fresh:boolean;at:{x:number;y:number}|null}|null;
  // Revived blocks are renamed to their next action in turn, in place: the one being named and the ones after it.
  renaming:{id:string;value:string;queue:string[]}|null;
  // The last push or revival, undoable for a few seconds.
  waitToast:{text:string;undo:()=>void;at:number}|null;
};
export type Info={dbPath:string;warning:string;lastBackup:string;autoStart:boolean;shortcut:string;exitOnClose:boolean;failed:boolean};
export type AppState={
  native:boolean;captureWindow:boolean;
  ready:boolean;loadError:string;snapshot:Snapshot|null;
  draftLoaded:boolean;draftLoadFailed:boolean;draftSequenceKnown:boolean;
  busy:boolean;failed:AppError|null;error:string;message:string;
  info:Info;
  now:number;today:string;
  nav:{view:View;selected:string;planAnchor:string;period:Period;dock:Dock;band:Band};
  drafts:Drafts;ui:Ui;
  quitSaving:boolean;draftPending:boolean;gesture:boolean;
  // Single-character shortcuts on this device.
  singleKeys:boolean;
};

const params=new URLSearchParams(location.search);
const native=isTauri();
// Development preview only: ?now=HH:MM pins the clock for repeatable checks.
const mockNow=!native&&import.meta.env.DEV?params.get('now'):null;
export const clockMinute=()=>{if(mockNow&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(mockNow))return minutes(mockNow);const d=new Date();return d.getHours()*60+d.getMinutes();};
export const pinnedClock=!!mockNow;

const day=today();
// The dock width is a device preference, like panel widths.
const storedDock=():Dock=>{try{const v=localStorage.getItem('blokky.dock');return v==='wide'||v==='hidden'?v:'narrow';}catch{return 'narrow';}};
const storedBand=():Band=>{try{return localStorage.getItem('blokky.band')==='closed'?'closed':'open';}catch{return 'open';}};
// Input the user has not committed yet: stored as a draft, and the reason to hold back reloads, generation and restores.
export const openDrafts=(d:Drafts)=>!!(d.capture||d.captureCommand||d.editorDirty||Object.keys(d.rawSchedules).length||d.settingsDraft||d.routineDraft||d.cut);
export const emptyDrafts=():Drafts=>({capture:'',captureCommand:null,composer:null,editor:null,editorDirty:false,editorSequence:0,pendingEditorId:null,rawSchedules:{},settingsBase:null,settingsDraft:null,routineDraft:null,cut:null});
let state:AppState={
  native,captureWindow:params.has('capture'),
  ready:false,loadError:'',snapshot:null,
  draftLoaded:!native,draftLoadFailed:false,draftSequenceKnown:false,
  busy:false,failed:null,error:'',message:'',
  info:{dbPath:'',warning:'',lastBackup:'',autoStart:false,shortcut:'Ctrl+Shift+Space',exitOnClose:false,failed:false},
  now:clockMinute(),today:day,
  nav:{view:'plan',selected:day,planAnchor:day,period:'week',dock:storedDock(),band:storedBand()},
  drafts:emptyDrafts(),
  ui:{editorMode:null,editorFocus:null,contextMenu:null,availability:null,split:null,pendingShortcut:null,landed:null,benchSelection:[],doneHere:[],search:false,found:null,naming:null,renaming:null,waitToast:null},
  quitSaving:false,draftPending:false,gesture:false,
  singleKeys:(()=>{try{return localStorage.getItem('blokky.single-keys')!=='off';}catch{return true;}})()
};
const listeners=new Set<()=>void>();
export const getState=()=>state;
export function setState(patch:Partial<AppState>|((s:AppState)=>Partial<AppState>)){
  state={...state,...(typeof patch==='function'?patch(state):patch)};
  listeners.forEach(l=>l());
}
export const setDrafts=(patch:Partial<Drafts>)=>setState(s=>({drafts:{...s.drafts,...patch}}));
export const setUi=(patch:Partial<Ui>)=>setState(s=>({ui:{...s.ui,...patch}}));
export const setNav=(patch:Partial<AppState['nav']>)=>{
  if(patch.dock)try{localStorage.setItem('blokky.dock',patch.dock);}catch{/* A storage restriction must not block the dock. */}
  if(patch.band)try{localStorage.setItem('blokky.band',patch.band);}catch{/* Unsaved, it still holds for this session. */}
  setState(s=>({nav:{...s.nav,...patch}}));
};
// 준비's bench is on screen: the work screen with the dock opened wide.
export const benchShown=(s:AppState)=>s.nav.view==='plan'&&s.nav.dock==='wide';
// Shape work: the work screen with the full bench. A jump here widens the dock for the session only; the stored width stays the person's.
export const openBench=()=>setState(s=>({nav:{...s.nav,view:'plan',dock:'wide'}}));
// Single-character shortcuts are a device preference too, and can be turned off (WCAG 2.1.4).
export function setSingleKeys(on:boolean){
  try{localStorage.setItem('blokky.single-keys',on?'on':'off');}catch{/* Unsaved, it still holds for this session. */}
  setState({singleKeys:on});
}
const subscribe=(l:()=>void)=>{listeners.add(l);return ()=>{listeners.delete(l);};};
// The whole state; its identity changes only when something changed.
export function useApp():AppState{return useSyncExternalStore(subscribe,getState);}
