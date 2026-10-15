import type {PointerEvent as ReactPointerEvent} from 'react';

type Follow={
  // How far the pointer must travel (only up or down with `along: 'y'`) before the gesture starts; short of it, the press stays a click.
  threshold?:number;along?:'y';
  start?:()=>void;
  move:(ev:PointerEvent)=>void;
  // `moved`: whether the pointer ever passed the threshold.
  end:(ev:PointerEvent,moved:boolean)=>void;
  // Escape, leaving the window or a cancelled pointer drop the gesture. Without it a cancelled pointer ends it like a release.
  cancel?:()=>void;
};

// Follows the pointer that pressed until it lifts; every listener goes with it.
export function follow(press:ReactPointerEvent|PointerEvent,{threshold=0,along,start,move,end,cancel}:Follow){
  const id=press.pointerId,x0=press.clientX,y0=press.clientY;let moved=false;
  const onMove=(ev:PointerEvent)=>{
    if(ev.pointerId!==id)return;
    if(!moved){
      if((along==='y'?Math.abs(ev.clientY-y0):Math.hypot(ev.clientX-x0,ev.clientY-y0))<threshold)return;
      moved=true;start?.();
    }
    move(ev);
  };
  const stop=()=>{
    document.removeEventListener('pointermove',onMove);document.removeEventListener('pointerup',onUp);document.removeEventListener('pointercancel',onCancel);
    document.removeEventListener('keydown',onKey,true);window.removeEventListener('blur',onBlur);
  };
  const onUp=(ev:PointerEvent)=>{if(ev.pointerId!==id)return;stop();end(ev,moved);};
  const onCancel=(ev:PointerEvent)=>{if(ev.pointerId!==id)return;stop();if(cancel)cancel();else end(ev,moved);};
  const onBlur=()=>{stop();cancel!();};
  const onKey=(ev:KeyboardEvent)=>{if(ev.key!=='Escape')return;ev.preventDefault();ev.stopPropagation();stop();cancel!();};
  document.addEventListener('pointermove',onMove,{passive:false});document.addEventListener('pointerup',onUp);document.addEventListener('pointercancel',onCancel);
  if(cancel){document.addEventListener('keydown',onKey,true);window.addEventListener('blur',onBlur);}
}
