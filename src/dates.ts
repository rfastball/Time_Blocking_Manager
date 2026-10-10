// Local wall-clock dates (YYYY-MM-DD) and minutes since midnight.
export const dateKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const today=()=>dateKey(new Date());
export const dateOf=(s:string)=>new Date(s+'T12:00:00');
export const time=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
export const minutes=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3,5));
export const plusDays=(date:string,n:number)=>{const d=dateOf(date);d.setDate(d.getDate()+n);return dateKey(d);};
export const dateLabel=(s:string)=>dateOf(s).toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long'});
