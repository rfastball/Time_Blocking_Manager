// Global search: Ctrl+K or the menu's 검색 opens an input and its results at the top centre. Esc gives focus back.
import {useEffect,useLayoutEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react';
import {motion} from 'motion/react';
import {isCompositionKey} from '../../capture.ts';
import {search,type Hit} from '../../search.ts';
import {getState,setNav,setUi,useApp} from '../store/state.ts';
import {reduced} from '../ui/motion.ts';
import {Icon} from '../ui/icons.tsx';
import './search.css';

export const openSearch=()=>{const s=getState();if(s.ready&&s.snapshot&&s.draftLoaded)setUi({search:true,contextMenu:null});};

export function SearchHost(){
  const {ui}=useApp();
  // Ctrl+K anywhere in the main window, except under a modal dialog, which owns the keyboard.
  useEffect(()=>{
    const key=(e:globalThis.KeyboardEvent)=>{
      if(!(e.ctrlKey||e.metaKey)||e.altKey||e.shiftKey||e.key.toLowerCase()!=='k'||e.isComposing)return;
      if(document.querySelector('dialog[open]'))return;
      e.preventDefault();openSearch();
    };
    addEventListener('keydown',key);return ()=>removeEventListener('keydown',key);
  },[]);
  return <>{ui.search&&<SearchPanel/>}{ui.found&&<FoundRing key={ui.found.id+ui.found.at}/>}</>;
}

function SearchPanel(){
  const {snapshot}=useApp(),[query,setQuery]=useState(''),[active,setActive]=useState(0);
  const [opener]=useState(()=>document.activeElement),input=useRef<HTMLInputElement>(null),panel=useRef<HTMLDivElement>(null);
  const hits=useMemo(()=>search(snapshot!,query),[snapshot,query]);
  useLayoutEffect(()=>{input.current?.focus();},[]);
  useEffect(()=>{setActive(0);},[query]);
  useEffect(()=>{document.getElementById('hit-'+hits[active]?.id)?.scrollIntoView({block:'nearest'});},[active,hits]);
  useEffect(()=>{
    const outside=(e:Event)=>{if(!panel.current?.contains(e.target as Node))close(false);};
    document.addEventListener('pointerdown',outside,true);return ()=>document.removeEventListener('pointerdown',outside,true);
  },[]);
  function close(refocus=true){setUi({search:false});if(refocus&&opener instanceof HTMLElement&&opener.isConnected)opener.focus({preventScroll:true});}
  function keys(e:KeyboardEvent<HTMLInputElement>){
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(hits.length)setActive(i=>(i+(e.key==='ArrowDown'?1:-1)+hits.length)%hits.length);return;}
    if(e.key==='Enter'&&!isCompositionKey(e.nativeEvent)){e.preventDefault();const hit=hits[active];if(hit)goTo(hit);}
  }
  const typed=!!query.trim();
  return <div className="search-layer">
    <motion.div ref={panel} className="search-panel" role="dialog" aria-label="검색" initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} transition={{duration:reduced()?0:.12}}>
      <div className="search-box">
        <Icon name="search" size={18}/>
        <input ref={input} type="text" role="combobox" aria-label="검색" aria-expanded={typed&&hits.length>0} aria-controls="search-results" aria-autocomplete="list"
          aria-activedescendant={hits[active]?'hit-'+hits[active].id:undefined} autoComplete="off" maxLength={200} placeholder="검색"
          value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={keys}/>
      </div>
      {typed&&(hits.length?<ul id="search-results" role="listbox" aria-label="검색 결과" className="search-results">
        {hits.map((h,i)=><li key={h.kind+h.id} id={'hit-'+h.id} role="option" aria-selected={i===active} className={'search-hit'+(i===active?' active':'')}
          onPointerDown={e=>e.preventDefault()} onPointerMove={()=>{if(i!==active)setActive(i);}} onClick={()=>goTo(h)}>
          <span className="hit-title">{h.title}</span><span className="hit-where">{h.where}</span>
        </li>)}
      </ul>:<p className="search-none" role="status">찾은 일이 없어요</p>)}
    </motion.div>
  </div>;
}

// Each kind of hit opens where it lives: dated work in 계획's 일 view, the bench and its lists on 미계획.
function goTo(hit:Hit){
  setUi({search:false});
  if(hit.kind==='dated'||hit.kind==='done')setNav({view:'plan',period:'day',selected:hit.date!,planAnchor:hit.date!});
  else setNav({view:'inbox'});
  setUi({found:{id:hit.id,kind:hit.kind,at:Date.now()}});
}
const targets:Record<Hit['kind'],(id:string)=>string>={
  bench:id=>`.wb [data-card="${id}"]`,
  dated:id=>`.dv-day [data-task="${id}"]`,
  done:id=>`.dv-day [data-task="${id}"]`,
  archive:id=>`.inbox-archive [data-task="${id}"]`,
  trash:id=>`[data-trash="${id}"]`,
};
const focusIn:Record<Hit['kind'],string>={bench:'.main',dated:'',done:'',archive:'.irow-restore',trash:'.irow-restore'};

// A brief ring on the found block, once it is drawn and scrolled into view; focus moves to it for the keyboard.
function FoundRing(){
  const {ui}=useApp(),found=ui.found!,[box,setBox]=useState<{left:number;top:number;width:number;height:number}|null>(null);
  useEffect(()=>{
    let frames=0,el:HTMLElement|null=null,raf=0;
    const place=()=>{if(!el?.isConnected)return;const r=el.getBoundingClientRect();setBox({left:r.left-4,top:r.top-4,width:r.width+8,height:r.height+8});};
    const look=()=>{
      const hit=document.querySelector<HTMLElement>(targets[found.kind](CSS.escape(found.id)));
      if(!hit){if(++frames<90)raf=requestAnimationFrame(look);else setUi({found:null});return;}
      el=hit.closest<HTMLElement>('[data-block],li,.chip')??hit;
      el.scrollIntoView({block:'center',behavior:reduced()?'instant':'smooth'});
      const button=focusIn[found.kind]?el.querySelector<HTMLElement>(focusIn[found.kind]):hit;
      button?.focus({preventScroll:true});
      setTimeout(place,reduced()?0:320);
    };
    raf=requestAnimationFrame(look);
    addEventListener('scroll',place,true);addEventListener('resize',place);
    const done=setTimeout(()=>setUi({found:null}),reduced()?1800:2000);
    return ()=>{cancelAnimationFrame(raf);clearTimeout(done);removeEventListener('scroll',place,true);removeEventListener('resize',place);};
  },[]);
  if(!box)return null;
  // Without motion the ring simply stands, then goes with the found state.
  if(reduced())return <div className="found-ring" aria-hidden="true" style={box}/>;
  return <motion.div className="found-ring" aria-hidden="true" style={box} initial={{opacity:0}} animate={{opacity:[0,1,1,0]}} transition={{duration:1.6,times:[0,.1,.75,1]}}/>;
}
