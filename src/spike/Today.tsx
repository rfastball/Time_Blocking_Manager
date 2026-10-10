import {useEffect,useRef,useState,type KeyboardEvent,type MouseEvent as ReactMouseEvent,type PointerEvent as ReactPointerEvent} from 'react';
import {DndContext,DragOverlay,PointerSensor,useDraggable,useSensor,useSensors,defaultDropAnimationSideEffects,type DragEndEvent,type DragMoveEvent,type DragStartEvent,type DropAnimation,type Modifier} from '@dnd-kit/core';
import {AnimatePresence,motion,useAnimate,useMotionValue,useSpring,type MotionValue} from 'motion/react';
import {dayPlan,type DayItem} from '../today.ts';
import {effectiveDay} from '../settings.ts';
import {placementIssue} from '../placement.ts';
import {timeAxisForDays,type TimeAxis} from '../time-axis.ts';
import {formatDuration} from '../format.ts';
import {unplacedLabel,moveInOrder,byFlowOrder} from '../flow.ts';
import {isCompositionKey} from '../capture.ts';
import {dateLabel,time,today} from '../dates.ts';
import type {Task} from '../types.ts';
import {applyIntent,intentAction,updateAction,type Intent,type Zone} from './intent.ts';
import {discard,dispatch,native,retry,setNow,useStore} from './store.ts';

const PX=1.2,RAIL_END=86,FLOW_LEFT=92,FIXED_LEFT=56,RIGHT=10,SNAP=15;
// Blocks are placed with `top`, never a transform: dnd-kit measures boxes without transforms.
// One spring for everything that moves because the plan changed. It keeps velocity when the target changes mid-flight.
const settle={type:'spring' as const,visualDuration:.42,bounce:.22};
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

type Held={task:Task;intent:Intent;width:number;startWidth:number;grabX:number;dropping?:boolean};

export function Today(){
  const {snapshot,error,busy,failed,now}=useStore();
  const date=today();
  const [selected,setSelected]=useState<string|null>(null);
  const [multi,setMulti]=useState<string[]>([]);
  const [held,setHeld]=useState<Held|null>(null);
  const [pending,setPending]=useState<Intent|null>(null);
  const [resize,setResize]=useState<{id:string;dur:number}|null>(null);
  const [squash,setSquash]=useState<string[]>([]);
  const [landed,setLanded]=useState<{id:string;clack:boolean}|null>(null);
  const [draft,setDraft]=useState('');
  const spaceRef=useRef<HTMLDivElement>(null),trayRef=useRef<HTMLElement>(null),belowRef=useRef<HTMLDivElement>(null);
  const start=useRef<{rect:{left:number;top:number;width:number;height:number};x:number;t:number;tilt:number;idle?:ReturnType<typeof setTimeout>}|null>(null);
  const snap=useRef<{left:number;top:number}|null>(null);
  const tilt=useMotionValue(0),tiltSmooth=useSpring(tilt,{stiffness:140,damping:22});
  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:5}}));

  if(!snapshot)return <main className="sp-load">{error?<p role="alert">{error}</p>:<p>기록을 불러오는 중입니다.</p>}</main>;
  const rule=effectiveDay(snapshot.settings,date);
  const axis=timeAxisForDays([rule],PX);
  const base=snapshot.tasks;
  const holding=held&&!held.dropping?held:null;
  let tasks=applyIntent(base,date,held?.intent??pending);
  if(resize)tasks=tasks.map(t=>t.id===resize.id?{...t,duration:resize.dur}:t);
  const plan=dayPlan(date,tasks,rule,snapshot.layouts);
  const nextId=plan.items.find(i=>!i.fixed&&!squash.includes(i.task.id))?.task.id??null;
  const inbox=tasks.filter(t=>!t.plan_date&&!t.completed);
  const doneIds=new Set(base.filter(t=>t.completed).map(t=>t.id));
  const byId=(id:string)=>base.find(t=>t.id===id);
  const stamp=()=>date+'T'+time(now);

  // ── 완료 ──
  async function complete(ids:string[]){
    const all=ids.map(byId).filter((t):t is Task=>!!t&&!t.completed);
    const flow=all.filter(t=>t.plan_date===date&&!t.starts_at),fixed=all.filter(t=>t.starts_at);
    setMulti([]);
    if(flow.length){
      setSquash(flow.map(t=>t.id));
      await dispatch({type:'complete_flow',date,items:flow.map(({id,revision})=>({id,revision})),at:stamp()});
      setSquash([]);
    }
    for(const t of fixed)await dispatch({type:'set_completed',id:t.id,expected_revision:t.revision,completed:true});
  }
  const uncomplete=(t:Task)=>dispatch({type:'set_completed',id:t.id,expected_revision:t.revision,completed:false});
  const reorder=(t:Task,delta:number)=>{
    const flows=base.filter(x=>x.plan_date===date&&!x.starts_at&&!x.completed).sort(byFlowOrder);
    const ids=moveInOrder(flows.map(x=>x.id),t.id,delta);
    if(ids)void dispatch({type:'reorder_flow',date,expected:ids.map(id=>({id,revision:byId(id)!.revision}))});
  };
  const fixHere=(t:Task,minute:number)=>dispatch(updateAction(t,date,date+'T'+time(minute))).then(ok=>{if(ok)land(t.id,true);});
  const unfix=(t:Task)=>{
    const m=Number(t.starts_at!.slice(11,13))*60+Number(t.starts_at!.slice(14,16));
    const before=plan.items.find(i=>!i.fixed&&i.start>=m)?.task.id??plan.unplaced[0]?.task.id??null;
    void dispatch(updateAction(t,date,null,before)).then(ok=>{if(ok)land(t.id,false);});
  };
  function land(id:string,clack:boolean){setLanded({id,clack});setTimeout(()=>setLanded(l=>l?.id===id?null:l),520);}

  // ── 들어서 옮기기 ──
  const zoneAt=(task:Task,px:number,py:number,top:number):Intent=>{
    const hit=(el:Element|null)=>{if(!el)return null;const r=el.getBoundingClientRect();return px>=r.left&&px<=r.right&&py>=r.top&&py<=r.bottom?r:null;};
    const space=hit(spaceRef.current);
    const intent:Intent={id:task.id,zone:'none',before:null,start:null,ok:true,reason:null};
    if(space){
      const topIn=top-space.top;
      if(px-space.left<RAIL_END){
        const minute=Math.round(axis.minute(topIn)/SNAP)*SNAP;
        const issue=placementIssue(task.id,date,minute,task.duration,rule,base);
        return {...intent,zone:'rail',start:minute,ok:!issue,reason:issue?.label??null};
      }
      const rest=dayPlan(date,base.filter(t=>t.id!==task.id),rule,snapshot!.layouts);
      const centre=axis.minute(topIn+task.duration*PX/2);
      const flows=rest.items.filter(i=>!i.fixed);
      const before=flows.find(i=>centre<(i.start+i.end)/2)?.task.id??rest.unplaced[0]?.task.id??null;
      return {...intent,zone:'body',before};
    }
    if(hit(belowRef.current))return {...intent,zone:'below'};
    if(hit(trayRef.current)&&task.plan_date)return {...intent,zone:'tray'};
    return intent;
  };
  const widthFor=(zone:Zone,fallback:number)=>{
    const w=spaceRef.current?.getBoundingClientRect().width??fallback;
    return zone==='rail'?w-FIXED_LEFT-RIGHT:zone==='body'||zone==='below'?w-FLOW_LEFT-RIGHT:fallback;
  };
  function onDragStart(e:DragStartEvent){
    const task=byId(String(e.active.id));if(!task)return;
    // dnd-kit measures the active node after this callback, so read the block's own box.
    const node=(e.activatorEvent.target as HTMLElement).closest('.sp-blk,.sp-tblk,.sp-ublk')!;
    const r=node.getBoundingClientRect();
    start.current={rect:{left:r.left,top:r.top,width:r.width,height:r.height},x:(e.activatorEvent as PointerEvent).clientX,t:performance.now(),tilt:0};
    snap.current=null;tilt.set(0);
    // Selection waits for the drop: changing the detail panel now would shift the tray under the pointer.
    setMulti([]);
    setHeld({task,intent:{id:task.id,zone:'none',before:null,start:null,ok:true,reason:null},width:r.width,startWidth:r.width,grabX:start.current.x-r.left});
  }
  function onDragMove(e:DragMoveEvent){
    const s=start.current,h=held;if(!s||!h||h.dropping)return;
    const a=e.activatorEvent as PointerEvent,px=a.clientX+e.delta.x,py=a.clientY+e.delta.y;
    const top=s.rect.top+e.delta.y;
    const intent=zoneAt(h.task,px,py,top);
    const space=spaceRef.current?.getBoundingClientRect();
    snap.current=intent.zone==='rail'&&space?{left:space.left+FIXED_LEFT,top:space.top+axis.position(intent.start!)+1}:null;
    // A slight, damped lean in the direction of travel; none while latched to the rail.
    const t=performance.now(),vx=(px-s.x)/Math.max(8,t-s.t)*16;s.x=px;s.t=t;
    s.tilt=intent.zone==='rail'||reduced()?0:Math.max(-1.2,Math.min(1.2,s.tilt*.85+vx*.04));
    tilt.set(s.tilt);clearTimeout(s.idle);s.idle=setTimeout(()=>{s.tilt=0;tilt.set(0);},140);
    const i=h.intent;
    if(i.zone!==intent.zone||i.before!==intent.before||i.start!==intent.start||i.ok!==intent.ok)setHeld({...h,intent,width:widthFor(intent.zone,s.rect.width)});
  }
  async function onDragEnd(_:DragEndEvent){
    const h=held;snap.current=null;tilt.set(0);
    if(!h)return;
    // The copy keeps rendering while it settles onto the block, now aligned with it.
    setHeld({...h,dropping:true});setTimeout(()=>setHeld(x=>x?.dropping?null:x),reduced()?0:320);
    setSelected(h.task.id);
    const action=intentAction(base,date,h.intent);
    if(!action)return;
    // The dropped block stays where it was put until the store answers; a failure lets it spring back.
    setPending(h.intent);
    const ok=await dispatch(action);
    setPending(null);
    if(ok)land(h.task.id,h.intent.zone==='rail');
  }
  const snapModifier:Modifier=({transform})=>{
    const s=snap.current,o=start.current;
    return s&&o?{...transform,x:s.left-o.rect.left,y:s.top-o.rect.top}:transform;
  };
  const dropAnimation:DropAnimation={
    duration:reduced()?0:300,easing:'cubic-bezier(.3,1.35,.5,1)',
    keyframes:({transform})=>[{transform:`translate3d(${transform.initial.x}px,${transform.initial.y}px,0)`},{transform:`translate3d(${transform.final.x}px,${transform.final.y}px,0)`}],
    sideEffects:defaultDropAnimationSideEffects({styles:{active:{opacity:'0'}}})
  };

  // ── 크기 조절 ──
  function gripDown(e:ReactPointerEvent<HTMLButtonElement>,t:Task){
    e.stopPropagation();e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const y0=e.clientY,d0=t.duration;let dur=d0;
    const el=e.currentTarget;
    const move=(ev:PointerEvent)=>{
      const next=Math.max(15,Math.min(480,Math.round((d0+(ev.clientY-y0)/PX)/SNAP)*SNAP));
      if(next===dur)return;
      if(t.starts_at&&placementIssue(t.id,date,Number(t.starts_at.slice(11,13))*60+Number(t.starts_at.slice(14,16)),next,rule,base))return;
      dur=next;setResize({id:t.id,dur});
    };
    const up=async()=>{
      el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);
      if(dur===d0){setResize(null);return;}
      await dispatch(updateAction(t,t.plan_date,t.starts_at,null,dur));
      setResize(null);land(t.id,false);
    };
    el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  }
  const gripKey=(e:KeyboardEvent,t:Task)=>{
    if(e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;
    e.preventDefault();
    const dur=Math.max(15,t.duration+(e.key==='ArrowUp'?-15:15));
    void dispatch(updateAction(t,t.plan_date,t.starts_at,null,dur));
  };

  const select=(e:ReactMouseEvent,t:Task)=>{
    if(e.shiftKey||e.ctrlKey||e.metaKey){if(!t.completed)setMulti(m=>m.includes(t.id)?m.filter(x=>x!==t.id):[...m,t.id]);}
    else{setSelected(t.id);setMulti([]);}
  };
  const blockKey=(e:KeyboardEvent,t:Task)=>{if(e.altKey&&(e.key==='ArrowUp'||e.key==='ArrowDown')&&!t.starts_at){e.preventDefault();reorder(t,e.key==='ArrowUp'?-1:1);}};

  const avail=rule.enabled?rule.end-rule.start-rule.breaks.reduce((n,b)=>n+b.end-b.start,0):0;
  const dayTasks=base.filter(t=>t.plan_date===date);
  const sum=(f:(t:Task)=>boolean)=>dayTasks.filter(f).reduce((n,t)=>n+t.duration,0);
  const aDone=sum(t=>!t.starts_at&&t.completed),aFlow=sum(t=>!t.starts_at&&!t.completed),aFixed=sum(t=>!!t.starts_at);
  const total=Math.max(avail,aDone+aFlow+aFixed),pct=(n:number)=>`${n/total*100}%`;
  const anchor=Math.max(rule.start,plan.anchor??rule.start);
  const detail=(selected&&byId(selected))||(nextId&&byId(nextId))||null;

  return <DndContext sensors={sensors} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={()=>{setHeld(null);snap.current=null;}} autoScroll={false}>
    <div className="sp-app">
      {!native&&<div className="sp-demo"><span className="sp-demo-tag">시험</span><label htmlFor="sp-now">현재 시각</label><input id="sp-now" type="range" min={510} max={1110} step={5} value={now} onChange={e=>setNow(Number(e.target.value))}/><output htmlFor="sp-now">{time(now)}</output></div>}
      <header className="sp-head">
        <h1>{dateLabel(date)}</h1><span className="sp-pill">오늘</span>
        <div className="sp-cap" aria-label={`배분 ${formatDuration(aDone+aFlow+aFixed)} / 가용 ${formatDuration(avail)}`}>
          <span className="sp-meter" aria-hidden="true">{[['done',aDone],['flow',aFlow],['fixed',aFixed]].map(([k,n])=><motion.i key={k} className={'m-'+k} animate={{width:pct(n as number)}} transition={settle}/>)}</span>
          <span>배분 {formatDuration(aDone+aFlow+aFixed)} / 가용 {formatDuration(avail)}</span>
        </div>
        <span className="sp-grow"/>
        {multi.length?<div className="sp-multi"><span>{multi.length}개 선택</span><button className="sp-btn primary" onClick={()=>void complete(multi)}>완료</button><button className="sp-btn" onClick={()=>setMulti([])}>취소</button></div>
          :<><span className="sp-anchor">{time(anchor)} 기준</span><button className="sp-btn" onClick={()=>void dispatch({type:'reflow',date,at:stamp()})}>지금 기준으로 다시 배치</button></>}
      </header>
      {(error||busy)&&<div className={'sp-status'+(error?' error':'')} role={error?'alert':'status'}>{error||'저장 중…'}{failed&&<><button className="sp-btn" onClick={retry}>다시 시도</button><button className="sp-btn" onClick={discard}>이 변경 취소</button></>}</div>}
      <div className="sp-cols">
        <section className="sp-day" aria-label="오늘 블록 공간">
          <Bin tasks={plan.completed} onUndo={t=>void uncomplete(t)} onSelect={t=>setSelected(t.id)}/>
          <div className={'sp-space'+(holding?' armed':'')} ref={spaceRef} style={{height:axis.height}}>
            <Ruler axis={axis} rule={rule}/>
            <motion.div className="sp-shutter" aria-hidden="true" style={{top:axis.position(rule.start)}} animate={{height:Math.max(0,axis.position(anchor)-axis.position(rule.start))}} transition={{type:'spring',visualDuration:.55,bounce:0}}/>
            <AnchorFlash top={axis.position(anchor)} label={`${time(anchor)} 기준`} anchor={anchor}/>
            <AnimatePresence initial={false} custom={doneIds}>
              {plan.items.map(item=><Block key={item.task.id} item={item} axis={axis} next={item.task.id===nextId} hollow={holding?.task.id===item.task.id}
                selected={selected===item.task.id&&!multi.length} multi={multi.includes(item.task.id)} squash={squash.includes(item.task.id)} landed={landed?.id===item.task.id?landed:null}
                onCheck={()=>item.task.completed?void uncomplete(byId(item.task.id)!):void complete([item.task.id])} onSelect={e=>select(e,byId(item.task.id)!)} onKey={e=>blockKey(e,byId(item.task.id)!)}
                onGrip={e=>gripDown(e,byId(item.task.id)!)} onGripKey={e=>gripKey(e,byId(item.task.id)!)}/>)}
            </AnimatePresence>
            {holding?.intent.zone==='rail'&&<span className={'sp-railtag'+(holding.intent.ok?'':' bad')} style={{top:axis.position(holding.intent.start!)}}>{time(holding.intent.start!)}</span>}
            {now>=axis.start&&now<=axis.end&&<div className="sp-now" style={{top:axis.position(now)}}><span>{time(now)}</span></div>}
          </div>
          <div className={'sp-below'+(holding?.intent.zone==='below'?' hot':'')} ref={belowRef}>
            {plan.unplaced.length>0&&<h2>배치되지 않음 <span className="sp-cnt">{plan.unplaced.length}</span></h2>}
            {plan.unplaced.map(u=><Unplaced key={u.task.id} task={u.task} reason={unplacedLabel[u.reason]} hollow={holding?.task.id===u.task.id} onSelect={e=>select(e,byId(u.task.id)!)} onCheck={()=>void complete([u.task.id])}/>)}
          </div>
        </section>
        <aside className="sp-side">
          {detail&&<Detail task={detail} next={detail.id===nextId} plan={plan.items} unplaced={plan.unplaced.map(u=>({id:u.task.id,reason:unplacedLabel[u.reason]}))}
            onComplete={()=>void complete([detail.id])} onUndo={()=>void uncomplete(detail)} onFix={m=>void fixHere(detail,m)} onUnfix={()=>unfix(detail)}
            onMove={d=>reorder(detail,d)} onUnplan={()=>void dispatch(updateAction(detail,null,null))} onAssign={()=>void dispatch(updateAction(detail,date,null))}
            onSize={d=>void dispatch(updateAction(detail,detail.plan_date,detail.starts_at,null,d))}/>}
          <section className={'sp-card sp-tray'+(holding?.intent.zone==='tray'?' hot':'')} ref={trayRef} aria-label="미계획">
            <h2>미계획 {inbox.length>0&&<span className="sp-cnt">{inbox.length}</span>}</h2>
            <label className="sp-sr" htmlFor="sp-capture">미계획에 추가</label>
            <input id="sp-capture" className="sp-capture" autoComplete="off" placeholder="새 할 일" value={draft} onChange={e=>setDraft(e.target.value)}
              onKeyDown={e=>{if(e.key!=='Enter'||isCompositionKey(e.nativeEvent))return;e.preventDefault();const title=draft.trim();if(!title)return;void dispatch({type:'create',id:crypto.randomUUID(),title}).then(ok=>{if(ok)setDraft('');});}}/>
            <div className="sp-well">
              <AnimatePresence initial={false}>
                {inbox.map(t=><TrayBlock key={t.id} task={t} hollow={holding?.task.id===t.id} selected={selected===t.id} onSelect={()=>setSelected(t.id)}/>)}
              </AnimatePresence>
            </div>
          </section>
        </aside>
      </div>
    </div>
    <DragOverlay modifiers={[snapModifier]} dropAnimation={dropAnimation}>
      {held&&<HeldBlock held={held} tilt={tiltSmooth}/>}
    </DragOverlay>
  </DndContext>;
}

function Ruler({axis,rule}:{axis:TimeAxis;rule:{start:number;end:number;enabled:boolean;breaks:{start:number;end:number;label:string}[]}}){
  const hours=Array.from({length:25},(_,i)=>i*60).filter(m=>m>=axis.start-60&&m<=axis.end+60);
  return <>
    <div className="sp-off" style={{top:0,height:axis.position(rule.start)}}/>
    <div className="sp-off" style={{top:axis.position(rule.end),height:axis.height-axis.position(rule.end)}}/>
    {hours.map(m=><div key={m} className="sp-hl" style={{top:axis.position(m)}}/>)}
    <div className="sp-ruler" aria-hidden="true">{hours.map(m=><span key={m} style={{top:axis.position(m)}}>{String(m/60).padStart(2,'0')}</span>)}</div>
    <div className="sp-rail" aria-hidden="true"/>
    {rule.breaks.map(b=><div key={b.start} className="sp-brk" style={{top:axis.position(b.start),height:axis.position(b.end)-axis.position(b.start)}}>{b.label}</div>)}
    <div className="sp-floor" style={{top:axis.position(rule.end)}}/>
  </>;
}

function AnchorFlash({top,label,anchor}:{top:number;label:string;anchor:number}){
  const last=useRef(anchor),[show,setShow]=useState(false);
  useEffect(()=>{if(anchor>last.current){setShow(true);const t=setTimeout(()=>setShow(false),1200);last.current=anchor;return()=>clearTimeout(t);}last.current=anchor;},[anchor]);
  return <AnimatePresence>{show&&<motion.div className="sp-flash" style={{top}} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}><span>{label}</span></motion.div>}</AnimatePresence>;
}

function Bin({tasks,onUndo,onSelect}:{tasks:Task[];onUndo:(t:Task)=>void;onSelect:(t:Task)=>void}){
  const [scope,animate]=useAnimate(),count=useRef(tasks.length);
  useEffect(()=>{if(tasks.length>count.current&&scope.current&&!reduced())void animate(scope.current,{scaleY:[1,2,1]},{duration:.36,ease:[.3,1.6,.5,1]});count.current=tasks.length;},[tasks.length]);
  return <>
    <div className="sp-bin" aria-label="완료">
      {tasks.length>0&&<span className="sp-bin-label">완료 <b>{tasks.length}</b></span>}
      <AnimatePresence initial={false}>
        {tasks.map(t=><motion.span key={t.id} className="sp-chip" layout initial={{opacity:0,y:18,scaleX:.8,scaleY:1.15}} animate={{opacity:1,y:0,scaleX:1,scaleY:1}} exit={{opacity:0,y:14}} transition={{type:'spring',visualDuration:.4,bounce:.35}}>
          <button className="sp-chip-title" onClick={()=>onSelect(t)}><Check/>{t.title}<small>{formatDuration(t.duration)}</small></button>
          <button className="sp-chip-undo" aria-label={t.title+' 완료 취소'} title="완료 취소" onClick={()=>onUndo(t)}><Undo/></button>
        </motion.span>)}
      </AnimatePresence>
    </div>
    <div className="sp-slit" ref={scope} aria-hidden="true"/>
  </>;
}

type BlockProps={item:DayItem;axis:TimeAxis;next:boolean;hollow:boolean;selected:boolean;multi:boolean;squash:boolean;landed:{clack:boolean}|null;
  onCheck:()=>void;onSelect:(e:ReactMouseEvent)=>void;onKey:(e:KeyboardEvent)=>void;onGrip:(e:ReactPointerEvent<HTMLButtonElement>)=>void;onGripKey:(e:KeyboardEvent)=>void};
// Only completion pulls a block up into the intake; any other departure just fades.
function Block({item,axis,next,hollow,selected,multi,squash,landed,onCheck,onSelect,onKey,onGrip,onGripKey}:BlockProps){
  const t=item.task,{attributes,listeners,setNodeRef}=useDraggable({id:t.id,disabled:item.fixed&&t.completed});
  const top=axis.position(item.start)+1,h=axis.position(item.end)-axis.position(item.start)-2;
  const range=`${time(item.start)}–${time(item.end)}`;
  const cls=['sp-blk',item.fixed?'fixed':'flow',next?'next':'',t.completed?'done':'',hollow?'hollow':'',selected?'sel':'',multi?'multi':'',h<34?'compact':''].join(' ');
  return <motion.div ref={setNodeRef} className={cls} style={{left:item.fixed?FIXED_LEFT:FLOW_LEFT}}
    initial={{top,height:h,opacity:0}} animate={{top,height:h,opacity:1}}
    variants={{leave:(done:Set<string>)=>done?.has(t.id)
      ?{y:-(top+h+40),scaleX:.5,scaleY:1.4,opacity:0,transition:{duration:reduced()?0:.3,ease:[.6,0,.9,.35]}}
      :{opacity:0,transition:{duration:.12}}}}
    exit="leave" transition={settle} {...attributes} {...listeners} tabIndex={-1} role="presentation">
    <motion.div className="sp-tile" animate={squash?{scaleX:1.05,scaleY:.86}:landed?{scaleX:[1.03,1.025,.99,1],scaleY:[1.03,.93,1.025,1]}:{scaleX:1,scaleY:1}}
      transition={squash?{duration:.1}:landed?{duration:.45}:{duration:.15}} style={{transformOrigin:'50% 100%'}}>
      {item.fixed&&<Latch clack={!!landed?.clack}/>}
      <button className="sp-chk" aria-label={t.title+(t.completed?' 완료 취소':' 완료')} aria-pressed={t.completed} onPointerDown={e=>e.stopPropagation()} onClick={onCheck}><Check/></button>
      <button className="sp-main" aria-label={`${t.title}, ${item.fixed?'시각 고정':'예상'} ${range}, ${formatDuration(t.duration)}${next?', 다음':''}${t.completed?', 완료':''}`} onClick={onSelect} onKeyDown={onKey}>
        <span className="sp-ttl-row">{next&&<span className="sp-tag">다음</span>}<span className="sp-ttl">{t.title}</span></span>
        <span className="sp-meta"><span className="sp-tm">{item.fixed?range:'예상 '+range}</span><span>{formatDuration(t.duration)}</span></span>
      </button>
    </motion.div>
    {!t.completed&&<button className="sp-grip" aria-label={t.title+' 크기 조절'} onPointerDown={onGrip} onKeyDown={onGripKey}/>}
  </motion.div>;
}

function Latch({clack}:{clack:boolean}){
  return <motion.span className="sp-latch" title="시각 고정" animate={clack?{x:[-5,1.5,0],scaleX:[1.2,.94,1]}:{x:0,scaleX:1}} transition={{duration:.36,ease:[.3,1.6,.5,1]}}>
    <Lock open={false}/>
    {clack&&<motion.i className="sp-ring" initial={{opacity:.9,scale:.4}} animate={{opacity:0,scale:1.6}} transition={{duration:.5}}/>}
  </motion.span>;
}

function Unplaced({task,reason,hollow,onSelect,onCheck}:{task:Task;reason:string;hollow:boolean;onSelect:(e:ReactMouseEvent)=>void;onCheck:()=>void}){
  const {attributes,listeners,setNodeRef}=useDraggable({id:task.id});
  return <motion.div ref={setNodeRef} layout className={'sp-ublk'+(hollow?' hollow':'')} style={{height:Math.max(30,task.duration*PX-2)}} transition={settle} {...attributes} {...listeners} tabIndex={-1} role="presentation">
    <div className="sp-tile">
      <button className="sp-chk" aria-label={task.title+' 완료'} onPointerDown={e=>e.stopPropagation()} onClick={onCheck}><Check/></button>
      <button className="sp-main" onClick={onSelect} aria-label={`${task.title}, ${formatDuration(task.duration)}, 배치되지 않음, ${reason}`}><span className="sp-ttl">{task.title}</span><span className="sp-meta"><span>{formatDuration(task.duration)}</span><span className="sp-why">{reason}</span></span></button>
    </div>
  </motion.div>;
}

function TrayBlock({task,hollow,selected,onSelect}:{task:Task;hollow:boolean;selected:boolean;onSelect:()=>void}){
  const {attributes,listeners,setNodeRef}=useDraggable({id:task.id});
  const h=Math.max(24,task.duration*PX-2);
  return <motion.div ref={setNodeRef} layout className={'sp-tblk'+(hollow?' hollow':'')+(selected?' sel':'')+(h<40?' compact':'')} style={{height:h}}
    initial={{opacity:0,scale:.96}} animate={{opacity:1,scale:1}} exit={{opacity:0,transition:{duration:0}}} transition={settle} {...attributes} {...listeners} tabIndex={-1} role="presentation">
    <div className="sp-tile"><Dots/><button className="sp-main" onClick={onSelect} aria-label={`${task.title}, ${formatDuration(task.duration)}, 미계획`}><span className="sp-ttl">{task.title}</span><span className="sp-meta">{formatDuration(task.duration)}</span></button></div>
  </motion.div>;
}

function HeldBlock({held,tilt}:{held:Held;tilt:MotionValue<number>}){
  const {task,intent,width}=held,rail=intent.zone==='rail',fixedLook=rail||(!!task.starts_at&&intent.zone==='none');
  // When the block widens over the day, the point that was grabbed stays under the pointer.
  const shift=rail||held.dropping?0:-held.grabX*(width/held.startWidth-1);
  return <motion.div className={'sp-held '+(fixedLook?'fixed':'flow')+(rail&&!intent.ok?' bad':'')}
    style={{rotate:tilt,height:task.duration*PX-2,transformOrigin:'50% 30%'}}
    initial={{scale:1,width:held.startWidth,marginLeft:0}} animate={{scale:held.dropping?1:rail?1.01:1.03,width,marginLeft:shift,x:rail&&!intent.ok?[0,-4,3,-2,0]:0}}
    transition={{scale:{type:'spring',visualDuration:.16,bounce:.4},width:{duration:.18},marginLeft:{duration:.18},x:{duration:.32}}}>
    <div className="sp-tile">
      {fixedLook&&<span className="sp-latch"><Lock open/></span>}
      <span className="sp-chk"/>
      <span className="sp-main"><span className="sp-ttl">{task.title}</span><span className="sp-meta">{rail?`${time(intent.start!)}–${time(intent.start!+task.duration)}`:formatDuration(task.duration)}</span></span>
      {rail&&!intent.ok&&<span className="sp-held-why">{intent.reason}</span>}
    </div>
  </motion.div>;
}

function Detail({task,next,plan,unplaced,onComplete,onUndo,onFix,onUnfix,onMove,onUnplan,onAssign,onSize}:{task:Task;next:boolean;plan:DayItem[];unplaced:{id:string;reason:string}[];
  onComplete:()=>void;onUndo:()=>void;onFix:(minute:number)=>void;onUnfix:()=>void;onMove:(d:number)=>void;onUnplan:()=>void;onAssign:()=>void;onSize:(d:number)=>void}){
  const item=plan.find(i=>i.task.id===task.id),u=unplaced.find(x=>x.id===task.id);
  const flowDay=!!task.plan_date&&!task.starts_at;
  const when=!task.plan_date?'미계획':task.starts_at&&item?`${time(item.start)}–${time(item.end)} · 시각 고정${task.completed?' · 완료':''}`:task.completed?'완료':item?`예상 ${time(item.start)}–${time(item.end)}`:u?`배치되지 않음 · ${u.reason}`:'';
  return <section className="sp-card" aria-label="블록 상세">
    <div className="sp-eyebrow">{next?'다음':''}</div>
    <h2 className="sp-dt-title">{task.title}</h2>
    <div className="sp-when">{task.starts_at&&<Lock open={false}/>}{when}</div>
    {task.body&&<p className="sp-memo">{task.body}</p>}
    <span className="sp-lbl" id="sp-size">크기</span>
    <div className="sp-sizes" role="group" aria-labelledby="sp-size">{[15,30,45,60,90,120].map(d=><button key={d} className={'sp-size'+(task.duration===d?' on':'')} aria-pressed={task.duration===d} onClick={()=>onSize(d)}>{formatDuration(d)}</button>)}</div>
    <div className="sp-acts">
      {task.plan_date&&!task.completed&&<button className="sp-btn primary" onClick={onComplete}>완료</button>}
      {task.plan_date&&task.completed&&<button className="sp-btn" onClick={onUndo}>완료 취소</button>}
      {!task.plan_date&&<button className="sp-btn primary" onClick={onAssign}>오늘에 추가</button>}
      {flowDay&&!task.completed&&item&&<button className="sp-btn" onClick={()=>onFix(item.start)}><Lock open={false}/>이 시각에 고정</button>}
      {task.starts_at&&!task.completed&&<button className="sp-btn" onClick={onUnfix}>고정 해제</button>}
      {flowDay&&!task.completed&&<><button className="sp-ibtn" aria-label="앞으로" title="앞으로 (Alt+↑)" onClick={()=>onMove(-1)}>↑</button><button className="sp-ibtn" aria-label="뒤로" title="뒤로 (Alt+↓)" onClick={()=>onMove(1)}>↓</button></>}
      {task.plan_date&&!task.completed&&<button className="sp-btn" onClick={onUnplan}>미계획으로</button>}
    </div>
  </section>;
}

const Check=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>;
const Undo=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>;
const Dots=()=><svg className="sp-dots" viewBox="0 0 12 20" fill="currentColor" aria-hidden="true"><path d="M3 4h2v2H3zm4 0h2v2H7zM3 9h2v2H3zm4 0h2v2H7zM3 14h2v2H3zm4 0h2v2H7z"/></svg>;
function Lock({open}:{open:boolean}){
  return <svg className="sp-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/>
    <motion.path d="M8 11V8a4 4 0 0 1 8 0v3" style={{transformBox:'fill-box',transformOrigin:'100% 100%'}} animate={open?{x:1,y:-3,rotate:28}:{x:0,y:0,rotate:0}} transition={{type:'spring',visualDuration:.2,bounce:.5}}/></svg>;
}
