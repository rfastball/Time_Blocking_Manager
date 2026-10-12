import {useEffect,useRef,useState} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {isCompositionKey} from '../../capture.ts';
import type {Task,Trashed} from '../../types.ts';
import {useApp} from '../store/state.ts';
import {clearArchive,closeComposer,deleteTask,editCapture,purgeTrashed,restoreTrashed,submitCapture,uncomplete} from '../store/tasks.ts';
import {openEditor} from '../store/editor.ts';
import {CutBoard} from '../cut/CutBoard.tsx';
import {setSelection} from '../store/bench.ts';
import {settle} from '../ui/motion.ts';
import {Icon} from '../ui/icons.tsx';
import {DoneHere,InboxList,SelectionBar,ShelfList} from './Workbench.tsx';
import './inbox.css';
import './workbench.css';

// The archive and 휴지통 disclosures keep the user's choice while they visit other views.
let archiveOpenMemory=false,trashOpenMemory=false;

// The bench: the 준비 dock opened wide, where captured work becomes blocks that can go on a date.
// The 들어옴 and one ordered shelf; the calendar beside it takes the place of the old date columns.
export function Bench(){
  const {snapshot,drafts,ready,draftLoaded,quitSaving,ui,today}=useApp();
  const [archiveOpen,setArchiveOpen]=useState(archiveOpenMemory),[trashOpen,setTrashOpen]=useState(trashOpenMemory),trash=snapshot!.trash??[];
  // Completions kept from before every completion had a date; nothing new arrives here.
  const archived=snapshot!.tasks.filter(t=>!t.plan_date&&t.completed);
  // A search result in the trash or the archive unfolds its list.
  useEffect(()=>{const f=ui.found;if(f?.kind==='trash'){trashOpenMemory=true;setTrashOpen(true);}if(f?.kind==='archive'){archiveOpenMemory=true;setArchiveOpen(true);}},[ui.found]);
  // A selection belongs to this page and to work still on it.
  useEffect(()=>()=>setSelection([]),[]);
  useEffect(()=>{const live=ui.benchSelection.filter(id=>snapshot!.tasks.some(t=>t.id===id&&!t.completed&&(!t.plan_date||t.plan_date<today)));if(live.length!==ui.benchSelection.length)setSelection(live);},[snapshot,ui.benchSelection,today]);
  const cutting=!!(ui.split&&drafts.cut),open=(t:Task)=>openEditor(t.id);
  return <section className="inbox-page jb" aria-label="준비" onClick={e=>{
    if(!(e.target as HTMLElement).closest('button,input,textarea,select,a,summary,[data-card],.cut,.jb-dock,.jb-selbar,.menu'))setSelection([]);
  }}>
    <div className="inbox-entry">
      <Icon name="plus" size={18}/>
      <label className="sr-only" htmlFor="inbox-capture">할 일 담기</label>
      <input id="inbox-capture" autoComplete="off" maxLength={650} placeholder="어떤 일을 해야 하나요?" value={drafts.composer?'':drafts.capture} disabled={!ready||!draftLoaded||quitSaving}
        onFocus={()=>{if(drafts.composer)closeComposer();}} onChange={e=>{if(drafts.composer)closeComposer();else editCapture(e.target.value);}}
        onKeyDown={e=>{if(e.key!=='Enter')return;e.preventDefault();if(isCompositionKey(e.nativeEvent))return;void submitCapture();}}/>
    </div>
    <div className="jb-work">
      <div id="inbox-bench" className="jb-bench">
        {cutting&&<CutBoard mode="inline"/>}
        <div className={'jb-layer'+(cutting?' jb-dim':'')} inert={cutting?true:undefined}>
          <InboxList onOpen={open}>
            <DoneHere/>
            {archived.length>0&&<details className="inbox-done inbox-archive" open={archiveOpen} onToggle={e=>{const o=e.currentTarget.open;archiveOpenMemory=o;setArchiveOpen(o);}}>
              <summary>날짜 없는 완료 {archived.length}</summary>
              {archiveOpen&&<>
                <ul className="inbox-rows">
                  <AnimatePresence initial={false} mode="popLayout">{archived.map(t=><ArchiveRow key={t.id} task={t}/>)}</AnimatePresence>
                </ul>
                <div className="inbox-trash-foot"><button type="button" className="btn text" onClick={()=>void clearArchive(archived)}>보관 목록 비우기</button></div>
              </>}
            </details>}
            {trash.length>0&&<details className="inbox-done inbox-trash" open={trashOpen} onToggle={e=>{const o=e.currentTarget.open;trashOpenMemory=o;setTrashOpen(o);}}>
              <summary>휴지통 {trash.length}</summary>
              {trashOpen&&<>
                <ul className="inbox-rows">
                  <AnimatePresence initial={false} mode="popLayout">{trash.map((t,index)=><TrashRow key={t.id} item={t} next={trash[index+1]??trash[index-1]}/>)}</AnimatePresence>
                </ul>
                <EmptyTrash items={trash}/>
              </>}
            </details>}
          </InboxList>
          <ShelfList onOpen={open}/>
        </div>
        <SelectionBar/>
      </div>
    </div>
  </section>;
}

// After a row leaves, keep the keyboard in the list: the neighbour's same button, else the disclosure.
function refocus(next:Trashed|undefined,action:'restore'|'purge'){
  requestAnimationFrame(()=>(document.querySelector<HTMLElement>(next?`[data-trash="${CSS.escape(next.id)}"] .irow-${action}`:'.inbox-trash>summary')??document.getElementById('inbox-capture'))?.focus());
}

function TrashRow({item:t,next}:{item:Trashed;next:Trashed|undefined}){
  const day=new Date(t.deleted_at).toLocaleDateString('ko-KR',{month:'long',day:'numeric'});
  return <motion.li layout data-trash={t.id} className="irow trashed" initial={{opacity:0,y:-18}} animate={{opacity:1,y:0}} exit={{opacity:0,scale:.98,transition:{duration:.12}}} transition={settle}>
    <div className="irow-main"><strong>{t.title}</strong><small><time dateTime={t.deleted_at}>{day}</time> 삭제</small></div>
    <button type="button" className="ibtn irow-restore" aria-label={`${t.title} 복원`} title="복원" onClick={async()=>{if(await restoreTrashed(t))refocus(next,'restore');}}><Icon name="undo" size={17}/></button>
    <button type="button" className="ibtn irow-purge" aria-label={`${t.title} 영구 삭제`} title="영구 삭제" onClick={async()=>{if(await purgeTrashed([t]))refocus(next,'purge');}}><Icon name="delete" size={17}/></button>
  </motion.li>;
}

function ArchiveRow({task:t}:{task:Task}){
  return <motion.li layout data-task={t.id} className="irow trashed" initial={{opacity:0,y:-18}} animate={{opacity:1,y:0}} exit={{opacity:0,scale:.98,transition:{duration:.12}}} transition={settle}>
    <div className="irow-main"><strong>{t.title}</strong></div>
    <button type="button" className="ibtn irow-restore" aria-label={`${t.title} 미완료로 되돌리기`} title="미완료로 되돌리기" onClick={()=>void uncomplete(t)}><Icon name="undo" size={17}/></button>
    <button type="button" className="ibtn irow-purge" aria-label={`${t.title} 삭제`} title="삭제" onClick={()=>void deleteTask(t)}><Icon name="delete" size={17}/></button>
  </motion.li>;
}

// Emptying is the one loss the trash cannot undo, so it asks in place like the editor's unsaved-change bar.
function EmptyTrash({items}:{items:Trashed[]}){
  const [confirming,setConfirming]=useState(false),sure=useRef<HTMLButtonElement>(null),start=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(confirming)sure.current?.focus();},[confirming]);
  const cancel=()=>{setConfirming(false);requestAnimationFrame(()=>start.current?.focus());};
  if(!confirming)return <div className="inbox-trash-foot"><button ref={start} type="button" className="btn text danger" onClick={()=>setConfirming(true)}>휴지통 비우기</button></div>;
  return <motion.div className="inbox-trash-foot" role="group" aria-label="휴지통 비우기 확인" initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} transition={{duration:.14}}
    onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}}}>
    <p>휴지통의 {items.length}개를 영구 삭제할까요?</p>
    <button ref={sure} type="button" className="btn danger" onClick={async()=>{if(await purgeTrashed(items))refocus(undefined,'purge');else setConfirming(false);}}>정말 비우기</button>
    <button type="button" className="btn" onClick={cancel}>취소</button>
  </motion.div>;
}
