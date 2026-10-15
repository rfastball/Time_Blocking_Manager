// Local wall-clock dates (YYYY-MM-DD) and minutes since midnight.
export const dateKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const today=()=>dateKey(new Date());
export const dateOf=(s:string)=>new Date(s+'T12:00:00');
export const time=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
export const minutes=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3,5));
export const plusDays=(date:string,n:number)=>{const d=dateOf(date);d.setDate(d.getDate()+n);return dateKey(d);};
// A stored start (YYYY-MM-DDTHH:MM): the date at a minute, and the minute back.
export const startAt=(date:string,minute:number)=>date+'T'+time(minute);
export const startMinute=(startsAt:string)=>minutes(startsAt.slice(11));
// Monday 0 … Sunday 6.
export const weekday=(date:string)=>(dateOf(date).getDay()+6)%7;
export const mondayOf=(date:string)=>plusDays(date,-weekday(date));
// The days a plan period shows from `anchor`: its week, two weeks, or the whole weeks around its month.
export function periodDates(period:'day'|'week'|'two'|'month',anchor:string){
  const first=period==='month'?mondayOf(anchor.slice(0,8)+'01'):mondayOf(anchor);
  const end=dateOf(anchor);end.setMonth(end.getMonth()+1,0);
  const count=period==='week'||period==='day'?7:period==='two'?14:Math.ceil((weekday(anchor.slice(0,8)+'01')+end.getDate())/7)*7;
  return Array.from({length:count},(_,i)=>plusDays(first,i));
}
// 10월 14일, and 10/14 where a 기다림 trigger reads it.
export const monthDay=(date:string)=>`${Number(date.slice(5,7))}월 ${Number(date.slice(8,10))}일`;
export const slashDate=(date:string)=>`${Number(date.slice(5,7))}/${Number(date.slice(8,10))}`;
export const dateLabel=(s:string)=>dateOf(s).toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long'});
