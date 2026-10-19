import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type KeyboardEvent,type PointerEvent as ReactPointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {useDraggable} from '@dnd-kit/core';
import {motion} from 'motion/react';
import type {Task} from '../../types.ts';
import {isCompositionKey} from '../../capture.ts';
import {jump,keyInitial,sinceLabel,staleLabel,waitGroups,type WaitGroup} from '../../waiting.ts';
import {getState,useApp} from '../store/state.ts';
import {editTrigger,reorderWait,revive,setBand} from '../store/wait.ts';
import {deleteTask} from '../store/tasks.ts';
import {openEditor} from '../store/editor.ts';
import {aimedAt,useDrag,useRegion} from '../space/drag.tsx';
import {reduced,reflow} from '../ui/motion.ts';
import {Icon} from '../ui/icons.tsx';
import './waiting.css';
import {useDismiss} from '../ui/dismiss.ts';
import {SPRING,RANK,restHeight,lift,pose,type Mode,type CardPose} from './pile-motion.ts';
import {NamingField} from './fields.tsx';

// The 기다림 band at the right of the work screen: work that is not my turn, each block wearing what it waits for as a tag.
// Blocks waiting on the same trigger pile up under one tag. Waiting is quiet; only a met date takes the full tag colour.
// Meeting a trigger is taking the tag off (its square handle, or B): the block goes back to 준비 and is named for its next step.

type Band={
  cursor:string|null;keyOf:(id:string,e:KeyboardEvent)=>void;focus:(id:string)=>void;
  openKey:string|null;setOpenKey:(key:string|null)=>void;
  unclip:Set<string>;releaseIds:(ids:string[])=>void;scrolled:number;held:Set<string>;
  openReq:{key:string;id:string}|null;today:string;
};
const BandCtx=createContext<Band|null>(null);
const useBand=()=>useContext(BandCtx)!;

export function Waiting(){
  const s=useApp(),{held,tasks}=useDrag(),open=s.nav.band==='open';
  const groups=useMemo(()=>waitGroups(tasks,s.today),[tasks,s.today]);
  const count=groups.reduce((n,g)=>n+g.items.length,0),ready=groups.filter(g=>g.kind==='ready').reduce((n,g)=>n+g.items.length,0);
  const list=useRef<HTMLDivElement>(null);
  // Over the band a held block becomes a waiting token: the band's width, no time axis.
  const ref=useRegion('wait',null,{form:()=>({width:open?Math.max(160,(list.current?.clientWidth??236)-40):220,height:63})});
  const hot=aimedAt(held,'wait');
  const [cursor,setCursor]=useState<string|null>(null),[openKey,setOpenKey]=useState<string|null>(null);
  const [openReq,setOpenReq]=useState<{key:string;id:string}|null>(null);
  const [unclip,setUnclip]=useState(new Set<string>()),[scrolled,setScrolled]=useState(0);
  const focusAfter=useRef<string|null>(null),typed=useRef({text:'',at:0});
  const naming=s.ui.naming,inline=s.nav.view==='plan'&&open;

  // Roving focus: one tab stop. Arrows walk the rows; while a pile is raised, only its blocks.
  const members=new Map(groups.map(g=>[g.key,g.items.map(t=>t.id)]));
  const groupOf=new Map(groups.flatMap(g=>g.items.map(t=>[t.id,g] as const)));
  const raised=openKey&&(members.get(openKey)?.length??0)>1?openKey:null;
  const visible=raised?members.get(raised)!:groups.map(g=>g.items[0].id);
  const here=cursor&&visible.includes(cursor)?cursor:visible[0]??null;
  // The block to focus may still be landing (a pile folding back keeps its row hidden), so it is tried for a few frames.
  const focus=useCallback((id:string)=>{
    focusAfter.current=id;setCursor(id);
    // It counts once it has held for a few frames; the keyboard taken elsewhere meanwhile is left there.
    let frames=0,held=0;
    const attempt=()=>{
      if(focusAfter.current!==id)return;
      const a=document.activeElement as HTMLElement|null,mine=!!a&&a.dataset.wait===id&&a.checkVisibility({visibilityProperty:true});
      if(mine)held++;
      else if(!a||a===document.body||a.closest('#wait,.wpile-layer')){held=0;[...document.querySelectorAll<HTMLElement>(`[data-wait="${CSS.escape(id)}"]`)].find(e=>e.checkVisibility({visibilityProperty:true}))?.focus({preventScroll:false});}
      else held=99;
      if(held>=3||++frames>40)focusAfter.current=null;else requestAnimationFrame(attempt);
    };
    requestAnimationFrame(attempt);
  },[]);
  const releaseIds=useCallback((ids:string[])=>{
    if(getState().ui.naming)return;
    if(getState().nav.dock==='hidden'){void revive(ids);return;}
    // The tag comes off first; then the freed blocks travel to 준비.
    setUnclip(new Set(ids));
    setTimeout(()=>{void revive(ids).finally(()=>setUnclip(new Set()));},reduced()?0:150);
  },[]);
  const heldIds=new Set(held&&!held.dropping?held.ids:[]);

  function keyOf(id:string,e:KeyboardEvent){
    const g=groupOf.get(id);if(!g||e.ctrlKey||e.metaKey||getState().ui.naming)return;
    const pile=g.items.length>1,isOpen=raised===g.key,closedTop=pile&&!isOpen,at=visible.indexOf(id),t=g.items.find(x=>x.id===id)!;
    if(e.altKey){
      if(isOpen&&(e.key==='ArrowUp'||e.key==='ArrowDown')){e.preventDefault();void reorderWait(id,at+(e.key==='ArrowUp'?-1:1)).then(()=>focus(id));}
      return;
    }
    const go=(to:string|undefined)=>{e.preventDefault();if(to)focus(to);};
    if(e.key==='ArrowDown')return go(visible[at+1]);
    if(e.key==='ArrowUp')return go(visible[at-1]);
    if(e.key==='Home')return go(visible[0]);
    if(e.key==='End')return go(visible[visible.length-1]);
    if(e.code==='KeyB'&&!e.shiftKey&&!isCompositionKey(e.nativeEvent)){e.preventDefault();releaseIds(closedTop?members.get(g.key)!:[id]);return;}
    if(e.key==='F2'){e.preventDefault();editTrigger(closedTop?members.get(g.key)!:[id]);return;}
    if(closedTop&&(e.key==='ArrowRight'||e.key==='Enter')){e.preventDefault();setOpenReq({key:g.key,id});return;}
    if(isOpen&&(e.key==='ArrowLeft'||e.key==='Escape')){e.preventDefault();setOpenKey(null);focus(g.items[0].id);return;}
    if(e.key==='Enter'){e.preventDefault();openEditor(id,'dialog');return;}
    if(e.key==='Delete'&&!closedTop){e.preventDefault();void deleteTask(t);return;}
    if(e.shiftKey||isCompositionKey(e.nativeEvent))return;
    const ch=keyInitial(e.code,e.key);if(!ch)return;
    e.preventDefault();
    const now=Date.now();typed.current={text:now-typed.current.at<800?typed.current.text+ch:ch,at:now};
    const entries=groups.flatMap(x=>x.items.map((b,i)=>({id:b.id,key:x.key,top:i===0,trigger:x.text,title:b.title})));
    const hit=jump(entries,id,typed.current.text);if(!hit)return;
    // A pile is reached closed, by its front; a block deeper inside raises its pile.
    if(hit.top){if(raised&&raised!==hit.key)setOpenKey(null);focus(hit.id);}
    else setOpenReq({key:hit.key,id:hit.id});
  }

  const band:Band={cursor:here,keyOf,focus,openKey,setOpenKey,unclip,releaseIds,scrolled,held:heldIds,openReq,today:s.today};
  if(!open)return <aside ref={ref} id="wait" className={'waitband closed'+(hot?' hot':'')} aria-label="기다림">
    <button type="button" className="wait-unfold" aria-label={`기다림 펴기${count?`, ${count}건`:''}${ready?`, 충족 ${ready}건`:''}`} aria-keyshortcuts="\" onClick={()=>setBand('open')}>
      <Icon name="wait" size={18}/>{count>0&&<span className="cnt">{count}</span>}
    </button>
    {ready>0&&<span className="wait-ready" aria-hidden="true">{ready}</span>}
  </aside>;
  // A field for blocks partly in a pile goes before it; for a whole group, in its place.
  const naming_=inline&&naming?new Set(naming.ids):null;
  let fieldShown=false;
  const rows=groups.flatMap(g=>{
    if(!naming_)return [<Row key={g.key} group={g}/>];
    const rest={...g,items:g.items.filter(t=>!naming_.has(t.id))},touched=rest.items.length<g.items.length;
    const out=[];
    if(touched&&!fieldShown){fieldShown=true;out.push(<NamingField key="naming"/>);}
    if(rest.items.length)out.push(<Row key={g.key} group={rest}/>);
    return out;
  });
  return <BandCtx.Provider value={band}>
    <aside ref={ref} id="wait" className={'waitband'+(hot?' hot':'')+(raised?' raised':'')} aria-label="기다림">
      <header><h2>기다림 {count>0&&<span className="cnt">{count}</span>}</h2>
        <button type="button" className="ibtn wait-fold" aria-label="기다림 접기" aria-keyshortcuts="\" title="접기" onClick={()=>setBand('closed')}><Icon name="foldRight" size={16}/></button></header>
      {naming_&&!fieldShown&&<NamingField/>}
      <div ref={list} className="wait-list" onScroll={()=>setScrolled(n=>n+1)}>{rows}</div>
    </aside>
    {openReq&&<OpenRequest req={openReq} done={()=>setOpenReq(null)}/>}
  </BandCtx.Provider>;
}
// Hands an open request (from the keyboard) to its pile once, then clears it.
function OpenRequest({done}:{req:{key:string;id:string};done:()=>void}){useEffect(()=>{const t=setTimeout(done,0);return ()=>clearTimeout(t);});return null;}

const TriggerIcon=({group}:{group:WaitGroup})=>group.kind==='who'
  ?<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="8" cy="5.5" r="2.6"/><path d="M3 14c.6-2.8 2.6-4.3 5-4.3s4.4 1.5 5 4.3"/></svg>
  :<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.8h11M5.5 2v3M10.5 2v3"/></svg>;
const Check=()=><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3L9.5 3.6"/></svg>;
const label=(g:WaitGroup)=>g.text||'정하지 않음';

function Row({group}:{group:WaitGroup}){
  return group.items.length>1?<Pile group={group}/>:<Single group={group} t={group.items[0]}/>;
}

// One waiting block: its trigger as a tag on top, the task below. The tag's words change the trigger; its square handle meets it.
function Single({group,t}:{group:WaitGroup;t:Task}){
  const b=useBand(),ready=group.kind==='ready',hollow=b.held.has(t.id),{openKey}=b;
  const {listeners,setNodeRef}=useDraggable({id:`wait:${t.id}`,data:{taskId:t.id}});
  const since=group.kind==='who'?sinceLabel(t):'',stale=group.kind==='who'?staleLabel(t,b.today):'';
  return <div ref={setNodeRef} data-block="true" data-flight={t.id} className={'wrow'+(ready?' ready':'')+(hollow?' hollow':'')+(openKey?' dim':'')} {...listeners} tabIndex={-1} role="presentation">
    <div className={'wtag'+(b.unclip.has(t.id)?' off':'')}>
      <button type="button" className="wtag-text" tabIndex={-1} aria-label={`${label(group)}, 바꾸기`} aria-keyshortcuts="F2" onClick={e=>{e.stopPropagation();editTrigger([t.id]);}}>
        <TriggerIcon group={group}/><span className={'trig'+(group.named?'':' unnamed')}>{label(group)}</span>{stale&&<span className="since">{stale}</span>}
      </button>
      <button type="button" className="handle" tabIndex={-1} aria-label={`${label(group)} 충족`} title="충족" onClick={e=>{e.stopPropagation();b.releaseIds([t.id]);}}><Check/></button>
    </div>
    <button type="button" className="wbody" data-wait={t.id} tabIndex={b.cursor===t.id?0:-1} aria-keyshortcuts="B F2 Delete"
      aria-label={`${t.title}, 기다림: ${label(group)}${ready?', 충족':''}${since?', '+since:''}`} title={since?since+' 기다림':undefined} onClick={()=>openEditor(t.id,'dialog')} onKeyDown={e=>b.keyOf(t.id,e)} onFocus={()=>{if(b.cursor!==t.id)b.focus(t.id);}}>
      <span className="ttl">{t.title}</span>
    </button>
  </div>;
}

function Pile({group}:{group:WaitGroup}){
  const b=useBand(),key=group.key,ids=group.items.map(t=>t.id),ready=group.kind==='ready',n=ids.length;
  const row=useRef<HTMLDivElement>(null);
  const [mode,setMode]=useState<Mode>('rest'),[at,setAt]=useState<{left:number;top:number;width:number}|null>(null);
  const modeRef=useRef(mode);modeRef.current=mode;
  const timers=useRef({hover:0,leave:0,fold:0,suppress:0});
  const pile=useDraggable({id:`wait-pile:${key}`,data:{taskId:ids[0],ids},disabled:mode==='open'});
  const hollow=ids.some(id=>b.held.has(id))&&mode!=='open';
  const raise=useCallback((to:Mode)=>{
    clearTimeout(timers.current.fold);
    if(!row.current)return;
    setAt(a=>{if(a)return a;const r=row.current!.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width};});
    setMode(to);
  },[]);
  const fold=useCallback((now=false)=>{
    clearTimeout(timers.current.hover);clearTimeout(timers.current.fold);
    setMode('rest');
    if(now||reduced())setAt(null);
    // Its row returns once it has landed.
    else timers.current.fold=window.setTimeout(()=>{if(modeRef.current==='rest')setAt(null);},420);
  },[]);
  const close=useCallback(()=>{timers.current.suppress=Date.now()+500;if(b.openKey===key)b.setOpenKey(null);fold();},[b,key,fold]);
  const openUp=useCallback((focusId?:string)=>{b.setOpenKey(key);raise('open');if(focusId)b.focus(focusId);},[b,key,raise]);
  // Only one pile is up at a time; the band scrolling drops a lifted one where it is.
  // Shut on purpose, it stays shut under the pointer for a moment instead of peeking straight back.
  useEffect(()=>{if(mode==='open'&&b.openKey!==key){timers.current.suppress=Date.now()+500;fold();}},[b.openKey,key,mode,fold]);
  useEffect(()=>{if(at)fold(true);},[b.scrolled]);
  useEffect(()=>{if(b.openReq?.key===key)openUp(b.openReq.id);},[b.openReq]);
  useEffect(()=>{if(b.held.size&&mode==='peek')fold(true);},[b.held.size]);
  useEffect(()=>()=>{clearTimeout(timers.current.hover);clearTimeout(timers.current.leave);clearTimeout(timers.current.fold);},[]);
  // An open pile stays open while its own layer, a dialog or a menu is pressed; a resize folds it.
  useDismiss(t=>!!t.closest(`[data-pile-layer="${CSS.escape(key)}"],[data-pile="${CSS.escape(key)}"],dialog,[role=menu]`),close,{enabled:mode==='open'});
  useEffect(()=>{
    if(mode!=='open')return;
    const resize=()=>fold(true);addEventListener('resize',resize);return ()=>removeEventListener('resize',resize);
  },[mode,fold]);
  const enter=(e:ReactPointerEvent)=>{
    if(e.pointerType!=='mouse')return;
    clearTimeout(timers.current.leave);
    if(modeRef.current!=='rest'||b.openKey||b.held.size||getState().ui.naming||Date.now()<timers.current.suppress)return;
    if(at){raise('peek');return;}
    timers.current.hover=window.setTimeout(()=>{if(modeRef.current==='rest'&&!b.openKey)raise('peek');},140);
  };
  const leave=()=>{clearTimeout(timers.current.hover);timers.current.leave=window.setTimeout(()=>{if(modeRef.current==='peek')fold();},90);};
  const face={group,mode,width:at?.width??0,top:at?.top??0,openUp,close};
  return <div ref={row} data-pile={key} className={'wpile'+(ready?' ready':'')+(b.openKey&&b.openKey!==key?' dim':'')+(hollow?' hollow':'')}
    style={{height:restHeight(n,ready)}} onPointerEnter={enter} onPointerLeave={leave} role="group" aria-label={`${label(group)} ${n}건`}>
    <div ref={pile.setNodeRef} data-block="true" data-flight={ids[0]} className="wpile-rest" style={{visibility:at?'hidden':undefined}} {...pile.listeners} tabIndex={-1} role="presentation">
      <PileFace {...face} mode="rest" static/>
    </div>
    {at&&createPortal(<div className="wpile-layer" data-pile-layer={key} style={{left:at.left,top:at.top,width:at.width}} onPointerEnter={()=>clearTimeout(timers.current.leave)} onPointerLeave={()=>{if(modeRef.current==='peek')leave();}}>
      <PileFace {...face} drag={mode!=='open'?{ids}:undefined}/>
    </div>,document.body)}
  </div>;
}

function PileFace({group,mode,width,top,openUp,close,static:still=false,drag}:{group:WaitGroup;mode:Mode;width:number;top:number;openUp:(id?:string)=>void;close:()=>void;static?:boolean;drag?:{ids:string[]}}){
  const b=useBand(),ready=group.kind==='ready',n=group.items.length,ids=group.items.map(t=>t.id);
  const p=pose(n,mode,ready,width||236,top),rest=pose(n,'rest',ready,width||236,top),full=mode==='open'&&!still;
  const reorderRegion=useRegion('wait',null,{list:{gap:6,items:()=>group.items.map(t=>({id:t.id,height:32})),top:()=>top+p.cards[0].y},form:()=>({width:width||236,height:32})});
  const prev=useRef(mode),rising=RANK[mode]>RANK[prev.current];useEffect(()=>{prev.current=mode;});
  const spring=(delay=0)=>reduced()||still?{duration:0}:full&&prev.current==='open'?reflow:{type:'spring' as const,...SPRING[mode],delay:rising?delay:0};
  const whole=useDraggable({id:`${still?'wait-peek-rest':'wait-peek'}:${group.key}`,data:{taskId:ids[0],ids},disabled:!drag||still});
  const allOff=group.items.every(t=>b.unclip.has(t.id));
  return <div className="wface" ref={drag&&!still?whole.setNodeRef:undefined} style={drag&&!still?{height:restHeight(n,ready)}:undefined} data-block={drag&&!still?'true':undefined} {...(drag&&!still?whole.listeners:{})}>
    {full&&<div ref={reorderRegion} style={{position:'absolute',top:p.cards[0].y,width:'100%',height:(n-1)*38+32,pointerEvents:'none'}}/>}
    <motion.div aria-hidden="true" className="wtray" initial={still?false:{x:rest.tray.x,y:rest.tray.y,width:rest.tray.width,height:rest.tray.height,opacity:0,boxShadow:lift(0)}}
      animate={{x:p.tray.x,y:p.tray.y,width:p.tray.width,height:p.tray.height,opacity:p.tray.opacity,boxShadow:lift(p.tray.shadow)}} transition={spring()}/>
    <motion.div className={'wtag whead'+(ready?' ready':'')+(allOff?' off':'')} style={{zIndex:n+2}} initial={still?false:{y:rest.head.y,boxShadow:lift(0)}} animate={{y:p.head.y,boxShadow:lift(p.head.shadow)}} transition={spring()}>
      <button type="button" className="wtag-text" tabIndex={-1} aria-label={full?`${label(group)} ${n}건, 바꾸기`:`${label(group)} ${n}건 펴기`}
        onClick={e=>{e.stopPropagation();if(full)editTrigger(ids);else openUp(ids[0]);}}>
        <TriggerIcon group={group}/><span className={'trig'+(group.named?'':' unnamed')}>{label(group)}</span><span className="count" aria-hidden="true">{n}</span>
      </button>
      <button type="button" className="handle" tabIndex={-1} aria-label={`${label(group)} ${n}건, 모두 충족`} title="모두 충족" onClick={e=>{e.stopPropagation();b.releaseIds(ids);}}><Check/></button>
    </motion.div>
    {group.items.map((t,i)=><PileCard key={t.id} t={t} i={i} n={n} group={group} pose={p.cards[i]} from={rest.cards[i]} transition={spring(i*.012)} still={still} full={full} openUp={openUp}/>)}
    {!still&&<motion.button type="button" className="wfold" tabIndex={-1} aria-label={`${label(group)} 접기`} aria-expanded={full} style={{pointerEvents:full?undefined:'none',left:(width||236)/2-22}}
      initial={{y:rest.fold.y,opacity:0}} animate={{y:p.fold.y,opacity:p.fold.opacity}} transition={spring(.14)} onClick={()=>{close();b.focus(ids[0]);}}><Icon name="up" size={14}/></motion.button>}
  </div>;
}

function PileCard({t,i,n,group,pose:p,from,transition,still,full,openUp}:{t:Task;i:number;n:number;group:WaitGroup;pose:CardPose;from:CardPose;transition:object;still:boolean;full:boolean;openUp:(id?:string)=>void}){
  const b=useBand(),ready=group.kind==='ready',corner=i===0&&!ready;
  // Raised, each block is its own: dragged alone, its own tag slice meets its own trigger.
  const one=useDraggable({id:`${still?'wait-rest':'wait'}:${t.id}`,data:{taskId:t.id},disabled:!full});
  const since=group.kind==='who'?sinceLabel(t):'',stale=group.kind==='who'?staleLabel(t,b.today):'';
  const focusable=still?i===0&&b.openKey!==group.key:full;
  return <motion.div ref={full?one.setNodeRef:undefined} data-block={full?'true':undefined} data-flight={full?t.id:undefined} {...(full?one.listeners:{})}
    className={'wcard'+(corner?' front':'')+(ready?' ready':'')+(p.slice?' split':'')+(full&&b.held.has(t.id)?' hollow':'')} style={{zIndex:n-i,transformOrigin:'50% 0'}}
    initial={still?false:{y:from.y,scale:from.scale,opacity:from.opacity,boxShadow:lift(0)}} animate={{y:p.y,scale:p.scale,opacity:p.opacity,boxShadow:lift(p.shadow)}} transition={transition}>
    {/* Each block's own handle is there only while the pile is raised; resting, the front reads like a single block. */}
    <motion.button type="button" className={'wslice'+(b.unclip.has(t.id)?' off':'')} tabIndex={-1}
      initial={still?false:{width:from.slice,marginRight:from.slice?1:0}} animate={{width:p.slice,marginRight:p.slice?1:0}} transition={transition} aria-label={full?`${t.title}, ${label(group)} 충족`:`${label(group)} ${n}건 펴기`} title={full?'충족':undefined}
      onClick={e=>{e.stopPropagation();if(full)b.releaseIds([t.id]);else openUp(t.id);}}>
      <motion.span className="handle" aria-hidden="true" initial={false} animate={{opacity:p.handle}} transition={{duration:still?0:.18}}><Check/></motion.span>
    </motion.button>
    <button type="button" className="wbody" data-wait={focusable?t.id:undefined} tabIndex={focusable&&b.cursor===t.id?0:-1} aria-keyshortcuts={full?'B F2 Delete Alt+ArrowUp Alt+ArrowDown':'Enter B F2'}
      aria-label={!full&&i===0?`${t.title} 외 ${n-1}건, 기다림: ${label(group)}${ready?', 충족':''}`:`${t.title}, 기다림: ${label(group)}${since?', '+since:''}, ${n}건 중 ${i+1}`} title={full&&since?since+' 기다림':undefined}
      aria-expanded={!full&&i===0?false:undefined}
      onClick={e=>{e.stopPropagation();if(full)openEditor(t.id,'dialog');else openUp(t.id);}} onKeyDown={e=>b.keyOf(t.id,e)} onFocus={()=>{if(b.cursor!==t.id)b.focus(t.id);}}>
      <span className="ttl">{t.title}</span>{stale&&<span className="since">{stale}</span>}
    </button>
    <motion.span className="wshade" aria-hidden="true" initial={still?false:{opacity:from.shade}} animate={{opacity:p.shade}} transition={transition}/>
  </motion.div>;
}
