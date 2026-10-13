import {useCallback,useEffect,useState} from 'react';
import {rangeTitle} from '../../format.ts';
import {needsSavedReview} from '../../capture.ts';
import {dateKey,dateLabel,dateOf,plusDays} from '../../dates.ts';
import {benchShown,setNav,useApp} from '../store/state.ts';
import {discardStoredDraft,release,reload,retry,queue} from '../store/session.ts';
import {openEditor} from '../store/editor.ts';
import {Icon,Logo} from '../ui/icons.tsx';
import {DragProvider} from '../space/drag.tsx';
import {Today} from '../today/Today.tsx';
import {Periods,Plan} from '../plan/Plan.tsx';
import {Dock} from '../dock/Dock.tsx';
import {KeyList,useShortcuts} from './keys.tsx';
import {Settings} from '../settings/Settings.tsx';
import {AvailabilityPopover} from '../settings/AvailabilityPopover.tsx';
import {EditorHost,ContextMenuHost} from '../editor/hosts.tsx';
import {CutHost} from '../cut/CutBoard.tsx';
import {SearchHost,openSearch} from '../search/Search.tsx';
import {openCut} from '../store/cut.ts';
import {BackupManager} from '../backups/BackupManager.tsx';
import './shell.css';

export function Shell(){
  const s=useApp(),{nav,ready,snapshot,quitSaving,ui,drafts}=s;
  const work=nav.view==='plan',focus=nav.view==='today';
  const toWork=()=>setNav({view:'plan',planAnchor:nav.selected});
  const toFocus=()=>setNav({view:'today',selected:s.today});
  function step(direction:number){
    if(work&&nav.period==='month'){const d=dateOf(nav.planAnchor);d.setDate(1);d.setMonth(d.getMonth()+direction);const key=dateKey(d);setNav({selected:key,planAnchor:key});return;}
    const base=work?nav.planAnchor:nav.selected,key=plusDays(base,direction*(work?(nav.period==='day'?1:nav.period==='week'?7:14):1));
    setNav(work?{selected:key,planAnchor:key}:{selected:key});
  }
  const heading=nav.view==='settings'?'설정':work?rangeTitle(nav.period,nav.planAnchor):dateLabel(nav.selected);
  const unit=focus||nav.period==='day'?'날':nav.period==='month'?'달':nav.period==='two'?'2주':'주';
  // The cutting board opened on the bench holds the calendar still, as the old date columns were.
  const cutting=!!(ui.split&&drafts.cut&&benchShown(s));
  const [keys,setKeys]=useState(false),openKeys=useCallback(()=>setKeys(true),[]);
  useShortcuts(openKeys);
  return <DragProvider>
    <div className="app-shell" inert={quitSaving||undefined}>
      <div className="workspace">
        <header className="topbar">
          <button type="button" className="brand" aria-label="BLOKKY 오늘로 이동" title="오늘로 이동" onClick={()=>setNav({view:focus?'today':'plan',selected:s.today,planAnchor:s.today})}><Logo/></button>
          {/* The way between the two screens comes first, where the eye lands. The settings way back is its own button,
              so returning leaves the keyboard on the gear rather than on 몰입. */}
          {work?<button key="screen" type="button" className="btn primary to-screen" aria-keyshortcuts={s.singleKeys?'F':undefined} onClick={toFocus}><Icon name="focus" size={16}/>몰입</button>
            :focus?<button key="screen" type="button" className="btn to-screen" aria-keyshortcuts={s.singleKeys?'F Escape':'Escape'} onClick={toWork}>작업 화면</button>
            :<button key="back" type="button" className="btn to-screen" aria-keyshortcuts="Escape" onClick={()=>{toWork();requestAnimationFrame(()=>document.querySelector<HTMLElement>('header.topbar [aria-label="설정"]')?.focus({preventScroll:true}));}}>작업 화면</button>}
          {(work||focus)&&<div className="date-nav">
            <button type="button" className="ibtn" aria-label={'이전 '+unit} onClick={()=>step(-1)}><Icon name="left"/></button>
            <button type="button" className="ibtn" aria-label={'다음 '+unit} onClick={()=>step(1)}><Icon name="right"/></button>
            <button type="button" className="btn" disabled={nav.selected===s.today} aria-keyshortcuts={s.singleKeys?'T':undefined} onClick={()=>setNav({selected:s.today,planAnchor:s.today})}>오늘</button>
          </div>}
          <h1>{heading}</h1>
          {focus&&nav.selected===s.today&&<span className="pill">오늘</span>}
          {work&&<Periods value={nav.period} keys={s.singleKeys}/>}
          {/* One group, so when the bar wraps the tools move together and stay right. */}
          <div className="bar-end">
            {!s.native&&<span className="notice">미리보기 · 예시 데이터</span>}
            {s.native&&s.info.warning&&<span className="notice warning">{s.info.warning}</span>}
            {/* Search finds work everywhere, so it sits with the tools rather than in any one place. */}
            <button type="button" className="btn search-open" aria-label="검색" aria-keyshortcuts="Control+K" aria-expanded={ui.search} onClick={openSearch}><Icon name="search" size={16}/><span className="label">검색</span><kbd>Ctrl K</kbd></button>
            <button type="button" className="ibtn" aria-label="단축키" aria-keyshortcuts={s.singleKeys?'?':undefined} aria-haspopup="dialog" onClick={openKeys}>?</button>
            <button type="button" className={'ibtn'+(nav.view==='settings'?' on':'')} aria-label="설정" aria-pressed={nav.view==='settings'} onClick={()=>nav.view==='settings'?toWork():setNav({view:'settings'})}><Icon name="settings" size={18}/></button>
          </div>
        </header>
        <main className="content" data-view={nav.view}>
          {!ready||!snapshot?<LoadState/>:!s.draftLoaded?<DraftState/>:focus?<Today/>:work?<div className={'work-screen'+(cutting?' cutting':'')}><Dock/><div className="plan-wrap" inert={cutting||undefined}><Plan/></div></div>:<Settings/>}
        </main>
        <StatusBar/>
      </div>
    </div>
    {ready&&snapshot&&s.draftLoaded&&<><EditorHost/><ContextMenuHost/><CutHost/><AvailabilityPopover/><SearchHost/></>}
    {keys&&<KeyList onClose={()=>setKeys(false)}/>}
    <div className="sr-only" role="status" aria-live="polite">{s.message}</div>
  </DragProvider>;
}

function LoadState(){
  const {loadError,native}=useApp();
  return <section className="load-state">
    <h2>{loadError?'저장소를 열지 못했습니다':'로컬 기록을 불러오는 중입니다'}</h2>
    <p role={loadError?'alert':undefined}>{loadError||'기록을 불러오는 중이에요. 잠시 후 편집할 수 있어요.'}</p>
    {loadError&&<button type="button" className="btn" onClick={()=>{if(!queue.busy)void reload();}}>다시 불러오기</button>}
    {native&&loadError&&<section className="card"><BackupManager recovery/></section>}
  </section>;
}
function DraftState(){
  const {draftLoadFailed}=useApp();
  return <section className="load-state"><h2>{draftLoadFailed?'초안을 불러오지 못했습니다':'초안 불러오는 중'}</h2><p role={draftLoadFailed?'alert':undefined}>저장된 작업은 그대로입니다.</p></section>;
}

// True once `on` has held for `ms`. A save that answers at once never flashes a status line.
function useLasting(on:boolean,ms:number){
  const [lasting,setLasting]=useState(false);
  useEffect(()=>{if(!on){setLasting(false);return;}const t=setTimeout(()=>setLasting(true),ms);return()=>clearTimeout(t);},[on,ms]);
  return on&&lasting;
}

// Shows only what needs attention: loading, saving, a failure with its recovery, or an unfinished edit.
function StatusBar(){
  const s=useApp(),dialogOpen=s.ui.editorMode==='dialog',saving=useLasting(s.busy,400);
  const issue=s.error||(s.draftLoadFailed?'보관 중인 초안을 불러오지 못했습니다. 저장된 작업은 그대로입니다.':'')||(s.info.failed?'일부 운영 설정을 불러오지 못했습니다. 다시 불러와 주세요.':'')||(s.failed?'저장하지 못했어요. 입력한 내용은 그대로 있어요.':'');
  const state=!s.ready?'기록 불러오는 중 · 편집 잠시 중지':!s.draftLoaded?'초안 불러오는 중 · 편집 잠시 중지':saving?'저장 중…':s.quitSaving?'종료 전 저장 중…':'';
  const resume=s.drafts.editorDirty&&s.drafts.editor&&!s.ui.editorMode,cutting=s.drafts.cut&&!s.ui.split?s.snapshot?.tasks.find(t=>t.id===s.drafts.cut!.taskId):null;
  if(!issue&&!state&&!resume&&!cutting)return null;
  return <footer className="status">
    <span className={issue&&!dialogOpen?'error':''} role={issue&&!dialogOpen?'alert':undefined}>{issue&&!dialogOpen?issue:state}</span>
    {s.failed&&!dialogOpen&&<><button type="button" className="btn" onClick={()=>void retry()}>{needsSavedReview(s.failed.code)?'저장된 내용 확인':'다시 시도'}</button><button type="button" className="btn" onClick={()=>void release()}>입력 유지하고 수정</button></>}
    {s.ready&&!dialogOpen&&(s.draftLoadFailed||s.info.failed)&&<button type="button" className="btn" onClick={()=>{if(!queue.busy)void reload();}}>다시 불러오기</button>}
    {s.ready&&s.draftLoadFailed&&s.draftSequenceKnown&&!dialogOpen&&<button type="button" className="btn" onClick={()=>void discardStoredDraft()}>보관 초안 버리기</button>}
    {resume&&<button type="button" className="btn" onClick={()=>openEditor(s.drafts.editor!.id,'dialog')}>‘{s.drafts.editor!.title}’ 이어서 편집</button>}
    {cutting&&<button type="button" className="btn" onClick={()=>openCut(cutting.id)}>‘{cutting.title}’ 이어서 쪼개기</button>}
  </footer>;
}
