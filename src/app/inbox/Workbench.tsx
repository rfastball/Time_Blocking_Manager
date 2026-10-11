// The 미계획 bench: 지난 미완료, the 투입구 and the user's piles, and the date columns to ship work to.
import {useEffect,useId,useLayoutEffect,useRef,useState,type KeyboardEvent,type MouseEvent,type PointerEvent as ReactPointerEvent,type ReactNode} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {useDraggable} from '@dnd-kit/core';
import {benchPiles,pileName,type PileView} from '../../bench.ts';
import {memoPreview} from '../../detail.ts';
import {formatDuration} from '../../format.ts';
import {dateLabel,dateOf} from '../../dates.ts';
import type {Task} from '../../types.ts';
import {getState,setUi,useApp} from '../store/state.ts';
import {completeTasks,deleteTask,overdueTasks,setGesture} from '../store/tasks.ts';
import {movePileTo,newPileWith,nudge,placeCards,selectPile,selectedTasks,setLength,setSelection,shiftPile,shipDates,shipTo,shortDate,stackOnto,toggleSelected} from '../store/bench.ts';
import {allocation,allocationLabel,allocationShort,dayTag} from '../plan/day.tsx';
import {menuKeys,clamp} from '../editor/actions.ts';
import {useDrag,useRegion} from '../space/drag.tsx';
import {reflow} from '../ui/motion.ts';
import {Dots,Icon} from '../ui/icons.tsx';

// Minutes to pixels on the bench and in the date columns: the same scale, so sizes read against free time.
export const SCALE=1;
const cardHeight=(minutes:number)=>Math.max(24,minutes*SCALE-2);
const hours=(minutes:number)=>String(Math.round(minutes/60*100)/100);

// The card a press opens: the cutting board once it exists; until then the detail editor.
type Open=(t:Task)=>void;

export function Bench({onOpen}:{onOpen:Open}){
  const {snapshot}=useApp(),{held}=useDrag(),ref=useRegion('bench',null);
  const piles=benchPiles(snapshot!.tasks,snapshot!.piles??[]),past=overdueTasks();
  const holding=held&&!held.dropping?held:null;
  const count=piles.reduce((n,p)=>n+p.cards.length,0),total=piles.reduce((n,p)=>n+p.total,0);
  return <>
    {past.length>0&&<section className="wb-sec" aria-label="지난 미완료">
      <header className="wb-head"><h2>지난 미완료 <span className="cnt">{past.length}</span></h2></header>
      <div className="wb-shelf">
        <AnimatePresence initial={false}>{past.map(t=><Card key={t.id} task={t} past onOpen={onOpen}/>)}</AnimatePresence>
      </div>
    </section>}
    <section className="wb-sec" aria-label="미계획">
      <header className="wb-head">
        <h2>미계획 <span className="cnt">{count}</span></h2>
        {total>0&&<span className="wb-sum">{formatDuration(total)}</span>}
        <SelectionBar/>
      </header>
      <div ref={ref} className="wb-piles">
        {piles.map((p,i)=><PileColumn key={p.id??'inbox'} pile={p} visual={i} piles={piles} holding={holding} onOpen={onOpen}/>)}
        <Gutter before={piles.length} piles={piles} holding={holding} end/>
      </div>
    </section>
  </>;
}

type Holding=ReturnType<typeof useDrag>['held'];
// Which visual gap a held block would open a new pile in (the pile's position counting the 투입구 as 0).
function hotGap(holding:Holding,piles:PileView[]){
  const i=holding?.intent;if(i?.zone!=='pile'||i.create==null)return null;
  if(!i.carry)return i.create;
  const from=piles.findIndex(p=>p.id===i.carry!.pile);
  return i.create>=from?i.create+1:i.create;
}

function Gutter({before,piles,holding,end}:{before:number;piles:PileView[];holding:Holding;end?:boolean}){
  return <div className={'wb-gutter'+(end?' end':'')+(hotGap(holding,piles)===before?' hot':'')} aria-hidden="true"><i/></div>;
}

function PileColumn({pile:p,visual,piles,holding,onOpen}:{pile:PileView;visual:number;piles:PileView[];holding:Holding;onOpen:Open}){
  const {ui}=useApp(),inbox=p.id===null,first=p.cards[0];
  const {listeners,setNodeRef}=useDraggable({id:`pile:${p.id??'inbox'}`,data:{taskId:first?.id,carry:{pile:p.id}},disabled:!first});
  const [menu,setMenu]=useState<{x:number;y:number}|null>(null),handle=useRef<HTMLButtonElement|null>(null);
  const i=holding?.intent,carryingThis=!!holding?.carry&&holding.carry.pile===p.id;
  const merge=i?.zone==='pile'&&!!i.carry&&i.create==null&&(i.pile??null)===p.id&&!carryingThis;
  // The landing slot: before the index-th card that is not itself being carried.
  const slotAt=i?.zone==='pile'&&!i.carry&&i.create==null&&(i.pile??null)===p.id?i.index??0:-1;
  const moving=holding?.ids??[],slotHeight=cardHeight(moving.reduce((n,id)=>n+(p.cards.find(c=>c.id===id)?.duration??getState().snapshot!.tasks.find(t=>t.id===id)?.duration??30),0));
  const all=p.cards.length>0&&p.cards.every(t=>ui.benchSelection.includes(t.id));
  let others=0;const rows:ReactNode[]=[];
  for(const t of p.cards){
    if(!moving.includes(t.id)){if(others===slotAt)rows.push(<Slot key="slot" height={slotHeight}/>);others++;}
    rows.push(<Card key={t.id} task={t} onOpen={onOpen}/>);
  }
  if(slotAt>=others)rows.push(<Slot key="slot" height={slotHeight}/>);
  function keys(e:KeyboardEvent<HTMLButtonElement>){
    if(e.altKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')&&!inbox){
      e.preventDefault();const to=visual+(e.key==='ArrowLeft'?-1:1);
      if(to>=1&&to<piles.length)void movePileTo(p.id!,to).then(ok=>{if(ok)requestAnimationFrame(()=>document.querySelector<HTMLElement>(`[data-pile="${CSS.escape(p.id!)}"] [data-pile-handle]`)?.focus());});
      return;
    }
    if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){e.preventDefault();const r=e.currentTarget.getBoundingClientRect();setMenu({x:r.left,y:r.bottom+4});}
    if(e.key==='Escape'&&getState().ui.benchSelection.length){e.preventDefault();setSelection([]);}
  }
  return <>
    <div className={'wb-pile'+(inbox?' inbox':'')+(merge?' hot':'')+(carryingThis&&!holding?.dropping?' lifted':'')} data-pile={p.id??''}>
      <button ref={el=>{handle.current=el;setNodeRef(el);}} type="button" className={'wb-handle'+(all?' sel':'')} data-pile-handle data-block="true" aria-label={pileName(p)+(all?', 선택됨':'')} aria-haspopup="menu"
        {...listeners} onClick={(e:MouseEvent)=>selectPile(p,e.shiftKey||e.ctrlKey||e.metaKey)} onKeyDown={keys}
        onContextMenu={e=>{e.preventDefault();setMenu({x:e.clientX,y:e.clientY});}}>
        <Dots/>{inbox&&<strong>투입구</strong>}{p.cards.length>0&&<span>{p.cards.length} · {formatDuration(p.total)}</span>}
      </button>
      <div className="wb-rail" aria-hidden="true"/>
      <AnimatePresence initial={false}>{rows}</AnimatePresence>
      {!p.cards.length&&slotAt<0&&<div className="wb-empty" aria-hidden="true"/>}
    </div>
    {menu&&<PileMenu pile={p} visual={visual} piles={piles} at={menu} onClose={()=>{setMenu(null);handle.current?.focus();}}/>}
    {visual<piles.length-1&&<Gutter before={visual+1} piles={piles} holding={holding}/>}
  </>;
}

const Slot=({height}:{height:number})=><motion.div className="wb-slot" style={{height}} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0,transition:{duration:0}}} transition={{duration:.1}}/>;

// A card on the bench or the 지난 미완료 shelf. The bottom lip and ↑/↓ set its length; Alt moves it.
function Card({task:t,past,onOpen}:{task:Task;past?:boolean;onOpen:Open}){
  const {ui,ready}=useApp(),{held}=useDrag(),memoId=useId();
  const {listeners,setNodeRef}=useDraggable({id:`bench:${t.id}`,data:{taskId:t.id},disabled:!ready});
  const [live,setLive]=useState<number|null>(null);
  const minutes=live??t.duration,h=cardHeight(minutes),compact=h<44,sel=ui.benchSelection.includes(t.id);
  const lifted=!!held&&!held.dropping&&held.ids.includes(t.id);
  const proto=t.proto&&live===null,size=proto?'':formatDuration(minutes),from=past?shortDate(t.plan_date!):'';
  const memo=!compact&&t.body.trim()?memoPreview(t.body):'';
  function keys(e:KeyboardEvent<HTMLButtonElement>){
    const vertical=e.key==='ArrowUp'||e.key==='ArrowDown',up=e.key==='ArrowUp';
    if(vertical&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){e.preventDefault();void setLength(t,t.duration+(up?-15:15));return;}
    if(vertical&&e.altKey&&!past){e.preventDefault();void nudge(t,up?-1:1);return;}
    if(e.altKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')&&!past){e.preventDefault();void shiftPile(t,e.key==='ArrowLeft'?-1:1);return;}
    if(e.key==='Delete'){e.preventDefault();const sel=getState().ui.benchSelection;for(const x of sel.includes(t.id)?selectedTasks():[t])void deleteTask(x);return;}
    if(e.key==='Escape'&&getState().ui.benchSelection.length){e.preventDefault();e.stopPropagation();setSelection([]);}
  }
  // The lip follows the hand in 15-minute steps and stores on release; the cards below simply follow.
  function resize(e:ReactPointerEvent<HTMLDivElement>){
    if(e.button!==0)return;
    e.stopPropagation();e.preventDefault();
    const el=e.currentTarget,y0=e.clientY;let value=t.duration;
    el.setPointerCapture(e.pointerId);setGesture(true);
    const move=(ev:PointerEvent)=>{value=Math.max(15,Math.min(1440,Math.round((t.duration+(ev.clientY-y0)/SCALE)/15)*15));setLive(value);};
    const up=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);setGesture(false);
      void setLength(t,value).finally(()=>setLive(null));};
    el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  }
  const label=`${t.title}, ${proto?'길이 미정':formatDuration(minutes)}${past?`, ${from} 미완료`:''}${sel?', 선택됨':''}`;
  return <motion.div ref={setNodeRef} data-card={t.id} data-block="true" layout="position" role="presentation" tabIndex={-1} {...listeners}
    className={'tblk wb-card'+(proto?' proto':'')+(past?' past':'')+(sel?' sel':'')+(lifted?' lifted':'')+(compact?' compact':'')+(ui.landed?.id===t.id?' landed':'')+(ui.split===t.id?' onboard':'')} style={{height:h}}
    initial={{opacity:0,y:-12}} animate={{opacity:1,y:0}} exit={{opacity:0,transition:{duration:0}}} transition={reflow}>
    <div className="tile">
      <button type="button" className="chk" aria-label={t.title+' 완료'} onClick={()=>void completeTasks([t])}><Icon name="check" size={12} stroke={3}/></button>
      <button type="button" className="main" data-task={t.id} aria-label={label} aria-describedby={memo?memoId:undefined}
        onClick={e=>{if(e.shiftKey||e.ctrlKey||e.metaKey){toggleSelected(t.id);return;}onOpen(t);}} onKeyDown={keys}>
        <span className="ttl-row"><span className="ttl">{t.title}</span></span>
        {memo&&<span className="wb-memo" id={memoId}>{memo}</span>}
        {(from||size)&&<span className="meta">{[from,size].filter(Boolean).join(' · ')}</span>}
      </button>
    </div>
    <div className="wb-lip" aria-hidden="true" onPointerDown={resize}/>
  </motion.div>;
}

// What the picked cards can do at once. Shipping is always to the end of a day's order.
function SelectionBar(){
  useApp();const picked=selectedTasks();
  if(!picked.length)return null;
  const ids=picked.map(t=>t.id),dated=picked.filter(t=>t.plan_date),[today,...later]=shipDates();
  return <div className="wb-selbar" role="group" aria-label="선택한 블록">
    <span className="wb-selinfo">선택 {picked.length} · {formatDuration(picked.reduce((n,t)=>n+t.duration,0))}</span>
    <button type="button" className="btn" onClick={()=>void shipTo(today,ids)}><Icon name="right" size={15}/>오늘에 싣기</button>
    <MenuButton label="다른 날에 싣기" items={later.map(d=>({label:`${shortDate(d)} ${dateOf(d).toLocaleDateString('ko-KR',{weekday:'short'})}`,run:()=>void shipTo(d,ids)}))}>다른 날</MenuButton>
    {dated.length>0&&<button type="button" className="btn" onClick={()=>void placeCards(dated.map(t=>t.id),null,0)}>미계획으로</button>}
    <button type="button" className="btn" onClick={()=>{setSelection([]);void completeTasks(picked);}}><Icon name="check" size={15}/>완료</button>
    <button type="button" className="ibtn danger" aria-label="선택한 블록 삭제" title="삭제" onClick={()=>{setSelection([]);for(const t of picked)void deleteTask(t);}}><Icon name="delete" size={16}/></button>
    <button type="button" className="ibtn" aria-label="선택 해제" title="선택 해제" onClick={()=>setSelection([])}><Icon name="close" size={15}/></button>
  </div>;
}

type Item={label:string;run:()=>void;disabled?:boolean};
function MenuButton({label,items,children}:{label:string;items:Item[];children:ReactNode}){
  const [at,setAt]=useState<{x:number;y:number}|null>(null),button=useRef<HTMLButtonElement>(null);
  return <>
    <button ref={button} type="button" className="btn" aria-haspopup="menu" aria-expanded={!!at} aria-label={label}
      onClick={e=>{const r=e.currentTarget.getBoundingClientRect();setAt(at?null:{x:r.left,y:r.bottom+4});}}>{children}<Icon name="down" size={14}/></button>
    {at&&<FloatingMenu label={label} items={items} at={at} onClose={()=>{setAt(null);button.current?.focus();}}/>}
  </>;
}

function PileMenu({pile:p,visual,piles,at,onClose}:{pile:PileView;visual:number;piles:PileView[];at:{x:number;y:number};onClose:()=>void}){
  const left=piles[visual-1],right=piles[visual+1],ids=p.cards.map(t=>t.id);
  const items:Item[]=[
    ...(left?[{label:`${visual-1===0?'투입구':'왼쪽 더미'}에 합치기`,disabled:!ids.length,run:()=>void stackOnto(p,left)}]:[]),
    ...(right?[{label:'오른쪽 더미에 합치기',disabled:!ids.length,run:()=>void stackOnto(p,right)}]:[]),
    ...(p.id===null&&ids.length?[{label:'새 더미로 옮기기',run:()=>void newPileWith(ids,1)}]:[]),
    ...shipDates().map((d,n)=>({label:n===0?'오늘에 싣기':`${shortDate(d)}에 싣기`,disabled:!ids.length,run:()=>void shipTo(d,ids)})),
  ];
  return <FloatingMenu label={`${pileName(p)} 메뉴`} items={items} at={at} onClose={onClose}/>;
}

function FloatingMenu({label,items,at,onClose}:{label:string;items:Item[];at:{x:number;y:number};onClose:()=>void}){
  const ref=useRef<HTMLDivElement>(null),[pos,setPos]=useState({left:at.x,top:at.y});
  useLayoutEffect(()=>{const r=ref.current!.getBoundingClientRect();setPos(clamp(at.x,at.y,r.width,r.height));ref.current!.querySelector<HTMLElement>('[role=menuitem]:not(:disabled)')?.focus({preventScroll:true});},[]);
  useEffect(()=>{
    const outside=(e:Event)=>{if(!ref.current?.contains(e.target as Node))onClose();};
    document.addEventListener('pointerdown',outside,true);addEventListener('resize',onClose);
    return ()=>{document.removeEventListener('pointerdown',outside,true);removeEventListener('resize',onClose);};
  },[]);
  return <motion.div ref={ref} role="menu" aria-label={label} className="menu wb-menu" style={pos} onKeyDown={e=>menuKeys(e,onClose)}
    initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} transition={{duration:.12}}>
    {items.map(i=><button key={i.label} type="button" role="menuitem" tabIndex={-1} disabled={i.disabled} onClick={()=>{onClose();i.run();}}>{i.label}</button>)}
  </motion.div>;
}

// The next working days as columns on the bench's scale: what is already on them, where working time ends, and what runs past it.
export function DateDock({frozen}:{frozen?:boolean}){
  return <section className={'card wb-dock'+(frozen?' wb-dim':'')} inert={frozen||undefined} aria-label="다음 근무일">{shipDates().map(d=><DateColumn key={d} date={d}/>)}</section>;
}

function DateColumn({date}:{date:string}){
  const {snapshot,today}=useApp(),{held,tasks}=useDrag(),ref=useRegion('date',date);
  const hot=!!held&&!held.dropping&&held.intent.zone==='date'&&held.intent.date===date;
  const base=allocation(date,snapshot!.tasks),after=hot?allocation(date,tasks):base,tag=dayTag(date),d=dateOf(date);
  const px=(m:number)=>Math.round(m*SCALE);
  // Work inside the available time stacks from the top; what runs past working time hangs below the line, hatched.
  const inside=(a:typeof base)=>a.used-a.outside,addIn=Math.max(0,inside(after)-inside(base)),addOut=Math.max(0,after.outside-base.outside);
  const height=px(Math.max(base.avail,inside(after))+after.outside+60);
  return <div ref={ref} className={'wb-day'+(hot?' hot':'')+(date===today?' today':'')} data-date={date} role="group" aria-label={`${dateLabel(date)}${tag?', '+tag:''}, ${allocationLabel(after)}`}>
    <div className="wb-dhead" aria-hidden="true">
      <div className="wb-dname"><strong>{d.toLocaleDateString('ko-KR',{weekday:'short'})}</strong><span>{d.getDate()}</span>{date===today&&<span className="pill">오늘</span>}{tag&&<span className="tag-chip">{tag}</span>}</div>
      <div className="wb-dload">{allocationShort(after)}</div>
      {after.outside>0&&<div className="wb-dover">근무 외 {hours(after.outside)}h</div>}
    </div>
    <div className="wb-dbody" style={{height}} aria-hidden="true">
      <div className="wb-avail" style={{height:px(base.avail)}}/>
      {inside(base)>0&&<div className="wb-base" style={{height:Math.max(18,px(inside(base))-3)}}>기존 {hours(base.used)}h</div>}
      {addIn>0&&<div className="wb-dslot" style={{top:px(inside(base))+1,height:Math.max(12,px(addIn)-2)}}/>}
      <div className="wb-cap" style={{top:px(base.avail)}}/>
      {after.outside>0&&<div className="wb-over" style={{top:px(base.avail),height:px(after.outside)}}/>}
      {addOut>0&&<div className="wb-dslot over" style={{top:px(base.avail+base.outside)+1,height:Math.max(12,px(addOut)-2)}}/>}
    </div>
  </div>;
}
