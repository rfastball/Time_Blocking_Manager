import type {Task} from '../../types.ts';
import {benchAction,updateAction} from '../../intent.ts';
import {byFlowOrder} from '../../flow.ts';
import {waiting} from '../../bench.ts';
import {parseTrigger,triggerLabel} from '../../waiting.ts';
import {quotedObject} from '../../format.ts';
import {fly} from '../ui/flight.ts';
import {getState,setNav,setUi} from './state.ts';
import {announce,dispatch} from './session.ts';
import {slashDate} from '../../dates.ts';
import {focusLater,taskSelector} from '../ui/focus.ts';

const snap=()=>getState().snapshot!;
const find=(id:string)=>snap().tasks.find(t=>t.id===id);
const revisions=(tasks:Task[])=>tasks.map(({id,revision})=>({id,revision}));
const quoted=(s:string)=>`‘${s}’`;
// ‘제목’ or ‘제목’ 외 N개, with the object particle when `object`.
const named=(tasks:Task[],object=false)=>tasks.length>1?`${quoted(tasks[0].title)} 외 ${tasks.length-1}개${object?'를':''}`:object?quotedObject(tasks[0].title):quoted(tasks[0].title);
const toast=(text:string,undo:()=>void)=>setUi({waitToast:{text,undo,at:Date.now()}});

// Where a block stood before it was pushed out, so 되돌리기 can put it back: its day and time, or the next block in its
// day's order, or its 준비 list and place.
type Origin={task:Task;before:string|null};
function origin(t:Task):Origin{
  if(!t.plan_date||t.starts_at)return {task:t,before:null};
  const day=snap().tasks.filter(x=>x.plan_date===t.plan_date&&!x.starts_at&&!x.completed).sort(byFlowOrder);
  return {task:t,before:day[day.findIndex(x=>x.id===t.id)+1]?.id??null};
}
async function putBack(origins:Origin[]){
  let ok=true;
  for(const {task:t,before} of origins){
    const now=find(t.id);if(!now||!waiting(now))continue;
    const s=snap(),action=t.plan_date?updateAction(now,t.plan_date,t.starts_at,before&&s.tasks.some(x=>x.id===before&&x.plan_date===t.plan_date)?before:null)
      :benchAction(s.tasks,s.piles??[],[t.id],t.pile_id?'shelf':'inbox',(t.pile_order??1)-1);
    if(action)ok=await dispatch(action)&&ok;
  }
  if(ok)announce('되돌렸어요');
}

// Not my turn: the blocks leave their places and wait in the band, and the trigger field opens for them.
// `at`: where the field floats when the band does not show it. `flown`: a drop already carried them there.
export async function pushOut(ids:string[],{at=null,flown=false}:{at?:{x:number;y:number}|null;flown?:boolean}={}){
  const s=getState(),tasks=ids.map(find).filter((t):t is Task=>!!t&&!t.completed&&!waiting(t));
  if(!tasks.length||s.ui.naming)return false;
  const origins=tasks.map(origin);
  if(s.nav.view==='plan'&&s.nav.band==='closed')setUi({railLanding:{side:'right',ids:tasks.map(t=>t.id)}});
  const move=()=>dispatch({type:'wait',items:revisions(tasks),trigger:'',until:null,since:s.today},{done:()=>announce(`${named(tasks,true)} 기다림으로 옮겼어요`)});
  if(!await (flown?move():fly(tasks.map(t=>t.id),move))){setUi({railLanding:null});return false;}
  setUi({naming:{ids:tasks.map(t=>t.id),value:'',hi:-1,fresh:true,at:getState().nav.band==='open'&&getState().nav.view==='plan'?null:at}});
  setUi({railLanding:null});
  toast(`${named(tasks)} 기다림으로`,()=>void putBack(origins));
  return true;
}

// The trigger as typed: a date or the 상대+무엇 text. Blank leaves a fresh push unnamed.
export function setTrigger(ids:string[],text:string){
  const {trigger,until}=parseTrigger(text,getState().today);
  const tasks=ids.map(find).filter((t):t is Task=>!!t&&waiting(t));
  if(!tasks.length||tasks.every(t=>(t.wait_for??'')===trigger&&(t.wait_until??null)===until))return Promise.resolve(true);
  return dispatch({type:'wait',items:revisions(tasks),trigger,until,since:getState().today},
    {done:()=>announce(`기다림: ${until?slashDate(until)+' 이후':trigger||'정하지 않음'}`)});
}
export function editTrigger(ids:string[],at:{x:number;y:number}|null=null){
  const t=find(ids[0]);if(!t||!waiting(t))return;
  setUi({naming:{ids,value:t.wait_until?slashDate(t.wait_until):t.wait_for??'',hi:-1,fresh:false,at}});
}
export const closeNaming=()=>setUi({naming:null});

// What it waited for has come: sized blocks go on top of the shelf, protos on top of the 들어옴, in the band's order.
export async function revive(ids:string[],{flown=false}:{flown?:boolean}={}){
  const tasks=ids.map(find).filter((t):t is Task=>!!t&&waiting(t));
  if(!tasks.length)return false;
  const before=tasks.map(t=>({...t}));
  const {nav}=getState();
  if(nav.view==='plan'&&nav.dock==='hidden')setUi({railLanding:{side:'left',ids:tasks.map(t=>t.id)}});
  const move=()=>dispatch({type:'revive',items:revisions(tasks)});
  if(!await (flown?move():fly(tasks.map(t=>t.id),move))){setUi({railLanding:null});return false;}
  revived(before,tasks.every(t=>t.proto)?'들어옴으로':tasks.some(t=>t.proto)?'준비로':'선반으로');
  setUi({railLanding:null});
  return true;
}
// After any revival (released here, or dropped from the band somewhere): name each block for its next action, and offer the way back.
export function revived(before:Task[],where:string){
  const [first,...rest]=before.filter(t=>find(t.id));if(!first)return;
  announce(`${quoted(triggerLabel(first))} 충족 · ${named(before,true)} ${where} 옮겼어요`);
  setUi({renaming:{id:first.id,value:first.title,queue:rest.map(t=>t.id)}});
  toast(`${quoted(triggerLabel(first))} ${before.length>1?before.length+'건 ':''}${where}`,()=>void rewait(before));
}
async function rewait(before:Task[]){
  setUi({renaming:null});
  const groups=new Map<string,Task[]>();
  for(const t of before){const now=find(t.id);if(!now||now.completed)continue;const k=JSON.stringify([t.wait_for??'',t.wait_until??null,t.wait_since]);groups.set(k,[...groups.get(k)??[],now]);}
  let ok=true;
  for(const [k,tasks] of groups){const [trigger,until,since]=JSON.parse(k) as [string,string|null,string];ok=await dispatch({type:'wait',items:revisions(tasks),trigger,until,since})&&ok;}
  if(ok)announce('되돌렸어요');
}

// Enter names this one and moves on; leaving the field names it and stops; Esc keeps this one and the rest as they are.
export function renameTo(value:string){const r=getState().ui.renaming;if(r)setUi({renaming:{...r,value}});}
export async function commitRename(mode:'next'|'stop'|'keep'){
  const r=getState().ui.renaming;if(!r)return;
  const t=find(r.id),v=r.value.trim(),queue=mode==='next'?r.queue.filter(id=>find(id)):[];
  setUi({renaming:queue.length?{id:queue[0],value:find(queue[0])!.title,queue:queue.slice(1)}:null});
  if(!queue.length&&getState().nav.view==='plan'&&getState().nav.dock==='hidden'&&!find(r.id)?.plan_date)focusLater('#dock .dock-unfold');
  else if(!queue.length)focusLater(`[data-card="${CSS.escape(r.id)}"] button.main,button.main${taskSelector(r.id)}`);
  if(mode!=='keep'&&t&&v&&v!==t.title)await dispatch({...updateAction(t,t.plan_date,t.starts_at),title:v},{done:()=>announce(`${quoted(v)}(으)로 바꿨어요`)});
}

export const setBand=(band:'open'|'closed')=>setNav({band});
