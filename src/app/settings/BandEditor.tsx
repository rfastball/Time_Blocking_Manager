import {useEffect,useLayoutEffect,useMemo,useRef,useState,type CSSProperties,type KeyboardEvent as ReactKeyboardEvent,type MouseEvent as ReactMouseEvent,type PointerEvent as ReactPointerEvent,type RefObject} from 'react';
import {createPortal,flushSync} from 'react-dom';
import {motion} from 'motion/react';
import {expandTimeAxis,timeAxisForDays,type TimeAxis} from '../../time-axis.ts';
import {changeAvailabilityBand,type AvailabilityTarget} from '../../availability-band.ts';
import {GESTURE_THRESHOLD,addBreak,bandGesture,bandLabel,bandOf,deleteBreak,gestureDay,hourLabels,moveEdge,renameBreak,shiftBand,toggleDay,type BandMode} from '../../availability-edit.ts';
import {minutes,time} from '../../dates.ts';
import type {WorkingDay} from '../../types.ts';
import {setGesture} from '../store/tasks.ts';
import {settle} from '../ui/motion.ts';
import {follow as followPointer} from '../ui/gesture.ts';
import {focusLater} from '../ui/focus.ts';
import {clamp,useDismiss} from '../ui/dismiss.ts';
import {SCALE as SCALES} from '../ui/scales.ts';

export type Selection={day:number;target:AvailabilityTarget};
type Props={
  // One column per day; `names` are the accessible column names (요일 or ‘이 날짜’).
  days:WorkingDay[];names:string[];short?:string[];
  // Compact: band choice buttons and time fields, no drawing surface (the one-date popover).
  compact?:boolean;initial?:Selection|null;autoFocus?:boolean;
  onChange:(index:number,day:WorkingDay)=>void;onError:(message:string)=>void;
};
type Menu={day:number;target:AvailabilityTarget;x:number;y:number};
const SCALE=SCALES.rhythm;
const follow={type:'spring' as const,visualDuration:.16,bounce:.18};
const targetOf=(v:string):AvailabilityTarget=>v==='work'?'work':Number(v);
const exists=(days:WorkingDay[],s:Selection|null)=>!!s&&!!days[s.day]?.enabled&&(s.target==='work'||!!days[s.day].breaks[s.target]);

// Weekly rhythm surface: parallel work (left) and break (right) bands on the shared compressed axis.
export function BandEditor({days,names,short=names,compact=false,initial=null,autoFocus=false,onChange,onError}:Props){
  const [chosen,setSelected]=useState<Selection|null>(initial??(compact?{day:0,target:'work'}:null));
  const [mode,setMode]=useState<BandMode>('work');
  const [menu,setMenu]=useState<Menu|null>(null);
  const [preview,setPreview]=useState<{day:number;value:WorkingDay}|null>(null);
  const [gestureAxis,setGestureAxis]=useState<TimeAxis|null>(null);
  const [stop,setStop]=useState('');
  const root=useRef<HTMLDivElement>(null),scroll=useRef<HTMLDivElement>(null);
  const fresh=timeAxisForDays(days,SCALE),baseAxis=useMemo(()=>fresh,[fresh.start,fresh.end]);
  const axis=gestureAxis??baseAxis;
  const selected=exists(days,chosen)?chosen:compact&&days[0]?.enabled?{day:0,target:'work' as AvailabilityTarget}:null;

  const focusIn=(selector:string)=>focusLater(selector,{root:root.current});
  const bandSelector=(s:Selection)=>`[data-select="${s.day}:${s.target}"]`;
  function apply(i:number,change:(d:WorkingDay)=>WorkingDay,select?:Selection|null,focus?:string){
    try{const next=change(days[i]);onError('');onChange(i,next);if(select!==undefined)setSelected(select);if(focus)focusLater(focus);}
    catch(e){onError((e as Error).message);}
  }
  const add=(i:number)=>{try{const r=addBreak(days[i]);apply(i,()=>r.day,{day:i,target:r.target},'[data-name]');}catch(e){onError((e as Error).message);}};
  const remove=(s:Selection)=>{if(s.target!=='work')apply(s.day,d=>deleteBreak(d,s.target as number),{day:s.day,target:'work'},bandSelector({day:s.day,target:'work'}));};
  const toggle=(i:number)=>apply(i,toggleDay,days[i].enabled?null:{day:i,target:'work'},compact?'[data-toggle]':`[data-toggle="${i}"]`);
  const shift=(s:Selection,delta:number,focus?:string)=>apply(s.day,d=>shiftBand(d,s.target,delta),s,focus);

  // The visible minute stays put when the axis is rebuilt after an edit.
  const lastAxis=useRef(axis),gestureLive=useRef(false);
  useLayoutEffect(()=>{
    const el=scroll.current;if(!el)return;
    if(lastAxis.current!==axis&&!gestureLive.current)el.scrollTop=axis.position(lastAxis.current.minute(el.scrollTop));
    lastAxis.current=axis;
  },[axis]);
  useLayoutEffect(()=>{if(scroll.current)scroll.current.scrollTop=Math.max(0,axis.position(axis.start)-12);},[]);
  useEffect(()=>{if(autoFocus)focusLater(compact?'[data-time="start"]':selected?bandSelector(selected):'[data-toggle]');},[]);

  function press(e:ReactPointerEvent<HTMLDivElement>,i:number){
    if(e.button!==0||!e.isPrimary)return;
    const t=e.target as HTMLElement,column=e.currentTarget,bandEl=t.closest<HTMLElement>('[data-band]'),edgeEl=t.closest<HTMLElement>('[data-edge]');
    const band=bandEl?targetOf(bandEl.dataset.band!):null,g=bandGesture(band,edgeEl?edgeEl.dataset.edge as 'start'|'end':null,mode),source=days[i];
    let ax=axis,result:{day:WorkingDay;target:AvailabilityTarget}|null=null;
    const minuteAt=(y:number)=>ax.minute(y-column.getBoundingClientRect().top),origin=minuteAt(e.clientY),before=selected;
    const move=(ev:PointerEvent)=>{
      ev.preventDefault();
      const sc=scroll.current!,r=sc.getBoundingClientRect();
      if(ev.clientY<r.top+70)sc.scrollTop-=16;else if(ev.clientY>r.bottom-24)sc.scrollTop+=16;
      const point=minuteAt(ev.clientY),next=expandTimeAxis(ax,point);
      // Opening an outer stretch keeps the minute under the pointer where it was.
      if(next!==ax){const delta=next.position(point)-ax.position(point);ax=next;flushSync(()=>setGestureAxis(next));sc.scrollTop+=delta;}
      try{result=gestureDay(source,g,mode,origin,point);onError('');setPreview({day:i,value:result.day});setSelected({day:i,target:result.target});}
      catch(err){result=null;onError((err as Error).message);}
    };
    const cleanup=()=>{gestureLive.current=false;setGesture(false);setPreview(null);setGestureAxis(null);};
    const finish=(_:PointerEvent,moved:boolean)=>{
      cleanup();
      if(!moved){if(band!==null){setSelected({day:i,target:band});if(edgeEl)edgeEl.focus({preventScroll:true});else focusIn(bandSelector({day:i,target:band}));}return;}
      swallowClick();
      if(result){onChange(i,result.day);setSelected({day:i,target:result.target});focusIn(bandSelector({day:i,target:result.target}));}
      else setSelected(before);
    };
    const cancel=()=>{cleanup();setSelected(before);onError('');};
    followPointer(e,{threshold:GESTURE_THRESHOLD,along:'y',start:()=>{gestureLive.current=true;setGesture(true);},move,end:finish,cancel});
  }
  function edgeKey(e:ReactKeyboardEvent,i:number,target:AvailabilityTarget,edge:'start'|'end'){
    if(e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;
    e.preventDefault();e.stopPropagation();
    apply(i,d=>moveEdge(d,target,edge,e.key==='ArrowUp'?-15:15),{day:i,target});
  }
  function bandKey(e:ReactKeyboardEvent<HTMLElement>,i:number,target:AvailabilityTarget){
    if(!(e.shiftKey&&e.key==='F10')&&e.key!=='ContextMenu')return;
    e.preventDefault();const r=e.currentTarget.getBoundingClientRect();
    setSelected({day:i,target});setMenu({day:i,target,x:r.left+8,y:Math.max(8,r.top+8)});
  }
  // The paper is one tab stop: arrows walk day by day through each head, then its bands top to bottom with their edges.
  function walk(e:ReactKeyboardEvent<HTMLDivElement>){
    const step={ArrowLeft:-1,ArrowUp:-1,ArrowRight:1,ArrowDown:1}[e.key],at=stops.indexOf((e.target as HTMLElement).dataset.stop??'');
    if(at<0||!step&&e.key!=='Home'&&e.key!=='End')return;
    e.preventDefault();
    const next=stops[e.key==='Home'?0:e.key==='End'?stops.length-1:Math.max(0,Math.min(stops.length-1,at+step!))];
    root.current?.querySelector<HTMLElement>(`[data-stop="${next}"]`)?.focus();
  }
  function context(e:ReactMouseEvent<HTMLDivElement>,i:number){
    e.preventDefault();const band=(e.target as HTMLElement).closest<HTMLElement>('[data-band]'),target=band?targetOf(band.dataset.band!):'work';
    if(days[i].enabled)setSelected({day:i,target});
    setMenu({day:i,target,x:e.clientX,y:e.clientY});
  }

  const detail=selected&&<Detail day={days[selected.day]} name={names[selected.day]} selection={selected} compact={compact}
    onEdge={(edge,value)=>apply(selected.day,d=>changeAvailabilityBand(d,selected.target,edge,value))}
    onShift={delta=>shift(selected,delta)} onRename={label=>apply(selected.day,d=>renameBreak(d,selected.target as number,label))}
    onAdd={()=>add(selected.day)} onDelete={()=>remove(selected)}/>;

  if(compact){
    const d=days[0];
    return <div className="rh rh-compact" ref={root}>
      <div className="rh-choices" role="group" aria-label="조정할 시간">
        {d.enabled&&(['work',...d.breaks.map((_,j)=>j)] as AvailabilityTarget[]).map(target=><button key={String(target)} type="button" className="btn" data-select={`0:${target}`}
          aria-pressed={selected?.target===target} onClick={()=>setSelected({day:0,target})}>{bandLabel(d,target)||'이름 없음'}</button>)}
        <button type="button" className="btn text" data-toggle="0" onClick={()=>toggle(0)}>{d.enabled?'휴무로 변경':'근무로 변경'}</button>
      </div>
      {detail}
    </div>;
  }
  const stops=days.flatMap((d,i)=>[`t${i}`,...d.enabled?(['work',...d.breaks.map((_,j)=>j)] as AvailabilityTarget[]).flatMap(t=>[`e${i}:${t}:start`,`b${i}:${t}`,`e${i}:${t}:end`]):[]]);
  const tab=stops.includes(stop)?stop:selected?`b${selected.day}:${selected.target}`:'t0';
  // Lines follow the labels in the compressed tails and every half hour in the open range.
  const hours=hourLabels(axis),lines=[...new Set([...hours,...Array.from({length:49},(_,k)=>k*30).filter(m=>m>=axis.start&&m<=axis.end)])];
  return <div className="rh" ref={root}>
    <div className="rh-tools" role="group" aria-label="그릴 시간 종류">
      {(['work','break'] as const).map(m=><button key={m} type="button" className="btn" aria-pressed={mode===m} onClick={()=>setMode(m)}><i className={'rh-swatch rh-swatch-'+m} aria-hidden="true"/>{m==='work'?'근무 그리기':'휴식 그리기'}</button>)}
    </div>
    <div className="rh-scroll" ref={scroll}>
      <div className="rh-paper" style={{'--rh-days':days.length} as CSSProperties} onKeyDown={walk} onFocus={e=>{const k=(e.target as HTMLElement).dataset.stop;if(k)setStop(k);}}>
        <div className="rh-head">
          <span aria-hidden="true"/>
          {days.map((d,i)=><button key={i} type="button" data-toggle={i} data-stop={`t${i}`} tabIndex={tab===`t${i}`?0:-1} aria-pressed={d.enabled} aria-label={`${names[i]} 근무`} onClick={()=>toggle(i)}>
            <strong>{short[i]}</strong><small>{d.enabled?'근무':'휴무'}</small></button>)}
        </div>
        <div className="rh-body" style={{height:axis.height}}>
          <div className="rh-axis" aria-hidden="true">{hours.map(m=><span key={m} style={{top:axis.position(m)}}>{String(m/60).padStart(2,'0')}</span>)}</div>
          <div className="rh-lines" aria-hidden="true">{lines.map(m=><i key={m} className={m%60?'rh-half':'rh-hour'} style={{top:axis.position(m)}}/>)}</div>
          {days.map((stored,i)=>{
            const d=preview?.day===i?preview.value:stored;
            return <div key={i} className={'rh-col'+(d.enabled?'':' rh-dayoff')+(preview?.day===i?' rh-editing':'')} role="group" aria-label={`${names[i]} 시간 밴드`}
              onPointerDown={e=>press(e,i)} onContextMenu={e=>context(e,i)}>
              {d.enabled?(['work',...d.breaks.map((_,j)=>j)] as AvailabilityTarget[]).map(target=>
                <Band key={String(target)} day={d} i={i} name={names[i]} target={target} axis={axis} tab={tab} live={preview?.day===i} active={selected?.day===i&&selected.target===target}
                  onSelect={()=>setSelected({day:i,target})} onKey={e=>bandKey(e,i,target)} onEdgeKey={(e,edge)=>edgeKey(e,i,target,edge)}/>)
              :<span className="rh-offday" style={{top:axis.position(axis.start)+24}}>휴무</span>}
            </div>;
          })}
        </div>
      </div>
    </div>
    {detail}
    {menu&&<BandMenu menu={menu} day={days[menu.day]} name={names[menu.day]} root={root}
      onClose={()=>setMenu(null)}
      onAdjust={()=>focusLater('[data-range="start"]')}
      onShift={delta=>shift({day:menu.day,target:menu.target},delta,bandSelector({day:menu.day,target:menu.target}))}
      onAdd={()=>add(menu.day)} onDelete={()=>remove({day:menu.day,target:menu.target})} onToggle={()=>toggle(menu.day)}/>}
  </div>;
}

// The click that ends a drag must not also select whatever is under the pointer.
function swallowClick(){
  const stop=(e:MouseEvent)=>{e.stopPropagation();e.preventDefault();};
  window.addEventListener('click',stop,{capture:true,once:true});
  setTimeout(()=>window.removeEventListener('click',stop,{capture:true}),0);
}

type BandProps={day:WorkingDay;i:number;name:string;target:AvailabilityTarget;axis:TimeAxis;tab:string;live:boolean;active:boolean;
  onSelect:()=>void;onKey:(e:ReactKeyboardEvent<HTMLElement>)=>void;onEdgeKey:(e:ReactKeyboardEvent,edge:'start'|'end')=>void};
function Band({day,i,name,target,axis,tab,live,active,onSelect,onKey,onEdgeKey}:BandProps){
  const b=bandOf(day,target),label=bandLabel(day,target),range=`${time(b.start)}–${time(b.end)}`;
  const top=axis.position(b.start),height=Math.max(6,axis.position(b.end)-top),short=height<48;
  return <motion.div data-band={String(target)} className={'rh-band '+(target==='work'?'rh-work':'rh-rest')+(active?' rh-selected':'')+(short?' rh-short':'')}
    initial={false} animate={{top,height}} transition={live?follow:settle} onKeyDown={onKey}>
    <button type="button" data-select={`${i}:${target}`} data-stop={`b${i}:${target}`} tabIndex={tab===`b${i}:${target}`?0:-1} aria-pressed={active} aria-label={`${name} ${label||'이름 없음'} ${range}`} title={`${label} ${range}`} onClick={onSelect}>
      <span className="rh-cap"><strong>{label}</strong>{target==='work'&&!short&&<small>{time(b.start)}<br/>{time(b.end)}</small>}</span>
    </button>
    {(['start','end'] as const).map(edge=><span key={edge} className={'rh-edge '+edge} data-edge={edge} data-stop={`e${i}:${target}:${edge}`} role="separator" tabIndex={tab===`e${i}:${target}:${edge}`?0:-1} aria-orientation="horizontal"
      aria-label={`${name} ${label} ${edge==='start'?'시작':'종료'} 조절`} aria-valuemin={0} aria-valuemax={1440} aria-valuenow={b[edge]} aria-valuetext={time(b[edge])}
      onKeyDown={e=>onEdgeKey(e,edge)}/>)}
  </motion.div>;
}

type DetailProps={day:WorkingDay;name:string;selection:Selection;compact:boolean;
  onEdge:(edge:'start'|'end',value:number)=>void;onShift:(delta:number)=>void;onRename:(label:string)=>void;onAdd:()=>void;onDelete:()=>void};
function Detail({day,name,selection,compact,onEdge,onShift,onRename,onAdd,onDelete}:DetailProps){
  const {target}=selection,b=bandOf(day,target),label=bandLabel(day,target);
  return <div className="rh-detail">
    <div className="rh-detail-head">
      <strong>{compact?label||'휴식':`${name} · ${label||'휴식'}`}</strong><output>{time(b.start)}–{time(b.end)}</output>
      {target==='work'?<button type="button" className="btn" onClick={onAdd}>휴식 추가</button>:<button type="button" className="btn danger" onClick={onDelete}>휴식 삭제</button>}
    </div>
    {target!=='work'&&<label className="rh-name">이름 <input data-name maxLength={60} value={label} required aria-invalid={!label.trim()||undefined} onChange={e=>onRename(e.target.value)}/></label>}
    {compact?<div className="rh-times">{(['start','end'] as const).map(edge=><label key={edge}>{edge==='start'?'시작':'종료'}
        <TimeField value={b[edge]} label={`${label} ${edge==='start'?'시작':'종료'}`} edge={edge} onCommit={v=>onEdge(edge,v)}/></label>)}</div>
      :<div className="rh-sliders">{(['start','end'] as const).map(edge=><label key={edge}><span>{edge==='start'?'시작':'종료'}</span><output>{time(b[edge])}</output>
        <input type="range" data-range={edge} min={edge==='end'?b.start+15:0} max={edge==='start'?b.end-15:1440} step={15} value={b[edge]}
          aria-label={`${label} ${edge==='start'?'시작':'종료'}`} aria-valuetext={time(b[edge])} onChange={e=>onEdge(edge,Number(e.target.value))}/></label>)}</div>}
    <div className="rh-nudge"><button type="button" className="btn" onClick={()=>onShift(-15)}>15분 앞당기기</button><button type="button" className="btn" onClick={()=>onShift(15)}>15분 늦추기</button></div>
  </div>;
}

// Typing a time passes through invalid partial values; it is applied on Enter or when focus leaves.
function TimeField({value,label,edge,onCommit}:{value:number;label:string;edge:'start'|'end';onCommit:(m:number)=>void}){
  const ref=useRef<HTMLInputElement>(null);
  useEffect(()=>{const el=ref.current;if(el&&document.activeElement!==el)el.value=time(value%1440);},[value]);
  const commit=()=>{
    const el=ref.current!;if(!el.value){el.value=time(value%1440);return;}
    const m=minutes(el.value),next=edge==='end'&&m===0?1440:m;
    if(next!==value)onCommit(next);
  };
  return <input ref={ref} type="time" data-time={edge} step={900} defaultValue={time(value%1440)} aria-label={label} required onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commit();}}}/>;
}

type MenuProps={menu:Menu;day:WorkingDay;name:string;root:RefObject<HTMLDivElement|null>;onClose:()=>void;
  onAdjust:()=>void;onShift:(delta:number)=>void;onAdd:()=>void;onDelete:()=>void;onToggle:()=>void};
function BandMenu({menu,day,name,root,onClose,onAdjust,onShift,onAdd,onDelete,onToggle}:MenuProps){
  const ref=useRef<HTMLDivElement>(null),[pos,setPos]=useState({left:menu.x,top:menu.y});
  const back=()=>{onClose();focusLater(day.enabled?`[data-select="${menu.day}:${menu.target}"]`:`[data-toggle="${menu.day}"]`,{root:root.current});};
  useLayoutEffect(()=>{const r=ref.current!.getBoundingClientRect();setPos(clamp(menu.x,menu.y,r.width,r.height));ref.current!.querySelector<HTMLElement>('button')?.focus();},[menu]);
  useDismiss(ref,onClose);
  const run=(f:()=>void)=>()=>{onClose();f();};
  function key(e:ReactKeyboardEvent){
    const items=[...ref.current!.querySelectorAll<HTMLButtonElement>('button')],i=items.indexOf(document.activeElement as HTMLButtonElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:items.length-1))%items.length]?.focus();}
    else if(e.key==='Escape'||e.key==='Tab'){e.preventDefault();e.stopPropagation();back();}
  }
  const label=day.enabled?bandLabel(day,menu.target):'휴무';
  return createPortal(<motion.div ref={ref} className="rh-menu" role="menu" aria-label={`${name} ${label}`} style={pos} onKeyDown={key}
    initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} transition={{duration:.12}}>
    {day.enabled&&<>
      <button type="button" role="menuitem" onClick={run(onAdjust)}>시간 조정</button>
      <button type="button" role="menuitem" onClick={run(()=>onShift(-15))}>15분 앞당기기</button>
      <button type="button" role="menuitem" onClick={run(()=>onShift(15))}>15분 늦추기</button>
      <hr/>
      <button type="button" role="menuitem" onClick={run(onAdd)}>휴식 추가</button>
      {menu.target!=='work'&&<button type="button" role="menuitem" onClick={run(onDelete)}>휴식 삭제</button>}
      <hr/>
    </>}
    <button type="button" role="menuitem" onClick={run(onToggle)}>{day.enabled?'휴무로 변경':'근무로 변경'}</button>
  </motion.div>,document.body);
}
