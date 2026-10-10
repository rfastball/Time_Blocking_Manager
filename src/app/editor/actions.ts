import type {KeyboardEvent as ReactKeyboardEvent} from 'react';
import {getState,setUi} from '../store/state.ts';
import {closeEditor,openEditor} from '../store/editor.ts';
import {showError} from '../store/session.ts';

// Menu keys shared by the block menu and the editor's 더보기: arrows wrap, Home/End jump, Esc/Tab leave.
export function menuKeys(e:ReactKeyboardEvent<HTMLElement>,close:()=>void){
  const items=[...e.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)')],i=items.indexOf(document.activeElement as HTMLElement);
  const go=(n:number)=>{e.preventDefault();items[(n+items.length)%items.length]?.focus();};
  if(e.key==='ArrowDown')go(i+1);
  else if(e.key==='ArrowUp')go(i<0?items.length-1:i-1);
  else if(e.key==='Home')go(0);
  else if(e.key==='End')go(items.length-1);
  else if(e.key==='Escape'||e.key==='Tab'){e.preventDefault();e.stopPropagation();close();}
}
// Splitting works on the stored task, so typed changes to it must be saved first.
export function requestSplit(id:string,mode:'panel'|'dialog'){
  const d=getState().drafts;
  if(d.editorDirty&&d.editor?.id===id){openEditor(id,mode);showError(Error('변경을 저장한 뒤 블록을 나눠 주세요.'));return;}
  // The chooser floats over the page; a modal editor would sit above it.
  if(getState().ui.editorMode==='dialog'&&d.editor?.id===id)closeEditor();
  setUi({split:id,contextMenu:null});
}
// The block's own button, where focus returns after a menu or chooser closes.
export const blockButton=(id:string,prefer?:Element|null)=>prefer instanceof HTMLElement&&prefer.isConnected&&prefer.dataset.task===id?prefer:document.querySelector<HTMLElement>(`[data-task="${CSS.escape(id)}"]`);
// Keeps a floating box inside the viewport with an 8px margin.
export function clamp(x:number,y:number,w:number,h:number){return {left:Math.max(8,Math.min(x,innerWidth-w-8)),top:Math.max(8,Math.min(y,innerHeight-h-8))};}
