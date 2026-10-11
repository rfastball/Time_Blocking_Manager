import {useRef,type KeyboardEvent} from 'react';
import {weekCapacity} from '../../settings.ts';
import {formatDuration} from '../../format.ts';
import {dateLabel,dateOf} from '../../dates.ts';
import {getState,setNav,useApp,type Period} from '../store/state.ts';
import {clearDay,inboxTasks,overdueTasks} from '../store/tasks.ts';
import {openEditor} from '../store/editor.ts';
import {Icon} from '../ui/icons.tsx';
import {InboxTray} from '../space/InboxTray.tsx';
import {Week,WEEK_SCALE} from './Week.tsx';
import {Calendar} from './Calendar.tsx';
import {DayView} from './DayView.tsx';
import {periodDates} from './day.tsx';
import './plan.css';

const periods:{id:Period;label:string}[]=[{id:'day',label:'일'},{id:'week',label:'주'},{id:'two',label:'2주'},{id:'month',label:'월'}];

// The routine form lives in settings; follow the button there and land in its first field once it is drawn.
function goRoutines(){
  setNav({view:'settings'});
  let tries=0;
  const find=()=>{const el=document.querySelector<HTMLElement>('#routine-title');if(el){el.focus();el.scrollIntoView({block:'center'});}else if(++tries<90)requestAnimationFrame(find);};
  requestAnimationFrame(find);
}

export function Plan(){
  const {nav,snapshot,drafts}=useApp();
  const settings=drafts.settingsDraft??snapshot!.settings,week=weekCapacity(settings,nav.selected);
  const inbox=inboxTasks(),dated=snapshot!.tasks.some(t=>t.plan_date===nav.selected);
  const dates=periodDates(nav.period,nav.planAnchor),open=nav.inboxOpen;
  return <div className="plan">
    <div className="plan-bar">
      <Periods value={nav.period}/>
      <span className="week-summary">선택한 주 근무 {formatDuration(week.minutes)} / {formatDuration(settings.weekly_target??2400)} · {week.days} / {settings.work_days??5}일</span>
      <span className="grow"/>
      <button type="button" className="btn" onClick={goRoutines}>정기 업무</button>
      <button type="button" className="btn text" disabled={!dated} aria-label={`${dateLabel(nav.selected)} 일정 비우기`} onClick={()=>void clearDay(nav.selected)}>{dateOf(nav.selected).getDate()}일 비우기</button>
      <button type="button" className={'btn drawer-toggle'+(open?' on':'')} aria-expanded={open} aria-controls="plan-drawer" aria-label={inbox.length?`미계획 ${inbox.length}건`:'미계획'}
        onClick={()=>setNav({inboxOpen:!open})}><Icon name="inbox" size={16}/>미계획{inbox.length>0&&<span className="cnt">{inbox.length}</span>}</button>
    </div>
    <div className={'plan-desk '+nav.period+(nav.period==='day'?' week':'')+(open?' with-drawer':'')}>
      <div className="plan-main">{nav.period==='day'?<DayView dates={dates}/>:nav.period==='week'?<Week dates={dates}/>:<Calendar dates={dates} period={nav.period}/>}</div>
      <aside id="plan-drawer" className="plan-drawer" hidden={!open} aria-label="미계획 드로어">
        {open&&<>
          <InboxTray scale={WEEK_SCALE} overdue={overdueTasks()} onOpen={t=>openEditor(t.id,'dialog')}/>
          <button type="button" className="ibtn drawer-close" aria-label="미계획 패널 닫기" onClick={()=>setNav({inboxOpen:false})}><Icon name="close" size={16}/></button>
        </>}
      </aside>
    </div>
  </div>;
}

// One tab stop; arrows move the choice like any radio group.
function Periods({value}:{value:Period}){
  const refs=useRef<(HTMLButtonElement|null)[]>([]);
  const choose=(p:Period)=>{const {nav}=getState();if(p!==nav.period)setNav({period:p,planAnchor:nav.selected});};
  function key(e:KeyboardEvent<HTMLButtonElement>,i:number){
    const n=periods.length,to={ArrowRight:i+1,ArrowDown:i+1,ArrowLeft:i-1,ArrowUp:i-1,Home:0,End:n-1}[e.key];
    if(to===undefined)return;
    e.preventDefault();const j=(to+n)%n;choose(periods[j].id);refs.current[j]?.focus();
  }
  return <div className="segmented" role="radiogroup" aria-label="계획 기간">
    {periods.map((p,i)=><button key={p.id} ref={el=>{refs.current[i]=el;}} type="button" role="radio" aria-checked={value===p.id} tabIndex={value===p.id?0:-1}
      onClick={()=>choose(p.id)} onKeyDown={e=>key(e,i)}>{p.label}</button>)}
  </div>;
}
