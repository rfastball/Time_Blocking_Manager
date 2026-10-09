import type {Task,WorkingDay} from './types';
import type {AvailabilityTarget,AvailabilityEdge} from './availability-band';
import {changeAvailabilityBand} from './availability-band.ts';
import {selectionRange} from './placement.ts';
import {formatDuration} from './format.ts';
import {readTimeAxis,expandTimeAxis,paintCalendarAxis} from './time-axis.ts';
import type {TimeAxis} from './time-axis';

type CalendarActions={
  task:(id:string)=>Task|undefined;
  issue:(id:string,date:string,start:number,duration:number)=>string|undefined;
  move:(task:Task,date:string,start:number,duration:number)=>void;
  create:(date:string,start:number,duration:number)=>void;
  unschedule:(task:Task)=>void;
  context:(task:Task|undefined,date:string,start:number,x:number,y:number)=>void;
  active:(value:boolean)=>void;
  error:(label:string)=>void;
  availabilityDay:(date:string)=>WorkingDay;
  availabilitySelect:(date:string,target:AvailabilityTarget,x:number,y:number)=>void;
  availabilityChange:(date:string,target:AvailabilityTarget,edge:AvailabilityEdge,start:number,x:number,y:number,openEditor?:boolean)=>void;
};
export function suppressGestureClick(pointerId:number){
  const cleanup=()=>{document.removeEventListener('click',suppress,{capture:true});document.removeEventListener('pointerdown',cleanup,{capture:true});document.removeEventListener('keydown',cleanup,{capture:true});};
  const suppress=(click:MouseEvent)=>{
    if(click.detail===0||'pointerId' in click&&(click as PointerEvent).pointerId!==pointerId)return;
    cleanup();click.preventDefault();click.stopImmediatePropagation();
  };
  document.addEventListener('click',suppress,{capture:true});
  document.addEventListener('pointerdown',cleanup,{capture:true});
  document.addEventListener('keydown',cleanup,{capture:true});
}
const clock=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const rawMinuteAt=(surface:HTMLElement,y:number)=>readTimeAxis(surface).minute(y-surface.getBoundingClientRect().top);
const minuteAt=(surface:HTMLElement,y:number)=>Math.max(0,Math.min(1425,Math.floor((rawMinuteAt(surface,y)+.000001)/15)*15));
const calendarScroller=(surface:HTMLElement)=>{
  for(let parent=surface.parentElement;parent;parent=parent.parentElement){
    if(/^(auto|scroll)$/.test(getComputedStyle(parent).overflowY))return parent;
  }
  return null;
};

export function bindCalendarGestures(root:HTMLElement,actions:CalendarActions){
  root.oncontextmenu=e=>{
    const target=e.target as HTMLElement,taskEl=target.closest<HTMLElement>('[data-drag],[data-task]'),surface=target.closest<HTMLElement>('[data-calendar-surface]'),day=target.closest<HTMLElement>('.day-cell[data-date]');
    if(!taskEl&&!surface&&!day)return;
    e.preventDefault();const task=taskEl?actions.task(taskEl.dataset.drag||taskEl.dataset.task!):undefined;
    actions.context(task,surface?.dataset.date||day?.dataset.date||task?.starts_at?.slice(0,10)||'',surface?minuteAt(surface,e.clientY):540,e.clientX,e.clientY);
  };
  root.querySelectorAll<HTMLElement>('[data-availability-select][data-date]').forEach(el=>el.onclick=e=>{e.stopPropagation();actions.availabilitySelect(el.dataset.date!,el.dataset.availabilitySelect==='work'?'work':Number(el.dataset.availabilitySelect),e.clientX,e.clientY);});
  root.querySelectorAll<HTMLElement>('[data-availability-edge][data-date]').forEach(el=>el.onkeydown=e=>{
    if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();
    const date=el.dataset.date!,target:AvailabilityTarget=el.dataset.availabilityBand==='work'?'work':Number(el.dataset.availabilityBand),day=actions.availabilityDay(date),band=target==='work'?day:day.breaks[target],edge=el.dataset.availabilityEdge as 'start'|'end',rect=el.getBoundingClientRect();
    actions.availabilityChange(date,target,edge,band[edge]+(e.key==='ArrowUp'?-15:15),rect.left,rect.top,true);
  });
  root.querySelectorAll<HTMLElement>('[data-drag]').forEach(el=>{el.draggable=false;el.ondragstart=e=>e.preventDefault();});
  root.querySelectorAll<HTMLElement>('[data-resize]').forEach(el=>el.onkeydown=e=>{
    if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
    e.preventDefault();e.stopPropagation();const task=actions.task(el.dataset.resize!);if(!task?.starts_at)return;
    const start=Number(task.starts_at.slice(11,13))*60+Number(task.starts_at.slice(14,16)),duration=task.duration+(e.key==='ArrowDown'?15:-15),date=task.starts_at.slice(0,10),issue=actions.issue(task.id,date,start,duration);
    if(issue)actions.error(issue);else actions.move(task,date,start,duration);
  });
  root.onpointerdown=e=>{
    if(e.button!==0||!e.isPrimary)return;
    const originalAxes=new Map<HTMLElement,TimeAxis>();
    const expandAt=(surface:HTMLElement,y:number)=>{
      const axis=readTimeAxis(surface),minute=rawMinuteAt(surface,y),next=expandTimeAxis(axis,minute);
      if(next!==axis&&(next.start!==axis.start||next.end!==axis.end)){
        const key=surface.closest<HTMLElement>('.week-time-grid')?.querySelector<HTMLElement>('[data-calendar-surface]')||surface;
        if(!originalAxes.has(key))originalAxes.set(key,axis);
        const scroll=calendarScroller(surface),top=scroll?.scrollTop??0,shift=next.position(minute)-axis.position(minute);
        paintCalendarAxis(surface,next);if(scroll)scroll.scrollTop=top+shift;
      }
      return minute;
    };
    const restoreAxes=()=>{for(const [surface,axis] of originalAxes){
      const scroll=calendarScroller(surface),current=readTimeAxis(surface),top=scroll?.scrollTop??0;
      const minute=scroll?current.minute(scroll.getBoundingClientRect().top-surface.getBoundingClientRect().top):0;
      paintCalendarAxis(surface,axis);if(scroll)scroll.scrollTop=top+axis.position(minute)-current.position(minute);
    }};
    const target=e.target as HTMLElement,availabilityBand=target.closest<HTMLElement>('[data-availability-band]'),calendar=target.closest<HTMLElement>('[data-calendar-surface]');
    if(availabilityBand&&calendar){
      const date=calendar.dataset.date!,bandTarget:AvailabilityTarget=availabilityBand.dataset.availabilityBand==='work'?'work':Number(availabilityBand.dataset.availabilityBand),source=actions.availabilityDay(date),band=bandTarget==='work'?source:source.breaks[bandTarget];
      if(!band)return;
      const handle=target.closest<HTMLElement>('[data-availability-edge]'),edge=(handle?.dataset.availabilityEdge||'move') as AvailabilityEdge,startY=e.clientY,initial=edge==='end'?band.end:band.start,pointerOrigin=rawMinuteAt(calendar,e.clientY);
      let moved=false,value=initial,problem='';const preview=document.createElement('div');preview.className='gesture-preview availability-gesture-preview';
      const move=(event:PointerEvent)=>{
        if(event.pointerId!==e.pointerId)return;if(!moved&&Math.abs(event.clientY-startY)<10)return;
        moved=true;actions.active(true);event.preventDefault();value=initial+Math.round((expandAt(calendar,event.clientY)-pointerOrigin)/15)*15;
        try{const next=changeAvailabilityBand(source,bandTarget,edge,value),nextBand=bandTarget==='work'?next:next.breaks[bandTarget];problem='';const axis=readTimeAxis(calendar);preview.style.top=axis.position(nextBand.start)+'px';preview.style.height=(axis.position(nextBand.end)-axis.position(nextBand.start))+'px';preview.textContent=clock(nextBand.start)+'–'+clock(nextBand.end);preview.classList.remove('invalid');}
        catch(error){problem=(error as Error).message;preview.classList.add('invalid');preview.textContent=problem;}
        if(!preview.isConnected)calendar.append(preview);
      };
      const cleanup=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',finish);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',escape);window.removeEventListener('blur',cancel);preview.remove();restoreAxes();actions.active(false);};
      const finish=(event:PointerEvent)=>{if(event.pointerId!==e.pointerId)return;cleanup();if(!moved)return;
        suppressGestureClick(e.pointerId);
        if(problem)actions.error(problem);else actions.availabilityChange(date,bandTarget,edge,value,event.clientX,event.clientY,false);
      };
      const cancel=()=>cleanup(),escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();cancel();}};
      document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',escape);window.addEventListener('blur',cancel);return;
    }
    const resize=target.closest<HTMLElement>('[data-resize]'),source=target.closest<HTMLElement>('[data-drag]'),surface=target.closest<HTMLElement>('[data-calendar-surface]');
    if(target.closest('input,textarea,.calendar-composer,.unavailable,[data-adjust-date]')||(!source&&!surface))return;
    const task=actions.task(resize?.dataset.resize||source?.dataset.drag||'');
    if(!task&&target.closest('[data-task]'))return;
    const startY=e.clientY,startX=e.clientX,origin=surface?minuteAt(surface,startY):0,pointerOrigin=surface?rawMinuteAt(surface,startY):0;
    const taskStart=task?.starts_at?Number(task.starts_at.slice(11,13))*60+Number(task.starts_at.slice(14,16)):0;
    const offset=task&&surface?origin-taskStart:0;
    let moved=false,destination:HTMLElement|null=surface,dropInbox=false,date=surface?.dataset.date||'',start=origin,duration=30,issue:string|undefined;
    const preview=document.createElement('div');preview.className='gesture-preview';preview.setAttribute('aria-hidden','true');
    const feedback=document.createElement('div');feedback.className='gesture-feedback';feedback.setAttribute('role','status');
    const paint=()=>{
      preview.remove();
      if(destination){const axis=readTimeAxis(destination);destination.append(preview);preview.style.top=axis.position(start)+'px';preview.style.height=(axis.position(start+duration)-axis.position(start))+'px';preview.classList.toggle('invalid',!!issue);preview.textContent=clock(start)+' · '+formatDuration(duration);}
      feedback.textContent=dropInbox?'미계획으로 옮기기':issue||`${date}  ${clock(start)}–${clock(start+duration)} · ${formatDuration(duration)}`;
      feedback.classList.toggle('invalid',!!issue);if(!feedback.isConnected)document.body.append(feedback);
    };
    const move=(event:PointerEvent)=>{
      if(event.pointerId!==e.pointerId)return;
      if(!moved&&Math.hypot(event.clientX-startX,event.clientY-startY)<5)return;
      moved=true;actions.active(true);event.preventDefault();source?.classList.add('dragging');
      const hit=document.elementFromPoint(event.clientX,event.clientY) as HTMLElement|null;
      dropInbox=!!task&&!resize&&!!hit?.closest('[data-inbox-drop]');
      destination=resize||!task?surface:hit?.closest<HTMLElement>('[data-calendar-surface]')||null;
      const day=hit?.closest<HTMLElement>('.day-cell[data-date]');
      if(destination){
        date=destination.dataset.date!;const pointerMinute=expandAt(destination,event.clientY);
        if(resize){start=taskStart;duration=Math.max(15,task!.duration+Math.round((pointerMinute-pointerOrigin)/15)*15);}
        else if(task){start=Math.min(1425,Math.floor((pointerMinute+.000001)/15)*15)-offset;duration=task.duration;}
        else {const range=selectionRange(origin,Math.min(1425,Math.floor((pointerMinute+.000001)/15)*15));start=range.start;duration=range.duration;}
        issue=actions.issue(task?.id||'',date,start,duration);
        const scroll=calendarScroller(destination);if(scroll){const r=scroll.getBoundingClientRect();if(event.clientY>r.bottom-30)scroll.scrollTop+=16;else if(event.clientY<r.top+30)scroll.scrollTop-=16;}
      }else if(day&&task){
        date=day.dataset.date!;duration=task.duration;start=0;
        while(start<1440&&actions.issue(task.id,date,start,duration))start+=15;
        issue=start>=1440?'이 날짜에 블록이 들어갈 빈 시간이 없어요.':undefined;
      }else issue=dropInbox?undefined:'배치할 시간 위로 옮겨 주세요.';
      paint();
    };
    const cleanup=()=>{
      document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',finish);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',escape);window.removeEventListener('blur',cancel);
      source?.classList.remove('dragging');preview.remove();feedback.remove();restoreAxes();actions.active(false);
    };
    const finish=(event:PointerEvent)=>{
      if(event.pointerId!==e.pointerId)return;cleanup();
      if(moved||(!task&&surface)){
        suppressGestureClick(e.pointerId);
        if(dropInbox&&task){actions.unschedule(task);return;}
        if(issue){actions.error(issue);return;}
        if(task){if(date)actions.move(task,date,start,duration);}
        else if(surface){const problem=actions.issue('',date,start,duration);if(problem)actions.error(problem);else actions.create(date,start,duration);}
      }
    };
    const cancel=()=>cleanup();const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();cancel();}};
    document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',escape);window.addEventListener('blur',cancel);
  };
}
