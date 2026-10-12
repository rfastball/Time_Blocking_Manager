import {useEffect,useRef,useState} from 'react';
import {captureEnterAction,needsSavedReview} from '../../capture.ts';
import {useApp} from '../store/state.ts';
import {discardStoredDraft,release,reload,retry,queue} from '../store/session.ts';
import {editCapture,submitCapture} from '../store/tasks.ts';
import {hideCapture} from '../store/lifecycle.ts';
import {Logo} from '../ui/icons.tsx';
import './capture.css';

// The quick capture window (?capture): one translucent panel, input above and a hairline action bar below.
export function CaptureWindow(){
  const s=useApp(),{drafts,failed}=s;
  const input=useRef<HTMLTextAreaElement>(null);
  const [saving,setSaving]=useState(false);
  // The browser preview has no OS window to hide, so Esc hides the panel until the page is used again.
  const [hidden,setHidden]=useState(false),hiddenNow=useRef(false);
  const hide=(value:boolean)=>{hiddenNow.current=value;setHidden(value);};
  const locked=!s.ready||!s.draftLoaded||s.quitSaving;
  const canSave=!!(drafts.captureCommand||drafts.capture.trim())&&!locked&&!saving&&!failed;
  const focus=()=>{const el=input.current;if(el&&!el.disabled&&document.activeElement!==el)el.focus();};

  useEffect(()=>{if(!locked&&!saving)focus();},[locked,saving]);
  useEffect(()=>{
    const esc=(e:KeyboardEvent)=>{
      if(e.key!=='Escape'||e.isComposing)return;
      e.preventDefault();e.stopImmediatePropagation();
      void hideCapture();if(!s.native)hide(true);
    };
    // A shown window starts in the field unless the user already moved focus to a button.
    const shown=()=>{hide(false);requestAnimationFrame(()=>{if(!document.activeElement||document.activeElement===document.body)focus();});};
    const reveal=()=>{if(hiddenNow.current){hide(false);requestAnimationFrame(focus);}};
    document.addEventListener('keydown',esc,{capture:true});
    window.addEventListener('focus',shown);
    if(!s.native)document.addEventListener('pointerdown',reveal);
    return ()=>{document.removeEventListener('keydown',esc,{capture:true});window.removeEventListener('focus',shown);document.removeEventListener('pointerdown',reveal);};
  },[s.native]);

  async function save(){
    if(!canSave)return;
    setSaving(true);
    try{await submitCapture();}finally{setSaving(false);}
  }
  const conflict=needsSavedReview(failed?.code);
  const issue=s.loadError||s.error||(s.draftLoadFailed?'보관 중인 초안을 불러오지 못했습니다.':'')||(failed?'저장하지 못했어요. 입력한 내용은 그대로 있어요.':'');
  // Draft writes also use the lane while typing; only an explicit save reads as 저장 중.
  const state=!s.ready?'기록 불러오는 중…':!s.draftLoaded?'초안 불러오는 중…':saving?'저장 중…':s.quitSaving?'종료 전 저장 중…':'';
  const reloadable=!failed&&(!!s.loadError||s.draftLoadFailed);
  return <main className="capture-window" hidden={hidden}>
    <form id="capture-form" className="capture-form" onSubmit={e=>{e.preventDefault();void save();}}>
      <span className="capture-mark"><Logo/></span>
      <label className="sr-only" htmlFor="capture">빠른 캡처</label>
      <textarea ref={input} id="capture" rows={2} maxLength={650} autoComplete="off" placeholder="어떤 일을 해야 하나요?" disabled={locked||saving} value={drafts.capture}
        onChange={e=>editCapture(e.target.value)}
        onKeyDown={e=>{const action=captureEnterAction(e.nativeEvent);if(action==='compose')e.preventDefault();if(action==='submit'){e.preventDefault();void save();}}}/>
    </form>
    <div className="capture-bar">
      <div className="capture-status">
        {issue?<span className="error" role="alert">{issue}</span>:state&&<span role="status">{state}</span>}
        {failed&&<><button type="button" onClick={()=>void retry()}>{conflict?'저장된 내용 확인':'다시 시도'}</button><button type="button" onClick={()=>void release()}>입력 유지하고 수정</button></>}
        {reloadable&&<button type="button" onClick={()=>{if(!queue.busy)void reload();}}>다시 불러오기</button>}
        {s.ready&&s.draftLoadFailed&&s.draftSequenceKnown&&<button type="button" onClick={()=>void discardStoredDraft()}>보관 초안 버리기</button>}
      </div>
      <button type="button" className="capture-close" onClick={()=>{void hideCapture();if(!s.native)hide(true);}}>닫기</button>
      <button type="submit" form="capture-form" className="capture-save" disabled={!canSave}>저장</button>
    </div>
    <div className="sr-only" role="status" aria-live="polite">{s.message}</div>
  </main>;
}
