import type {KeyboardEvent as ReactKeyboardEvent} from 'react';

// Menu keys shared by block and pile menus: arrows wrap, Home/End jump, Esc/Tab leave.
export function menuKeys(e:ReactKeyboardEvent<HTMLElement>,close:()=>void){
  const items=[...e.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)')],i=items.indexOf(document.activeElement as HTMLElement);
  const go=(n:number)=>{e.preventDefault();items[(n+items.length)%items.length]?.focus();};
  if(e.key==='ArrowDown')go(i+1);
  else if(e.key==='ArrowUp')go(i<0?items.length-1:i-1);
  else if(e.key==='Home')go(0);
  else if(e.key==='End')go(items.length-1);
  else if(e.key==='Escape'||e.key==='Tab'){e.preventDefault();e.stopPropagation();close();}
}
// Splitting opens the cutting board on the stored task (store/cut.ts saves typed changes first).
export {openCut as requestSplit} from '../store/cut.ts';
// The block's own button, where focus returns after a menu or chooser closes.
export const blockButton=(id:string,prefer?:Element|null)=>prefer instanceof HTMLElement&&prefer.isConnected&&prefer.dataset.task===id?prefer:document.querySelector<HTMLElement>(`[data-task="${CSS.escape(id)}"]`);
// 오늘 opens detail in its side panel; the single-column fallback (≤760px) opens it over the timetable.
export const editorModeHere=():'panel'|'dialog'=>matchMedia('(max-width:760px)').matches?'dialog':'panel';
