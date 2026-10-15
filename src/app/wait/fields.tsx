import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Task} from '../../types.ts';
import {isCompositionKey} from '../../capture.ts';
import {triggerOptions} from '../../waiting.ts';
import {getState,setUi,useApp} from '../store/state.ts';
import {closeNaming,commitRename,renameTo,setTrigger} from '../store/wait.ts';

// The trigger field: who and what, or a date. Its choices are the triggers already waiting and the near dates.
// In the band it sits where the blocks are; elsewhere (band folded, the focus screen) it floats where they were.
export function NamingField({floating=false}:{floating?:boolean}){
  const s=useApp(),n=s.ui.naming!,tasks=n.ids.map(id=>s.snapshot!.tasks.find(t=>t.id===id)).filter((t):t is Task=>!!t);
  const options=triggerOptions(n.value,s.snapshot!.tasks,s.today),done=useRef(false);
  // Floating, the keyboard goes back where it was (the focus screen's card) once the trigger is set.
  const [opener]=useState(()=>document.activeElement as HTMLElement|null);
  useEffect(()=>{done.current=false;},[n.ids]);
  if(!tasks.length)return null;
  function commit(text:string|null){
    if(done.current)return;done.current=true;
    const ids=n.ids,inBand=!floating;closeNaming();
    const back=()=>requestAnimationFrame(()=>{
      const el=inBand?document.querySelector<HTMLElement>(`[data-wait="${CSS.escape(ids[0])}"]`):opener?.isConnected&&opener.id!=='wait-trigger'?opener:document.querySelector<HTMLElement>('.ed-next .ed-next-done');
      el?.focus({preventScroll:true});
    });
    if(text!==null)void setTrigger(ids,text).then(back);else back();
  }
  const set=(patch:Partial<typeof n>)=>setUi({naming:{...n,...patch}});
  const title=tasks.length>1?`${tasks[0].title} 외 ${tasks.length-1}개`:tasks[0].title;
  const W=236,style=floating?{left:Math.min(Math.max(8,n.at?.x??innerWidth-W-80),innerWidth-W-8),top:Math.min(Math.max(8,n.at?.y??80),innerHeight-220)}:undefined;
  return <div className={'wname'+(floating?' floating':'')} style={style}>
    <span className="wname-title">{title}</span>
    <label className="sr-only" htmlFor="wait-trigger">기다리는 것</label>
    <input id="wait-trigger" role="combobox" aria-expanded={options.length>0} aria-controls="wait-options" aria-autocomplete="list" aria-activedescendant={n.hi>=0?`wait-option-${n.hi}`:undefined}
      autoComplete="off" maxLength={100} placeholder="상대 또는 날짜" value={n.value} autoFocus
      onChange={e=>set({value:e.target.value,hi:-1})}
      onBlur={()=>commit(n.value)}
      onKeyDown={e=>{
        if(isCompositionKey(e.nativeEvent))return;
        if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!options.length)return;let hi=n.hi+(e.key==='ArrowDown'?1:-1);if(hi>=options.length)hi=-1;if(hi<-1)hi=options.length-1;set({hi});}
        else if(e.key==='Enter'){e.preventDefault();commit(n.hi>=0?options[n.hi].text:n.value);}
        // Esc leaves a fresh push unnamed and a change unmade.
        else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();commit(null);}
      }}/>
    {options.length>0&&<div id="wait-options" role="listbox" aria-label="트리거">
      {options.map((o,i)=><button key={o.text} id={`wait-option-${i}`} type="button" role="option" tabIndex={-1} aria-selected={i===n.hi} className={i===n.hi?'on':''}
        onMouseDown={e=>e.preventDefault()} onClick={()=>commit(o.text)}><span>{o.text}</span>{o.note&&<small>{o.note}</small>}</button>)}
    </div>}
  </div>;
}

// Over a revived block wherever it landed: its title, to be renamed for the next step.
export function RenameField(){
  const s=useApp(),r=s.ui.renaming,input=useRef<HTMLInputElement>(null),[box,setBox]=useState<{left:number;top:number;width:number}|null>(null);
  useLayoutEffect(()=>{
    if(!r)return;
    let frame=0;
    const place=()=>{
      const v=CSS.escape(r.id),hit=document.querySelector<HTMLElement>(`[data-card="${v}"],[data-block] button.main[data-task="${v}"]`);
      const el=hit?.closest<HTMLElement>('[data-card],[data-block]')??hit,rect=el?.getBoundingClientRect();
      const fallback=document.getElementById('dock')?.getBoundingClientRect();
      const next=rect&&rect.width?{left:rect.left,top:rect.top,width:Math.max(160,rect.width)}:fallback?{left:fallback.left+8,top:fallback.top+8,width:Math.max(200,fallback.width-16)}:{left:16,top:80,width:240};
      setBox(b=>b&&b.left===next.left&&b.top===next.top&&b.width===next.width?b:next);
      frame=requestAnimationFrame(place);
    };
    place();return ()=>cancelAnimationFrame(frame);
  },[r?.id]);
  const shown=!!box;
  useEffect(()=>{if(r&&shown){input.current?.focus({preventScroll:true});input.current?.select();}},[r?.id,shown]);
  if(!r||!box)return null;
  return createPortal(<div className="wrename" style={box}>
    <label className="sr-only" htmlFor="wait-rename">제목</label>
    <input id="wait-rename" ref={input} autoComplete="off" maxLength={650} value={r.value} onChange={e=>renameTo(e.target.value)}
      onBlur={()=>void commitRename('stop')}
      onKeyDown={e=>{if(isCompositionKey(e.nativeEvent))return;if(e.key==='Enter'){e.preventDefault();void commitRename('next');}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();void commitRename('keep');}}}/>
  </div>,document.body);
}

// The last push or revival can be put back for a few seconds.
export function WaitToast(){
  const {ui}=useApp(),t=ui.waitToast;
  useEffect(()=>{if(!t)return;const at=t.at,timer=setTimeout(()=>{if(getState().ui.waitToast?.at===at)setUi({waitToast:null});},6000);return ()=>clearTimeout(timer);},[t]);
  if(!t)return null;
  return <div className="wtoast" role="status"><span>{t.text}</span><button type="button" onClick={()=>{setUi({waitToast:null});t.undo();}}>되돌리기</button></div>;
}

// Everything of the band that lives outside it: the floating trigger field, the rename field and the toast.
export function WaitHosts(){
  const {ui,nav}=useApp(),floating=!!ui.naming&&!(nav.view==='plan'&&nav.band==='open');
  return <>{floating&&<NamingField floating/>}<RenameField/><WaitToast/></>;
}
