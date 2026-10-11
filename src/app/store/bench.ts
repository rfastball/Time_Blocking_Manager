// The 미계획 bench: piles, lengths, shipping to a date, and the bench selection.
import {benchPiles,type PileView} from '../../bench.ts';
import {updateAction} from '../../intent.ts';
import {dateLabel,dateOf,plusDays} from '../../dates.ts';
import type {Task} from '../../types.ts';
import {getState,setUi} from './state.ts';
import {announce,dispatch} from './session.ts';
import {dayRule,land} from './tasks.ts';

const snap=()=>getState().snapshot!;
const revisions=(ids:string[])=>ids.map(id=>({id,revision:snap().tasks.find(t=>t.id===id)!.revision}));
export const piles=():PileView[]=>benchPiles(snap().tasks,snap().piles??[]);
export const pileOf=(t:Task)=>piles().find(p=>p.cards.some(c=>c.id===t.id))??null;

// Today and the next working days after it: the dates the bench can ship to.
export function shipDates(count=5){
  const today=getState().today,dates=[today];
  for(let d=plusDays(today,1),n=0;dates.length<count&&n<60;d=plusDays(d,1),n++)if(dayRule(d).enabled)dates.push(d);
  return dates;
}
export const shortDate=(date:string)=>{const d=dateOf(date);return `${d.getMonth()+1}월 ${d.getDate()}일`;};
const refocus=(id:string)=>requestAnimationFrame(()=>document.querySelector<HTMLElement>(`.wb [data-task="${CSS.escape(id)}"]`)?.focus({preventScroll:false}));

// ── 선택 ──
export const setSelection=(ids:string[])=>setUi({benchSelection:ids});
export function toggleSelected(id:string){const s=getState().ui.benchSelection;setSelection(s.includes(id)?s.filter(x=>x!==id):[...s,id]);}
// A pile handle picks up its cards; pressed again with all of them picked, it lets them go.
export function selectPile(p:PileView,add:boolean){
  const ids=p.cards.map(t=>t.id),sel=getState().ui.benchSelection;if(!ids.length)return;
  const all=ids.every(id=>sel.includes(id));
  setSelection(all?sel.filter(id=>!ids.includes(id)):add?[...sel,...ids.filter(id=>!sel.includes(id))]:ids);
}
// Selection in reading order: 지난 미완료 first, then the bench.
export function selectedTasks(){
  const sel=getState().ui.benchSelection,tasks=snap().tasks;
  return [...tasks.filter(t=>t.plan_date&&!t.completed&&sel.includes(t.id)),...piles().flatMap(p=>p.cards).filter(t=>sel.includes(t.id))];
}

// ── 놓기 ──
export function placeCards(ids:string[],pile:string|null,index:number){
  return dispatch({type:'place_unplanned',items:revisions(ids),pile,index},{done:()=>{ids.forEach(id=>land(id));}});
}
export function newPileWith(ids:string[],position:number){
  return dispatch({type:'place_unplanned',items:revisions(ids),pile:crypto.randomUUID(),create_at:position,index:0},{done:()=>{ids.forEach(id=>land(id));announce('새 더미를 만들었어요');}});
}
export function stackOnto(from:PileView,onto:PileView){
  return dispatch({type:'place_unplanned',items:revisions(from.cards.map(t=>t.id)),pile:onto.id,index:onto.cards.length},{done:()=>announce('더미를 합쳤어요')});
}
export const movePileTo=(pile:string,position:number)=>dispatch({type:'move_pile',pile,position});
// Date only: always the end of that day's order, the same as dropping on its date head in 계획.
export function shipTo(date:string,ids:string[]){
  if(!ids.length)return Promise.resolve(false);
  return dispatch({type:'ship_flow',date,items:revisions(ids)},{done:()=>{
    setSelection(getState().ui.benchSelection.filter(id=>!ids.includes(id)));
    announce(`${ids.length>1?ids.length+'개를':`‘${snap().tasks.find(t=>t.id===ids[0])?.title}’을`} ${dateLabel(date)} 순서 끝에 실었어요`);
  }});
}

// ── 길이·키보드 ──
// Choosing a length sizes a proto block for good, even at the length it already had.
export function setLength(t:Task,duration:number){
  const d=Math.max(15,Math.min(1440,Math.round(duration/15)*15));
  if(d===t.duration&&!t.proto)return Promise.resolve(false);
  return dispatch({...updateAction(t,t.plan_date,t.starts_at,null,d),sized:true});
}
// Alt+↑/↓ within its pile.
export async function nudge(t:Task,delta:number){
  const p=pileOf(t);if(!p)return false;
  const at=p.cards.findIndex(c=>c.id===t.id),to=at+delta;
  if(to<0||to>=p.cards.length)return false;
  const ok=await placeCards([t.id],p.id,to);if(ok){announce(`‘${t.title}’ ${to+1}번째`);refocus(t.id);}
  return ok;
}
// Alt+←/→ to the pile beside it at the same height; past the last pile it starts a new one.
export async function shiftPile(t:Task,dir:number){
  const all=piles(),from=all.findIndex(p=>p.cards.some(c=>c.id===t.id));if(from<0)return false;
  const at=all[from].cards.findIndex(c=>c.id===t.id),to=from+dir;
  if(to<0)return false;
  let ok;
  if(to>=all.length){if(all[from].cards.length===1)return false;ok=await newPileWith([t.id],all.length);}
  else{ok=await placeCards([t.id],all[to].id,Math.min(at,all[to].cards.length));if(ok)announce(`‘${t.title}’을 ${to===0?'투입구':`${to+1}번째 더미`}로 옮겼어요`);}
  if(ok)refocus(t.id);
  return ok;
}
