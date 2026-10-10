import {useState,useSyncExternalStore} from 'react';
import {resolveTheme,saveTheme,themes} from '../../theme.ts';
import {shortcutFromKey} from '../../settings.ts';
import {setUi,useApp} from '../store/state.ts';
import {setAutostart,setExitOnClose,setShortcut} from '../store/schedule.ts';
import {syncTheme} from '../store/lifecycle.ts';
import {BackupManager} from '../backups/BackupManager.tsx';
import {Rhythm} from './Rhythm.tsx';
import {Routines} from './Routines.tsx';
import './settings.css';

// 설정: work rules (rhythm, date changes, routines) beside device operations.
export function Settings(){
  return <div className="st-page">
    <section className="card st-rules" aria-label="근무 규칙"><Rhythm/><Routines/></section>
    <section className="card st-ops" aria-label="운영 설정">
      <ThemePicker/>
      <ShortcutField/>
      <Device/>
      <BackupManager/>
      <Diagnostics/>
    </section>
  </div>;
}

const watchTheme=(listener:()=>void)=>{const o=new MutationObserver(listener);o.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});return ()=>o.disconnect();};
const currentTheme=()=>resolveTheme(document.documentElement.dataset.theme);
function ThemePicker(){
  const theme=useSyncExternalStore(watchTheme,currentTheme),[error,setError]=useState('');
  function choose(value:string){
    try{document.documentElement.dataset.theme=saveTheme(localStorage,value);setError('');}
    catch{syncTheme();setError('테마를 저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 선택해 주세요.');}
  }
  return <fieldset className="st-themes">
    <legend>화면 테마</legend>
    <div className="st-theme-grid">{themes.map(t=><label key={t.id} className="st-theme">
      <input type="radio" name="theme" value={t.id} checked={theme===t.id} onChange={()=>choose(t.id)}/>
      <span className="st-preview" data-theme={t.id} aria-hidden="true">
        <span className="st-preview-rail"/>
        <span className="st-preview-page"><strong>오늘</strong><i className="p-flow"/><i className="p-next"/><i className="p-fixed"/><i className="p-now"/></span>
      </span>
      <span className="st-theme-name">{t.name}</span>
    </label>)}</div>
    {error&&<p className="error" role="alert">{error}</p>}
  </fieldset>;
}

function ShortcutField(){
  const {info,ui}=useApp(),[result,setResult]=useState<{ok:boolean;text:string}|null>(null),[saving,setSaving]=useState(false);
  const value=ui.pendingShortcut??info.shortcut,changed=!!ui.pendingShortcut&&ui.pendingShortcut!==info.shortcut;
  return <form className="st-shortcut" onSubmit={async e=>{e.preventDefault();setSaving(true);const r=await setShortcut(value);setSaving(false);setResult({ok:r.ok,text:r.message});}}>
    <h2>빠른 캡처</h2>
    <label htmlFor="shortcut">단축키</label>
    <div className="st-inline">
      <input id="shortcut" readOnly value={value} aria-invalid={result&&!result.ok||undefined} onKeyDown={e=>{
        if(e.key==='Tab')return;
        e.preventDefault();
        if(e.key==='Escape'){setUi({pendingShortcut:null});setResult(null);return;}
        const next=shortcutFromKey(e);
        if(next){setUi({pendingShortcut:next});setResult(null);}
        else if(!['Control','Alt','Shift','Meta'].includes(e.key))setResult({ok:false,text:'Ctrl 또는 Alt와 문자, 숫자, 기능 키를 함께 누르세요.'});
      }}/>
      <button type="submit" className="btn" disabled={!changed||saving}>변경</button>
    </div>
    {result&&<p className={result.ok?'st-note':'error'} role={result.ok?'status':'alert'}>{result.text}</p>}
  </form>;
}

function Device(){
  const {info,native}=useApp(),[locked,setLocked]=useState(false);
  // The checkbox shows the stored value; a failed change leaves it where it was.
  const change=async(run:Promise<void>)=>{setLocked(true);await run;setLocked(false);};
  return <div className="st-device">
    <h2>실행과 기록 보관</h2>
    <label className="st-check"><input id="autostart" type="checkbox" checked={info.autoStart} disabled={!native||locked} onChange={e=>void change(setAutostart(e.target.checked))}/>Windows 로그인 시 자동실행</label>
    <label className="st-check"><input id="exit-on-close" type="checkbox" checked={info.exitOnClose} disabled={!native||locked} onChange={e=>void change(setExitOnClose(e.target.checked))}/>창을 닫으면 앱 종료</label>
  </div>;
}

function Diagnostics(){
  const {info}=useApp();
  return <details className="st-diagnostics">
    <summary>진단 정보</summary>
    <label>저장소 위치<input readOnly value={info.dbPath||'데스크톱 앱에서 확인'}/></label>
    {info.lastBackup&&<p>마지막 자동 백업 {info.lastBackup}</p>}
    <p>시간별 24개 · 일별 30개 보관</p>
  </details>;
}
