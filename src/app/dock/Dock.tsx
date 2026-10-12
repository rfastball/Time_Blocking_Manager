import {setNav,useApp} from '../store/state.ts';
import {inboxTasks,overdueTasks} from '../store/tasks.ts';
import {openEditor} from '../store/editor.ts';
import {Icon} from '../ui/icons.tsx';
import {InboxTray} from '../space/InboxTray.tsx';
import {WEEK_SCALE} from '../plan/Week.tsx';
import {Bench} from '../inbox/InboxPage.tsx';
import './dock.css';

// Folding swaps the dock's controls, so the keyboard is handed to the control that undoes it, as the old drawer did.
const fold=(to:'hidden'|'narrow',focus:string)=>{setNav({dock:to});requestAnimationFrame(()=>document.querySelector<HTMLElement>(focus)?.focus({preventScroll:true}));};

// The 준비 dock beside the calendar. Narrow it is the list to fill gaps from; wide it is the bench where work gets its shape;
// folded it keeps only the count. Its width changes only when asked, never as a side effect of editing.
export function Dock(){
  const {nav,snapshot}=useApp(),dock=nav.dock;
  const count=snapshot?inboxTasks().length+overdueTasks().length:0;
  if(dock==='hidden')return <aside id="dock" className="dock hidden" aria-label="준비 도크">
    <button type="button" className="dock-unfold" aria-label={`준비 펴기${count?`, ${count}건`:''}`} aria-keyshortcuts="[" onClick={()=>fold('narrow','#dock .dock-fold')}>
      <Icon name="inbox" size={18}/>{count>0&&<span className="cnt">{count}</span>}
    </button>
  </aside>;
  return <aside id="dock" className={'dock '+dock} aria-label="준비 도크">
    <div className="dock-tools">
      <button type="button" className="ibtn dock-fold" aria-label="준비 접기" aria-keyshortcuts="[" title="접기" onClick={()=>fold('hidden','#dock .dock-unfold')}><Icon name="fold" size={16}/></button>
      <button type="button" className="ibtn" aria-label={dock==='wide'?'준비 좁히기':'준비 넓히기'} aria-pressed={dock==='wide'} aria-keyshortcuts="]" title={dock==='wide'?'좁히기':'넓히기'}
        onClick={()=>setNav({dock:dock==='wide'?'narrow':'wide'})}><Icon name={dock==='wide'?'left':'right'} size={16}/></button>
    </div>
    {dock==='wide'?<Bench/>:<InboxTray scale={WEEK_SCALE} overdue={overdueTasks()} onOpen={t=>openEditor(t.id,'dialog')}/>}
  </aside>;
}
