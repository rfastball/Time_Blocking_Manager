import {timeAxisForDays,type TimeAxis} from '../../time-axis.ts';
import {dateLabel,dateOf} from '../../dates.ts';
import type {Task} from '../../types.ts';
import {setNav,useApp} from '../store/state.ts';
import {dayRule} from '../store/tasks.ts';
import {openEditor} from '../store/editor.ts';
import {DaySpace} from '../space/DaySpace.tsx';
import {useDrag,useRegion} from '../space/drag.tsx';
import {useNewBlock} from './Composer.tsx';
import {allocation,allocationLabel,dayTag,Meter} from './day.tsx';

export const WEEK_SCALE=1;
const open=(t:Task)=>openEditor(t.id,'dialog');

// Seven day spaces on one time axis. The hour ruler is shared; each date head is also a place to drop work.
export function Week({dates}:{dates:string[]}){
  const axis=timeAxisForDays(dates.map(dayRule),WEEK_SCALE);
  const hours=Array.from({length:25},(_,i)=>i*60).filter(m=>m>=axis.start-60&&m<=axis.end+60);
  return <section className="card wk" aria-label="주간 블록 공간">
    <div className="wk-scroll">
      <div className="wk-grid">
        <div className="wk-corner"/>
        {dates.map(date=><Head key={date} date={date}/>)}
        <div className="wk-ruler" aria-hidden="true"><div className="wk-hours" style={{height:axis.height}}>{hours.map(m=><span key={m} style={{top:axis.position(m)}}>{String(m/60).padStart(2,'0')}</span>)}</div></div>
        {dates.map((date,i)=><Column key={date} date={date} axis={axis} align={i<4?'left':'right'}/>)}
      </div>
    </div>
  </section>;
}

function Head({date}:{date:string}){
  const {today,nav}=useApp(),{held,tasks}=useDrag();
  const ref=useRegion('date',date);
  const a=allocation(date,tasks),tag=dayTag(date),off=!dayRule(date).enabled;
  const hot=!!held&&!held.dropping&&held.intent.zone==='date'&&held.intent.date===date;
  const d=dateOf(date);
  return <div ref={ref} data-date={date} className={'wk-head'+(date===today?' today':'')+(date===nav.selected?' sel':'')+(off?' off':'')+(hot?' hot':'')}>
    <button type="button" className="wk-date" onClick={()=>setNav({view:'today',selected:date})}
      aria-label={`${dateLabel(date)}${date===today?', 오늘':''}${tag?', '+tag:''}, ${allocationLabel(a)}`}>
      <span className="wk-day"><small>{d.toLocaleDateString('ko-KR',{weekday:'short'})}</small><strong>{d.getDate()}</strong>{date===today&&<span className="pill">오늘</span>}{tag&&<span className="tag-chip">{tag}</span>}</span>
      <Meter a={a}/>
      <span className="wk-alloc">{allocationLabel(a)}</span>
    </button>
  </div>;
}

function Column({date,axis,align}:{date:string;axis:TimeAxis;align:'left'|'right'}){
  const {drafts}=useApp(),nb=useNewBlock(date,axis,'column',align);
  return <div className={'wk-col'+(!dayRule(date).enabled?' off':'')+(drafts.composer?.date===date?' composing':'')} data-date={date}>
    <DaySpace date={date} axis={axis} variant="column" bin shelf onOpen={open} {...nb}/>
  </div>;
}
