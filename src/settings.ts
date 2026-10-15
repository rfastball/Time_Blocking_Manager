import type {Settings} from './types.ts';
import {plusDays,weekday,mondayOf} from './dates.ts';

// A schedule saved before targets existed reads as 40 hours over 5 days; a target can be at most the whole week.
export const WEEKLY_TARGET=2400,WORK_DAYS=5,WEEK_MINUTES=7*1440;
export function effectiveDay(settings:Settings,date:string){
  return settings.exceptions?.find(e=>e.date===date)?.day??settings.days[weekday(date)];
}
export function weekCapacity(settings:Settings,date:string){
  const monday=mondayOf(date);
  let minutes=0,days=0;
  for(let i=0;i<7;i++){
    const rule=effectiveDay(settings,plusDays(monday,i));
    if(rule.enabled){days++;minutes+=rule.end-rule.start-rule.breaks.reduce((n,b)=>n+b.end-b.start,0);}
  }
  return {minutes,days};
}

export const weekdays=['월요일','화요일','수요일','목요일','금요일','토요일','일요일'];

export function shortcutFromKey(event:{key:string;code:string;ctrlKey:boolean;altKey:boolean;shiftKey:boolean}){
  if(!event.ctrlKey&&!event.altKey||['Control','Alt','Shift','Meta'].includes(event.key))return null;
  const code=event.code||event.key;
  const key=code===' '||code==='Space'?'Space':/^(Key[A-Z]|Digit[0-9])$/.test(code)?code.replace(/^(Key|Digit)/,''):/^[a-z0-9]$/i.test(code)?code.toUpperCase():/^(F([1-9]|1[0-9]|2[0-4])|Enter|Tab|Escape|Arrow(Up|Down|Left|Right))$/.test(code)?code:null;
  return key?[event.ctrlKey?'Ctrl':'',event.altKey?'Alt':'',event.shiftKey?'Shift':'',key].filter(Boolean).join('+'):null;
}

