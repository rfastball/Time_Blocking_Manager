// The 준비 tab: the 들어옴 and the shelf, lengths, moving between them, shipping to a date, and selection.
import {benchAction} from '../../intent.ts';
import {inboxCards,placeOf,shelfCards,type Place} from '../../bench.ts';
import {updateAction} from '../../intent.ts';
import {dateLabel,dateOf,plusDays} from '../../dates.ts';
import type {Task} from '../../types.ts';
import {getState,setUi} from './state.ts';
import {announce,dispatch} from './session.ts';
import {dayRule,land,overdueTasks} from './tasks.ts';
import {openEditor} from './editor.ts';
import {fly} from '../ui/flight.ts';

const snap=()=>getState().snapshot!;
const revisions=(ids:string[])=>ids.map(id=>({id,revision:snap().tasks.find(t=>t.id===id)!.revision}));
export const inbox=()=>inboxCards(snap().tasks);
export const shelf=()=>shelfCards(snap().tasks,snap().piles??[]);
// Today and the next working days after it: the dates 준비 can ship to.
export function shipDates(count=5){
  const today=getState().today,dates=[today];
  for(let d=plusDays(today,1),n=0;dates.length<count&&n<60;d=plusDays(d,1),n++)if(dayRule(d).enabled)dates.push(d);
  return dates;
}
export const shortDate=(date:string)=>{const d=dateOf(date);return `${d.getMonth()+1}월 ${d.getDate()}일`;};
// Overdue work lives in the 들어옴 until it is placed, after the undated work there.
export const pastWork=()=>overdueTasks().sort((a,b)=>a.plan_date!.localeCompare(b.plan_date!)||(a.flow_order??0)-(b.flow_order??0)||a.id.localeCompare(b.id));
// Every card in 준비 in screen order: the 들어옴 (undated, then overdue), then the shelf.
export const readingOrder=()=>[...inbox(),...pastWork(),...shelf()];
export const placeOfCard=(t:Task):Place=>t.plan_date?'inbox':placeOf(t);
export const refocus=(id:string)=>requestAnimationFrame(()=>document.querySelector<HTMLElement>(`.jb [data-task="${CSS.escape(id)}"]`)?.focus({preventScroll:false}));

// ── 선택 ──
export const setSelection=(ids:string[])=>setUi({benchSelection:ids});
export function toggleSelected(id:string){const s=getState().ui.benchSelection;setSelection(s.includes(id)?s.filter(x=>x!==id):[...s,id]);}
// Shift+click: everything between the last picked card and this one in the same place, in screen order.
export function selectRange(id:string){
  const sel=getState().ui.benchSelection,order=readingOrder(),t=order.find(x=>x.id===id);if(!t)return;
  const place=placeOfCard(t),same=order.filter(x=>placeOfCard(x)===place).map(x=>x.id);
  const anchor=[...sel].reverse().find(x=>same.includes(x));
  if(!anchor){setSelection([...sel.filter(x=>x!==id),id]);return;}
  const [a,b]=[same.indexOf(anchor),same.indexOf(id)].sort((x,y)=>x-y);
  setSelection([...new Set([...sel,...same.slice(a,b+1)])]);
}
// Selection in screen order.
export function selectedTasks(){
  const sel=getState().ui.benchSelection;
  return readingOrder().filter(t=>sel.includes(t.id));
}

export function mergeSelected(){
  const tasks=selectedTasks();
  if(tasks.length<2||tasks.some(t=>t.plan_date||t.completed))return Promise.resolve(false);
  const id=crypto.randomUUID();
  return dispatch({type:'merge_unplanned',id,items:revisions(tasks.map(t=>t.id))},{done:()=>{
    setSelection([]);land(id);openEditor(id);announce(`${tasks.length}개를 하나로 합쳤어요`);
  }});
}

// ── 옮기기 ──
// Into the 들어옴 or the shelf before the card now at `index` among the others (Infinity: the end).
export function moveTo(ids:string[],to:Place,index:number){
  const s=snap(),action=benchAction(s.tasks,s.piles??[],ids,to,index);
  if(!action)return Promise.resolve(false);
  const one=s.tasks.find(t=>t.id===ids[0]);
  return fly(ids,()=>dispatch(action,{done:()=>{
    ids.forEach(id=>land(id));
    if(placeOfCard(one!)!==to||one?.plan_date)announce(`${ids.length>1?`${ids.length}개를`:`‘${one?.title}’을`} ${to==='shelf'?'선반':'들어옴'}에 놓았어요`);
  }}));
}
// One step up or down in its own place (Alt+↑/↓).
export function shiftInPlace(t:Task,delta:number){
  const place=placeOfCard(t);if(t.plan_date)return Promise.resolve(false);
  const list=(place==='shelf'?shelf():inbox()).map(x=>x.id),at=list.indexOf(t.id),to=at+delta;
  if(at<0||to<0||to>=list.length)return Promise.resolve(false);
  return moveTo([t.id],place,to).then(ok=>{if(ok){announce(`‘${t.title}’ 순서를 옮겼어요`);refocus(t.id);}return ok;});
}
// Date only: always the end of that day's order, the same as dropping on its date head in 계획.
export function shipTo(date:string,ids:string[]){
  if(!ids.length)return Promise.resolve(false);
  return fly(ids,()=>dispatch({type:'ship_flow',date,items:revisions(ids)},{done:()=>{
    setSelection(getState().ui.benchSelection.filter(id=>!ids.includes(id)));
    announce(`${ids.length>1?ids.length+'개를':`‘${snap().tasks.find(t=>t.id===ids[0])?.title}’을`} ${dateLabel(date)} 순서 끝에 실었어요`);
  }}));
}

// ── 길이 ──
// Choosing a length sizes a proto block for good, even at the length it already had. It stays where it is.
export function setLength(t:Task,duration:number){
  const d=Math.max(15,Math.min(1440,Math.round(duration/15)*15));
  if(d===t.duration&&!t.proto)return Promise.resolve(false);
  return dispatch({...updateAction(t,t.plan_date,t.starts_at,null,d),sized:true});
}
