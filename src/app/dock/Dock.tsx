import {setNav,useApp,type Dock as DockWidth} from '../store/state.ts';
import {benchTasks,overdueTasks} from '../store/tasks.ts';
import {openEditor} from '../store/editor.ts';
import {Icon} from '../ui/icons.tsx';
import {InboxTray} from './InboxTray.tsx';
import {SCALE} from '../ui/scales.ts';
import {Bench} from './Bench.tsx';
import './dock.css';

// Changing the width swaps what the dock draws. If the keyboard was in the dock and its element went with the old width,
// it is handed to the control that undoes the change, as the old drawer's close returned it to its toggle.
export function setDock(to:DockWidth){
  const inside=!!document.getElementById('dock')?.contains(document.activeElement);
  setNav({dock:to});
  if(inside)requestAnimationFrame(()=>{
    const dock=document.getElementById('dock'),active=document.activeElement;
    if(active&&active!==document.body&&dock?.contains(active))return;
    dock?.querySelector<HTMLElement>(to==='hidden'?'.dock-unfold':'.dock-fold')?.focus({preventScroll:true});
  });
}

// The 준비 dock beside the calendar. Narrow it is the list to fill gaps from; wide it is the bench where work gets its shape;
// folded it keeps only the count. Its width changes only when asked, never as a side effect of editing.
export function Dock(){
  const {nav,snapshot}=useApp(),dock=nav.dock;
  const count=snapshot?benchTasks().length+overdueTasks().length:0;
  if(dock==='hidden')return <aside id="dock" className="dock hidden" aria-label="준비 도크">
    <button type="button" className="dock-unfold" aria-label={`준비 펴기${count?`, ${count}건`:''}`} aria-keyshortcuts="[" onClick={()=>setDock('narrow')}>
      <Icon name="inbox" size={18}/>{count>0&&<span className="cnt">{count}</span>}
    </button>
  </aside>;
  return <aside id="dock" className={'dock '+dock} aria-label="준비 도크">
    <div className="dock-tools">
      <button type="button" className="ibtn dock-fold" aria-label="준비 접기" aria-keyshortcuts="[" title="접기" onClick={()=>setDock('hidden')}><Icon name="fold" size={16}/></button>
      <button type="button" className="ibtn" aria-label={dock==='wide'?'준비 좁히기':'준비 넓히기'} aria-keyshortcuts="]" title={dock==='wide'?'좁히기':'넓히기'}
        onClick={()=>setDock(dock==='wide'?'narrow':'wide')}><Icon name={dock==='wide'?'left':'right'} size={16}/></button>
    </div>
    {dock==='wide'?<Bench/>:<InboxTray scale={SCALE.week} overdue={overdueTasks()} onOpen={t=>openEditor(t.id,'dialog')}/>}
  </aside>;
}
