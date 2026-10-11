// The cutting board (도마): a block lifted at twice the scale and cut into pieces. Each piece becomes its own task on commit.
import type {Piece,Task} from './types.ts';
import {checklist} from './detail.ts';

// `sized` false: a piece with no chosen length yet (a proto). `done`: completed when the board is committed.
export type Seg={key:string;name:string;duration:number;sized:boolean;done:boolean};
export const UNSIZED=30;
const snap=(m:number)=>Math.round(m/15)*15;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
let counter=0;
export const segKey=()=>'s'+(++counter);
const seg=(name:string,duration:number,sized:boolean,done=false):Seg=>({key:segKey(),name,duration,sized,done});

export const initialSegs=(t:Task):Seg[]=>[seg('',t.duration,!t.proto)];
export const sizedTotal=(segs:Seg[])=>segs.reduce((n,s)=>n+(s.sized?s.duration:0),0);
export const canCut=(s:Seg)=>s.sized&&s.duration>=30;
// Where the knife falls for a point `minutes` into a piece: 15-minute steps, at least 15 on each side.
export const knifeAt=(s:Seg,minutes:number)=>clamp(snap(minutes),15,s.duration-15);

// Cuts piece i at `offset` minutes; the new piece below it is the one to name next.
export function cut(segs:Seg[],i:number,offset:number):{segs:Seg[];focus:string}|null{
  const s=segs[i];if(!s||!canCut(s))return null;
  const at=knifeAt(s,offset),below=seg('',s.duration-at,true);
  return {segs:[...segs.slice(0,i),{...s,duration:at},below,...segs.slice(i+1)],focus:below.key};
}
// Enter in a name: cut the piece in half, or, when it cannot be cut, start an unsized piece after it.
export function halve(segs:Seg[],i:number){
  const s=segs[i];if(canCut(s))return cut(segs,i,s.duration/2)!;
  const next=seg('',UNSIZED,false);return {segs:[...segs.slice(0,i+1),next,...segs.slice(i+1)],focus:next.key};
}
// The edge below piece i moves by `delta`: an inner seam trades time with the piece below (the total stays),
// the bottom edge changes the total, and an unsized piece gets its first length.
export function trade(segs:Seg[],i:number,delta:number):Seg[]{
  const s=segs[i],n=segs[i+1],next=[...segs];if(!s)return segs;
  const d=snap(delta);
  if(!s.sized)next[i]={...s,sized:true,duration:clamp(UNSIZED+d,15,1440)};
  else if(n?.sized){const a=clamp(s.duration+d,15,s.duration+n.duration-15);next[i]={...s,duration:a};next[i+1]={...n,duration:s.duration+n.duration-a};}
  else next[i]={...s,duration:clamp(s.duration+d,15,1440)};
  return next;
}
// Joins piece i with the one below: a wrong cut undone. The name and lengths it had are kept.
export function join(segs:Seg[],i:number):Seg[]{
  const a=segs[i],b=segs[i+1];if(!a||!b)return segs;
  const sized=a.sized||b.sized,duration=(a.sized?a.duration:0)+(b.sized?b.duration:0)||UNSIZED;
  return [...segs.slice(0,i),{...a,name:a.name||b.name,duration,sized,done:a.done&&b.done},...segs.slice(i+2)];
}
export function move(segs:Seg[],i:number,j:number):Seg[]{
  if(j<0||j>=segs.length||i===j)return segs;
  const next=[...segs],[s]=next.splice(i,1);next.splice(j,0,s);return next;
}
export const addPiece=(segs:Seg[],name:string)=>[...segs,seg(name,UNSIZED,false)];

// The memo's checklist laid out as pieces; checked items are done pieces. Those lines leave the memo.
// A sized block shares its length evenly in 15-minute steps, the last piece taking the rest.
export function fromChecklist(body:string,segs:Seg[]):{segs:Seg[];body:string}|null{
  const items=checklist(body),first=segs[0];
  if(items.length<2||segs.length!==1)return null;
  const n=items.length,total=Math.max(first.duration,15*n),per=Math.max(15,Math.floor(total/n/15)*15);
  const next=items.map((x,j)=>seg(x.label,first.sized?(j===n-1?total-per*(n-1):per):UNSIZED,first.sized,x.checked));
  const lines=new Set(items.map(x=>x.line));
  return {segs:next,body:body.split('\n').filter((_,line)=>!lines.has(line)).join('\n').replace(/^\n+|\n+$/g,'')};
}

// The stored pieces. A piece with no name is the next round of the same work: it keeps the title and gets the memo, as the first does.
// On a date an unsized piece takes the default length; on the bench it stays a proto.
export function piecesOf(task:Task,title:string,body:string,segs:Seg[],newId:()=>string):Piece[]{
  const fallback=title.trim()||task.title;
  return segs.map((s,n)=>{
    const named=s.name.trim();
    return {id:n===0?task.id:newId(),title:named||fallback,body:n===0||!named?body:'',duration:s.sized?s.duration:UNSIZED,proto:!s.sized&&!task.plan_date&&!s.done,completed:s.done};
  });
}
