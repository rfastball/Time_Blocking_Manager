import type {ManagedBackup} from './types.ts';

const kinds:Record<ManagedBackup['kind'],string>={hour:'시간별',day:'일별',manual:'직접',safety:'복원 전',migration:'업데이트 전'};
export const backupKind=(kind:ManagedBackup['kind'])=>kinds[kind]??'백업';

const pad=(n:number)=>String(n).padStart(2,'0');
// Stored times are RFC 3339 (UTC); shown in local time, with the year only when it is not this year.
export function backupDate(value:string|null|undefined,now=new Date()){
  const d=value?new Date(value):null;
  if(!d||Number.isNaN(d.getTime()))return '시각 정보 없음';
  return `${d.getFullYear()!==now.getFullYear()?d.getFullYear()+'년 ':''}${d.getMonth()+1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const backupCount=(b:Pick<ManagedBackup,'tasks'|'error'>)=>b.error||b.tasks===null?'손상됨':`작업 ${b.tasks}건`;
export const errorText=(e:unknown)=>typeof e==='object'&&e&&'message' in e?String((e as {message:unknown}).message):String(e);
