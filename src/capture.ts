import type {Action,AppError,Command} from './types';
import {startAt} from './dates.ts';

export const requestLifetimeMs=30*24*60*60*1000;
export const requestClockToleranceMs=5*60*1000;
export function createCommand(action:Action,epoch:string,issued_at=Date.now()):Command {
  return {request_id:crypto.randomUUID(),epoch,issued_at,action};
}
export function requestTimeIssue(command:Command,now=Date.now(),cutoff=0):AppError|null {
  if(now<=cutoff)return {code:'clock',message:'시스템 시각이 처리 기록 정리 시각보다 이전입니다. PC 시각을 확인하거나 백업에서 복원해 주세요.',retryable:false};
  const issued=command.issued_at;
  if(issued!==undefined&&Number.isSafeInteger(issued)&&issued>now+requestClockToleranceMs)return {code:'clock',message:'PC 시각이 저장 요청 시각보다 이전입니다. PC 시각을 확인한 뒤 다시 시도해 주세요. 입력은 유지됩니다.',retryable:false};
  return issued===undefined||!Number.isSafeInteger(issued)||issued<0||issued<=now-requestLifetimeMs||issued<=cutoff
    ?{code:'expired',message:'이전 저장 요청의 처리 기록을 확인할 수 없습니다. 입력은 유지됩니다. 저장된 내용을 확인해 주세요.',retryable:false}:null;
}
export function captureMatchesCommand(command:Command,text:string,composer:{date:string;start:number;duration:number;fixed?:boolean}|null=null){
  const a=command.action;
  if(!('title' in a)||a.title!==text.trim())return false;
  if(a.type==='create')return composer===null;
  if(!composer||a.type!=='create_flow'&&a.type!=='create_scheduled')return false;
  return composer.duration===a.duration&&(a.type==='create_flow'
    ?!composer.fixed&&composer.date===a.date
    :!!composer.fixed&&a.starts_at===startAt(composer.date,composer.start));
}
// Releasing one failed request must not erase a newer capture's identity.
export function releaseCaptureCommand(current:Command|null,failed:Command|null){
  return current&&failed&&current.request_id===failed.request_id&&current.epoch===failed.epoch?null:current;
}
export const needsSavedReview=(code:string|undefined)=>code==='conflict'||code==='epoch'||code==='expired';

export class CaptureDraft {
  text='';
  command:Command|null=null;
  edit(text:string){this.text=text;}
  acknowledge(command:Command){
    if(this.command!==command)return false;
    this.command=null;
    if(!captureMatchesCommand(command,this.text))return false;
    this.text='';
    return true;
  }
}

export function captureEnterAction(event:Pick<KeyboardEvent,'key'|'shiftKey'|'isComposing'|'keyCode'>){
  if(event.key!=='Enter')return null;
  if(isCompositionKey(event))return 'compose';
  return event.shiftKey?'newline':'submit';
}

export class StoredDraft {
  sequence=0;
  sequenceKnown=false;
  loaded=false;
  read(sequence:number,content:string){
    this.loaded=false;this.sequence=sequence;this.sequenceKnown=true;
    const draft=content?JSON.parse(content):null;this.loaded=true;return draft;
  }
  nextSequence(){
    if(!this.loaded)throw Error('초안을 불러온 뒤 입력해 주세요.');
    return ++this.sequence;
  }
  discardSequence(){
    if(!this.sequenceKnown)throw Error('초안 상태를 다시 불러와 주세요.');
    return ++this.sequence;
  }
}

export function isCompositionKey(event:Pick<KeyboardEvent,'isComposing'|'keyCode'>){
  return event.isComposing||event.keyCode===229;
}
