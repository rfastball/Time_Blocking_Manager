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
  if(event.isComposing||event.keyCode===229)return 'compose';
  return event.shiftKey?'newline':'submit';
}
