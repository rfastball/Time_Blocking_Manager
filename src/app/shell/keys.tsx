import {useCallback,useEffect} from 'react';
import {shortcut,shortcutList} from '../../shortcuts.ts';
import {getState,setNav} from '../store/state.ts';
import {setDock} from '../dock/Dock.tsx';
import {Icon} from '../ui/icons.tsx';

const typingIn=(el:Element|null)=>!!el&&(el.matches('input,textarea,select,[contenteditable=""],[contenteditable="true"]')||el.id==='shortcut');

// Single-key shortcuts for the main window. Anything that owns the keyboard (a dialog, menu, search, drag, the cutting board,
// a text field) keeps it; the decision itself is src/shortcuts.ts.
export function useShortcuts(openKeys:()=>void){
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const s=getState();if(!s.ready||!s.snapshot||!s.draftLoaded||s.quitSaving||s.captureWindow)return;
      const {ui,nav}=s;
      const blocked=ui.search||!!ui.contextMenu||ui.editorMode==='dialog'||!!ui.availability||!!ui.split||s.gesture||!!document.querySelector('dialog[open]');
      const act=shortcut(e,{screen:nav.view,typing:typingIn(document.activeElement),blocked,editing:ui.editorMode==='panel'});
      if(!act)return;
      e.preventDefault();
      switch(act.type){
        case 'today':setNav({selected:s.today,planAnchor:s.today});break;
        case 'period':if(act.period!==nav.period)setNav({period:act.period,planAnchor:nav.selected});break;
        case 'fold':setDock(nav.dock==='hidden'?'narrow':'hidden');break;
        case 'widen':setDock(nav.dock==='wide'?'narrow':'wide');break;
        case 'focus':setNav({view:'today',selected:s.today});break;
        case 'work':setNav({view:'plan',planAnchor:nav.selected});break;
        case 'keys':openKeys();break;
        case 'capture':document.querySelector<HTMLInputElement>('#tray-capture')?.focus();break;
      }
    };
    addEventListener('keydown',onKey);return ()=>removeEventListener('keydown',onKey);
  },[openKeys]);
}

// The ? list. A modal dialog, so Esc and the close button both return to where the keyboard was.
export function KeyList({onClose}:{onClose:()=>void}){
  const attach=useCallback((d:HTMLDialogElement|null)=>{
    if(!d)return;
    const opener=document.activeElement;if(!d.open)d.showModal();
    return ()=>{if(opener instanceof HTMLElement&&opener.isConnected)opener.focus({preventScroll:true});};
  },[]);
  return <dialog ref={attach} className="key-list" aria-labelledby="key-list-title" onCancel={e=>{e.preventDefault();onClose();}}>
    <header><h2 id="key-list-title">단축키</h2><button type="button" className="ibtn" aria-label="닫기" onClick={onClose}><Icon name="close" size={16}/></button></header>
    <dl>{shortcutList.map(k=><div key={k.keys}><dt><kbd>{k.keys}</kbd></dt><dd>{k.label}<small>{k.where}</small></dd></div>)}</dl>
  </dialog>;
}
