import {useSyncExternalStore} from 'react';
import {isTauri} from '@tauri-apps/api/core';
import type {AppError,Command,Settings,Snapshot,Task} from '../../types.ts';
import type {AvailabilityTarget} from '../../availability-band.ts';
import {minutes,today} from '../../dates.ts';

export type View='today'|'plan'|'inbox'|'settings';
// 일 is one day's editor with its week as a strip above it, so it spans the same seven dates as 주.
export type Period='day'|'week'|'two'|'month';
// The task as typed in the editor. epoch/revision are the saved state it started from.
export type EditorDraft=Task&{epoch:string};
export type Composer={date:string;start:number;duration:number;fixed?:boolean};
export type RoutineDraft={id:string;title:string;body:string;weekdays:number[];start:string;duration:string;epoch:string;revision:number};
// Raw schedule inputs kept while they are invalid, keyed by date or 'weekly'. `settings` is the last valid draft behind them.
export type RawSchedule={values:{value:string;checked:boolean}[];invalid:boolean;settings?:Settings};

export type Drafts={
  capture:string;captureCommand:Command|null;composer:Composer|null;
  editor:EditorDraft|null;editorDirty:boolean;editorSequence:number;pendingEditorId:string|null;
  rawSchedules:Record<string,RawSchedule>;settingsBase:{epoch:string;revision:number}|null;settingsDraft:Settings|null;routineDraft:RoutineDraft|null;
};
// Cross-area UI requests: a block asks, the owning area draws.
export type Ui={
  editorMode:'panel'|'dialog'|null;editorFocus:'fix'|'duration'|null;
  contextMenu:{taskId:string|null;date:string;minute:number;x:number;y:number}|null;
  availability:{date:string;target:AvailabilityTarget;x:number;y:number}|null;
  split:string|null;
  pendingShortcut:string|null;
  landed:{id:string;clack:boolean}|null;
  // Blocks picked on the 미계획 bench (Shift/Ctrl+click, a pile handle); a drag of one of them carries them all.
  benchSelection:string[];
};
export type Info={dbPath:string;warning:string;lastBackup:string;autoStart:boolean;shortcut:string;exitOnClose:boolean;failed:boolean};
export type AppState={
  native:boolean;captureWindow:boolean;
  ready:boolean;loadError:string;snapshot:Snapshot|null;
  draftLoaded:boolean;draftLoadFailed:boolean;draftSequenceKnown:boolean;
  busy:boolean;failed:AppError|null;error:string;message:string;
  info:Info;
  now:number;today:string;
  nav:{view:View;selected:string;planAnchor:string;period:Period;inboxOpen:boolean};
  drafts:Drafts;ui:Ui;
  quitSaving:boolean;draftPending:boolean;gesture:boolean;
};

const params=new URLSearchParams(location.search);
const native=isTauri();
// Development preview only: ?now=HH:MM pins the clock for repeatable checks.
const mockNow=!native&&import.meta.env.DEV?params.get('now'):null;
export const clockMinute=()=>{if(mockNow&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(mockNow))return minutes(mockNow);const d=new Date();return d.getHours()*60+d.getMinutes();};
export const pinnedClock=!!mockNow;

const day=today();
export const emptyDrafts=():Drafts=>({capture:'',captureCommand:null,composer:null,editor:null,editorDirty:false,editorSequence:0,pendingEditorId:null,rawSchedules:{},settingsBase:null,settingsDraft:null,routineDraft:null});
let state:AppState={
  native,captureWindow:params.has('capture'),
  ready:false,loadError:'',snapshot:null,
  draftLoaded:!native,draftLoadFailed:false,draftSequenceKnown:false,
  busy:false,failed:null,error:'',message:'',
  info:{dbPath:'',warning:'',lastBackup:'',autoStart:false,shortcut:'Ctrl+Shift+Space',exitOnClose:false,failed:false},
  now:clockMinute(),today:day,
  nav:{view:'today',selected:day,planAnchor:day,period:'week',inboxOpen:true},
  drafts:emptyDrafts(),
  ui:{editorMode:null,editorFocus:null,contextMenu:null,availability:null,split:null,pendingShortcut:null,landed:null,benchSelection:[]},
  quitSaving:false,draftPending:false,gesture:false
};
const listeners=new Set<()=>void>();
export const getState=()=>state;
export function setState(patch:Partial<AppState>|((s:AppState)=>Partial<AppState>)){
  state={...state,...(typeof patch==='function'?patch(state):patch)};
  listeners.forEach(l=>l());
}
export const setDrafts=(patch:Partial<Drafts>)=>setState(s=>({drafts:{...s.drafts,...patch}}));
export const setUi=(patch:Partial<Ui>)=>setState(s=>({ui:{...s.ui,...patch}}));
export const setNav=(patch:Partial<AppState['nav']>)=>setState(s=>({nav:{...s.nav,...patch}}));
const subscribe=(l:()=>void)=>{listeners.add(l);return ()=>{listeners.delete(l);};};
// The whole state; its identity changes only when something changed.
export function useApp():AppState{return useSyncExternalStore(subscribe,getState);}
