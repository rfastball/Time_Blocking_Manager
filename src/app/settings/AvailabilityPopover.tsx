import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {motion} from 'motion/react';
import {effectiveDay} from '../../settings.ts';
import {missingBreakName,withoutException} from '../../availability-edit.ts';
import type {AvailabilityTarget} from '../../availability-band.ts';
import {dateLabel} from '../../dates.ts';
import type {DayException} from '../../types.ts';
import {getState,setUi,useApp} from '../store/state.ts';
import {saveSchedule,setSettingsDraft,stashRawSchedule} from '../store/schedule.ts';
import {Icon} from '../ui/icons.tsx';
import {BandEditor} from './BandEditor.tsx';
import {dateDraft,publishDate} from './drafts.ts';
import './settings.css';
import {clamp,useDismiss} from '../ui/dismiss.ts';

// One date's working time, opened from the off-hours and break bands of a day space.
export function AvailabilityPopover(){
  const {ui}=useApp(),a=ui.availability;
  if(!a)return null;
  return <DatePopover key={`${a.date}:${a.target}:${a.x}:${a.y}`} date={a.date} target={a.target} x={a.x} y={a.y}/>;
}

function DatePopover({date,target,x,y}:{date:string;target:AvailabilityTarget;x:number;y:number}){
  const s=useApp(),{draft,kind}=dateDraft(date,s),day=effectiveDay(draft,date),exception=draft.exceptions?.find(e=>e.date===date);
  const ref=useRef<HTMLElement>(null),opener=useRef(document.activeElement as HTMLElement|null),heading=useId();
  const [pos,setPos]=useState({left:x,top:y}),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  const initial=target==='work'||day.breaks[target]?target:'work';

  const close=(refocus:boolean)=>{setUi({availability:null});if(refocus&&opener.current?.isConnected)opener.current.focus({preventScroll:true});};
  useLayoutEffect(()=>{
    const r=ref.current!.getBoundingClientRect();
    setPos(clamp(x,y,r.width,r.height));
  },[x,y]);
  useDismiss(t=>!!ref.current?.contains(t)||!!t.closest('.rh-menu'),()=>close(false));
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!e.defaultPrevented){e.preventDefault();close(true);}};
    document.addEventListener('keydown',key);
    return ()=>document.removeEventListener('keydown',key);
  },[]);

  async function store(settings:typeof draft){
    setSaving(true);
    const ok=await saveSchedule(settings,date);
    setSaving(false);
    if(ok)close(true);else setError(getState().error||'저장하지 못했습니다. 다시 시도해 주세요.');
  }
  function apply(){
    const now=dateDraft(date),d=getState().drafts;
    if(!d.settingsDraft&&!d.rawSchedules[date]){close(true);return;}
    if(missingBreakName([effectiveDay(now.draft,date)])){setError('휴식 이름을 입력하세요.');return;}
    void store(now.draft);
  }
  function restore(){
    const next=withoutException(dateDraft(date).draft,date);
    setSettingsDraft(next);stashRawSchedule(date,null);setError('');
    void store(next);
  }
  function changeKind(next:DayException['kind']){setError('');publishDate(date,next,next==='leave'?day:{...day,enabled:true});}

  const problem=kind!=='leave'&&missingBreakName([day])?'휴식 이름을 입력하세요.':'';
  return <motion.section ref={ref} className="ap" role="dialog" aria-labelledby={heading} style={pos} inert={saving||undefined}
    initial={{opacity:0,y:-6,scale:.98}} animate={{opacity:1,y:0,scale:1}} transition={{type:'spring',visualDuration:.22,bounce:.2}}>
    <header className="ap-head">
      <h2 id={heading}>{dateLabel(date)}</h2>
      <button type="button" className="ibtn" aria-label="시간 조정 닫기" onClick={()=>close(true)}><Icon name="close"/></button>
    </header>
    <label className="ap-kind">변경 종류
      <select value={kind} onChange={e=>changeKind(e.target.value as DayException['kind'])}>
        <option value="custom">시간 변경</option><option value="early">조퇴</option><option value="leave">휴가</option>
      </select>
    </label>
    {kind!=='leave'&&<BandEditor compact days={[day]} names={['이 날짜']} initial={{day:0,target:initial}} autoFocus
      onChange={(_,next)=>{setError('');publishDate(date,dateDraft(date).kind,next);}} onError={setError}/>}
    {(error||problem)&&<p className="error st-error" role="alert">{error||problem}</p>}
    <div className="ap-actions">
      {exception&&<button type="button" className="btn" onClick={restore}>반복 일정으로 복원</button>}
      <button type="button" className="btn primary" disabled={s.busy} onClick={apply}>이 날짜에 적용</button>
    </div>
  </motion.section>;
}
