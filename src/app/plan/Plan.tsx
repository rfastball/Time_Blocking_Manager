// Foundation placeholder for area A (plan): a plain week of day spaces sharing one time axis.
import {timeAxisForDays} from '../../time-axis.ts';
import {dateKey,dateOf,plusDays} from '../../dates.ts';
import {useApp} from '../store/state.ts';
import {dayRule} from '../store/tasks.ts';
import {openEditor} from '../store/editor.ts';
import {DaySpace} from '../space/DaySpace.tsx';
import {InboxTray} from '../space/InboxTray.tsx';

const SCALE=0.9;
export function Plan(){
  const {nav}=useApp();
  const first=dateOf(nav.planAnchor);first.setDate(first.getDate()-(first.getDay()+6)%7);
  const dates=Array.from({length:7},(_,i)=>plusDays(dateKey(first),i));
  const axis=timeAxisForDays(dates.map(dayRule),SCALE);
  return <div style={{display:'flex',gap:16,alignItems:'flex-start'}}>
    <section className="card" style={{flex:1,padding:0,overflow:'hidden',display:'grid',gridTemplateColumns:`repeat(7,minmax(0,1fr))`}} aria-label="주간 블록 공간">
      {dates.map(date=><div key={date} style={{borderLeft:'1px solid var(--color-divider)'}}><div style={{padding:'6px 8px',fontSize:12}}>{date.slice(5)}</div>
        <DaySpace date={date} axis={axis} variant="column" bin shelf onOpen={t=>openEditor(t.id,'dialog')}/></div>)}
    </section>
    <div style={{width:280}}><InboxTray scale={SCALE} onOpen={t=>openEditor(t.id,'dialog')}/></div>
  </div>;
}
