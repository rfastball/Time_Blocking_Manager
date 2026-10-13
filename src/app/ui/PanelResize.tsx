import {useLayoutEffect,useMemo,useRef,useState,type CSSProperties,type RefObject} from 'react';
import './panel-resize.css';

const MIN_PANEL=280,SPLITTER=16;
const storageName=(key:string)=>`blokky.panel.${key}`;
function readRatio(key:string,fallback:number){
  try{const raw=localStorage.getItem(storageName(key)),n=raw===null?NaN:Number(raw);return Number.isFinite(n)&&n>0&&n<1?n:fallback;}catch{return fallback;}
}
const clamp=(ratio:number,width:number)=>{const min=Math.min(.5,MIN_PANEL/Math.max(width-SPLITTER,1));return Math.max(min,Math.min(1-min,ratio));};

// Panel widths are device preferences; changing work-data snapshots leaves them intact.
export function usePanelResize(key:string,defaultRatio:number,label:string,controls:string,enabled=true,variable='panel'){
  const ref=useRef<HTMLDivElement>(null),[width,setWidth]=useState(0);
  const stored=useMemo(()=>readRatio(key,defaultRatio),[key,defaultRatio]);
  const [value,setValue]=useState({key,ratio:stored});
  const preferred=value.key===key?value.ratio:stored,ratio=clamp(preferred,width||1200);
  useLayoutEffect(()=>{
    const el=ref.current;if(!el)return;
    // The intermediate calendar layout uses display:contents; its enclosing desk supplies the width.
    const nodes:HTMLElement[]=[];for(let node:HTMLElement|null=el;node&&nodes.length<3;node=node.parentElement)nodes.push(node);
    const measure=()=>setWidth(nodes.map(n=>n.getBoundingClientRect().width).find(w=>w>0)??0);
    const observer=new ResizeObserver(measure);nodes.forEach(n=>observer.observe(n));measure();
    return ()=>observer.disconnect();
  },[key,enabled]);
  function change(next:number){
    const n=clamp(next,width||1200);setValue({key,ratio:n});
    try{localStorage.setItem(storageName(key),String(n));}catch{/* A storage restriction must not disable resizing. */}
  }
  function reset(){setValue({key,ratio:defaultRatio});try{localStorage.removeItem(storageName(key));}catch{}}
  // The first panel's share of the width; the grid holds it between the two minimums and gives the second the rest,
  // so the pair always fills the row even when the measured width is stale.
  const style={[`--${variable}-first`]:`calc((100% - ${SPLITTER}px) * ${ratio})`} as CSSProperties;
  return {ref,style,stacked:width>0&&width<MIN_PANEL*2+SPLITTER,
    separator:enabled?<PanelSeparator key={key} container={ref} width={width} ratio={ratio} label={label} controls={controls} change={change} reset={reset}/>:null};
}

function PanelSeparator({container,width,ratio,label,controls,change,reset}:{container:RefObject<HTMLDivElement|null>;width:number;ratio:number;label:string;controls:string;change:(ratio:number)=>void;reset:()=>void}){
  const gesture=useRef<{pointer:number;x:number;ratio:number}|null>(null),[dragging,setDragging]=useState(false);
  const min=Math.min(50,Math.round(MIN_PANEL/Math.max((width||1200)-SPLITTER,1)*100));
  function finish(){gesture.current=null;setDragging(false);container.current?.removeAttribute('data-panel-dragging');}
  useLayoutEffect(()=>()=>{container.current?.removeAttribute('data-panel-dragging');},[container]);
  return <div className={'panel-separator'+(dragging?' dragging':'')} role="separator" tabIndex={0} aria-orientation="vertical"
    aria-label={label} aria-controls={controls} aria-valuemin={min} aria-valuemax={100-min} aria-valuenow={Math.round(ratio*100)} aria-valuetext={`${Math.round(ratio*100)}%`}
    onPointerDown={e=>{if(e.button!==0||gesture.current)return;e.preventDefault();e.stopPropagation();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);gesture.current={pointer:e.pointerId,x:e.clientX,ratio};setDragging(true);container.current?.setAttribute('data-panel-dragging','');}}
    onPointerMove={e=>{const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;e.preventDefault();e.stopPropagation();change(g.ratio+(e.clientX-g.x)/Math.max(width-SPLITTER,1));}}
    onPointerUp={e=>{if(gesture.current?.pointer!==e.pointerId)return;e.stopPropagation();finish();e.currentTarget.releasePointerCapture(e.pointerId);}}
    onPointerCancel={e=>{e.stopPropagation();finish();}} onLostPointerCapture={finish}
    onClick={e=>e.stopPropagation()} onDoubleClick={e=>{e.preventDefault();e.stopPropagation();reset();}}
    onKeyDown={e=>{const direction=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(!direction&&e.key!=='Home'&&e.key!=='End')return;e.preventDefault();e.stopPropagation();change(e.key==='Home'?0:e.key==='End'?1:ratio+direction*(e.shiftKey?48:16)/Math.max(width-SPLITTER,1));}}/>;
}
