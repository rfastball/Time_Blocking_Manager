import {useEffect,useState} from 'react';
import {rangeTitle} from '../../format.ts';
import {dateKey,dateLabel,dateOf,plusDays} from '../../dates.ts';
import {setNav,useApp,type View} from '../store/state.ts';
import {discardStoredDraft,release,reload,retry,queue} from '../store/session.ts';
import {openEditor} from '../store/editor.ts';
import {inboxTasks} from '../store/tasks.ts';
import {Icon,Logo} from '../ui/icons.tsx';
import {DragProvider} from '../space/drag.tsx';
import {Today} from '../today/Today.tsx';
import {Plan} from '../plan/Plan.tsx';
import {InboxPage} from '../inbox/InboxPage.tsx';
import {Settings} from '../settings/Settings.tsx';
import {AvailabilityPopover} from '../settings/AvailabilityPopover.tsx';
import {EditorHost,ContextMenuHost,SplitHost} from '../editor/hosts.tsx';
import {BackupManager} from '../backups/BackupManager.tsx';
import './shell.css';

const views:{id:View;label:string}[]=[{id:'today',label:'오늘'},{id:'plan',label:'계획'},{id:'inbox',label:'미계획'},{id:'settings',label:'설정'}];

export function Shell(){
  const s=useApp(),{nav,ready,snapshot,quitSaving}=s;
  const inboxCount=ready&&snapshot?inboxTasks().length:0;
  const go=(view:View)=>{
    if(view==='today')setNav({view,selected:s.today});
    else if(view==='plan')setNav({view,planAnchor:nav.selected});
    else setNav({view});
  };
  function step(direction:number){
    if(nav.view==='plan'&&nav.period==='month'){const d=dateOf(nav.planAnchor);d.setDate(1);d.setMonth(d.getMonth()+direction);const key=dateKey(d);setNav({selected:key,planAnchor:key});return;}
    const base=nav.view==='plan'?nav.planAnchor:nav.selected,key=plusDays(base,direction*(nav.view==='plan'?(nav.period==='day'?1:nav.period==='week'?7:14):1));
    setNav(nav.view==='plan'?{selected:key,planAnchor:key}:{selected:key});
  }
  const heading=nav.view==='settings'?'설정':nav.view==='inbox'?'미계획':nav.view==='plan'?rangeTitle(nav.period,nav.planAnchor):dateLabel(nav.selected);
  const unit=nav.view==='today'||nav.period==='day'?'날':nav.period==='month'?'달':nav.period==='two'?'2주':'주';
  return <DragProvider>
    <div className="app-shell" inert={quitSaving||undefined}>
      <nav className="rail-nav" aria-label="주 메뉴">
        <button type="button" className="brand" aria-label="BLOKKY 오늘로 이동" title="오늘로 이동" onClick={()=>setNav({view:'today',selected:s.today})}><Logo/></button>
        {views.map(v=><button key={v.id} type="button" className={'nav-button'+(nav.view===v.id?' active':'')} aria-current={nav.view===v.id?'page':undefined}
          aria-label={v.id==='inbox'&&inboxCount?`미계획 ${inboxCount}건`:v.label} onClick={()=>go(v.id)}><Icon name={v.id} size={20} stroke={1.7}/><span>{v.label}{v.id==='inbox'&&inboxCount?' '+inboxCount:''}</span></button>)}
      </nav>
      <main className="workspace">
        <header className="topbar">
          {(nav.view==='today'||nav.view==='plan')&&<div className="date-nav">
            <button type="button" className="ibtn" aria-label={'이전 '+unit} onClick={()=>step(-1)}><Icon name="left"/></button>
            <button type="button" className="ibtn" aria-label={'다음 '+unit} onClick={()=>step(1)}><Icon name="right"/></button>
            <button type="button" className="btn" disabled={nav.selected===s.today} onClick={()=>setNav({selected:s.today,planAnchor:s.today})}>오늘</button>
          </div>}
          <h1>{heading}</h1>
          {nav.view==='today'&&nav.selected===s.today&&<span className="pill">오늘</span>}
          {!s.native&&<span className="notice">미리보기 · 예시 데이터</span>}
          {s.native&&s.info.warning&&<span className="notice warning">{s.info.warning}</span>}
        </header>
        <div className="content" data-view={nav.view}>
          {!ready||!snapshot?<LoadState/>:!s.draftLoaded?<DraftState/>:nav.view==='today'?<Today/>:nav.view==='plan'?<Plan/>:nav.view==='inbox'?<InboxPage/>:<Settings/>}
        </div>
        <StatusBar/>
      </main>
    </div>
    {ready&&snapshot&&s.draftLoaded&&<><EditorHost/><ContextMenuHost/><SplitHost/><AvailabilityPopover/></>}
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
  const resume=s.drafts.editorDirty&&s.drafts.editor&&!s.ui.editorMode;
  if(!issue&&!state&&!resume)return null;
  return <footer className="status">
    <span className={issue&&!dialogOpen?'error':''} role={issue&&!dialogOpen?'alert':undefined}>{issue&&!dialogOpen?issue:state}</span>
    {s.failed&&!dialogOpen&&<><button type="button" className="btn" onClick={()=>void retry()}>{s.failed.code==='conflict'||s.failed.code==='epoch'?'저장된 내용 확인':'다시 시도'}</button><button type="button" className="btn" onClick={release}>입력 유지하고 수정</button></>}
    {s.ready&&!dialogOpen&&(s.draftLoadFailed||s.info.failed)&&<button type="button" className="btn" onClick={()=>{if(!queue.busy)void reload();}}>다시 불러오기</button>}
    {s.ready&&s.draftLoadFailed&&s.draftSequenceKnown&&!dialogOpen&&<button type="button" className="btn" onClick={()=>void discardStoredDraft()}>보관 초안 버리기</button>}
    {resume&&<button type="button" className="btn" onClick={()=>openEditor(s.drafts.editor!.id,'dialog')}>‘{s.drafts.editor!.title}’ 이어서 편집</button>}
  </footer>;
}
