// The cutting board (도마): the block at twice the scale, cut into pieces by a knife line, seams and names.
// It doubles as the title and memo editor. Closing (닫기·Esc) commits; 취소 throws this edit away.
import {Fragment,useCallback,useEffect,useRef,useState,type KeyboardEvent,type PointerEvent as ReactPointerEvent} from 'react';
import {isCompositionKey} from '../../capture.ts';
import {addPiece,canCut,cut,fromChecklist,halve,join,knifeAt,move,sizedTotal,trade,type Seg} from '../../cut.ts';
import {checklist} from '../../detail.ts';
import {formatDuration} from '../../format.ts';
import {getState,useApp} from '../store/state.ts';
import {cancelCut,commitCut,cutPlace,editCut} from '../store/cut.ts';
import {setGesture} from '../store/tasks.ts';
import {reduced} from '../ui/motion.ts';
import {Icon} from '../ui/icons.tsx';
import './cut.css';

// Twice the bench scale; an unsized piece is drawn at a fixed height with no length.
const BS=2,PROTO_H=36;
const heightOf=(s:Seg)=>s.sized?Math.round(s.duration*BS):PROTO_H;
type Knife={i:number;off:number;top:number};

export function CutBoard({mode}:{mode:'inline'|'dialog'}){
  const {drafts,snapshot,error,busy}=useApp(),c=drafts.cut!,task=snapshot!.tasks.find(t=>t.id===c.taskId);
  const [knife,setKnife]=useState<Knife|null>(null),[drop,setDrop]=useState<number|null>(null),[grab,setGrab]=useState(-1),[add,setAdd]=useState('');
  const block=useRef<HTMLDivElement>(null),gesture=useRef(false),root=useRef<HTMLDivElement>(null);
  const segs=c.segs,n=segs.length,many=n>1;
  const tops:number[]=[];let y=0;for(const s of segs){tops.push(y);y+=heightOf(s);}
  const total=sizedTotal(segs),open=segs.filter(s=>!s.sized).length,items=checklist(c.body);
  const focusSeg=useCallback((key:string)=>requestAnimationFrame(()=>document.getElementById('seg-'+key)?.focus()),[]);
  useEffect(()=>{requestAnimationFrame(()=>{const el=document.getElementById('cut-title') as HTMLInputElement|null;el?.focus();if(mode==='inline')root.current?.scrollIntoView({block:'nearest',behavior:reduced()?'instant':'smooth'});});},[]);
  if(!task)return null;
  const set=(next:Seg[],focus?:string)=>{editCut({segs:next});setKnife(null);if(focus)focusSeg(focus);};
  const minuteAt=(clientY:number)=>clientY-block.current!.getBoundingClientRect().top;

  // The knife follows the pointer over a piece's body; a press there cuts.
  function hover(e:ReactPointerEvent<HTMLDivElement>){
    if(gesture.current||(e.target as HTMLElement).closest('input,button,.cut-edge')){if(knife)setKnife(null);return;}
    const at=minuteAt(e.clientY),i=tops.findIndex((top,j)=>at>=top&&at<top+heightOf(segs[j]));
    const s=segs[i];
    const next=s&&canCut(s)?{i,off:knifeAt(s,(at-tops[i])/BS),top:0}:null;
    if(next)next.top=Math.round(tops[i]+next.off*BS);
    if(next?.i!==knife?.i||next?.off!==knife?.off)setKnife(next);
  }
  function press(e:ReactPointerEvent<HTMLDivElement>){
    if(!knife||(e.target as HTMLElement).closest('input,button,.cut-edge'))return;
    const r=cut(segs,knife.i,knife.off);if(r)set(r.segs,r.focus);
  }
  // A seam traded between its neighbours, or the bottom edge, follows the hand in 15-minute steps.
  function edge(e:ReactPointerEvent<HTMLDivElement>,i:number){
    if(e.button!==0)return;e.preventDefault();e.stopPropagation();
    const y0=e.clientY,base=segs;gesture.current=true;setGesture(true);setKnife(null);
    const moveTo=(ev:PointerEvent)=>editCut({segs:trade(base,i,(ev.clientY-y0)/BS)});
    const up=()=>{removeEventListener('pointermove',moveTo);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);gesture.current=false;setGesture(false);};
    addEventListener('pointermove',moveTo);addEventListener('pointerup',up);addEventListener('pointercancel',up);
  }
  // A piece's grip moves it; the line shows where it goes.
  function grip(e:ReactPointerEvent<HTMLButtonElement>,i:number){
    if(e.button!==0)return;e.preventDefault();e.stopPropagation();
    gesture.current=true;setGesture(true);setGrab(i);setKnife(null);let target:number|null=null;
    const moveTo=(ev:PointerEvent)=>{const at=minuteAt(ev.clientY);let idx=0;tops.forEach((top,j)=>{if(top+heightOf(segs[j])/2<at)idx=j+1;});target=idx===i||idx===i+1?null:idx;setDrop(target);};
    const up=()=>{removeEventListener('pointermove',moveTo);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);gesture.current=false;setGesture(false);setGrab(-1);setDrop(null);
      if(target!=null){const to=target>i?target-1:target;set(move(getState().drafts.cut!.segs,i,to),segs[i].key);}};
    addEventListener('pointermove',moveTo);addEventListener('pointerup',up);addEventListener('pointercancel',up);
  }
  // A piece's name reads like a line of text: Enter cuts, Backspace on an empty name joins, arrows move between pieces.
  function nameKeys(e:KeyboardEvent<HTMLInputElement>,i:number){
    if(isCompositionKey(e.nativeEvent))return;
    const s=segs[i];
    if(e.key==='Enter'){e.preventDefault();const r=halve(segs,i);set(r.segs,r.focus);return;}
    if(e.key==='Backspace'&&!s.name&&i>0&&e.currentTarget.selectionStart===0){e.preventDefault();set(join(segs,i-1),segs[i-1].key);return;}
    if(e.key==='ArrowUp'||e.key==='ArrowDown'){
      const dir=e.key==='ArrowUp'?-1:1;e.preventDefault();
      if(e.altKey){set(move(segs,i,i+dir),s.key);return;}
      if(e.ctrlKey||e.metaKey){set(trade(segs,i,dir*15));return;}
      const next=segs[i+dir];if(next)focusSeg(next.key);
    }
  }
  function keys(e:KeyboardEvent<HTMLDivElement>){
    if(e.key==='Escape'&&!isCompositionKey(e.nativeEvent)){e.preventDefault();e.stopPropagation();void commitCut();}
  }
  const failure=error||'';
  return <div ref={root} className={'cut '+(mode==='inline'?'cut-inline':'cut-modal')} role="group" aria-label={`‘${c.title||task.title}’ 쪼개기`} onKeyDown={keys}>
    <div className="cut-board">
      <div className="cut-title">
        <label className="sr-only" htmlFor="cut-title">제목</label>
        <input id="cut-title" autoComplete="off" maxLength={650} value={c.title} onChange={e=>editCut({title:e.target.value})}
          onKeyDown={e=>{if(e.key!=='Enter'||isCompositionKey(e.nativeEvent))return;e.preventDefault();if(many)focusSeg(segs[0].key);else void commitCut();}}/>
        <span className="cut-sum">{[total?formatDuration(total):'',open?`길이 미정 ${open}`:''].filter(Boolean).join(' · ')}</span>
      </div>
      <div ref={block} className={'cut-block'+(knife?' knifing':'')} style={{height:y}} onPointerMove={hover} onPointerLeave={()=>{if(knife)setKnife(null);}} onClick={press}>
        {segs.map((s,i)=>{const last=i===n-1,label=s.name||c.title||task.title;return <Fragment key={s.key}>
          <div className={'cut-seg'+(s.sized?'':' proto')+(s.done?' done':'')+(i===0?' first':'')+(last?' last':'')+(grab===i?' grabbed':'')} style={{top:tops[i],height:heightOf(s)}}>
            {many&&<button type="button" className="cut-grip" tabIndex={-1} aria-hidden="true" onPointerDown={e=>grip(e,i)}><Icon name="more" size={12} stroke={3}/></button>}
            {many&&<button type="button" className="cut-check" aria-label={`${label} 조각 완료`} aria-pressed={s.done} onClick={()=>set(segs.map((x,j)=>j===i?{...x,done:!x.done}:x))}><Icon name="check" size={10} stroke={3.5}/></button>}
            <label className="sr-only" htmlFor={'seg-'+s.key}>{i+1}번째 조각 이름</label>
            <input id={'seg-'+s.key} className="cut-name" aria-keyshortcuts="Enter Control+ArrowUp Control+ArrowDown Alt+ArrowUp Alt+ArrowDown" autoComplete="off" maxLength={650} placeholder={c.title||task.title} value={s.name}
              onChange={e=>editCut({segs:segs.map((x,j)=>j===i?{...x,name:e.target.value}:x)})} onKeyDown={e=>nameKeys(e,i)}/>
            <span className="cut-len">{s.sized?formatDuration(s.duration):''}</span>
          </div>
          <div className={'cut-edge'+(last?' last':'')+(s.sized?'':' open')} style={{top:tops[i]+heightOf(s)-6}} aria-hidden="true"
            onPointerDown={e=>edge(e,i)} onDoubleClick={()=>{if(!last)set(join(segs,i),s.key);}}><i/></div>
        </Fragment>;})}
        {knife&&<div className="cut-knife" style={{top:knife.top}} aria-hidden="true"><span>{formatDuration(knife.off)} <b>│</b> {formatDuration(segs[knife.i].duration-knife.off)}</span></div>}
        {drop!=null&&<div className="cut-drop" style={{top:(drop<n?tops[drop]:y)-1}} aria-hidden="true"/>}
      </div>
      <div className="cut-add">
        <Icon name="plus" size={14}/>
        <label className="sr-only" htmlFor="cut-add">조각 추가</label>
        <input id="cut-add" autoComplete="off" maxLength={650} placeholder="조각 추가" value={add} onChange={e=>setAdd(e.target.value)}
          onKeyDown={e=>{if(e.key!=='Enter'||isCompositionKey(e.nativeEvent))return;e.preventDefault();const v=add.trim();if(!v)return;set(addPiece(segs,v));setAdd('');}}/>
      </div>
      {failure&&<p className="cut-error error" role="alert">{failure}</p>}
    </div>
    <div className="cut-side">
      <span className="cut-where">{cutPlace(task.id)}</span>
      <label className="sr-only" htmlFor="cut-memo">메모</label>
      <textarea id="cut-memo" className="cut-memo" placeholder="메모" rows={8} value={c.body} onChange={e=>editCut({body:e.target.value})}/>
      {items.length>1&&!many&&<button type="button" className="btn" onClick={()=>{const r=fromChecklist(c.body,segs);if(r){editCut({segs:r.segs,body:r.body});focusSeg(r.segs[0].key);}}}>체크 항목으로 나누기</button>}
    </div>
    {/* After the memo, so a stacked board still ends with its commit. */}
    <div className="cut-foot">
      <button type="button" className="btn" onClick={cancelCut}>취소</button>
      <button type="button" className="btn primary" disabled={busy} onClick={()=>void commitCut()}>{many?`${n}개로 나누기`:'닫기'}</button>
    </div>
  </div>;
}

// Elsewhere (계획·오늘) the same board opens as a dialog. Esc commits like the close button.
export function CutHost(){
  const {ui,drafts,nav}=useApp();
  if(!ui.split||!drafts.cut||nav.view==='inbox')return null;
  return <CutDialog key={drafts.cut.taskId}/>;
}
function CutDialog(){
  const attach=useCallback((d:HTMLDialogElement|null)=>{
    if(!d)return;
    const opener=document.activeElement;if(!d.open)d.showModal();
    return ()=>{if(opener instanceof HTMLElement&&opener.isConnected)opener.focus({preventScroll:true});};
  },[]);
  return <dialog ref={attach} className="cut-dialog" aria-label="블록 쪼개기" onCancel={e=>{e.preventDefault();void commitCut();}}>
    <CutBoard mode="dialog"/>
  </dialog>;
}
