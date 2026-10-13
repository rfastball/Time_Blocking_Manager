import {useState,type FormEvent} from 'react';
import {weekdays} from '../../settings.ts';
import {rhythmTotal,withoutException} from '../../availability-edit.ts';
import {formatDuration} from '../../format.ts';
import {dateLabel,time} from '../../dates.ts';
import {getState,setNav,useApp} from '../store/state.ts';
import {ask} from '../store/session.ts';
import {resetSettingsDraft,saveSchedule,setSettingsDraft,stashRawSchedule} from '../store/schedule.ts';
import {BandEditor} from './BandEditor.tsx';
import {publishWeekly,weeklyDraft,weeklyProblem} from './drafts.ts';

const kindLabel={custom:'시간 변경',early:'조퇴',leave:'휴가'};
// A date's own hours are changed in its column on the work screen; the keyboard lands on that date's head.
function pickOnPlan(date:string){
  setNav({view:'plan',planAnchor:date});
  let frames=0;
  const look=()=>{const head=document.querySelector<HTMLElement>(`.wk-head[data-date="${date}"] .wk-date,.cal-cell[data-date="${date}"] .cal-date`);if(head)head.focus();else if(++frames<30)requestAnimationFrame(look);};
  requestAnimationFrame(look);
}

// 한 주의 근무 리듬: targets, the weekday band editor, date exceptions and the save bar.
export function Rhythm(){
  const s=useApp(),{draft,hours,count}=weeklyDraft(s);
  const [error,setError]=useState(''),[saving,setSaving]=useState(false);
  const problem=weeklyProblem(draft,hours,count),total=rhythmTotal(draft.days);
  const dirty=!!s.drafts.settingsDraft||!!s.drafts.rawSchedules.weekly;
  const exceptions=[...(draft.exceptions??[])].sort((a,b)=>a.date.localeCompare(b.date));

  async function save(e:FormEvent){
    e.preventDefault();
    const now=weeklyDraft(),issue=weeklyProblem(now.draft,now.hours,now.count);
    if(issue){setError(issue);return;}
    setSaving(true);
    const ok=await saveSchedule(now.draft,'weekly');
    setSaving(false);setError(ok?'':getState().error||'저장하지 못했습니다. 다시 시도해 주세요.');
  }
  async function revert(){if(await ask('저장하지 않은 근무시간 변경을 버릴까요?')){resetSettingsDraft();setError('');}}
  function restore(date:string){setSettingsDraft(withoutException(weeklyDraft().draft,date));stashRawSchedule(date,null);}

  return <form className="st-rhythm" aria-labelledby="rhythm-heading" onSubmit={e=>void save(e)} inert={saving||undefined}>
    <h2 id="rhythm-heading">한 주의 근무 리듬</h2>
    <div className="st-targets">
      <label>주간 목표 <input id="weekly-target" type="number" min={.25} max={168} step={.25} value={hours} required onChange={e=>{setError('');publishWeekly(weeklyDraft().draft.days,e.target.value,weeklyDraft().count);}}/> 시간</label>
      <label>근무일 <input id="work-days" type="number" min={1} max={7} value={count} required onChange={e=>{setError('');publishWeekly(weeklyDraft().draft.days,weeklyDraft().hours,e.target.value);}}/> 일</label>
      <output aria-label="반복 일정 합계">반복 일정 {formatDuration(total.minutes)} · {total.days}일</output>
    </div>
    <BandEditor days={draft.days} names={weekdays} short={weekdays.map(w=>w.slice(0,1))}
      onChange={(i,day)=>{const now=weeklyDraft();publishWeekly(now.draft.days.map((d,j)=>j===i?day:d),now.hours,now.count);}} onError={setError}/>
    <section className="st-exceptions" aria-labelledby="exceptions-heading">
      <div className="st-row"><h3 id="exceptions-heading">날짜별 변경</h3><button type="button" className="btn text" onClick={()=>pickOnPlan(s.nav.selected)}>작업 화면에서 선택</button></div>
      {exceptions.length>0&&<ul>{exceptions.map(x=><li key={x.date}>
        <span><strong>{dateLabel(x.date)}</strong> {kindLabel[x.kind]}{x.day.enabled&&x.kind!=='leave'?` · ${time(x.day.start)}–${time(x.day.end)}`:''}</span>
        <button type="button" className="btn" onClick={()=>restore(x.date)}>반복 일정으로 복원</button>
      </li>)}</ul>}
    </section>
    {/* Errors travel with the save buttons so they are in view whenever saving is possible. */}
    <div className={'st-savebar'+(dirty?' st-dirty':'')}>
      {(error||problem)&&<p className="error st-error" role="alert">{error||problem}</p>}
      <div className="st-savebar-row">
        <span>{saving?'저장 중…':dirty?'저장하지 않은 변경':''}</span>
        <button type="button" className="btn" disabled={!dirty} onClick={()=>void revert()}>되돌리기</button>
        <button type="submit" className="btn primary" disabled={!dirty||s.busy}>저장</button>
      </div>
    </div>
  </form>;
}
