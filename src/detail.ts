// Pure rules behind the detail editor: checklist lines in the memo, the schedule fields and their summaries.
import {formatDuration} from './format.ts';
import {time,startMinute,monthDay} from './dates.ts';
import type {Task} from './types.ts';

// "[ ] a", "[x] b" and "- [ ] c" lines are checklist items; every other line is plain memo.
const CHECK=/^\s*(?:-\s*)?\[([ xX])\]\s*(.*)$/;
export type CheckItem={line:number;checked:boolean;label:string};
export function checklist(body:string):CheckItem[]{
  return body.split('\n').flatMap((text,line)=>{const m=text.match(CHECK);return m?[{line,checked:m[1]!==' ',label:m[2]}]:[];});
}
// Rewrites only the mark of that one line, so the rest of the memo stays byte for byte.
export function toggleCheck(body:string,line:number,checked:boolean){
  const lines=body.split('\n');
  if(!CHECK.test(lines[line]??''))return body;
  lines[line]=lines[line].replace(/\[[ xX]\]/,checked?'[x]':'[ ]');
  return lines.join('\n');
}
// The memo as read at a glance: checklist marks become ✓ / · and blank lines drop out.
export function memoPreview(body:string){
  return body.split('\n').filter(l=>l.trim()).map(l=>{const m=l.match(CHECK);return m?`${m[1]===' '?'·':'✓'} ${m[2]}`:l.trim();}).join('\n');
}
export function checkCount(body:string){const items=checklist(body);return {done:items.filter(i=>i.checked).length,total:items.length};}

// Titles become one checklist line; each original memo (including its checklist marks) stays intact below it.
export function mergeBody(tasks:Pick<Task,'title'|'body'>[]){
  return tasks.map(t=>`- [ ] ${t.title.replace(/[\r\n]/g,' ')}${t.body?'\n\n'+t.body:''}`).join('\n\n');
}

export const taskState=(t:Pick<Task,'completed'|'plan_date'|'starts_at'|'wait_since'>)=>t.completed?'완료':!t.plan_date?t.wait_since?'기다림':'준비':t.starts_at?'시각 고정':'계획';
export const quarter=(minute:number)=>Math.round(minute/15)*15;

// The collapsed schedule line: size, then where the block lives.
export function scheduleSummary(t:Pick<Task,'duration'|'plan_date'|'starts_at'>){
  const size=Number.isInteger(t.duration)&&t.duration>0?formatDuration(t.duration):'크기 미정';
  const place=t.starts_at?`${monthDay(t.starts_at.slice(0,10))} ${t.starts_at.slice(11,16)} 고정`:t.plan_date?monthDay(t.plan_date):'준비';
  return `일정 · ${size} · ${place}`;
}
// The time the block occupies: its fixed range, or the flow estimate when the day plan has one.
export function scheduleHint(t:Pick<Task,'duration'|'plan_date'|'starts_at'>,estimate:{start:number;end:number}|null=null){
  if(t.starts_at)return `${t.starts_at.slice(11,16)}–${time(startMinute(t.starts_at)+(Number.isFinite(t.duration)?t.duration:0))}`;
  if(!t.plan_date)return '준비';
  return estimate?`예상 ${time(estimate.start)}–${time(estimate.end)}`:monthDay(t.plan_date);
}
// Date and fixed time as typed. A fixed block needs both; until then it stays a dated flow block.
export function withSchedule(date:string,fixed:boolean,at:string):Pick<Task,'plan_date'|'starts_at'>{
  return {plan_date:date||null,starts_at:fixed&&date&&/^\d\d:\d\d$/.test(at)?date+'T'+at:null};
}
export const durationValid=(n:number)=>Number.isInteger(n)&&n>=15&&n<=1440&&n%15===0;
// A dragged length lands on the nearest 15 minutes within the range durationValid accepts.
export const snapDuration=(minutes:number)=>Math.max(15,Math.min(1440,Math.round(minutes/15)*15));
