import {useEffect,useRef,type RefObject} from 'react';

// Keeps a floating box inside the viewport with an 8px margin.
export function clamp(x:number,y:number,w:number,h:number){return {left:Math.max(8,Math.min(x,innerWidth-w-8)),top:Math.max(8,Math.min(y,innerHeight-h-8))};}

// Closes a floating box on a press outside it (`inside`: the box, or a test for what counts as part of it), and, when
// asked, when the page scrolls under it, the window resizes or loses focus. `enabled` false keeps it open.
export function useDismiss(inside:RefObject<HTMLElement|null>|((target:Element)=>boolean),close:()=>void,{scroll=false,resize=false,blur=false,enabled=true}={}){
  const latest=useRef({inside,close});latest.current={inside,close};
  useEffect(()=>{
    if(!enabled)return;
    const within=(t:EventTarget|null)=>{const i=latest.current.inside;return typeof i==='function'?t instanceof Element&&i(t):!!i.current?.contains(t as Node);};
    const outside=(e:Event)=>{if(!within(e.target))latest.current.close();};
    const away=()=>latest.current.close();
    document.addEventListener('pointerdown',outside,true);
    if(scroll)document.addEventListener('scroll',outside,true);
    if(resize)addEventListener('resize',away);
    if(blur)addEventListener('blur',away);
    return ()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('scroll',outside,true);removeEventListener('resize',away);removeEventListener('blur',away);};
  },[enabled,scroll,resize,blur]);
}
