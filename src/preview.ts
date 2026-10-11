import type {Command,Snapshot,Task} from './types.ts';
import {placementIssue as checkPlacement,unavailableParts} from './placement.ts';
import {effectiveDay} from './settings.ts';
import {dateOf,minutes,plusDays,time} from './dates.ts';
import {insertPile,movePile,normalize,onBench,place} from './bench.ts';

// Browser preview stand-in for the Rust store: the same transitions on a cloned snapshot.
export function previewMutation(snapshot:Snapshot,command:Command,occurrences:Set<string>):Snapshot {
  const s=structuredClone(snapshot),a=command.action;s.layouts??=[];s.trash??=[];s.piles??=[];
  const nextOrder=(date:string)=>Math.max(0,...s.tasks.filter(t=>t.plan_date===date&&!t.starts_at).map(t=>t.flow_order??0))+1;
  const toFlow=(t:Task,date:string)=>{t.starts_at=null;t.plan_date=date;t.flow_order=nextOrder(date);};
  const raise=(date:string,at:string)=>{if(at.slice(0,10)!==date)throw Error('완료 확인 날짜가 계획 날짜와 다릅니다.');const minute=minutes(at.slice(11)),row=s.layouts.find(l=>l.date===date);if(row)row.anchor=Math.max(row.anchor,minute);else s.layouts.push({date,anchor:minute});};
  const fixedIssue=(id:string,startsAt:string,duration:number)=>checkPlacement(id,startsAt.slice(0,10),minutes(startsAt.slice(11)),duration,effectiveDay(s.settings,startsAt.slice(0,10)),s.tasks);
  const put=(ids:string[],pile:string|null,index:number)=>{s.tasks=place(s.tasks,ids,pile,index);};
  const changed=()=>Error('다른 창에서 작업이 변경됐습니다. 다시 확인하세요.');
  if(a.type==='create'||a.type==='create_scheduled'||a.type==='create_flow'){
    const start=a.type==='create_scheduled'?a.starts_at:null,duration=a.type==='create'?30:a.duration;
    const issue=start&&fixedIssue(a.id,start,duration);if(issue)throw Error(issue.label);
    const task:Task={id:a.id,title:a.title,body:'',starts_at:start,duration,completed:false,revision:1,plan_date:start?.slice(0,10)??null,flow_order:null,proto:a.type==='create'};
    if(a.type==='create_flow')toFlow(task,a.date);
    s.tasks.push(task);
    if(a.type==='create')put([a.id],null,0);
  }
  else if(a.type==='set_settings'||a.type==='set_schedule'){
    s.settings={...s.settings,...a,revision:s.settings.revision+1};
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
      if(unavailableParts(routine.start,routine.start+routine.duration,effectiveDay(s.settings,date)).length||checkPlacement(id,date,routine.start,routine.duration,effectiveDay(s.settings,date),s.tasks))toFlow(task,date);
      s.tasks.push(task);occurrences.add(key);
    }
  }
  else if(a.type==='clear_day'){
    const tasks=s.tasks.filter(t=>t.plan_date===a.date);
    if(tasks.length!==a.expected_tasks.length||tasks.some(t=>!a.expected_tasks.some(expected=>expected.id===t.id&&expected.revision===t.revision)))throw Error('일정이 변경됐습니다. 다시 확인하세요.');
    // The day's open work goes on top of the 투입구 in the order it was planned.
    const open=tasks.filter(t=>!t.completed).sort((x,y)=>(x.flow_order==null?1:0)-(y.flow_order==null?1:0)||(x.flow_order??0)-(y.flow_order??0)||(x.starts_at??'').localeCompare(y.starts_at??'')||(x.id<y.id?-1:1)).map(t=>t.id);
    // Completed work stays as that day's record; only open work goes back to 미계획.
    for(const task of tasks)if(!task.completed){task.starts_at=null;task.plan_date=null;task.flow_order=null;task.revision++;}
    s.layouts=s.layouts.filter(l=>l.date!==a.date);
    put(open,null,0);
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
    // Open unplanned work goes back into its pile while it exists, else on top of the 투입구.
    const pile=task.pile_id&&s.piles.some(p=>p.id===task.pile_id)?task.pile_id:null,index=pile?Math.max(0,(task.pile_order??1)-1):0;
    s.tasks.push({...task,pile_id:null,pile_order:null});
    if(onBench(task))put([task.id],pile,index);
  }
  else if(a.type==='purge_trashed'){
    if(!a.ids.length||a.ids.some(id=>!s.trash.some(t=>t.id===id)))throw Error('다른 창에서 휴지통이 바뀌었습니다. 다시 확인하세요.');
    s.trash=s.trash.filter(t=>!a.ids.includes(t.id));
  }
  else if(a.type==='place_unplanned'){
    const moving=a.items.map(i=>s.tasks.find(t=>t.id===i.id&&t.revision===i.revision&&!t.completed));
    if(!moving.length||moving.some(t=>!t))throw changed();
    if(a.create_at!=null){
      if(!a.pile||s.piles.some(p=>p.id===a.pile))throw Error('새 더미 정보를 확인하세요.');
      s.piles=insertPile(s.piles,a.pile,a.create_at);
    }else if(a.pile&&!s.piles.some(p=>p.id===a.pile))throw Error('더미가 바뀌었습니다. 다시 확인하세요.');
    for(const t of moving)if(t!.plan_date){t!.starts_at=null;t!.plan_date=null;t!.flow_order=null;t!.revision++;}
    put(moving.map(t=>t!.id),a.pile,a.index);
  }
  else if(a.type==='move_pile'){
    if(!s.piles.some(p=>p.id===a.pile))throw Error('더미가 바뀌었습니다. 다시 확인하세요.');
    s.piles=movePile(s.piles,a.pile,a.position);
  }
  else if(a.type==='ship_flow'){
    for(const item of a.items){
      const t=s.tasks.find(x=>x.id===item.id&&x.revision===item.revision&&!x.completed);if(!t)throw changed();
      t.flow_order=null;t.starts_at=null;t.plan_date=null;toFlow(t,a.date);
      Object.assign(t,{proto:false,pile_id:null,pile_order:null,revision:t.revision+1});
    }
  }
  else {const t=s.tasks.find(t=>t.id===a.id)!;
    if(a.type==='delete'){if(!t)throw Error('항목이 이미 삭제됐습니다.');s.tasks=s.tasks.filter(x=>x!==t);s.trash.unshift({...t,deleted_at:new Date().toISOString().slice(0,19)+'Z'});}
    else if(a.type==='set_completed'){
      // No completion without a date: 미계획 work done now is that day's completion. Undoing an old dateless one returns it to the 투입구.
      if(a.completed&&!t.completed&&!t.plan_date){if(!a.date)throw Error('완료한 날짜를 확인하세요.');toFlow(t,a.date);t.proto=false;}
      const dateless=!a.completed&&t.completed&&!t.plan_date;
      t.completed=a.completed;t.revision++;
      if(dateless)put([t.id],null,0);
    }
    else if(a.type==='split_pieces'){
      if(!t||t.revision!==a.expected_revision)throw changed();
      if(t.completed)throw Error('완료한 블록은 나눌 수 없어요.');
      if(!a.pieces.length||a.pieces[0].id!==t.id||new Set(a.pieces.map(p=>p.id)).size!==a.pieces.length||a.pieces.some((p,n)=>n>0&&[...s.tasks,...s.trash].some(x=>x.id===p.id)))throw Error('조각 정보를 확인하세요.');
      if(a.pieces.some(p=>p.duration<15||p.duration%15||!p.title.trim()))throw Error('조각의 이름과 길이를 확인하세요.');
      const bench=!t.plan_date;if(bench&&a.pieces.some(p=>p.completed)&&!a.date)throw Error('완료한 날짜를 확인하세요.');
      const others=s.tasks.filter(x=>x.id!==t.id),index=bench?others.filter(x=>!x.plan_date&&!x.completed&&(x.pile_id??null)===(t.pile_id??null)&&(x.pile_order??0)<(t.pile_order??0)).length:0;
      let minute=t.starts_at?minutes(t.starts_at.slice(11)):null;const order=t.flow_order;
      if(t.plan_date&&!t.starts_at&&order!=null)for(const x of others)if(x.plan_date===t.plan_date&&!x.starts_at&&(x.flow_order??0)>order)x.flow_order=(x.flow_order??0)+a.pieces.length-1;
      const built:Task[]=[],open:string[]=[];
      a.pieces.forEach((p,n)=>{
        const x:Task={id:p.id,title:p.title.trim(),body:p.body,duration:p.duration,completed:p.completed,revision:n===0?t.revision+1:1,plan_date:t.plan_date,starts_at:null,flow_order:null,proto:false,pile_id:null,pile_order:null};
        if(minute!=null){x.starts_at=t.plan_date+'T'+time(minute);minute+=p.duration;const issue=checkPlacement(x.id,t.plan_date!,minutes(x.starts_at.slice(11)),x.duration,effectiveDay(s.settings,t.plan_date!),[...others,...built]);if(issue)throw Error(issue.label);}
        else if(order!=null)x.flow_order=order+n;
        else if(p.completed){x.plan_date=a.date!;x.flow_order=Math.max(0,...[...others,...built].filter(y=>y.plan_date===a.date&&!y.starts_at).map(y=>y.flow_order??0))+1;}
        else {x.proto=p.proto;open.push(x.id);}
        built.push(x);
      });
      s.tasks=[...others,...built];
      if(bench)put(open,t.pile_id??null,index);
    }
    else {
      if(a.starts_at&&fixedIssue(a.id,a.starts_at,a.duration))throw Error('다른 항목 또는 작업 불가 시간과 겹칩니다.');
      const wasFlowOn=!t.starts_at?t.plan_date:null,wasDated=!!t.plan_date,wasDone=t.completed;
      const date=a.starts_at?.slice(0,10)??a.plan_date;
      if(!date&&wasDone&&wasDated)throw Error('완료한 작업은 미계획으로 옮길 수 없어요. 완료를 취소한 뒤 옮겨 주세요.');
      // A length chosen or a date given makes a proto block a sized one, for good.
      t.proto=!!t.proto&&!date&&a.duration===t.duration&&a.sized!==true;
      Object.assign(t,{title:a.title,body:a.body,duration:a.duration,starts_at:a.starts_at,revision:t.revision+1});
      if(a.starts_at){t.plan_date=date;t.flow_order=null;}
      else if(!date){t.plan_date=null;t.flow_order=null;if(wasDated&&!wasDone)put([t.id],null,0);}
      else if(a.before){const target=s.tasks.find(x=>x.id===a.before&&x.plan_date===date&&!x.starts_at&&!x.completed&&x.id!==t.id);if(!target)throw Error('끼워 넣을 위치를 다시 확인하세요.');const order=target.flow_order!;for(const x of s.tasks)if(x.id!==t.id&&x.plan_date===date&&!x.starts_at&&(x.flow_order??0)>=order)x.flow_order=(x.flow_order??0)+1;t.plan_date=date;t.flow_order=order;}
      else if(wasFlowOn!==date)toFlow(t,date);
    }
  }
  const bench=normalize(s.tasks,s.piles);s.tasks=bench.tasks;s.piles=bench.piles;
  return s;
}
