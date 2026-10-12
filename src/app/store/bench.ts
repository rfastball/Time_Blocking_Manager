// The free 미계획 bench: positions, lengths, shipping to a date, and selection.
import {benchPiles,seedBoardPositions,type PileView} from '../../bench.ts';
import {updateAction} from '../../intent.ts';
import {dateLabel,dateOf,plusDays} from '../../dates.ts';
import type {Task} from '../../types.ts';
import {getState,setUi} from './state.ts';
import {announce,dispatch} from './session.ts';
import {dayRule,land} from './tasks.ts';
import {openEditor} from './editor.ts';

const snap=()=>getState().snapshot!;
const revisions=(ids:string[])=>ids.map(id=>({id,revision:snap().tasks.find(t=>t.id===id)!.revision}));
export const piles=():PileView[]=>benchPiles(snap().tasks,snap().piles??[]);
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
// Selection in reading order: 지난 미완료 first, then the bench.
export function selectedTasks(){
  const sel=getState().ui.benchSelection,tasks=snap().tasks;
  return [...tasks.filter(t=>t.plan_date&&!t.completed&&sel.includes(t.id)),...seedBoardPositions(tasks,snap().piles??[]).filter(t=>!t.plan_date&&!t.completed&&sel.includes(t.id)).sort((a,b)=>a.board_y!-b.board_y!||a.board_x!-b.board_x!||a.id.localeCompare(b.id))];
}

export function mergeSelected(){
  const tasks=selectedTasks();
  if(tasks.length<2||tasks.some(t=>t.plan_date||t.completed))return Promise.resolve(false);
  const id=crypto.randomUUID();
  return dispatch({type:'merge_unplanned',id,items:revisions(tasks.map(t=>t.id))},{done:()=>{
    setSelection([]);land(id);openEditor(id);announce(`${tasks.length}개를 하나로 합쳤어요`);
  }});
}

// ── 놓기 ──
export function placeCards(ids:string[],pile:string|null,index:number){
  return dispatch({type:'place_unplanned',items:revisions(ids),pile,index},{done:()=>{ids.forEach(id=>land(id));}});
}
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
// Alt+arrows move the picked cards together by world pixels.
export async function nudgeBoard(t:Task,dx:number,dy:number){
  const picked=getState().ui.benchSelection.includes(t.id)?selectedTasks().filter(t=>!t.plan_date):[t];
  const seeded=seedBoardPositions(snap().tasks,snap().piles??[]);
  const items=picked.map(task=>{const p=seeded.find(t=>t.id===task.id)!;return {id:task.id,revision:task.revision,x:p.board_x!+dx,y:p.board_y!+dy};});
  if(items.some(p=>Math.abs(p.x)>100000||Math.abs(p.y)>100000))return false;
  const ok=await dispatch({type:'place_board',items});if(ok)refocus(t.id);return ok;
}
