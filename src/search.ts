// Global search: a plain partial match on titles and memos across the bench, every date, completions and the trash.
// No filters or syntax. Each hit says where the work is now, in the words the screens use.
import type {Pile,Task,Trashed} from './types.ts';
import {benchPiles} from './bench.ts';
import {byFlowOrder} from './flow.ts';
import {dateOf} from './dates.ts';

export type HitKind='bench'|'dated'|'done'|'archive'|'trash';
export type Hit={id:string;title:string;where:string;kind:HitKind;date:string|null;inTitle:boolean};

const fold=(s:string)=>s.normalize('NFC').toLocaleLowerCase('ko-KR');
const day=(date:string)=>{const d=dateOf(date);return `${d.getMonth()+1}월 ${d.getDate()}일`;};
const rank:Record<HitKind,number>={bench:0,dated:1,done:2,archive:3,trash:4};

export function search(source:{tasks:Task[];piles?:Pile[];trash?:Trashed[]},query:string,limit=50):Hit[]{
  const q=fold(query.trim());if(!q)return [];
  const piles=benchPiles(source.tasks,source.piles??[]),order=new Map<string,number>(),reading=new Map(piles.flatMap(p=>p.cards).map((t,n)=>[t.id,n]));
  for(const date of new Set(source.tasks.filter(t=>t.plan_date&&!t.starts_at&&!t.completed).map(t=>t.plan_date!)))
    source.tasks.filter(t=>t.plan_date===date&&!t.starts_at&&!t.completed).sort(byFlowOrder).forEach((t,n)=>order.set(t.id,n+1));
  const where=(t:Task):[HitKind,string]=>{
    if(!t.plan_date)return t.completed?['archive','날짜 없는 완료']:['bench','작업대'];
    if(t.completed)return ['done',`${day(t.plan_date)} · 완료`];
    return ['dated',`${day(t.plan_date)} · ${t.starts_at?t.starts_at.slice(11,16):`순서 ${order.get(t.id)}`}`];
  };
  const hits:Hit[]=[];
  const consider=(t:Task,trashed:boolean)=>{
    const inTitle=fold(t.title).includes(q);if(!inTitle&&!fold(t.body).includes(q))return;
    const [kind,label]=trashed?['trash' as const,'휴지통']:where(t);
    hits.push({id:t.id,title:t.title,where:label,kind,date:trashed?null:t.plan_date,inTitle});
  };
  for(const t of source.tasks)consider(t,false);
  for(const t of source.trash??[])consider(t,true);
  // Title matches first; then the bench in reading order, dates (soonest first), completions (latest first), and what was set aside.
  return hits.sort((a,b)=>Number(b.inTitle)-Number(a.inTitle)||rank[a.kind]-rank[b.kind]||(reading.get(a.id)??0)-(reading.get(b.id)??0)
    ||(a.kind==='done'?(b.date??'').localeCompare(a.date??''):(a.date??'').localeCompare(b.date??''))||a.title.localeCompare(b.title,'ko')).slice(0,limit);
}
