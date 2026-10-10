import {invoke,isTauri} from '@tauri-apps/api/core';
import {useSyncExternalStore} from 'react';
import {SaveQueue} from '../queue.ts';
import {previewMutation} from '../preview.ts';
import {minutes,today} from '../dates.ts';
import type {Action,AppError,Snapshot,Task} from '../types.ts';

export const native=isTauri();
const params=new URLSearchParams(location.search);
// Preview answers after a short delay so motion is checked against a real round trip.
const latency=Number(params.get('latency')??120);

type State={snapshot:Snapshot|null;error:string;busy:boolean;failed:boolean;now:number};
const clock=()=>{const d=new Date();return d.getHours()*60+d.getMinutes();};
const mockNow=params.get('now');
let state:State={snapshot:null,error:'',busy:false,failed:false,now:mockNow&&/^\d\d:\d\d$/.test(mockNow)?minutes(mockNow):clock()};
const listeners=new Set<()=>void>();
function set(patch:Partial<State>){state={...state,...patch};listeners.forEach(l=>l());}
export function useStore(){return useSyncExternalStore(l=>{listeners.add(l);return()=>listeners.delete(l);},()=>state);}

const queue=new SaveQueue(()=>set({busy:queue.busy,failed:!!queue.failed}));
const occurrences=new Set<string>();
const messageOf=(e:unknown)=>(e as AppError)?.message||String(e);

// Every write goes through the one save lane. The screen changes only after the store answers.
export function dispatch(action:Action):Promise<boolean>{
  const snapshot=state.snapshot;
  if(!snapshot)return Promise.resolve(false);
  const command={request_id:crypto.randomUUID(),epoch:snapshot.epoch,action};
  return queue.add(async()=>{
    const result=native?await invoke<Snapshot>('mutate',{command}):await new Promise<Snapshot>((resolve,reject)=>setTimeout(()=>{try{resolve(previewMutation(state.snapshot!,command,occurrences));}catch(e){reject(e);}},latency));
    set({snapshot:result,error:''});
  }).then(()=>true,e=>{set({error:messageOf(e)});return false;});
}
export function retry(){set({error:''});queue.retry();}
export function discard(){set({error:''});queue.discardFailed();}
let manualNow=false;
export function setNow(minute:number){manualNow=true;set({now:minute});}

function sample():Snapshot{
  const day=today(),days=Array.from({length:7},()=>({enabled:true,start:540,end:1080,breaks:[{start:720,end:780,label:'점심'}]}));
  const flow=(id:string,title:string,duration:number,order:number,body='',completed=false):Task=>({id,title,body,starts_at:null,duration,completed,revision:1,plan_date:day,flow_order:order});
  const inbox=(id:string,title:string,duration:number):Task=>({id,title,body:'',starts_at:null,duration,completed:false,revision:1,plan_date:null,flow_order:null});
  return {epoch:'preview',layouts:[],settings:{revision:1,days},tasks:[
    flow('x','주간 일정 확인',15,0,'',true),
    flow('a','분기 보고서 초안',60,1,'3분기 매출 요약과 4분기 목표 정리\n지난주 리뷰 의견 반영'),
    flow('b','고객 문의 답변',45,2,'어제 접수된 문의 6건'),
    flow('c','회의록 정리',30,3),
    flow('d','예산안 검토',60,4,'재무팀 공유본 기준'),
    {id:'w',title:'디자인 워크숍',body:'3층 대회의실',starts_at:day+'T14:00',duration:60,completed:false,revision:1,plan_date:day,flow_order:null},
    flow('e','신규 입사자 교육 자료',90,5),
    flow('f','경쟁사 자료 조사',120,6),
    inbox('i1','디자인 리뷰 피드백',45),inbox('i2','출장 경비 정산',30),inbox('i3','채용 공고 문구 수정',60),inbox('i4','서버 점검 일정 확인',15)
  ]};
}

export async function load(){
  try{set({snapshot:native?await invoke<Snapshot>('load'):sample(),error:''});}
  catch(e){set({error:messageOf(e)});}
  if(!mockNow)setInterval(()=>{if(!manualNow)set({now:clock()});},30_000);
}
