import {useRef,type KeyboardEvent} from 'react';
import {weekCapacity} from '../../settings.ts';
import {formatDuration} from '../../format.ts';
import {getState,setNav,useApp,type Period} from '../store/state.ts';
import {usePanelResize} from '../ui/PanelResize.tsx';
import {Week} from './Week.tsx';
import {Calendar} from './Calendar.tsx';
import {DayView} from './DayView.tsx';
import {periodDates} from '../../dates.ts';
import './plan.css';

const periods:{id:Period;label:string;key:string}[]=[{id:'day',label:'일',key:'D'},{id:'week',label:'주',key:'W'},{id:'two',label:'2주',key:'2'},{id:'month',label:'월',key:'M'}];

// The calendar half of the work screen; the 준비 dock beside it belongs to the shell.
export function Plan(){
  const {nav,snapshot,drafts}=useApp();
  const settings=drafts.settingsDraft??snapshot!.settings,week=weekCapacity(settings,nav.selected);
  const dates=periodDates(nav.period,nav.planAnchor);
  const calendarPanels=usePanelResize(`plan-${nav.period}-calendar`,.67,'달력과 선택 날짜 패널 크기','calendar-summary calendar-day',nav.period==='two'||nav.period==='month','calendar');
  return <div className="plan">
    <div className="plan-bar">
      <span className="week-summary">선택한 주 근무 {formatDuration(week.minutes)} / {formatDuration(settings.weekly_target??2400)} · {week.days} / {settings.work_days??5}일</span>
    </div>
    <div style={calendarPanels.style} className={'plan-desk '+nav.period}>
      <div className="plan-main">{nav.period==='day'?<DayView dates={dates}/>:nav.period==='week'?<Week dates={dates}/>:<Calendar dates={dates} period={nav.period} panels={calendarPanels}/>}</div>
    </div>
  </div>;
}

// One tab stop; arrows move the choice like any radio group.
export function Periods({value,keys}:{value:Period;keys:boolean}){
  const refs=useRef<(HTMLButtonElement|null)[]>([]);
  const choose=(p:Period)=>{const {nav}=getState();if(p!==nav.period)setNav({period:p,planAnchor:nav.selected});};
  function key(e:KeyboardEvent<HTMLButtonElement>,i:number){
    const n=periods.length,to={ArrowRight:i+1,ArrowDown:i+1,ArrowLeft:i-1,ArrowUp:i-1,Home:0,End:n-1}[e.key];
    if(to===undefined)return;
    e.preventDefault();const j=(to+n)%n;choose(periods[j].id);refs.current[j]?.focus();
  }
  return <div className="segmented" role="radiogroup" aria-label="계획 기간">
    {periods.map((p,i)=><button key={p.id} ref={el=>{refs.current[i]=el;}} type="button" role="radio" aria-checked={value===p.id} tabIndex={value===p.id?0:-1} aria-keyshortcuts={keys?p.key:undefined}
      onClick={()=>choose(p.id)} onKeyDown={e=>key(e,i)}>{p.label}</button>)}
  </div>;
}
