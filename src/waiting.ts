import type {Task} from './types.ts';
import {triggerText,waiting} from './bench.ts';
import {dateKey,dateOf,plusDays,slashDate} from './dates.ts';

// 기다림: work pushed out until something it waits for has come. Blocks waiting on the same trigger form one pile.
// A date trigger is met on its day (ready) and only changes its look; every trigger is met by the person, never by the clock.
export type WaitKind='ready'|'who'|'date';
export type WaitGroup={key:string;kind:WaitKind;text:string;named:boolean;until:string|null;items:Task[]};

export const sinceLabel=(t:Task)=>t.wait_since?slashDate(t.wait_since)+'부터':'';
// A who-trigger has no day of its own; how long it has waited shows only once it is worth a nudge.
// The day it began stays in its name and tooltip.
export const STALE=7;
export const waitedDays=(t:Task,today:string)=>t.wait_since?Math.round((dateOf(today).getTime()-dateOf(t.wait_since).getTime())/864e5):0;
export const staleLabel=(t:Task,today:string)=>{const d=waitedDays(t,today);return d>=STALE?`${d}일째`:'';};
export const isReady=(t:Task,today:string)=>!!t.wait_until&&t.wait_until<=today;
export const triggerLabel=(t:Task)=>triggerText(t)||'정하지 않음';

// Met dates first, then triggers in 가나다 order (an unnamed one first), then later dates by date.
// Inside a pile the oldest waits in front.
export function waitGroups(tasks:Task[],today:string):WaitGroup[]{
  const groups=new Map<string,WaitGroup>();
  for(const t of tasks.filter(waiting)){
    const kind:WaitKind=t.wait_until?isReady(t,today)?'ready':'date':'who',text=triggerText(t),key=kind+':'+text;
    let g=groups.get(key);
    if(!g)groups.set(key,g={key,kind,text,named:!!text,until:t.wait_until??null,items:[]});
    g.items.push(t);
  }
  const rank={ready:0,who:1,date:2};
  const list=[...groups.values()].sort((a,b)=>rank[a.kind]-rank[b.kind]||(a.kind==='who'
    ?(a.named===b.named?a.text.localeCompare(b.text,'ko'):a.named?1:-1)
    :(a.until??'')<(b.until??'')?-1:(a.until??'')>(b.until??'')?1:0));
  for(const g of list)g.items.sort((a,b)=>(a.wait_since??'')<(b.wait_since??'')?-1:(a.wait_since??'')>(b.wait_since??'')?1:a.id<b.id?-1:a.id>b.id?1:0);
  return list;
}

// What was typed into the trigger field: a date (10/20, 10.20, 내일, 모레) or the 상대+무엇 text.
// A month/day well behind today means next year's.
export function parseTrigger(text:string,today:string):{trigger:string;until:string|null}{
  const v=text.trim().replace(/\s+/g,' ');
  if(v==='내일')return {trigger:'',until:plusDays(today,1)};
  if(v==='모레')return {trigger:'',until:plusDays(today,2)};
  const m=v.match(/^(\d{1,2})\s*[/.]\s*(\d{1,2})(?:\s*이후)?$/);
  if(m){
    const now=dateOf(today),month=Number(m[1]),day=Number(m[2]);
    let d=new Date(now.getFullYear(),month-1,day,12);
    if(d.getMonth()===month-1&&d.getDate()===day){
      if(dateKey(d)<plusDays(today,-60))d=new Date(now.getFullYear()+1,month-1,day,12);
      return {trigger:'',until:dateKey(d)};
    }
  }
  return {trigger:v,until:null};
}

// The field's choices: triggers already waiting, then the near dates. Typing narrows them by their start.
export function triggerOptions(value:string,tasks:Task[],today:string):{text:string;note:string}[]{
  const v=value.trim(),seen=new Set<string>(),people:string[]=[];
  for(const t of tasks.filter(waiting))if(t.wait_for?.trim()&&!t.wait_until&&!seen.has(t.wait_for.trim())){seen.add(t.wait_for.trim());people.push(t.wait_for.trim());}
  people.sort((a,b)=>a.localeCompare(b,'ko'));
  const monday=plusDays(today,((8-dateOf(today).getDay())%7)||7);
  const dates=[{text:slashDate(plusDays(today,1))+' 이후',note:'내일'},{text:slashDate(monday)+' 이후',note:'다음 주 월'}];
  const all=[...people.map(text=>({text,note:''})),...dates];
  if(!v)return [...all.filter(o=>!o.note).slice(0,3),...dates];
  return all.filter(o=>o.text.startsWith(v)&&o.text!==v).slice(0,5);
}

// Letters jump through the band by initial consonant; the physical key gives the same 초성 in either input mode.
const CHO='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const FOLD:Record<string,string>={'ㄲ':'ㄱ','ㄸ':'ㄷ','ㅃ':'ㅂ','ㅆ':'ㅅ','ㅉ':'ㅈ'};
const KEYCHO:Record<string,string>={KeyR:'ㄱ',KeyS:'ㄴ',KeyE:'ㄷ',KeyF:'ㄹ',KeyA:'ㅁ',KeyQ:'ㅂ',KeyT:'ㅅ',KeyD:'ㅇ',KeyW:'ㅈ',KeyC:'ㅊ',KeyZ:'ㅋ',KeyX:'ㅌ',KeyV:'ㅍ',KeyG:'ㅎ'};
export const initials=(s:string)=>Array.from(s.replace(/\s+/g,'')).map(c=>{
  const k=c.charCodeAt(0)-0xAC00;
  if(k>=0&&k<=11171){const ch=CHO[Math.floor(k/588)];return FOLD[ch]??ch;}
  return FOLD[c]??c.toLowerCase();
}).join('');
// The 초성 a key stands for, or a digit; '' for any other key.
export function keyInitial(code:string,key:string){
  if(KEYCHO[code])return KEYCHO[code];
  if(/^Digit\d$/.test(code))return code.slice(5);
  if(/^[ㄱ-ㅎ]$/.test(key))return FOLD[key]??key;
  return '';
}
// The next entry matching `typed` after `from`: a pile's trigger first (news comes with a name), its blocks' titles after.
// Repeating one letter steps through its matches.
export function jump<E extends {id:string;top:boolean;trigger:string;title:string}>(entries:E[],from:string,typed:string):E|null{
  const q=/^(.)\1+$/.test(typed)?typed[0]:typed,cur=entries.findIndex(e=>e.id===from),off=q.length===1?1:0;
  for(const hit of [(e:E)=>e.top&&initials(e.trigger).startsWith(q),(e:E)=>initials(e.title).startsWith(q)])
    for(let n=0;n<entries.length;n++){const e=entries[(cur+off+n+entries.length)%entries.length];if(hit(e))return e;}
  return null;
}
