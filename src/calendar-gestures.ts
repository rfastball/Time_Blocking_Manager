import type {Task,WorkingDay} from './types';
import type {AvailabilityTarget,AvailabilityEdge} from './availability-band';
import {changeAvailabilityBand} from './availability-band';
import {selectionRange,splitDuration} from './placement';
import {formatDuration} from './format';

type CalendarActions={
  task:(id:string)=>Task|undefined;
  issue:(id:string,date:string,start:number,duration:number)=>string|undefined;
  move:(task:Task,date:string,start:number,duration:number)=>void;
  create:(date:string,start:number,duration:number)=>void;
  unschedule:(task:Task)=>void;
  split:(task:Task,first:number)=>void;
  context:(task:Task|undefined,date:string,start:number,x:number,y:number)=>void;
  active:(value:boolean)=>void;
  error:(label:string)=>void;
  availabilityDay:(date:string)=>WorkingDay;
  availabilitySelect:(date:string,target:AvailabilityTarget,x:number,y:number)=>void;
  availabilityChange:(date:string,target:AvailabilityTarget,edge:AvailabilityEdge,start:number,x:number,y:number)=>void;
};
const clock=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const minuteAt=(surface:HTMLElement,y:number)=>Math.max(Number(surface.dataset.start),Math.min(Number(surface.dataset.end)-15,Math.floor((Number(surface.dataset.start)+(y-surface.getBoundingClientRect().top)/Number(surface.dataset.pxPerMin))/15)*15));

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
    actions.availabilityChange(date,target,edge,band[edge]+(e.key==='ArrowUp'?-15:15),rect.left,rect.top);
  });
  const paintSplit=(seam:HTMLElement,task:Task,position:number)=>{
    const first=splitDuration(task.duration,position);seam.dataset.splitDuration=String(first);seam.style.top=first/task.duration*100+'%';seam.setAttribute('aria-valuenow',String(first));seam.setAttribute('aria-valuetext',`앞 ${formatDuration(first)}, 뒤 ${formatDuration(task.duration-first)}`);
    seam.querySelector('span')!.textContent=`${formatDuration(first)} + ${formatDuration(task.duration-first)}`;
    let feedback=document.querySelector<HTMLElement>('.split-feedback');if(!feedback){feedback=document.createElement('div');feedback.className='gesture-feedback split-feedback';feedback.setAttribute('role','status');document.body.append(feedback);}
    feedback.textContent=`${formatDuration(first)} + ${formatDuration(task.duration-first)}`;return first;
  };
  root.querySelectorAll<HTMLElement>('[data-split]').forEach(seam=>{
    seam.onclick=e=>{e.preventDefault();e.stopPropagation();const task=actions.task(seam.dataset.split!);if(task){seam.focus();paintSplit(seam,task,Number(seam.dataset.splitDuration));}};
    seam.onfocus=()=>{const task=actions.task(seam.dataset.split!);if(task)paintSplit(seam,task,Number(seam.dataset.splitDuration));};
    seam.onblur=()=>document.querySelector('.split-feedback')?.remove();
    seam.onkeydown=e=>{
      const task=actions.task(seam.dataset.split!);if(!task)return;
      if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();paintSplit(seam,task,Number(seam.dataset.splitDuration)+(e.key==='ArrowUp'?-15:15));}
      if(e.key==='Enter'){e.preventDefault();e.stopPropagation();document.querySelector('.split-feedback')?.remove();actions.split(task,Number(seam.dataset.splitDuration));}
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();paintSplit(seam,task,task.duration/2);seam.blur();}
    };
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
    const target=e.target as HTMLElement,availabilityBand=target.closest<HTMLElement>('[data-availability-band]'),calendar=target.closest<HTMLElement>('[data-calendar-surface]');
    const seam=target.closest<HTMLElement>('[data-split]');
    if(seam&&calendar){
      const task=actions.task(seam.dataset.split!);if(!task)return;
      const startY=e.clientY,origin=Number(seam.dataset.splitDuration),scale=Number(calendar.dataset.pxPerMin);let moved=false,first=origin;
      seam.focus();
      const move=(event:PointerEvent)=>{if(event.pointerId!==e.pointerId)return;if(!moved&&Math.abs(event.clientY-startY)<5)return;moved=true;actions.active(true);event.preventDefault();first=paintSplit(seam,task,origin+(event.clientY-startY)/scale);};
      const cleanup=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',finish);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',escape,true);window.removeEventListener('blur',cancel);actions.active(false);};
      const finish=(event:PointerEvent)=>{if(event.pointerId!==e.pointerId)return;cleanup();if(!moved)return;document.querySelector('.split-feedback')?.remove();const suppress=(click:MouseEvent)=>{click.preventDefault();click.stopPropagation();};document.addEventListener('click',suppress,{capture:true,once:true});setTimeout(()=>document.removeEventListener('click',suppress,true),0);actions.split(task,first);};
      const cancel=()=>{cleanup();paintSplit(seam,task,origin);document.querySelector('.split-feedback')?.remove();};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();cancel();}};
      document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',escape,{capture:true});window.addEventListener('blur',cancel);return;
    }
    if(availabilityBand&&calendar){
      const date=calendar.dataset.date!,bandTarget:AvailabilityTarget=availabilityBand.dataset.availabilityBand==='work'?'work':Number(availabilityBand.dataset.availabilityBand),source=actions.availabilityDay(date),band=bandTarget==='work'?source:source.breaks[bandTarget];
      if(!band)return;
      const handle=target.closest<HTMLElement>('[data-availability-edge]'),edge=(handle?.dataset.availabilityEdge||'move') as AvailabilityEdge,startY=e.clientY,initial=edge==='end'?band.end:band.start,scale=Number(calendar.dataset.pxPerMin);
      let moved=false,value=initial,problem='';const preview=document.createElement('div');preview.className='gesture-preview availability-gesture-preview';
      const move=(event:PointerEvent)=>{
        if(event.pointerId!==e.pointerId)return;if(!moved&&Math.abs(event.clientY-startY)<5)return;
        moved=true;actions.active(true);event.preventDefault();value=initial+Math.round((event.clientY-startY)/scale/15)*15;
        try{const next=changeAvailabilityBand(source,bandTarget,edge,value),nextBand=bandTarget==='work'?next:next.breaks[bandTarget];problem='';preview.style.top=(nextBand.start-Number(calendar.dataset.start))*scale+'px';preview.style.height=(nextBand.end-nextBand.start)*scale+'px';preview.textContent=clock(nextBand.start)+'–'+clock(nextBand.end);preview.classList.remove('invalid');}
        catch(error){problem=(error as Error).message;preview.classList.add('invalid');preview.textContent=problem;}
        if(!preview.isConnected)calendar.append(preview);
      };
      const cleanup=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',finish);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',escape);window.removeEventListener('blur',cancel);preview.remove();actions.active(false);};
      const finish=(event:PointerEvent)=>{if(event.pointerId!==e.pointerId)return;cleanup();if(!moved)return;
        const suppress=(click:MouseEvent)=>{click.preventDefault();click.stopPropagation();};document.addEventListener('click',suppress,{capture:true,once:true});setTimeout(()=>document.removeEventListener('click',suppress,true),0);
        if(problem)actions.error(problem);else actions.availabilityChange(date,bandTarget,edge,value,event.clientX,event.clientY);
      };
      const cancel=()=>cleanup(),escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();cancel();}};
      document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',escape);window.addEventListener('blur',cancel);return;
    }
    const resize=target.closest<HTMLElement>('[data-resize]'),source=target.closest<HTMLElement>('[data-drag]'),surface=target.closest<HTMLElement>('[data-calendar-surface]');
    if(target.closest('input,textarea,.calendar-composer,[data-split],.unavailable,[data-adjust-date]')||(!source&&!surface))return;
    const task=actions.task(resize?.dataset.resize||source?.dataset.drag||'');
    if(!task&&target.closest('[data-task]'))return;
    const startY=e.clientY,startX=e.clientX,origin=surface?minuteAt(surface,startY):0;
    const taskStart=task?.starts_at?Number(task.starts_at.slice(11,13))*60+Number(task.starts_at.slice(14,16)):0;
    const offset=task&&surface?origin-taskStart:0;
    let moved=false,destination:HTMLElement|null=surface,dropInbox=false,date=surface?.dataset.date||'',start=origin,duration=30,issue:string|undefined;
    const preview=document.createElement('div');preview.className='gesture-preview';preview.setAttribute('aria-hidden','true');
    const feedback=document.createElement('div');feedback.className='gesture-feedback';feedback.setAttribute('role','status');
    const paint=()=>{
      preview.remove();
      if(destination){destination.append(preview);preview.style.top=(start-Number(destination.dataset.start))*Number(destination.dataset.pxPerMin)+'px';preview.style.height=duration*Number(destination.dataset.pxPerMin)+'px';preview.classList.toggle('invalid',!!issue);preview.textContent=clock(start)+' · '+formatDuration(duration);}
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
        date=destination.dataset.date!;
        if(resize){start=taskStart;duration=Math.max(15,task!.duration+Math.round((event.clientY-startY)/Number(destination.dataset.pxPerMin)/15)*15);}
        else if(task){start=minuteAt(destination,event.clientY)-offset;duration=task.duration;}
        else {const range=selectionRange(origin,minuteAt(destination,event.clientY));start=range.start;duration=range.duration;}
        issue=actions.issue(task?.id||'',date,start,duration);
        const scroll=destination.closest<HTMLElement>('.week-view,.timeline-scroll');if(scroll){const r=scroll.getBoundingClientRect();if(event.clientY>r.bottom-30)scroll.scrollTop+=16;else if(event.clientY<r.top+30)scroll.scrollTop-=16;}
      }else if(day&&task){
        date=day.dataset.date!;duration=task.duration;start=0;
        while(start<1440&&actions.issue(task.id,date,start,duration))start+=15;
        issue=start>=1440?'이 날짜에 블록이 들어갈 빈 시간이 없어요.':undefined;
      }else issue=dropInbox?undefined:'배치할 시간 위로 옮겨 주세요.';
      paint();
    };
    const cleanup=()=>{
      document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',finish);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',escape);window.removeEventListener('blur',cancel);
      source?.classList.remove('dragging');preview.remove();feedback.remove();actions.active(false);
    };
    const finish=(event:PointerEvent)=>{
      if(event.pointerId!==e.pointerId)return;cleanup();
      if(moved||(!task&&surface)){
        const suppress=(click:MouseEvent)=>{click.preventDefault();click.stopPropagation();};document.addEventListener('click',suppress,{capture:true,once:true});setTimeout(()=>document.removeEventListener('click',suppress,true),0);
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
