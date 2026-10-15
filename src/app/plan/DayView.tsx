import {dateLabel,time} from '../../dates.ts';
import {useApp} from '../store/state.ts';
import {dayRule,planOf,reflowToday} from '../store/tasks.ts';
import {openEditor} from '../store/editor.ts';
import {Icon} from '../ui/icons.tsx';
import {DaySpace} from '../space/DaySpace.tsx';
import {useDaysAxis,useDrag} from '../space/drag.tsx';
import {useNewBlock} from './Composer.tsx';
import {Head} from './Week.tsx';
import {allocation,allocationLabel,allocationShort,dayTag,Meter,Outside} from './load.tsx';
import {SCALE} from '../ui/scales.ts';


// One day to plan in full: its week as a strip of date heads to move between and drop onto, and the day's space below.
export function DayView({dates}:{dates:string[]}){
  const {nav,today}=useApp(),{tasks}=useDrag(),date=nav.selected;
  const axis=useDaysAxis([date],SCALE.day),nb=useNewBlock(date,axis,'day');
  const a=allocation(date,tasks),tag=dayTag(date),plan=planOf(date),rule=dayRule(date);
  const anchor=Math.max(rule.start,plan.anchor??rule.start),flows=plan.items.some(i=>!i.fixed);
  return <div className="dv">
    <section className="card dv-strip" aria-label="이번 주 날짜">{dates.map(d=><Head key={d} date={d}/>)}</section>
    <section className="card dv-day" aria-label={`${dateLabel(date)} 블록 공간`}>
      <header className="plan-day-head">
        <h2>{dateLabel(date)}</h2>{tag&&<span className="tag-chip">{tag}</span>}
        <span className="plan-day-alloc"><span className="sr-only">{allocationLabel(a)}</span><Meter a={a}/><span aria-hidden="true">{allocationShort(a)}</span><Outside a={a}/></span>
        {date===today&&flows&&<><span className="anchor">{time(anchor)} 기준</span>
          <button type="button" className="btn" onClick={()=>void reflowToday()}><Icon name="reflow" size={15}/>재배치</button></>}
      </header>
      <DaySpace date={date} axis={axis} variant="day" bin onOpen={t=>openEditor(t.id,'dialog')} {...nb}/>
    </section>
  </div>;
}
