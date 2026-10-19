// Global search: a plain partial match on titles and memos across 준비, every date, completions and the trash.
// No filters or syntax. Each hit says where the work is now, in the words the screens use.
import type {Pile,Task,Trashed} from './types.ts';
import {inboxCards,shelfCards,triggerText,waitCards,waiting} from './bench.ts';
import {byFlowOrder} from './flow.ts';
import {monthDay} from './dates.ts';

export type HitKind='bench'|'wait'|'dated'|'done'|'archive'|'trash';
export type Hit={id:string;title:string;where:string;kind:HitKind;date:string|null;inTitle:boolean};

const fold=(s:string)=>s.normalize('NFC').toLocaleLowerCase('ko-KR');
const rank:Record<HitKind,number>={bench:0,wait:1,dated:2,done:3,archive:4,trash:5};
const titles=new Intl.Collator('ko');

type Source={tasks:Task[];piles?:Pile[];trash?:Trashed[]};

// Owns a projection of one immutable snapshot. Rebuild when the snapshot is replaced.
export function createSearch(source:Source){
  // 준비 reads as its screen does: the 들어옴, then the shelf; 기다림 after it.
  const shelf=shelfCards(source.tasks,source.piles??[]),positions=new Map(shelf.map((t,n)=>[t.id,n+1]));
  const order=new Map<string,number>(),reading=new Map([...inboxCards(source.tasks),...shelf,...waitCards(source.tasks)].map((t,n)=>[t.id,n]));
  const dates=new Map<string,Task[]>();
  for(const t of source.tasks)if(t.plan_date&&!t.starts_at&&!t.completed){
    let day=dates.get(t.plan_date);if(!day)dates.set(t.plan_date,day=[]);day.push(t);
  }
  for(const day of dates.values())day.sort(byFlowOrder).forEach((t,n)=>order.set(t.id,n+1));
  const where=(t:Task):[HitKind,string]=>{
    if(!t.plan_date)return t.completed?['archive','날짜 없는 완료']:waiting(t)?['wait',`기다림 · ${triggerText(t)||'정하지 않음'}`]:['bench',t.pile_id?`선반 · ${positions.get(t.id)??0}번째`:'들어옴'];
    if(t.completed)return ['done',`${monthDay(t.plan_date)} · 완료`];
    return ['dated',`${monthDay(t.plan_date)} · ${t.starts_at?t.starts_at.slice(11,16):`순서 ${order.get(t.id)}`}`];
  };
  const entry=(t:Task,trashed:boolean)=>{
    const [kind,label]=trashed?['trash' as const,'휴지통']:where(t);
    return {hit:{id:t.id,title:t.title,where:label,kind,date:trashed?null:t.plan_date},title:fold(t.title),body:fold(t.body)};
  };
  const entries=[...source.tasks.map(t=>entry(t,false)),...(source.trash??[]).map(t=>entry(t,true))];
  entries.sort(({hit:a},{hit:b})=>rank[a.kind]-rank[b.kind]||(reading.get(a.id)??0)-(reading.get(b.id)??0)
    ||(a.kind==='done'?(b.date??'').localeCompare(a.date??''):(a.date??'').localeCompare(b.date??''))||titles.compare(a.title,b.title));
  return (query:string,limit=50):Hit[]=>{
    const q=fold(query.trim());if(!q)return [];
    // Title matches first; each group keeps the snapshot's reading order.
    const titles:Hit[]=[],memos:Hit[]=[];
    for(const e of entries){
      if(e.title.includes(q))titles.push({...e.hit,inTitle:true});
      else if(e.body.includes(q))memos.push({...e.hit,inTitle:false});
    }
    return [...titles,...memos].slice(0,limit);
  };
}

export function search(source:Source,query:string,limit=50):Hit[]{
  return query.trim()?createSearch(source)(query,limit):[];
}
