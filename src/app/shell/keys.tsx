import {useCallback,useEffect,useRef} from 'react';
import {shortcut,shortcutList} from '../../shortcuts.ts';
import {getState,setNav,setSingleKeys,useApp} from '../store/state.ts';
import {setDock} from '../dock/Dock.tsx';
import {pushOut,setBand} from '../store/wait.ts';
import {selectedTasks} from '../store/bench.ts';
import {Icon} from '../ui/icons.tsx';

const typingIn=(el:Element|null)=>!!el&&(el.matches('input,textarea,select,[contenteditable=""],[contenteditable="true"]')||el.id==='shortcut');
const find=(selector:string)=>document.querySelector<HTMLElement>(selector);

// A key that redraws what had the keyboard keeps it near: the same block if the new view shows it, else the control that does
// the same thing. Focus already somewhere, or nowhere to begin with, is left alone.
function keepFocus(fallback:()=>HTMLElement|null){
  const was=document.activeElement;
  if(!(was instanceof HTMLElement)||was===document.body)return;
  const id=was.closest<HTMLElement>('[data-task]')?.dataset.task,range=!!was.closest('.segmented');
  requestAnimationFrame(()=>{
    if(!range&&document.activeElement&&document.activeElement!==document.body)return;
    const block=id?[...document.querySelectorAll<HTMLElement>(`[data-task="${CSS.escape(id)}"]`)].map(el=>el.matches('button,[tabindex]')?el:el.querySelector<HTMLElement>('button')).find(Boolean):null;
    block?.focus({preventScroll:true});
    if(document.activeElement!==block)fallback()?.focus({preventScroll:true});
  });
}

// B on a block: out to 기다림, with the 준비 selection it belongs to. Where the band does not show the trigger field,
// the field floats beside the block (the focus screen) or beside the folded band.
function pushFocused(){
  const was=document.activeElement as HTMLElement|null,id=was?.closest<HTMLElement>('[data-task]')?.dataset.task??was?.closest<HTMLElement>('[data-card]')?.dataset.card;
  if(!was||!id)return;
  const s=getState(),sel=s.ui.benchSelection,ids=sel.length>1&&sel.includes(id)?selectedTasks().map(t=>t.id):[id];
  const r=(was.closest<HTMLElement>('[data-block],[data-card],li')??was).getBoundingClientRect(),band=document.getElementById('wait')?.getBoundingClientRect();
  const at=s.nav.view==='today'?{x:r.right+8,y:r.top}:band?{x:band.left-244,y:r.top}:{x:r.right+8,y:r.top};
  void pushOut(ids,{at});
}

// Single-key shortcuts for the main window. Anything that owns the keyboard (a dialog, menu, search, drag, the cutting board,
// the composer, a text field) keeps it; the decision itself is src/shortcuts.ts.
export function useShortcuts(openKeys:()=>void){
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const s=getState();if(!s.ready||!s.snapshot||!s.draftLoaded||s.quitSaving||s.captureWindow)return;
      const {ui,nav}=s;
      const blocked=ui.search||!!ui.contextMenu||ui.editorMode==='dialog'||!!ui.availability||!!ui.split||s.gesture||!!document.querySelector('dialog[open],[role=menu],form.composer');
      const act=shortcut(e,{screen:nav.view,typing:typingIn(document.activeElement),blocked,editing:ui.editorMode==='panel',single:s.singleKeys});
      if(!act)return;
      e.preventDefault();
      const toggle=()=>find('header.topbar .to-screen');
      switch(act.type){
        case 'today':keepFocus(()=>null);setNav({selected:s.today,planAnchor:s.today});break;
        case 'period':if(act.period!==nav.period){keepFocus(()=>find('.segmented [aria-checked=true]'));setNav({period:act.period,planAnchor:nav.selected});}break;
        case 'fold':setDock(nav.dock==='hidden'?'narrow':'hidden');break;
        case 'widen':setDock(nav.dock==='wide'?'narrow':'wide');break;
        case 'focus':keepFocus(toggle);setNav({view:'today',selected:s.today});break;
        case 'work':keepFocus(nav.view==='settings'?()=>find('header.topbar [aria-label="설정"]'):toggle);setNav({view:'plan',planAnchor:nav.selected});break;
        case 'keys':openKeys();break;
        case 'capture':find('#tray-capture')?.focus();break;
        case 'band':setBand(nav.band==='open'?'closed':'open');break;
        case 'wait':pushFocused();break;
      }
    };
    addEventListener('keydown',onKey);return ()=>removeEventListener('keydown',onKey);
  },[openKeys]);
}

// The ? list. A modal dialog, so Esc and the close button both return to where the keyboard was.
export function KeyList({onClose}:{onClose:()=>void}){
  const {singleKeys}=useApp();
  const opening=useRef<{dialog:HTMLDialogElement;opener:Element|null}|null>(null);
  const attach=useCallback((d:HTMLDialogElement|null)=>{
    if(!d)return;
    // StrictMode reattaches the same node after the dialog has already taken focus.
    if(opening.current?.dialog!==d)opening.current={dialog:d,opener:document.activeElement};
    const opener=opening.current.opener;if(!d.open)d.showModal();
    return ()=>{requestAnimationFrame(()=>{
      if(document.activeElement&&document.activeElement!==document.body)return;
      if(opener instanceof HTMLElement&&opener.isConnected)opener.focus({preventScroll:true});
    });};
  },[]);
  return <dialog ref={attach} className="key-list" aria-labelledby="key-list-title" onCancel={e=>{e.preventDefault();onClose();}} onClose={onClose}>
    <header><h2 id="key-list-title">단축키</h2><button type="button" className="ibtn" aria-label="닫기" onClick={onClose}><Icon name="close" size={16}/></button></header>
    <dl>{shortcutList.map(k=><div key={k.keys}><dt><kbd>{k.keys}</kbd></dt><dd>{k.label}<small>{k.where}</small></dd></div>)}</dl>
    <label className="key-pref"><input type="checkbox" role="switch" checked={singleKeys} onChange={e=>setSingleKeys(e.target.checked)}/>한 글자 단축키</label>
  </dialog>;
}
