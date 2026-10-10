// Foundation placeholder for area D (미계획 화면).
import {openEditor} from '../store/editor.ts';
import {InboxTray} from '../space/InboxTray.tsx';

export function InboxPage(){
  return <div style={{maxWidth:860}}><InboxTray scale={1.2} onOpen={t=>openEditor(t.id,'dialog')}/></div>;
}
