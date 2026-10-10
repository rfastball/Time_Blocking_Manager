import type {Command,Snapshot,Task} from './types.ts';
import {placementIssue as checkPlacement} from './placement.ts';
import {effectiveDay} from './settings.ts';
import {dateOf,minutes,plusDays,time} from './dates.ts';

// Browser preview stand-in for the Rust store: the same transitions on a cloned snapshot.
export function previewMutation(snapshot:Snapshot,command:Command,occurrences:Set<string>):Snapshot {
  const s=structuredClone(snapshot),a=command.action;s.layouts??=[];s.trash??=[];
  const taskMinute=(t:Task)=>minutes(t.starts_at!.slice(11));
  const nextOrder=(date:string)=>Math.max(0,...s.tasks.filter(t=>t.plan_date===date&&!t.starts_at).map(t=>t.flow_order??0))+1;
  const toFlow=(t:Task,date:string)=>{t.starts_at=null;t.plan_date=date;t.flow_order=nextOrder(date);};
  const raise=(date:string,at:string)=>{if(at.slice(0,10)!==date)throw Error('완료 확인 날짜가 계획 날짜와 다릅니다.');const minute=minutes(at.slice(11)),row=s.layouts.find(l=>l.date===date);if(row)row.anchor=Math.max(row.anchor,minute);else s.layouts.push({date,anchor:minute});};
  const fixedIssue=(id:string,startsAt:string,duration:number)=>checkPlacement(id,startsAt.slice(0,10),minutes(startsAt.slice(11)),duration,effectiveDay(s.settings,startsAt.slice(0,10)),s.tasks);
  if(a.type==='create'||a.type==='create_scheduled'||a.type==='create_flow'){
    const start=a.type==='create_scheduled'?a.starts_at:null,duration=a.type==='create'?30:a.duration;
    if(start&&fixedIssue(a.id,start,duration))throw Error('다른 작업 또는 금지시간과 겹칩니다.');
    const task:Task={id:a.id,title:a.title,body:'',starts_at:start,duration,completed:false,revision:1,plan_date:start?.slice(0,10)??null,flow_order:null};
    if(a.type==='create_flow')toFlow(task,a.date);
    s.tasks.push(task);
  }
  else if(a.type==='set_settings'||a.type==='set_schedule'){
    s.settings={...s.settings,...a,revision:s.settings.revision+1};
    for(const t of s.tasks){if(t.starts_at&&checkPlacement(t.id,t.starts_at.slice(0,10),taskMinute(t),t.duration,effectiveDay(s.settings,t.starts_at.slice(0,10)),[])){
      if(a.type==='set_schedule'&&a.move_conflicts){toFlow(t,t.plan_date!);t.revision++;}else throw Error('배치된 작업과 겹칩니다.');
    }}
  }
  else if(a.type==='set_routines'){
    if(a.expected_revision!==s.settings.revision)throw Error('정기 업무 설정이 변경됐습니다. 다시 확인하세요.');
    s.settings.routines=a.routines;s.settings.revision++;
  }
  else if(a.type==='ensure_routines'){
    for(let date=a.from;date<=a.to;date=plusDays(date,1))for(const routine of s.settings.routines??[]){
      const key=routine.id+':'+date;
      if(occurrences.has(key)||!routine.weekdays.includes((dateOf(date).getDay()+6)%7))continue;
      const id=crypto.randomUUID(),task:Task={id,title:routine.title,body:routine.body,starts_at:date+'T'+time(routine.start),duration:routine.duration,completed:false,revision:1,plan_date:date,flow_order:null};
      if(checkPlacement(id,date,routine.start,routine.duration,effectiveDay(s.settings,date),s.tasks))toFlow(task,date);
      s.tasks.push(task);occurrences.add(key);
    }
  }
  else if(a.type==='clear_day'){
    const tasks=s.tasks.filter(t=>t.plan_date===a.date);
    if(tasks.length!==a.expected_tasks.length||tasks.some(t=>!a.expected_tasks.some(expected=>expected.id===t.id&&expected.revision===t.revision)))throw Error('일정이 변경됐습니다. 다시 확인하세요.');
    for(const task of tasks){task.starts_at=null;task.plan_date=null;task.flow_order=null;task.revision++;}
    s.layouts=s.layouts.filter(l=>l.date!==a.date);
  }
  else if(a.type==='complete_flow'){
    const tasks=a.items.map(item=>s.tasks.find(t=>t.id===item.id&&t.revision===item.revision&&t.plan_date===a.date&&!t.starts_at&&!t.completed));
    if(!tasks.length||tasks.some(t=>!t))throw Error('다른 곳에서 항목이 변경됐습니다. 다시 확인하세요.');
    for(const t of tasks){t!.completed=true;t!.revision++;}
    if(a.at)raise(a.date,a.at);
  }
  else if(a.type==='reflow')raise(a.date,a.at);
  else if(a.type==='reorder_flow'){
    const current=s.tasks.filter(t=>t.plan_date===a.date&&!t.starts_at&&!t.completed);
    if(current.length!==a.expected.length||a.expected.some(e=>!current.some(t=>t.id===e.id&&t.revision===e.revision)))throw Error('다른 창에서 하루 순서가 변경됐습니다. 다시 확인하세요.');
    a.expected.forEach((e,i)=>{s.tasks.find(t=>t.id===e.id)!.flow_order=i+1;});
  }
  else if(a.type==='restore_trashed'){
    const item=s.trash.find(t=>t.id===a.id);if(!item)throw Error('휴지통에서 이미 복원했거나 지운 항목입니다. 다시 확인하세요.');
    const {deleted_at:_,...task}=item;task.revision++;s.trash=s.trash.filter(t=>t!==item);
    // A taken time falls back to flow work on the same date (D8/D9); flow work returns to its old order.
    if(task.starts_at&&fixedIssue(task.id,task.starts_at,task.duration))toFlow(task,task.plan_date!);
    else if(!task.starts_at&&task.plan_date)for(const x of s.tasks)if(x.plan_date===task.plan_date&&!x.starts_at&&(x.flow_order??0)>=task.flow_order!)x.flow_order=(x.flow_order??0)+1;
    s.tasks.push(task);
  }
  else if(a.type==='purge_trashed'){
    if(!a.ids.length||a.ids.some(id=>!s.trash.some(t=>t.id===id)))throw Error('다른 창에서 휴지통이 바뀌었습니다. 다시 확인하세요.');
    s.trash=s.trash.filter(t=>!a.ids.includes(t.id));
  }
  else {const t=s.tasks.find(t=>t.id===a.id)!;
    if(a.type==='delete'){if(!t)throw Error('항목이 이미 삭제됐습니다.');s.tasks=s.tasks.filter(x=>x!==t);s.trash.unshift({...t,deleted_at:new Date().toISOString().slice(0,19)+'Z'});}
    else if(a.type==='set_completed'){t.completed=a.completed;t.revision++;}
    else if(a.type==='split'){if(t.completed||a.first_duration<15||a.first_duration%15||a.first_duration>t.duration-15)throw Error('각 블록은 15분 이상이어야 해요.');s.tasks.push({...t,id:a.new_id,starts_at:null,plan_date:null,flow_order:null,duration:t.duration-a.first_duration,revision:1});t.duration=a.first_duration;t.revision++;}
    else {
      if(a.starts_at&&fixedIssue(a.id,a.starts_at,a.duration))throw Error('다른 항목 또는 작업 불가 시간과 겹칩니다.');
      const wasFlowOn=!t.starts_at?t.plan_date:null;
      Object.assign(t,{title:a.title,body:a.body,duration:a.duration,starts_at:a.starts_at,revision:t.revision+1});
      const date=a.starts_at?.slice(0,10)??a.plan_date;
      if(a.starts_at){t.plan_date=date;t.flow_order=null;}
      else if(!date){t.plan_date=null;t.flow_order=null;}
      else if(a.before){const target=s.tasks.find(x=>x.id===a.before&&x.plan_date===date&&!x.starts_at&&!x.completed&&x.id!==t.id);if(!target)throw Error('끼워 넣을 위치를 다시 확인하세요.');const order=target.flow_order!;for(const x of s.tasks)if(x.id!==t.id&&x.plan_date===date&&!x.starts_at&&(x.flow_order??0)>=order)x.flow_order=(x.flow_order??0)+1;t.plan_date=date;t.flow_order=order;}
      else if(wasFlowOn!==date)toFlow(t,date);
    }
  } return s;
}
