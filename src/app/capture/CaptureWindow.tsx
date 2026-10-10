// Foundation placeholder for area D: the quick capture window (?capture).
import {captureEnterAction} from '../../capture.ts';
import {useApp} from '../store/state.ts';
import {editCapture,submitCapture} from '../store/tasks.ts';
import {hideCapture} from '../store/lifecycle.ts';

export function CaptureWindow(){
  const {drafts,ready,draftLoaded}=useApp();
  return <main className="capture-window">
    <label className="sr-only" htmlFor="capture">빠른 캡처</label>
    <textarea id="capture" rows={2} maxLength={650} placeholder="어떤 일을 해야 하나요?" disabled={!ready||!draftLoaded} value={drafts.capture}
      onChange={e=>editCapture(e.target.value)}
      onKeyDown={e=>{const action=captureEnterAction(e.nativeEvent);if(action==='compose')e.preventDefault();if(action==='submit'){e.preventDefault();void submitCapture();}}}/>
    <button type="button" onClick={()=>void hideCapture()}>닫기</button>
    <button type="button" disabled={!drafts.capture.trim()} onClick={()=>void submitCapture()}>저장</button>
  </main>;
}
