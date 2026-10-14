import type {Command,Settings,Snapshot,Task,TaskRevision} from './types.ts';
import {placementIssue as checkPlacement,unavailableParts} from './placement.ts';
import {effectiveDay} from './settings.ts';
import {dateOf,minutes,plusDays,time} from './dates.ts';
import {SHELF,insertPile,normalize,onBench,place} from './bench.ts';
import {requestTimeIssue} from './capture.ts';
import {mergeBody} from './detail.ts';

const bytes=(value:string)=>new TextEncoder().encode(value).length;
const receipts=new WeakMap<Set<string>,Map<string,{epoch:string;payload:string}>>();
function reject(message:string,code='validation'):never {throw Object.assign(Error(message),{code,retryable:false});}
function parseDate(value:string){
  const date=dateOf(value);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number(value.slice(0,4))<1900||!Number.isFinite(date.getTime())
    ||date.getFullYear()!==Number(value.slice(0,4))||date.getMonth()+1!==Number(value.slice(5,7))||date.getDate()!==Number(value.slice(8)))reject('시작 날짜와 시각이 올바르지 않습니다.');
  return date;
}
function parseStart(value:string){
  parseDate(value.slice(0,10));
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)||Number(value.slice(11,13))>23||Number(value.slice(14,16))>59)reject('시작 날짜와 시각이 올바르지 않습니다.');
  return minutes(value.slice(11));
}
function uniqueRevisions(items:TaskRevision[]){
  const seen=new Set<string>();
  for(const item of items){
    if(!item.id||bytes(item.id)>100||!Number.isInteger(item.revision)||item.revision<1||seen.has(item.id))reject('항목 정보를 확인하세요.');
    seen.add(item.id);
  }
}
function validateSettings(settings:Settings){
  const ids=new Set<string>();
  for(const r of settings.routines??[]){
    if(!r.id||bytes(r.id)>100||ids.has(r.id)||!r.title.trim()||bytes(r.title)>2000||bytes(r.body)>200_000
      ||!r.weekdays.length||new Set(r.weekdays).size!==r.weekdays.length||r.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)
      ||!Number.isInteger(r.start)||r.start<0||r.start%15||!Number.isInteger(r.duration)||r.duration<15||r.duration>1440||r.duration%15||r.start>1440-r.duration)reject('정기 업무의 제목, 요일, 시작시각과 소요시간을 확인하세요.');
    ids.add(r.id);
  }
  if(settings.days.length!==7)reject('월요일부터 일요일까지 7일의 설정이 필요합니다.');
  const target=settings.weekly_target??2400,workDays=settings.work_days??5;
  if(!Number.isInteger(target)||target<15||target>10080||target%15||!Number.isInteger(workDays)||workDays<1||workDays>7)reject('주간 목표 시간과 근무일 수를 확인하세요.');
  const dates=new Set<string>();
  for(const e of settings.exceptions??[]){
    parseDate(e.date);
    if(dates.has(e.date)||!['custom','leave','early'].includes(e.kind)||e.kind==='leave'&&e.day.enabled)reject('날짜별 예외 설정을 확인하세요.');
    dates.add(e.date);
  }
  for(const day of [...settings.days,...(settings.exceptions??[]).map(e=>e.day)]){
    if(!Number.isInteger(day.start)||!Number.isInteger(day.end)||day.start<0||day.end>1440||day.start>=day.end||day.start%15||day.end%15)reject('작업 시간의 시작과 끝을 확인하세요.');
    const breaks=[...day.breaks].sort((a,b)=>a.start-b.start);
    breaks.forEach((b,i)=>{
      if(!Number.isInteger(b.start)||!Number.isInteger(b.end)||b.start<day.start||b.end>day.end||b.start>=b.end||b.start%15||b.end%15||!b.label.trim()||bytes(b.label)>200||i>0&&breaks[i-1].end>b.start)reject('작업 불가 시간은 근무시간 안에서 겹치지 않게 지정하세요.');
    });
  }
}
function validateTask(task:Task,tasks:Task[],settings:Settings){
  if(!task.id||bytes(task.id)>100||!task.title.trim()||bytes(task.title)>2000||bytes(task.body)>200_000||!Number.isInteger(task.duration)||task.duration<15||task.duration>1440||task.duration%15)reject('제목(최대 2,000바이트), 본문(최대 200KB), 소요시간을 확인하세요.');
  if(task.plan_date!==null)parseDate(task.plan_date);
  // Only waiting work carries a trigger; the place rules hold through normalize.
  const waitDay=(d:string|null|undefined)=>{if(d==null)return true;try{parseDate(d);return true;}catch{return false;}};
  if(task.wait_since==null&&(task.wait_for!=null||task.wait_until!=null)||task.wait_for!=null&&(bytes(task.wait_for)>200||task.wait_for.trim()!==task.wait_for)
    ||!waitDay(task.wait_since)||!waitDay(task.wait_until))reject('기다림 조건을 확인하세요.');
  if(task.starts_at===null){
    if((task.plan_date===null)!==(task.flow_order===null))reject('작업의 날짜·순서·시각 배치 상태가 올바르지 않습니다.');
    return;
  }
  if(task.starts_at.slice(0,10)!==task.plan_date||task.flow_order!==null)reject('작업의 날짜·순서·시각 배치 상태가 올바르지 않습니다.');
  const minute=parseStart(task.starts_at),issue=checkPlacement(task.id,task.plan_date!,minute,task.duration,effectiveDay(settings,task.plan_date!),tasks);
  if(issue)reject(issue.label,issue.kind==='overlap'?'overlap':'validation');
}

export function previewAcknowledgement(snapshot:Snapshot,command:Command,occurrences:Set<string>):Snapshot|null {
  if(!command.request_id||bytes(command.request_id)>100)reject('요청 식별자가 올바르지 않습니다.');
  if(command.epoch!==snapshot.epoch)reject('복원 전 화면의 요청입니다. 초안을 보존하고 최신 데이터를 확인하세요.','epoch');
  const previous=receipts.get(occurrences)?.get(command.request_id);
  if(!previous||previous.epoch!==snapshot.epoch)return null;
  if(previous.payload!==JSON.stringify(command))reject('같은 요청 식별자에 서로 다른 변경이 전달됐습니다.');
  return structuredClone(snapshot);
}
// Browser preview stand-in for the Rust store: the same transitions on a cloned snapshot.
export function previewMutation(snapshot:Snapshot,command:Command,occurrences:Set<string>,now=Date.now()):Snapshot {
  const acknowledged=previewAcknowledgement(snapshot,command,occurrences);if(acknowledged)return acknowledged;
  const issue=requestTimeIssue(command,now);if(issue)throw issue;
  const s=structuredClone(snapshot),a=command.action;s.layouts??=[];s.trash??=[];s.piles??=[];
  const generated=new Set<string>();
  const nextOrder=(date:string)=>Math.max(0,...s.tasks.filter(t=>t.plan_date===date&&!t.starts_at).map(t=>t.flow_order??0))+1;
  const toFlow=(t:Task,date:string)=>{const order=nextOrder(date);t.starts_at=null;t.plan_date=date;t.flow_order=order;};
  const raise=(date:string,at:string)=>{parseDate(date);const minute=parseStart(at);if(at.slice(0,10)!==date)reject('배치 기준 시각은 같은 날짜여야 합니다.');const row=s.layouts.find(l=>l.date===date);if(row)row.anchor=Math.max(row.anchor,minute);else s.layouts.push({date,anchor:minute});};
  const put=(ids:string[],pile:string|null,index:number)=>{s.tasks=place(s.tasks,ids,pile,index);};
  // Sized work coming back from a date goes on top of the shelf, in the order given.
  const shelve=(ids:string[])=>{if(!ids.length)return;const piles=s.piles??[];if(!piles.some(p=>p.id===SHELF))s.piles=insertPile(piles,SHELF,piles.length+1);put(ids,SHELF,0);};
  const changed=()=>Object.assign(Error('다른 창에서 작업이 변경됐습니다. 다시 확인하세요.'),{code:'conflict',retryable:false});
  if(a.type==='create'||a.type==='create_scheduled'||a.type==='create_flow'){
    const start=a.type==='create_scheduled'?a.starts_at:null,duration=a.type==='create'?30:a.duration;
    const task:Task={id:a.id,title:a.title.trim(),body:'',starts_at:start,duration,completed:false,revision:1,plan_date:start?.slice(0,10)??null,flow_order:null,proto:a.type==='create'};
    if(a.type==='create_flow'){parseDate(a.date);toFlow(task,a.date);}
    validateTask(task,s.tasks,s.settings);
    if([...s.tasks,...s.trash].some(t=>t.id===a.id))reject('이미 사용 중인 블록 식별자입니다.');
    s.tasks.push(task);
    if(a.type==='create')put([a.id],null,0);
  }
  else if(a.type==='set_settings'||a.type==='set_schedule'){
    if(a.expected_revision!==s.settings.revision)reject('다른 창에서 시간 설정이 변경됐습니다. 다시 확인하세요.','conflict');
    s.settings={...s.settings,days:structuredClone(a.days),revision:a.expected_revision+1};
    if(a.type==='set_schedule')Object.assign(s.settings,{exceptions:structuredClone(a.exceptions),weekly_target:a.weekly_target,work_days:a.work_days});
    validateSettings(s.settings);
  }
  else if(a.type==='set_routines'){
    if(a.expected_revision!==s.settings.revision)reject('정기 업무 설정이 변경됐습니다. 다시 확인하세요.','conflict');
    s.settings.routines=a.routines.map(r=>({...structuredClone(r),title:r.title.trim()}));s.settings.revision++;
    validateSettings(s.settings);
  }
  else if(a.type==='ensure_routines'){
    const from=parseDate(a.from),to=parseDate(a.to),count=Math.round((to.getTime()-from.getTime())/86400000)+1;
    if(count<1||count>62)reject('정기 업무 생성 기간은 1일부터 62일까지 지정하세요.');
    for(let offset=0;offset<count;offset++)for(const routine of s.settings.routines??[]){
      const date=plusDays(a.from,offset);
      const key=routine.id+':'+date;
      if(occurrences.has(key)||generated.has(key)||!routine.weekdays.includes((dateOf(date).getDay()+6)%7))continue;
      const id=crypto.randomUUID(),task:Task={id,title:routine.title,body:routine.body,starts_at:date+'T'+time(routine.start),duration:routine.duration,completed:false,revision:1,plan_date:date,flow_order:null};
      let overlap=false;try{validateTask(task,s.tasks,s.settings);}catch(e){if((e as {code?:string}).code!=='overlap')throw e;overlap=true;}
      if(overlap||unavailableParts(routine.start,routine.start+routine.duration,effectiveDay(s.settings,date)).length)toFlow(task,date);
      s.tasks.push(task);generated.add(key);
    }
  }
  else if(a.type==='clear_day'){
    parseDate(a.date);uniqueRevisions(a.expected_tasks);
    const tasks=s.tasks.filter(t=>t.plan_date===a.date);
    if(tasks.length!==a.expected_tasks.length||tasks.some(t=>!a.expected_tasks.some(expected=>expected.id===t.id&&expected.revision===t.revision)))reject('일정이 변경됐습니다. 다시 확인하세요.','conflict');
    // The day's open work goes on top of the shelf in the order it was planned.
    const open=tasks.filter(t=>!t.completed).sort((x,y)=>(x.flow_order==null?1:0)-(y.flow_order==null?1:0)||(x.flow_order??0)-(y.flow_order??0)||(x.starts_at??'').localeCompare(y.starts_at??'')||(x.id<y.id?-1:1)).map(t=>t.id);
    // Completed work stays as that day's record; only open work goes back to 준비.
    for(const task of tasks)if(!task.completed){task.starts_at=null;task.plan_date=null;task.flow_order=null;task.revision++;}
    s.layouts=s.layouts.filter(l=>l.date!==a.date);
    shelve(open);
  }
  else if(a.type==='complete_flow'){
    parseDate(a.date);uniqueRevisions(a.items);
    if(!a.items.length)reject('완료할 항목을 선택하세요.');
    const tasks=a.items.map(item=>s.tasks.find(t=>t.id===item.id&&t.revision===item.revision&&t.plan_date===a.date&&!t.starts_at&&t.flow_order!==null&&!t.completed));
    if(tasks.some(t=>!t))throw changed();
    for(const t of tasks){t!.completed=true;t!.revision++;}
    if(a.at!==null)raise(a.date,a.at);
  }
  else if(a.type==='reflow')raise(a.date,a.at);
  else if(a.type==='reorder_flow'){
    parseDate(a.date);uniqueRevisions(a.expected);
    const current=s.tasks.filter(t=>t.plan_date===a.date&&!t.starts_at&&t.flow_order!==null&&!t.completed);
    if(current.length!==a.expected.length||a.expected.some(e=>!current.some(t=>t.id===e.id&&t.revision===e.revision)))reject('다른 창에서 하루 순서가 변경됐습니다. 다시 확인하세요.','conflict');
    a.expected.forEach((e,i)=>{s.tasks.find(t=>t.id===e.id)!.flow_order=i+1;});
  }
  else if(a.type==='restore_trashed'){
    const item=s.trash.find(t=>t.id===a.id);if(!item)reject('휴지통에서 이미 복원했거나 지운 항목입니다. 다시 확인하세요.','conflict');
    const {deleted_at:_,...task}=item;task.revision++;s.trash=s.trash.filter(t=>t!==item);
    // A taken time falls back to flow work on the same date (D8/D9); flow work returns to its old order.
    if(task.starts_at){try{validateTask(task,s.tasks,s.settings);}catch(e){if((e as {code?:string}).code!=='overlap')throw e;toFlow(task,task.plan_date!);}}
    else if(task.plan_date&&task.flow_order!==null)for(const x of s.tasks)if(x.plan_date===task.plan_date&&!x.starts_at&&(x.flow_order??0)>=task.flow_order!)x.flow_order=(x.flow_order??0)+1;
    // Open unplanned work returns to its place on the shelf or the top of the 들어옴; sized work whose pile is gone goes on top of the shelf.
    const kept=task.pile_id&&(task.pile_id===SHELF||s.piles.some(p=>p.id===task.pile_id)),pile=kept?task.pile_id!:task.pile_id&&!task.proto?SHELF:null;
    const index=kept?Math.max(0,(task.pile_order??1)-1):0;
    validateTask(task,s.tasks,s.settings);s.tasks.push({...task,pile_id:null,pile_order:null});
    if(onBench(task)){if(pile===SHELF&&!s.piles.some(p=>p.id===SHELF))s.piles=insertPile(s.piles,SHELF,s.piles.length+1);put([task.id],pile,index);}
  }
  else if(a.type==='purge_trashed'){
    if(!a.ids.length||new Set(a.ids).size!==a.ids.length)reject('지울 휴지통 항목을 확인하세요.');
    if(a.ids.some(id=>!s.trash.some(t=>t.id===id)))reject('다른 창에서 휴지통이 바뀌었습니다. 다시 확인하세요.','conflict');
    s.trash=s.trash.filter(t=>!a.ids.includes(t.id));
  }
  else if(a.type==='place_unplanned'){
    uniqueRevisions(a.items);
    if(!a.items.length||!Number.isInteger(a.index)||a.index<0)reject('옮길 항목과 위치를 확인하세요.');
    const moving=a.items.map(i=>s.tasks.find(t=>t.id===i.id&&t.revision===i.revision&&!t.completed));
    if(moving.some(t=>!t))throw changed();
    if(a.create_at!=null){
      if(!a.pile||bytes(a.pile)>100||s.piles.some(p=>p.id===a.pile)||!Number.isInteger(a.create_at)||a.create_at<1)reject('새 더미 정보를 확인하세요.');
      s.piles=insertPile(s.piles,a.pile,a.create_at);
    }else if(a.pile!==null&&!s.piles.some(p=>p.id===a.pile))reject('더미가 바뀌었습니다. 다시 확인하세요.','conflict');
    for(const t of moving)if(t!.plan_date||t!.wait_since){Object.assign(t!,{starts_at:null,plan_date:null,flow_order:null,wait_for:null,wait_until:null,wait_since:null});t!.revision++;}
    put(moving.map(t=>t!.id),a.pile,a.index);
  }
  else if(a.type==='merge_unplanned'){
    uniqueRevisions(a.items);
    if(a.items.length<2)reject('합칠 준비 작업을 두 개 이상 선택하세요.');
    const originals=a.items.map(item=>s.tasks.find(t=>t.id===item.id&&t.revision===item.revision&&onBench(t)&&t.starts_at===null));
    if(originals.some(t=>!t))throw changed();
    const tasks=originals as Task[],first=tasks[0],ids=tasks.map(t=>t.id),pile=first.pile_id??null;
    const task:Task={id:a.id,title:first.title,body:mergeBody(tasks),duration:tasks.reduce((sum,t)=>sum+t.duration,0),revision:1,completed:false,starts_at:null,plan_date:null,flow_order:null,proto:false,pile_id:null,pile_order:null,board_x:first.board_x,board_y:first.board_y};
    validateTask(task,s.tasks,s.settings);
    if([...s.tasks,...s.trash].some(t=>t.id===a.id))reject('이미 사용 중인 블록 식별자입니다.');
    const index=s.tasks.filter(t=>onBench(t)&&(t.pile_id??null)===pile&&!ids.includes(t.id)&&(t.pile_order??0)<(first.pile_order??0)).length;
    const deleted_at=new Date(now).toISOString().slice(0,19)+'Z';
    s.trash.unshift(...tasks.map(t=>({...t,deleted_at})));
    s.tasks=s.tasks.filter(t=>!ids.includes(t.id));s.tasks.push(task);put([a.id],pile,index);
  }
  else if(a.type==='ship_flow'){
    parseDate(a.date);uniqueRevisions(a.items);if(!a.items.length)reject('실을 항목을 선택하세요.');
    const ids=a.items.map(item=>item.id);
    const moving=a.items.map(item=>s.tasks.find(t=>t.id===item.id&&t.revision===item.revision&&!t.completed));
    if(moving.some(t=>!t))throw changed();
    const target=a.before!=null?s.tasks.find(t=>t.id===a.before&&t.plan_date===a.date&&!t.starts_at&&t.flow_order!==null&&!t.completed&&!ids.includes(t.id)):null;
    if(a.before!=null&&!target)reject('끼워 넣을 위치를 다시 확인하세요.');
    const order=target?.flow_order??null;
    for(const t of moving){t!.flow_order=null;t!.starts_at=null;t!.plan_date=null;}
    if(order!==null)for(const t of s.tasks)if(t.plan_date===a.date&&!t.starts_at&&(t.flow_order??0)>=order)t.flow_order=(t.flow_order??0)+moving.length;
    let index=0;
    for(const item of a.items){
      const t=s.tasks.find(x=>x.id===item.id)!;
      if(order===null)toFlow(t,a.date);else {t.plan_date=a.date;t.flow_order=order+index++;}
      Object.assign(t,{proto:false,pile_id:null,pile_order:null,revision:t.revision+1});
    }
  }
  else if(a.type==='wait'){
    uniqueRevisions(a.items);if(!a.items.length)reject('기다릴 작업을 선택하세요.');
    const trigger=a.trigger.trim();if(bytes(trigger)>200)reject('기다림 조건을 확인하세요.');
    parseDate(a.since);if(a.until!==null)parseDate(a.until);
    const moving=a.items.map(item=>s.tasks.find(t=>t.id===item.id&&t.revision===item.revision&&!t.completed));
    if(moving.some(t=>!t))throw changed();
    // Out of its day, pile or 기다림 trigger; the day keeps its other order numbers, as when work goes back to 준비.
    for(const t of moving)Object.assign(t!,{starts_at:null,plan_date:null,flow_order:null,pile_id:null,pile_order:null,wait_for:trigger,wait_until:a.until,wait_since:t!.wait_since??a.since,revision:t!.revision+1});
  }
  else if(a.type==='revive'){
    uniqueRevisions(a.items);if(!a.items.length)reject('꺼낼 작업을 선택하세요.');
    const back=a.items.map(item=>s.tasks.find(t=>t.id===item.id&&t.revision===item.revision));
    if(back.some(t=>!t))throw changed();
    if(back.some(t=>!t!.wait_since))reject('기다리는 작업만 꺼낼 수 있어요.');
    for(const t of back)Object.assign(t!,{wait_for:null,wait_until:null,wait_since:null,pile_id:null,pile_order:null,revision:t!.revision+1});
    shelve(back.filter(t=>!t!.proto).map(t=>t!.id));
    const protos=back.filter(t=>t!.proto).map(t=>t!.id);if(protos.length)put(protos,null,0);
  }
  else {const t=s.tasks.find(t=>t.id===a.id)!;
    if(!t||t.revision!==a.expected_revision)throw changed();
    if(a.type==='delete'){s.tasks=s.tasks.filter(x=>x!==t);s.trash.unshift({...t,deleted_at:new Date().toISOString().slice(0,19)+'Z'});}
    else if(a.type==='set_completed'){
      // No completion without a date: 준비 work done now is that day's completion. Undoing an old dateless one returns it to the shelf.
      if(a.completed&&!t.completed&&!t.plan_date){if(!a.date)reject('완료한 날짜를 확인하세요.');parseDate(a.date);toFlow(t,a.date);t.proto=false;}
      const dateless=!a.completed&&t.completed&&!t.plan_date;
      t.completed=a.completed;t.revision++;
      if(dateless)shelve([t.id]);
    }
    else if(a.type==='split_pieces'){
      if(t.completed)reject('완료한 블록은 나눌 수 없어요.');
      if(!a.pieces.length||a.pieces.length>100||a.pieces[0].id!==t.id||new Set(a.pieces.map(p=>p.id)).size!==a.pieces.length||a.pieces.some((p,n)=>!p.id||bytes(p.id)>100||n>0&&[...s.tasks,...s.trash].some(x=>x.id===p.id)))reject('조각 정보를 확인하세요.');
      const bench=!t.plan_date;if(bench&&a.pieces.some(p=>p.completed)){if(!a.date)reject('완료한 날짜를 확인하세요.');parseDate(a.date);}
      const others=s.tasks.filter(x=>x.id!==t.id),index=onBench(t)?others.filter(x=>onBench(x)&&(x.pile_id??null)===(t.pile_id??null)&&(x.pile_order??0)<(t.pile_order??0)).length:0;
      let minute=t.starts_at?minutes(t.starts_at.slice(11)):null;const order=t.flow_order;
      if(t.plan_date&&!t.starts_at&&order!=null)for(const x of others)if(x.plan_date===t.plan_date&&!x.starts_at&&(x.flow_order??0)>order)x.flow_order=(x.flow_order??0)+a.pieces.length-1;
      const built:Task[]=[],open:string[]=[];
      a.pieces.forEach((p,n)=>{
        const x:Task={id:p.id,title:p.title.trim(),body:p.body,duration:p.duration,completed:p.completed,revision:n===0?t.revision+1:1,plan_date:t.plan_date,starts_at:null,flow_order:null,proto:false,pile_id:null,pile_order:null,board_x:n===0?t.board_x:null,board_y:n===0?t.board_y:null};
        if(minute!=null){x.starts_at=t.plan_date+'T'+time(minute);minute+=p.duration;}
        else if(order!=null)x.flow_order=order+n;
        else if(p.completed){x.plan_date=a.date!;x.flow_order=Math.max(0,...[...others,...built].filter(y=>y.plan_date===a.date&&!y.starts_at).map(y=>y.flow_order??0))+1;}
        // Open pieces of waiting work keep waiting on the same trigger.
        else {x.proto=p.proto;open.push(x.id);if(t.wait_since)Object.assign(x,{wait_for:t.wait_for??null,wait_until:t.wait_until??null,wait_since:t.wait_since});}
        validateTask(x,[...others,...built],s.settings);built.push(x);
      });
      s.tasks=[...others,...built];
      if(onBench(t))put(open,t.pile_id??null,index);
    }
    else {
      if(a.starts_at!==null&&a.plan_date!==null&&a.starts_at.slice(0,10)!==a.plan_date)reject('시각을 고정한 날짜와 계획 날짜가 다릅니다.');
      const wasFlowOn=!t.starts_at?t.plan_date:null,wasDated=!!t.plan_date,wasDone=t.completed;
      const date=a.starts_at?.slice(0,10)??a.plan_date;if(date!==null)parseDate(date);
      if(a.before!=null&&(a.starts_at!==null||date===null))reject('순서는 날짜만 정한 작업에서 지정할 수 있습니다.');
      if(!date&&wasDone&&wasDated)reject('완료한 작업은 준비로 옮길 수 없어요. 완료를 취소한 뒤 옮겨 주세요.');
      // A length chosen or a date given makes a proto block a sized one, for good.
      t.proto=!!t.proto&&!date&&a.duration===t.duration&&a.sized!==true;
      Object.assign(t,{title:a.title.trim(),body:a.body,duration:a.duration,starts_at:a.starts_at,revision:t.revision+1});
      if(a.starts_at){t.plan_date=date;t.flow_order=null;}
      else if(!date){t.plan_date=null;t.flow_order=null;if(wasDated&&!wasDone)shelve([t.id]);}
      else if(a.before!=null){const target=s.tasks.find(x=>x.id===a.before&&x.plan_date===date&&!x.starts_at&&x.flow_order!==null&&!x.completed&&x.id!==t.id);if(!target)reject('끼워 넣을 위치를 다시 확인하세요.');const order=target.flow_order!;for(const x of s.tasks)if(x.id!==t.id&&x.plan_date===date&&!x.starts_at&&(x.flow_order??0)>=order)x.flow_order=(x.flow_order??0)+1;t.plan_date=date;t.flow_order=order;}
      else if(wasFlowOn!==date||t.flow_order===null)toFlow(t,date);
      validateTask(t,s.tasks,s.settings);
    }
  }
  const bench=normalize(s.tasks,s.piles);s.tasks=bench.tasks;s.piles=bench.piles;
  for(const key of generated)occurrences.add(key);
  let recorded=receipts.get(occurrences);if(!recorded){recorded=new Map();receipts.set(occurrences,recorded);}
  recorded.set(command.request_id,{epoch:command.epoch,payload:JSON.stringify(command)});
  return s;
}
