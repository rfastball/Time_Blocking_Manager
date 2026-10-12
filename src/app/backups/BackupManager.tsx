import {useCallback,useEffect,useId,useLayoutEffect,useRef,type RefObject} from 'react';
import {backupCount,backupDate,backupKind} from '../../backup-format.ts';
import {useApp} from '../store/state.ts';
import {unsaved} from '../store/session.ts';
import {cancelReview,createBackup,getBackups,inspectBackup,loadBackups,rememberScroll,restoreBackup,setOpen,useBackups} from './backups.ts';
import './backups.css';

// Managed backups in settings, and the recovery list when the store failed to load (open by default there).
export function BackupManager({recovery=false}:{recovery?:boolean}){
  const s=useApp(),b=useBackups(),uid=useId();
  const root=useRef<HTMLDetailsElement>(null),summary=useRef<HTMLElement>(null);
  const open=recovery?b.recoveryOpen:b.open;
  useEffect(()=>{if(s.native)void loadBackups();},[s.native]);
  const list=useCallback((el:HTMLUListElement|null)=>{if(el)el.scrollTop=getBackups().scroll;},[]);
  useKeptFocus(root);
  const seen=useRef(b.focusSummary);
  useEffect(()=>{if(b.focusSummary!==seen.current){seen.current=b.focusSummary;summary.current?.focus({preventScroll:true});}},[b.focusSummary]);

  const failed=!!s.failed,blocked=unsaved()&&!b.busy;
  const chosen=b.items.find(x=>x.id===b.selected&&!x.error),info=b.inspection;
  return <details ref={root} className="backups" open={open} onToggle={e=>setOpen(recovery,e.currentTarget.open)}>
    <summary ref={summary}>백업·복원</summary>
    {!s.native?<p className="backups-note">데스크톱 앱에서 백업을 관리합니다.</p>:<div className="backups-body">
      <div className="backups-top">
        <p className="backups-note">자동 백업 · {s.info.lastBackup?<time dateTime={s.info.lastBackup}>{backupDate(s.info.lastBackup)}</time>:'아직 없음'}</p>
        <button type="button" className="btn" data-key="create" disabled={!s.ready||!!b.busy||s.busy||failed} onClick={()=>void createBackup()}>{b.busy==='create'?'백업 중…':'지금 백업'}</button>
      </div>
      {b.status&&<p className={'backups-status'+(b.statusError?' error':'')} role={b.statusError?'alert':'status'}>{b.status}</p>}
      {b.loading&&!b.items.length&&<p className="backups-note" role="status">백업 불러오는 중…</p>}
      {b.error&&<div className="backups-error"><p className="error" role="alert">{b.error}</p><button type="button" className="btn" data-key="retry-list" disabled={b.loading} onClick={()=>void loadBackups()}>다시 불러오기</button></div>}
      {b.items.length>0?<ul ref={list} className="backups-list" aria-label="보관된 백업" aria-busy={b.loading} onScroll={e=>rememberScroll(e.currentTarget.scrollTop)}>
        {b.items.map((x,i)=><li key={x.id} className={x.error?'damaged':undefined}>
          <button type="button" data-key={'item:'+x.id} aria-pressed={x.id===b.selected} disabled={!!x.error||!!b.busy||failed} aria-describedby={x.error?`${uid}-d${i}`:undefined} onClick={()=>void inspectBackup(x.id)}>
            <span className="backups-kind">{backupKind(x.kind)}</span><time dateTime={x.created_at??undefined}>{backupDate(x.created_at)}</time><span className="backups-count">{backupCount(x)}</span>
          </button>
          {x.error&&<p id={`${uid}-d${i}`} className="backups-damage">복원할 수 없음 · {x.error}</p>}
        </li>)}
      </ul>:b.loaded&&!b.loading&&!b.error&&<p className="backups-note">보관된 백업이 없습니다.</p>}
      {chosen&&<section className="restore-review" aria-labelledby={uid+'-h'} aria-busy={b.inspecting}>
        <h3 id={uid+'-h'}>{backupKind(chosen.kind)} 백업 <time dateTime={(info?.created_at??chosen.created_at)??undefined}>{backupDate(info?.created_at??chosen.created_at)}</time></h3>
        {b.inspecting?<p className="backups-note" role="status">백업 확인 중…</p>
        :b.inspectionError?<div className="backups-error"><p className="error" role="alert">{b.inspectionError}</p><button type="button" className="btn" data-key="retry-inspect" onClick={()=>void inspectBackup(chosen.id)}>다시 확인</button></div>
        :info&&<>
          <dl><div><dt>전체</dt><dd>{info.tasks}건</dd></div><div><dt>배치</dt><dd>{info.scheduled}건</dd></div><div><dt>완료</dt><dd>{info.completed}건</dd></div></dl>
          <p className="restore-warning">{s.ready?'현재 기록을 이 백업으로 교체합니다. 교체 전 기록은 ‘복원 전’ 백업으로 보존됩니다.':'현재 손상 기록은 복구 자료로 보존하고, 이 백업으로 교체합니다.'}</p>
          {blocked&&<p id="restore-blocked" className="error">작성 중인 내용을 저장하거나 되돌린 뒤 복원하세요.</p>}
        </>}
        <div className="restore-actions">
          <button type="button" className="btn" data-key="cancel" disabled={!!b.busy||failed} onClick={cancelReview}>취소</button>
          {info&&!b.inspecting&&!b.inspectionError&&<button type="button" className="btn primary" data-key="restore" aria-describedby={blocked?'restore-blocked':undefined} disabled={!!b.busy||unsaved()||failed} onClick={()=>void restoreBackup()}>{b.busy==='restore'?'복원 중…':'현재 기록을 교체하고 복원'}</button>}
        </div>
      </section>}
    </div>}
  </details>;
}

// Buttons here are disabled while a backup or save runs, which drops their focus; it returns once they are usable,
// unless the user has meanwhile moved elsewhere.
function useKeptFocus(root:RefObject<HTMLElement|null>){
  const last=useRef<string|null>(null);
  useEffect(()=>{
    const away=(e:Event)=>{if(!root.current?.contains(e.target as Node))last.current=null;};
    const track=(e:FocusEvent)=>{const key=(e.target as HTMLElement).closest?.<HTMLElement>('[data-key]')?.dataset.key;if(root.current?.contains(e.target as Node))last.current=key??null;else last.current=null;};
    document.addEventListener('pointerdown',away,true);document.addEventListener('focusin',track);
    return ()=>{document.removeEventListener('pointerdown',away,true);document.removeEventListener('focusin',track);};
  },[root]);
  useLayoutEffect(()=>{
    const key=last.current,active=document.activeElement;
    if(!key||!root.current||(active&&active!==document.body&&!(active instanceof HTMLButtonElement&&active.disabled)))return;
    const target=[...root.current.querySelectorAll<HTMLButtonElement>('[data-key]')].find(el=>el.dataset.key===key);
    if(target&&!target.disabled)target.focus({preventScroll:true});
  });
}
