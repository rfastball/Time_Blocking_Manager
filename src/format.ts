export const formatDuration=(minutes:number)=>minutes<60?`${minutes}분`: `${Math.floor(minutes/60)}시간${minutes%60?` ${minutes%60}분`:''}`;
// ‘제목’을 / ‘제목’를 by the last syllable's final consonant; non-Hangul endings keep both.
export function quotedObject(title:string){
  const c=title.trim().slice(-1).charCodeAt(0)-0xac00;
  return `‘${title}’${c>=0&&c<11172?(c%28?'을':'를'):'을(를)'}`;
}
export function rangeTitle(mode:string,anchor:string){
  const start=new Date(anchor+'T12:00:00');
  if(mode==='month')return `${start.getFullYear()}년 ${start.getMonth()+1}월`;
  if(mode==='day')return `${start.getMonth()+1}월 ${start.getDate()}일 ${start.toLocaleDateString('ko-KR',{weekday:'long'})}`;
  start.setDate(start.getDate()-(start.getDay()+6)%7);
  const end=new Date(start);end.setDate(end.getDate()+(mode==='week'?6:mode==='two'?13:27));
  const crossYear=start.getFullYear()!==end.getFullYear();
  return `${crossYear?start.getFullYear()+'년 ':''}${start.getMonth()+1}월 ${start.getDate()}일 – ${crossYear?end.getFullYear()+'년 ':''}${crossYear||start.getMonth()!==end.getMonth()?end.getMonth()+1+'월 ':''}${end.getDate()}일`;
}
