// Free 미계획 workbench and the date dock.
import {useEffect,useId,useLayoutEffect,useRef,useState,type KeyboardEvent,type PointerEvent as ReactPointerEvent,type ReactNode} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {useDraggable} from '@dnd-kit/core';
import {BOARD_CARD_WIDTH,BOARD_CARD_HEIGHT,onBench,seedBoardPositions} from '../../bench.ts';
import {memoPreview} from '../../detail.ts';
import {formatDuration} from '../../format.ts';
import {dateLabel,dateOf} from '../../dates.ts';
import type {Task} from '../../types.ts';
import {getState,useApp} from '../store/state.ts';
import {completeTasks,deleteTask,overdueTasks,setGesture} from '../store/tasks.ts';
import {mergeSelected,nudgeBoard,placeCards,selectedTasks,setLength,setSelection,shipDates,shipTo,shortDate,toggleSelected} from '../store/bench.ts';
import {openCut} from '../store/cut.ts';
import {allocation,allocationLabel,allocationShort,dayTag} from '../plan/day.tsx';
import {menuKeys,clamp} from '../editor/actions.ts';
import {useDrag,useRegion,type BoardView} from '../space/drag.tsx';
import {reflow} from '../ui/motion.ts';
import {Icon} from '../ui/icons.tsx';

export const SCALE=1;
const CARD_HEIGHT=BOARD_CARD_HEIGHT;
const hours=(minutes:number)=>String(Math.round(minutes/60*100)/100);
type Open=(t:Task)=>void;
const viewKey='blokky.workbench.view';
function initialView():BoardView{
  try{const v=JSON.parse(localStorage.getItem(viewKey)??'null');if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.zoom)&&v.zoom>0&&v.zoom<=2)return v;}catch{}
  return {x:0,y:0,zoom:1};
}

export function Bench({onOpen}:{onOpen:Open}){
  const {snapshot,ui}=useApp(),{held}=useDrag();
  const [view,setView]=useState(initialView),[hand,setHand]=useState(false),[space,setSpace]=useState(false);
  const liveView=useRef(view);liveView.current=view;
  const viewport=useRef<HTMLDivElement>(null),suppressClick=useRef(false);
  const register=useRegion('canvas',null,{board:view});
  const tasks=seedBoardPositions(snapshot!.tasks,snapshot!.piles??[]).filter(onBench).sort((a,b)=>a.board_y!-b.board_y!||a.board_x!-b.board_x!||a.id.localeCompare(b.id));
  const past=overdueTasks(),total=tasks.reduce((n,t)=>n+t.duration,0);
  type Gesture={kind:'box'|'pan';pointer:number;x:number;y:number;active:boolean;base:string[];view:BoardView};
  const gesture=useRef<Gesture|null>(null),[box,setBox]=useState<{left:number;top:number;width:number;height:number}|null>(null);
  const known=useRef(new Set(tasks.map(t=>t.id)));
  function changeView(next:BoardView){
    liveView.current=next;setView(next);
    try{localStorage.setItem(viewKey,JSON.stringify(next));}catch{}
  }
  function zoomTo(value:number,at?:{x:number;y:number}){
    const el=viewport.current;if(!el)return;
    const v=liveView.current,r=el.getBoundingClientRect(),p=at??{x:r.width/2,y:r.height/2},zoom=Math.max(.05,Math.min(2,value));
    changeView({zoom,x:p.x-(p.x-v.x)/v.zoom*zoom,y:p.y-(p.y-v.y)/v.zoom*zoom});
  }
  function fit(){
    const r=viewport.current?.getBoundingClientRect();if(!r)return;
    if(!tasks.length){changeView({x:0,y:0,zoom:1});return;}
    const left=Math.min(...tasks.map(t=>t.board_x!)),top=Math.min(...tasks.map(t=>t.board_y!));
    const width=Math.max(...tasks.map(t=>t.board_x!+BOARD_CARD_WIDTH))-left,height=Math.max(...tasks.map(t=>t.board_y!+CARD_HEIGHT))-top;
    const zoom=Math.min(1,(r.width-48)/width,(r.height-48)/height);
    changeView({zoom,x:(r.width-width*zoom)/2-left*zoom,y:(r.height-height*zoom)/2-top*zoom});
  }
  function reveal(id:string){
    const t=tasks.find(t=>t.id===id),r=viewport.current?.getBoundingClientRect();if(!t||!r)return;
    const v=liveView.current,left=t.board_x!*v.zoom+v.x,top=t.board_y!*v.zoom+v.y;
    const x=left<16?v.x+16-left:left+BOARD_CARD_WIDTH*v.zoom>r.width-16?v.x+r.width-16-left-BOARD_CARD_WIDTH*v.zoom:v.x;
    const y=top<16?v.y+16-top:top+CARD_HEIGHT*v.zoom>r.height-16?v.y+r.height-16-top-CARD_HEIGHT*v.zoom:v.y;
    if(x!==v.x||y!==v.y)changeView({...v,x,y});
  }
  useLayoutEffect(()=>{
    const added=tasks.find(t=>!known.current.has(t.id));known.current=new Set(tasks.map(t=>t.id));
    if(added)reveal(added.id);
  },[snapshot]);
  useLayoutEffect(()=>{if(ui.found?.kind==='bench')reveal(ui.found.id);},[ui.found]);
  function cancel(clear=false){
    const g=gesture.current;gesture.current=null;suppressClick.current=false;setBox(null);
    if(g){setGesture(false);if(g.kind==='box')setSelection(clear?[]:g.base);if(viewport.current?.hasPointerCapture(g.pointer))viewport.current.releasePointerCapture(g.pointer);}
  }
  useEffect(()=>{
    const editable=(e:globalThis.KeyboardEvent)=>(e.target as HTMLElement)?.closest('button,input,textarea,select,[contenteditable=true],[role=button],[role=separator]');
    const down=(e:globalThis.KeyboardEvent)=>{
      if(e.code==='Space'&&!editable(e)&&viewport.current?.contains(e.target as Node)){e.preventDefault();setSpace(true);}
      if(e.key==='Escape'&&!getState().ui.editorMode&&!getState().ui.split&&!held){cancel(true);setSelection([]);setHand(false);}
    };
    const up=(e:globalThis.KeyboardEvent)=>{if(e.code==='Space')setSpace(false);};
    const blur=()=>{setSpace(false);cancel();};
    document.addEventListener('keydown',down);document.addEventListener('keyup',up);window.addEventListener('blur',blur);
    return ()=>{document.removeEventListener('keydown',down);document.removeEventListener('keyup',up);window.removeEventListener('blur',blur);if(gesture.current)setGesture(false);};
  },[held]);
  useEffect(()=>{
    const el=viewport.current;if(!el)return;
    const wheel=(e:WheelEvent)=>{
      if(held||gesture.current)return;e.preventDefault();
      const v=liveView.current,r=el.getBoundingClientRect();
      if(e.ctrlKey)zoomTo(v.zoom*Math.exp(-e.deltaY*.002),{x:e.clientX-r.left,y:e.clientY-r.top});
      else changeView({...v,x:v.x-e.deltaX,y:v.y-e.deltaY});
    };
    el.addEventListener('wheel',wheel,{passive:false});return ()=>el.removeEventListener('wheel',wheel);
  },[held]);
  function start(e:ReactPointerEvent<HTMLDivElement>){
    const pan=e.button===1||e.button===0&&(space||hand);
    if(e.button!==1&&!space&&(e.target as HTMLElement).closest('button,input,textarea,select,a,summary'))return;
    if(held||gesture.current||!pan&&(e.button!==0||(e.target as HTMLElement).closest('button,input,textarea,[data-card],.wb-lip')))return;
    if(pan)e.stopPropagation();e.preventDefault();suppressClick.current=false;
    if(!(e.target as HTMLElement).closest('[data-card],button'))e.currentTarget.focus({preventScroll:true});
    gesture.current={kind:pan?'pan':'box',pointer:e.pointerId,x:e.clientX,y:e.clientY,active:false,base:e.ctrlKey||e.metaKey||e.shiftKey?[...getState().ui.benchSelection]:[],view:liveView.current};
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e:ReactPointerEvent<HTMLDivElement>){
    const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;
    if(!g.active&&Math.hypot(e.clientX-g.x,e.clientY-g.y)<=6)return;
    g.active=true;setGesture(true);
    if(g.kind==='pan'){changeView({...g.view,x:g.view.x+e.clientX-g.x,y:g.view.y+e.clientY-g.y});return;}
    const rect={left:Math.min(g.x,e.clientX),top:Math.min(g.y,e.clientY),width:Math.abs(e.clientX-g.x),height:Math.abs(e.clientY-g.y)};setBox(rect);
    const vr=viewport.current!.getBoundingClientRect();
    const hits=[...viewport.current!.querySelectorAll<HTMLElement>('[data-card]')].filter(el=>{
      const r=el.getBoundingClientRect();return r.right>vr.left&&r.left<vr.right&&r.bottom>vr.top&&r.top<vr.bottom&&r.left<=rect.left+rect.width&&r.right>=rect.left&&r.top<=rect.top+rect.height&&r.bottom>=rect.top;
    }).map(el=>el.dataset.card!);
    setSelection([...new Set([...g.base,...hits])]);
  }
  function finish(e:ReactPointerEvent<HTMLDivElement>){
    const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;
    gesture.current=null;suppressClick.current=g.active||g.kind==='pan';setBox(null);setGesture(false);
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  }
  const landing=held&&!held.dropping&&held.intent.zone==='canvas'?held.intent.positions:[];
  return <div className="wb-surface">
    <section className="wb-sec" aria-label="미계획">
      <header className="wb-head"><h2>미계획 {tasks.length>0&&<span className="cnt">{tasks.length}</span>}</h2>{total>0&&<span className="wb-sum">{formatDuration(total)}</span>}</header>
      <div className="wb-tools" role="toolbar" aria-label="작업대 도구">
        <button className="btn" type="button" aria-pressed={!hand} onClick={()=>setHand(false)}>선택</button>
        <button className="btn" type="button" aria-pressed={hand} onClick={()=>setHand(true)}>이동</button>
        <span className="wb-zoom-tools">
          <button className="ibtn" type="button" aria-label="축소" disabled={view.zoom<=.05} onClick={()=>zoomTo(view.zoom*.8)}><svg className="ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 12h14"/></svg></button>
          <button className="btn text wb-zoom" type="button" aria-label="100%로 보기" onClick={()=>zoomTo(1)}>{Math.round(view.zoom*100)}%</button>
          <button className="ibtn" type="button" aria-label="확대" disabled={view.zoom>=2} onClick={()=>zoomTo(view.zoom/.8)}><Icon name="plus" size={16}/></button>
          <button className="btn" type="button" onClick={fit}>전체 보기</button>
        </span>
      </div>
      <div ref={el=>{viewport.current=el;register(el);}} className={'wb-canvas'+(hand||space?' hand':'')} data-zoom={view.zoom} data-pan-x={view.x} data-pan-y={view.y} role="group" tabIndex={0} aria-label="자유 배치 작업대"
        onPointerDownCapture={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>cancel()} onLostPointerCapture={()=>{if(gesture.current)cancel();}}
        onClickCapture={e=>{if(suppressClick.current){suppressClick.current=false;e.preventDefault();e.stopPropagation();}}}>
        <div className="wb-world" style={{transform:`translate(${view.x}px,${view.y}px) scale(${view.zoom})`}}>
          <AnimatePresence initial={false}>{tasks.map(t=><Card key={t.id} task={t} board zoom={view.zoom} disabled={hand||space} onReveal={reveal} onOpen={onOpen}/>)}</AnimatePresence>
          {landing?.map(p=><div key={p.id} className="wb-slot" style={{left:p.x,top:p.y,width:BOARD_CARD_WIDTH,height:CARD_HEIGHT}} aria-hidden="true"/>)}
        </div>
        <SelectionBar/>
        {box&&<div className="wb-selection-box" style={box} aria-hidden="true"/>}
      </div>
    </section>
    {past.length>0&&<details className="wb-past"><summary>지난 미완료 {past.length}</summary><div className="wb-shelf"><AnimatePresence initial={false}>{past.map(t=><Card key={t.id} task={t} past onOpen={onOpen}/>)}</AnimatePresence></div></details>}
  </div>;
}

// A card on the bench or the 지난 미완료 shelf. The bottom lip and ↑/↓ set its length; Alt moves it.
function Card({task:t,past,board,zoom=1,disabled,onReveal,onOpen}:{task:Task;past?:boolean;board?:boolean;zoom?:number;disabled?:boolean;onReveal?:(id:string)=>void;onOpen:Open}){
  const {ui,ready}=useApp(),{held}=useDrag(),memoId=useId();
  const {listeners,setNodeRef}=useDraggable({id:`bench:${t.id}`,data:{taskId:t.id},disabled:disabled||!ready||!!held?.dropping});
  const [live,setLive]=useState<number|null>(null);
  const minutes=live??t.duration,sel=ui.benchSelection.includes(t.id);
  const lifted=!!held&&!held.dropping&&held.ids.includes(t.id);
  const dropping=!!held?.dropping&&held.ids.includes(t.id);
  const proto=t.proto&&live===null,size=formatDuration(minutes)+(proto?' · 미정':''),from=past?shortDate(t.plan_date!):'';
  const memo=t.body.trim()?memoPreview(t.body):'';
  async function remove(items:Task[],action:'main'|'wb-delete'){
    const ids=items.map(x=>x.id),cards=[...document.querySelectorAll<HTMLElement>('.wb-card')],at=cards.findIndex(c=>c.dataset.card===t.id);
    const next=cards.slice(at+1).find(c=>!ids.includes(c.dataset.card!))??cards.slice(0,at).reverse().find(c=>!ids.includes(c.dataset.card!));
    let ok=true;for(const task of items)ok=await deleteTask(task)&&ok;
    if(ok)requestAnimationFrame(()=>(next?.isConnected?next.querySelector<HTMLElement>('.'+action):document.getElementById('inbox-capture'))?.focus({preventScroll:true}));
  }
  function keys(e:KeyboardEvent<HTMLButtonElement>){
    const vertical=e.key==='ArrowUp'||e.key==='ArrowDown',up=e.key==='ArrowUp';
    if(vertical&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){e.preventDefault();void setLength(t,t.duration+(up?-15:15));return;}
    if(e.altKey&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)&&!past){e.preventDefault();void nudgeBoard(t,e.key==='ArrowLeft'?-16:e.key==='ArrowRight'?16:0,e.key==='ArrowUp'?-16:e.key==='ArrowDown'?16:0);return;}
    if(e.key==='Delete'){e.preventDefault();const sel=getState().ui.benchSelection;void remove(sel.includes(t.id)?selectedTasks():[t],'main');return;}
    if(e.key==='Escape'&&getState().ui.benchSelection.length){e.preventDefault();e.stopPropagation();setSelection([]);}
  }
  // A 15px lip movement changes the numeric duration by 15 minutes.
  function resize(e:ReactPointerEvent<HTMLDivElement>){
    if(e.button!==0)return;
    e.stopPropagation();e.preventDefault();
    const el=e.currentTarget,y0=e.clientY;let value=t.duration;
    el.setPointerCapture(e.pointerId);setGesture(true);
    const move=(ev:PointerEvent)=>{value=Math.max(15,Math.min(1440,Math.round((t.duration+(ev.clientY-y0)/zoom/SCALE)/15)*15));setLive(value);};
    const up=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);setGesture(false);
      void setLength(t,value).finally(()=>setLive(null));};
    el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  }
  const label=`${t.title}, ${size}${past?`, ${from} 미완료`:''}${sel?', 선택됨':''}`;
  return <motion.div ref={setNodeRef} data-card={t.id} data-block="true" layout={board||dropping?false:'position'} role="presentation" tabIndex={-1} onFocusCapture={()=>onReveal?.(t.id)} {...listeners}
    className={'tblk wb-card'+(proto?' proto':'')+(past?' past':'')+(sel?' sel':'')+(lifted?' lifted':'')+(ui.landed?.id===t.id?' landed':'')+(ui.split===t.id?' onboard':'')} style={{width:BOARD_CARD_WIDTH,height:CARD_HEIGHT,left:board?t.board_x!:undefined,top:board?t.board_y!:undefined,zIndex:ui.landed?.id===t.id?4:sel?3:1,visibility:dropping?'hidden':undefined}}
    initial={dropping?false:{opacity:0,y:-12}} animate={{opacity:1,y:0}} exit={{opacity:0,transition:{duration:0}}} transition={reflow}>
    <div className="tile">
      <button type="button" className="chk" aria-label={t.title+' 완료'} onClick={()=>void completeTasks([t])}><Icon name="check" size={12} stroke={3}/></button>
      <button type="button" className="main" data-task={t.id} aria-label={label} aria-describedby={memo?memoId:undefined}
        onClick={e=>{if(e.shiftKey||e.ctrlKey||e.metaKey){toggleSelected(t.id);return;}onOpen(t);}} onKeyDown={keys}>
        <span className="ttl-row"><span className="ttl">{t.title}</span></span>
        {memo&&<span className="wb-memo" id={memoId}>{memo}</span>}
        <span className="meta" aria-live={live!==null?'polite':undefined}><span className="wb-ruler" aria-hidden="true"><i style={{width:`${Math.min(100,minutes/480*100)}%`}}/></span>{[from,size].filter(Boolean).join(' · ')}</span>
      </button>
      <div className="wb-card-actions">
        <button type="button" className="btn text wb-split" aria-label={`${t.title} 나누기`} disabled={!ready} onPointerDown={e=>e.stopPropagation()} onClick={()=>openCut(t.id)}>나누기</button>
        <button type="button" className="ibtn wb-delete" aria-label={`${t.title} 삭제`} title="삭제" disabled={!ready} onPointerDown={e=>e.stopPropagation()} onClick={()=>void remove([t],'wb-delete')}><Icon name="delete" size={15}/></button>
      </div>
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
    {picked.length>=2&&!dated.length&&<button type="button" className="btn" onClick={()=>void mergeSelected()}>하나로 합치기</button>}
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
