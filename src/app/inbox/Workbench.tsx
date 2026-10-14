// 준비's bench: the 들어옴 and the shelf at the timetable's scale.
import {useLayoutEffect,useRef,useState,type CSSProperties,type KeyboardEvent,type MouseEvent as ReactMouseEvent,type PointerEvent as ReactPointerEvent,type ReactNode} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {useDraggable} from '@dnd-kit/core';
import {inboxCards,shelfCards,type Place} from '../../bench.ts';
import {memoPreview} from '../../detail.ts';
import {formatDuration} from '../../format.ts';
import {dateLabel,dateOf} from '../../dates.ts';
import type {Task} from '../../types.ts';
import {getState,setUi,useApp} from '../store/state.ts';
import {deleteTask,setGesture} from '../store/tasks.ts';
import {completeHere,mergeSelected,moveTo,placeOfCard,readingOrder,selectRange,selectedTasks,setLength,setSelection,shiftInPlace,shipDates,shipTo,shortDate,toggleSelected,undoHere} from '../store/bench.ts';
import {menuKeys,clamp} from '../editor/actions.ts';
import {useDrag,useRegion,type Form} from '../space/drag.tsx';
import {reflow,reduced} from '../ui/motion.ts';
import {Icon} from '../ui/icons.tsx';

// One hour is 72px, as on 오늘, so a block on the shelf is the size it will be on a day.
export const SCALE=1.2;
const SHEET=34,INBOX_GAP=6,SHELF_GAP=2,CEILING=10;
const blockHeight=(minutes:number)=>Math.max(16,Math.round(minutes*SCALE)-SHELF_GAP);
// A proto in the 들어옴 is a sheet with no thickness; anywhere else it is drawn at its default length.
const cardHeight=(t:Task,place:Place)=>t.proto&&place==='inbox'?SHEET:blockHeight(t.duration);
const total=(list:Task[])=>list.reduce((n,t)=>n+t.duration,0);
type Open=(t:Task)=>void;

// A list in 준비: what it holds, as drawn, for the drop index; held blocks take its width and their own height on it.
function useList(place:Place,width:()=>number,top?:()=>number){
  const gap=place==='shelf'?SHELF_GAP:INBOX_GAP;
  const items=()=>{const s=getState().snapshot!;return (place==='shelf'?shelfCards(s.tasks,s.piles??[]):inboxCards(s.tasks)).map(t=>({id:t.id,height:cardHeight(t,place)}));};
  const form=(task:Task,ids:string[]):Form=>{
    const list=ids.map(id=>getState().snapshot!.tasks.find(t=>t.id===id)??task);
    return {width:width(),height:list.reduce((n,t)=>n+cardHeight(t,place),0)+(list.length-1)*gap};
  };
  return useRegion(place,null,{list:{gap,items,top},form});
}

export function InboxList({onOpen,children}:{onOpen:Open;children?:ReactNode}){
  const {held,tasks}=useDrag(),{today}=useApp(),box=useRef<HTMLDivElement>(null);
  const register=useList('inbox',()=>box.current?.clientWidth??280);
  const fresh=inboxCards(tasks),past=tasks.filter(t=>!t.completed&&t.plan_date&&t.plan_date<today).sort((a,b)=>a.plan_date!.localeCompare(b.plan_date!)||a.id.localeCompare(b.id));
  const hot=held&&!held.dropping&&!held.passing&&held.intent.zone==='inbox';
  return <section className={'jb-panel jb-inbox'+(hot?' hot':'')} aria-label="들어옴">
    <header className="jb-head"><h2>들어옴</h2>{fresh.length+past.length>0&&<span className="cnt">{fresh.length+past.length}</span>}</header>
    <div className="jb-scroll">
      <div ref={el=>{box.current=el;register(el);}} className="jb-well">
        <AnimatePresence initial={false}>{fresh.map(t=><Card key={t.id} task={t} place="inbox" onOpen={onOpen}/>)}</AnimatePresence>
      </div>
      {past.length>0&&<>
        <h3 className="jb-sub">지난 미완료</h3>
        <div className="jb-well past"><AnimatePresence initial={false}>{past.map(t=><Card key={t.id} task={t} place="inbox" past onOpen={onOpen}/>)}</AnimatePresence></div>
      </>}
      {children}
    </div>
  </section>;
}

export function ShelfList({onOpen}:{onOpen:Open}){
  const {held,tasks}=useDrag(),box=useRef<HTMLDivElement>(null);
  const register=useList('shelf',()=>box.current?.clientWidth??300,()=>box.current?.getBoundingClientRect().top??0);
  const cards=shelfCards(tasks,getState().snapshot?.piles??[]),sum=total(cards);
  const hot=held&&!held.dropping&&!held.passing&&held.intent.zone==='shelf';
  // The ruler shows whole hours down to a little past what the shelf holds, and at least a working day (stacked, only the former).
  const fit=Math.ceil(sum/60)+1,hours=Array.from({length:Math.max(8,fit)},(_,i)=>i+1);
  const rack={'--rack':`${hours.length*60*SCALE+24}px`,'--rack-fit':`${fit*60*SCALE+24}px`} as CSSProperties;
  return <section ref={register} className={'jb-panel jb-shelf'+(hot?' hot':'')} aria-label="선반">
    <header className="jb-head"><h2>선반</h2>{cards.length>0&&<><span className="cnt">{cards.length}</span><span className="jb-sum">{formatDuration(sum)}</span></>}</header>
    <div className="jb-scroll">
      <div className="jb-rack" style={rack}>
        <div className="jb-ruler" aria-hidden="true">{hours.map(h=><span key={h} style={{top:CEILING+h*60*SCALE}}>{h}h</span>)}</div>
        <div className="jb-stack" data-block="true">
          <Ceiling cards={cards}/>
          <div ref={box} className="jb-hang">
            <AnimatePresence initial={false}>{cards.map(t=><Card key={t.id} task={t} place="shelf" onOpen={onOpen}/>)}</AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  </section>;
}

// The shelf's ceiling: drag it to carry every block on the shelf in order; press it to pick them all.
function Ceiling({cards}:{cards:Task[]}){
  const {ready}=useApp(),{held}=useDrag(),ids=cards.map(t=>t.id);
  const {listeners,setNodeRef}=useDraggable({id:'shelf-all',data:{taskId:ids[0],ids},disabled:!ready||!ids.length||!!held?.dropping});
  return <button ref={setNodeRef} type="button" className="jb-ceiling" disabled={!ids.length} {...listeners}
    aria-label={`선반 전체 ${ids.length}개, ${formatDuration(total(cards))}`} title="선반 전체" onClick={()=>setSelection(ids)}/>;
}

// A card in 준비: a sheet (no length yet) or a block whose height is its length. Lengths save at once and never move the card.
function Card({task:t,place,past,onOpen}:{task:Task;place:Place;past?:boolean;onOpen:Open}){
  const {ui,ready}=useApp(),{held}=useDrag();
  // Each place owns its copy's drag registration: a card leaving one list must not take the other's with it.
  const {listeners,setNodeRef}=useDraggable({id:`bench:${past?"past":place}:${t.id}`,data:{taskId:t.id},disabled:!ready||!!held?.dropping});
  // While the lip is pulled: the length under the hand, null while still a sheet.
  const [live,setLive]=useState<number|null|undefined>(undefined);
  const pulling=live!==undefined,sheet=t.proto&&place==='inbox'&&!(pulling&&live!==null);
  const minutes=pulling&&live!=null?live:t.duration;
  const height=sheet?SHEET:blockHeight(minutes);
  const sel=ui.benchSelection.includes(t.id),hollow=!!held&&held.ids.includes(t.id);
  const memo=t.body.trim()?memoPreview(t.body):'';
  const label=`${t.title}, ${sheet?'길이 미정':formatDuration(minutes)}${past?`, ${dateLabel(t.plan_date!)} 미완료`:''}${sel?', 선택됨':''}`;
  function pull(e:ReactPointerEvent<HTMLDivElement>){
    if(e.button!==0)return;
    e.stopPropagation();e.preventDefault();
    const el=e.currentTarget,y0=e.clientY,from=t.proto&&place==='inbox'?0:t.duration;let value:number|null=t.proto&&place==='inbox'?null:t.duration;
    el.setPointerCapture(e.pointerId);setGesture(true);setLive(value);
    // A sheet gains thickness 15 minutes at a time once pulled past half a step; pushed back flat it stays a sheet.
    const move=(ev:PointerEvent)=>{
      const raw=from+(ev.clientY-y0)/SCALE;
      value=from===0&&raw<7.5?null:Math.max(15,Math.min(1440,Math.round(raw/15)*15));setLive(value);
    };
    const up=()=>{
      el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);setGesture(false);
      if(value===null||value===t.duration&&!t.proto){setLive(undefined);return;}
      void setLength(t,value).finally(()=>setLive(undefined));
    };
    el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  }
  function click(e:ReactMouseEvent){
    if(e.shiftKey){selectRange(t.id);return;}
    if(e.ctrlKey||e.metaKey){toggleSelected(t.id);return;}
    onOpen(t);
  }
  function keys(e:KeyboardEvent<HTMLButtonElement>){
    if(e.nativeEvent.isComposing)return;
    const sel=getState().ui.benchSelection,picked=sel.includes(t.id)?selectedTasks():[t];
    if((e.shiftKey&&e.key==='F10')||e.key==='ContextMenu'){e.preventDefault();const r=e.currentTarget.getBoundingClientRect();menu({clientX:r.left+12,clientY:r.top+12});return;}
    const up=e.key==='ArrowUp',down=e.key==='ArrowDown';
    if((up||down)&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){
      e.preventDefault();
      // A sheet gets its first length going down; a block grows or shrinks by 15 minutes.
      if(sheet){if(down)void setLength(t,15);return;}
      void setLength(t,t.duration+(up?-15:15));return;
    }
    if((up||down)&&e.altKey){e.preventDefault();void shiftInPlace(t,up?-1:1);return;}
    if(e.altKey&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){
      e.preventDefault();
      const to:Place=e.key==='ArrowRight'?'shelf':'inbox',ids=picked.filter(x=>placeOfCard(x)!==to||x.plan_date).map(x=>x.id);
      if(ids.length)void moveTo(ids,to,to==='shelf'?Infinity:0).then(ok=>{if(ok)focusCard(t.id);});
      return;
    }
    if(e.key==='Delete'){e.preventDefault();void remove(picked);return;}
    if(e.key==='Escape'&&sel.length){e.preventDefault();e.stopPropagation();setSelection([]);}
  }
  function menu(e:{clientX:number;clientY:number}){setUi({contextMenu:{taskId:t.id,date:getState().today,minute:0,x:e.clientX,y:e.clientY,bench:true}});}
  // After a delete the keyboard stays in the lists: the next card, else the one before, else the capture input.
  async function remove(items:Task[]){
    const ids=items.map(x=>x.id),order=readingOrder().map(x=>x.id),at=order.indexOf(t.id);
    const next=order.slice(at+1).find(id=>!ids.includes(id))??order.slice(0,at).reverse().find(id=>!ids.includes(id));
    setSelection(getState().ui.benchSelection.filter(id=>!ids.includes(id)));
    let ok=true;for(const task of items)ok=await deleteTask(task)&&ok;
    if(ok)requestAnimationFrame(()=>(next?document.querySelector<HTMLElement>(`.jb [data-task="${CSS.escape(next)}"]`):document.getElementById('inbox-capture'))?.focus({preventScroll:true}));
  }
  const cls=['jb-card',sheet?'sheet':'block',past?'past':'',sel?'sel':'',hollow?'hollow':'',ui.landed?.id===t.id?'landed':'',ui.split===t.id?'onboard':'',height<30?'thin':'',height>=48?'tall':''].filter(Boolean).join(' ');
  return <motion.div ref={setNodeRef} data-card={t.id} data-block="true" className={cls} style={{height}} {...listeners} tabIndex={-1} role="presentation"
    layout={pulling||reduced()?false:'position'} initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,transition:{duration:0}}} transition={reflow}
    onContextMenu={e=>{e.preventDefault();menu(e);}}>
    <div className="tile">
      {!sheet&&<button type="button" className="chk" aria-label={t.title+' 완료'} onPointerDown={e=>e.stopPropagation()} onClick={()=>void completeHere([t])}><Icon name="check" size={12} stroke={3}/></button>}
      <button type="button" className="main" data-task={t.id} aria-label={label} title={memo?`${t.title}\n${memo}`:t.title} onClick={click} onKeyDown={keys}
        aria-keyshortcuts="ArrowUp ArrowDown Alt+ArrowUp Alt+ArrowDown Alt+ArrowRight Alt+ArrowLeft Delete Shift+F10">
        <span className="ttl">{t.title}</span>
        {!sheet&&<span className="meta">{past&&<b className="from">{shortDate(t.plan_date!)}</b>}<span>{formatDuration(minutes)}</span></span>}
      </button>
      <span className="jb-acts">
        <button type="button" className="ibtn jb-delete" aria-label={`${t.title} 삭제`} title="삭제" disabled={!ready} onPointerDown={e=>e.stopPropagation()} onClick={()=>void remove([t])}><Icon name="delete" size={14}/></button>
      </span>
    </div>
    {pulling&&live!=null&&<span className="jb-len" aria-live="polite">{formatDuration(live)}</span>}
    {!past&&<div className={'jb-lip'+(sheet?' tab':'')} aria-hidden="true" onPointerDown={pull}/>}
  </motion.div>;
}
const focusCard=(id:string)=>requestAnimationFrame(()=>document.querySelector<HTMLElement>(`.jb [data-task="${CSS.escape(id)}"]`)?.focus({preventScroll:false}));

// What the picked cards can do at once. Shipping is always to the end of a day's order.
// What was completed here this session, newest first; each can go back to where it stood.
export function DoneHere(){
  const {ui,snapshot}=useApp(),done=ui.doneHere.map(d=>snapshot!.tasks.find(t=>t.id===d.id)).filter((t):t is Task=>!!t&&t.completed);
  if(!done.length)return null;
  return <section className="jb-done" aria-label="방금 완료">
    <h3 className="jb-sub">방금 완료</h3>
    <div className="jb-chips"><AnimatePresence initial={false}>{done.map(t=><motion.span key={t.id} data-flight={t.id} className="chip" layout
      initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,transition:{duration:.1}}} transition={reflow}>
      <span className="chip-title"><Icon name="check" size={13} stroke={2.6}/><span className="ttl">{t.title}</span><small>{formatDuration(t.duration)}</small></span>
      <button type="button" className="chip-undo" aria-label={t.title+' 완료 취소'} title="완료 취소" onClick={()=>void undoHere(t.id)}><Icon name="undo" size={14}/></button>
    </motion.span>)}</AnimatePresence></div>
  </section>;
}

export function SelectionBar(){
  useApp();const picked=selectedTasks();
  if(!picked.length)return null;
  const ids=picked.map(t=>t.id),dated=picked.filter(t=>t.plan_date),loose=picked.filter(t=>placeOfCard(t)!=='shelf'||t.plan_date),[today,...later]=shipDates();
  return <div className="jb-selbar" role="group" aria-label="선택한 블록">
    <span className="jb-selinfo">선택 {picked.length} · {formatDuration(total(picked))}</span>
    {loose.length>0&&<button type="button" className="btn" onClick={()=>void moveTo(loose.map(t=>t.id),'shelf',Infinity)}>선반으로</button>}
    <button type="button" className="btn" onClick={()=>void shipTo(today,ids)}><Icon name="right" size={15}/>오늘에 싣기</button>
    <MenuButton label="다른 날에 싣기" items={later.map(d=>({label:`${shortDate(d)} ${dateOf(d).toLocaleDateString('ko-KR',{weekday:'short'})}`,run:()=>void shipTo(d,ids)}))}>다른 날</MenuButton>
    {picked.length>=2&&!dated.length&&<button type="button" className="btn" onClick={()=>void mergeSelected()}>하나로 합치기</button>}
    <button type="button" className="btn" onClick={()=>void completeHere(picked)}><Icon name="check" size={15}/>완료</button>
    <button type="button" className="ibtn danger" aria-label="선택한 블록 삭제" title="삭제" onClick={()=>{setSelection([]);for(const t of picked)void deleteTask(t);}}><Icon name="delete" size={16}/></button>
    <button type="button" className="ibtn" aria-label="선택 해제" title="선택 해제" onClick={()=>setSelection([])}><Icon name="close" size={15}/></button>
  </div>;
}

type Item={label:string;run:()=>void;disabled?:boolean};
function MenuButton({label,items,children}:{label:string;items:Item[];children:ReactNode}){
  const [at,setAt]=useState<{x:number;y:number}|null>(null),button=useRef<HTMLButtonElement>(null);
  return <>
    <button ref={button} type="button" className="btn" aria-haspopup="menu" aria-expanded={!!at} aria-label={label}
      onClick={e=>{const r=e.currentTarget.getBoundingClientRect();setAt(at?null:{x:r.left,y:r.top-4});}}>{children}<Icon name="down" size={14}/></button>
    {at&&<FloatingMenu label={label} items={items} at={at} onClose={()=>{setAt(null);button.current?.focus();}}/>}
  </>;
}

function FloatingMenu({label,items,at,onClose}:{label:string;items:Item[];at:{x:number;y:number};onClose:()=>void}){
  const ref=useRef<HTMLDivElement>(null),[pos,setPos]=useState({left:at.x,top:at.y});
  // Opens upward from the bar at the bottom of the work area.
  useLayoutEffect(()=>{const r=ref.current!.getBoundingClientRect();setPos(clamp(at.x,at.y-r.height,r.width,r.height));ref.current!.querySelector<HTMLElement>('[role=menuitem]:not(:disabled)')?.focus({preventScroll:true});},[]);
  useLayoutEffect(()=>{
    const outside=(e:Event)=>{if(!ref.current?.contains(e.target as Node))onClose();};
    document.addEventListener('pointerdown',outside,true);addEventListener('resize',onClose);
    return ()=>{document.removeEventListener('pointerdown',outside,true);removeEventListener('resize',onClose);};
  },[]);
  return <motion.div ref={ref} role="menu" aria-label={label} className="menu jb-menu" style={pos} onKeyDown={e=>menuKeys(e,onClose)}
    initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} transition={{duration:.12}}>
    {items.map(i=><button key={i.label} type="button" role="menuitem" tabIndex={-1} disabled={i.disabled} onClick={()=>{onClose();i.run();}}>{i.label}</button>)}
  </motion.div>;
}
