import type {Command} from './types';

export class CaptureDraft {
  text='';
  command:Command|null=null;
  edit(text:string){this.text=text;this.command=null;}
  acknowledge(command:Command){
    if(this.command!==command)return false;
    this.text='';this.command=null;
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
