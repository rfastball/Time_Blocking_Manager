import type {Settings,WorkingDay,DayException,Task} from './types';
import {effectiveDay,weekdays,weekCapacity} from './settings';
import {placementIssue} from './placement';
import {formatDuration} from './format';
import {changeAvailabilityBand,addAvailabilityBreak} from './availability-band';
import type {AvailabilityTarget,AvailabilityEdge} from './availability-band';
import {timeAxisForDays,expandTimeAxis} from './time-axis';
import type {TimeAxis} from './time-axis';
import './availability.css';
export {changeAvailabilityBand,addAvailabilityBreak} from './availability-band';

const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const time=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const minute=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3));
const targetOf=(v:string|undefined):AvailabilityTarget=>v==='work'?'work':Number(v);
const labelOf=(day:WorkingDay,target:AvailabilityTarget)=>target==='work'?'근무':day.breaks[target].label;
function edges(target:AvailabilityTarget,day:WorkingDay,attrs=''){
  const b=target==='work'?day:day.breaks[target],label=labelOf(day,target);
  return (['start','end'] as const).map(edge=>`<span class="availability-edge ${edge}" data-availability-edge="${edge}" data-availability-band="${target}" ${attrs} role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${escape(label)} ${edge==='start'?'시작':'종료'} 조절" aria-valuemin="0" aria-valuemax="1440" aria-valuenow="${b[edge]}" aria-valuetext="${time(b[edge])}"></span>`).join('');
}
export function calendarAvailabilityHTML(day:WorkingDay,date:string,axis:TimeAxis){
  if(!day.enabled)return '';
  const render=(target:AvailabilityTarget)=>{
    const b=target==='work'?day:day.breaks[target],top=b.start,bottom=b.end;
    if(bottom<=top)return '';
    return `<div class="${target==='work'?'calendar-work-band':'calendar-break-band'}" data-availability-band="${target}" data-date="${date}" data-minute="${top}" data-duration="${bottom-top}" style="top:${axis.position(top)}px;height:${axis.position(bottom)-axis.position(top)}px"><button type="button" class="calendar-band-label" data-availability-select="${target}" data-date="${date}" aria-label="${escape(labelOf(day,target))} ${time(b.start)}–${time(b.end)} 이 날짜만 조정">${escape(labelOf(day,target))} <small>${time(b.start)}–${time(b.end)}</small></button>${edges(target,day,`data-date="${date}"`)}</div>`;
  };
  return render('work')+day.breaks.map((_,i)=>render(i)).join('');
}
function exceptionList(settings:Settings){return (settings.exceptions??[]).map(e=>`<div class="availability-exception"><span><strong>${escape(e.date)}</strong> ${e.kind==='leave'?'휴가':e.kind==='early'?'조퇴':'시간 변경'}${e.day.enabled?' · '+time(e.day.start)+'–'+time(e.day.end):''}</span><button type="button" data-remove-exception="${e.date}">반복 일정으로 복원</button></div>`).join('')||'<p class="availability-empty">날짜별 변경 없음</p>';}
const feedback=()=>'<p class="form-error error" role="alert"></p><div class="schedule-conflicts"></div>';
export function availabilityHTML(s:Settings){return `<div class="availability-heading"><h2>한 주의 근무 리듬</h2></div><form id="availability-form" class="availability-sheet"><div class="availability-targets"><label>주간 목표 <input id="weekly-target" type="number" min="0.25" max="168" step="0.25" value="${(s.weekly_target??2400)/60}" required> 시간</label><label>근무일 <input id="work-days" type="number" min="1" max="7" value="${s.work_days??5}" required> 일</label></div><div data-availability-editor></div><section class="availability-exceptions"><div class="section-header"><h3>이 날짜만 변경</h3><button type="button" id="select-exception-date">달력에서 선택</button></div><div data-exception-list>${exceptionList(s)}</div></section>${feedback()}<div class="settings-save"><span>반복 근무 일정</span><button type="button" id="reset-availability">되돌리기</button><button type="submit" class="primary">저장</button></div></form>`;}
export function dayAvailabilityHTML(s:Settings,date:string){
  const e=s.exceptions?.find(e=>e.date===date),day=effectiveDay(s,date);
  return `<details class="day-availability"><summary>${e?.kind==='leave'?'휴가':day.enabled?time(day.start)+'–'+time(day.end):'휴무'}${e&&e.kind!=='leave'?' · '+(e.kind==='early'?'조퇴':'이 날짜만 변경'):''}<span>이 날짜만 조정</span></summary><form id="day-availability-form" class="availability-sheet availability-date-sheet"><label class="availability-kind">${escape(date)} <select id="exception-kind" aria-label="날짜별 변경 종류"><option value="custom" ${e?.kind==='custom'?'selected':''}>시간 변경</option><option value="early" ${e?.kind==='early'?'selected':''}>조퇴</option><option value="leave" ${e?.kind==='leave'?'selected':''}>휴가</option></select></label><div data-availability-editor></div>${feedback()}<div class="detail-actions">${e?'<button type="button" id="reset-day">반복 일정으로 복원</button>':''}<button class="primary" type="submit">이 날짜에 적용</button></div></form></details>`;
}
export function weeklySummary(s:Settings,date:string){const week=weekCapacity(s,date);return `선택한 주 근무 ${formatDuration(week.minutes)} / ${formatDuration(s.weekly_target??2400)} · ${week.days} / ${s.work_days??5}일`;}
export type RawSchedule={values:{value:string;checked:boolean}[];invalid:boolean;settings?:Settings};
type Hooks={save:(s:Settings,move:boolean,done:()=>void)=>void;changed:(s:Settings|null)=>void;reset:()=>void;raw?:RawSchedule;stash:(raw:RawSchedule)=>void};
export function focusAvailabilityBand(root:HTMLElement,target:AvailabilityTarget){root.dispatchEvent(new CustomEvent('availability-select',{detail:target}));}

export function bindAvailability(root:HTMLElement,settings:Settings,tasks:Task[],date:string|null,hooks:Hooks){
  let draft=structuredClone(settings),selected:{day:number;target:AvailabilityTarget}|null=null,mode:'work'|'break'='work';
  if(hooks.raw?.invalid&&hooks.raw.settings){
    if(date){const exception=hooks.raw.settings.exceptions?.find(e=>e.date===date);draft.exceptions=[...(draft.exceptions??[]).filter(e=>e.date!==date),...(exception?[structuredClone(exception)]:[])];}
    else draft.days=structuredClone(hooks.raw.settings.days);
  }
  const form=root.querySelector<HTMLFormElement>(date?'#day-availability-form':'#availability-form');if(!form)return;
  const error=form.querySelector<HTMLElement>('.form-error')!,conflicts=form.querySelector<HTMLElement>('.schedule-conflicts')!,surface=form.querySelector<HTMLElement>('[data-availability-editor]')!;
  const metadata=()=>Array.from(form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('#weekly-target,#work-days,#exception-kind'));
  if(hooks.raw?.settings)metadata().forEach((input,i)=>{if(hooks.raw?.values[i])input.value=hooks.raw.values[i].value;});
  const get=(i:number)=>date?effectiveDay(draft,date):draft.days[i];
  let axis=timeAxisForDays(date?[get(0)]:draft.days,1.1);
  const set=(i:number,day:WorkingDay)=>{if(date){const kind=form.querySelector<HTMLSelectElement>('#exception-kind')!.value as DayException['kind'];draft.exceptions=[...(draft.exceptions??[]).filter(e=>e.date!==date),{date,kind,day}];}else draft.days[i]=day;};
  const readMetadata=()=>{if(date){const kind=form.querySelector<HTMLSelectElement>('#exception-kind')!.value;set(0,{...get(0),enabled:kind==='leave'?false:get(0).enabled});}else {const target=Number(form.querySelector<HTMLInputElement>('#weekly-target')!.value)*60,days=Number(form.querySelector<HTMLInputElement>('#work-days')!.value);if(!Number.isFinite(target)||target<15||target>10080||target%15||!Number.isInteger(days)||days<1||days>7)throw Error('주간 목표는 15분 단위, 근무일은 1–7일로 정하세요.');draft.weekly_target=target;draft.work_days=days;}};
  const findConflicts=()=>tasks.filter(t=>t.starts_at&&placementIssue(t.id,t.starts_at.slice(0,10),minute(t.starts_at.slice(11)),t.duration,effectiveDay(draft,t.starts_at.slice(0,10)),[])!==null);
  let conflictKey='';
  const renderConflicts=()=>{const list=findConflicts(),key=list.map(t=>t.id).sort().join(','),accepted=key===conflictKey&&(conflicts.querySelector<HTMLInputElement>('#move-conflicts')?.checked??false);conflictKey=key;conflicts.innerHTML=list.length?`<label class="check-line"><input type="checkbox" id="move-conflicts" ${accepted?'checked':''}>충돌하는 작업 ${list.length}건을 미계획으로 이동</label><p>${list.map(t=>escape(t.title)).join(', ')}</p>`:'';};
  const stash=(invalid=false)=>hooks.stash({values:metadata().map(input=>({value:input.value,checked:false})),invalid,settings:structuredClone(draft)});
  const validateNames=()=>{if((date?[get(0)]:draft.days).some(day=>day.breaks.some(b=>!b.label.trim())))throw Error('휴식 이름을 입력하세요.');};
  const publish=()=>{try{readMetadata();validateNames();error.textContent='';hooks.changed(structuredClone(draft));stash();renderConflicts();}catch(e){error.textContent=(e as Error).message;stash(true);}};
  const bands=(day:WorkingDay,i:number)=>!day.enabled?`<span class="availability-off" style="top:${axis.position(axis.start)+24}px">휴무</span>`:(['work',...day.breaks.map((_,j)=>j)] as AvailabilityTarget[]).map(target=>{
    const b=target==='work'?day:day.breaks[target],active=selected?.day===i&&selected.target===target;
    return `<div class="availability-band ${target==='work'?'work':'break'} ${active?'selected':''} ${axis.position(b.end)-axis.position(b.start)<48?'compact':''}" data-band="${target}" data-day="${i}" style="top:${axis.position(b.start)}px;height:${axis.position(b.end)-axis.position(b.start)}px"><button type="button" data-band-select="${target}" data-day="${i}" aria-pressed="${active}" aria-label="${escape(labelOf(day,target))} ${time(b.start)}–${time(b.end)}" title="${escape(labelOf(day,target))} ${time(b.start)}–${time(b.end)}"><span class="availability-band-caption"><strong>${escape(labelOf(day,target))}</strong><small>${time(b.start)}<br>${time(b.end)}</small></span></button>${edges(target,day,`data-day="${i}"`)}</div>`;
  }).join('');
  const axisHTML=()=>{let previous=-30;return Array.from({length:25},(_,i)=>{const y=axis.position(i*60);if(y-previous<23)return '';previous=y;return `<span style="top:${y}px">${String(i).padStart(2,'0')}</span>`;}).join('');};
  const gridHTML=()=>Array.from({length:97},(_,i)=>i*15).filter(m=>m>=axis.start&&m<=axis.end||m%120===0).map(m=>`<i class="availability-grid-line ${m%60===0?'hour':''}" style="top:${axis.position(m)}px"></i>`).join('');
  const selectionHTML=():string=>{
    if(!selected)return '<div class="availability-selection empty"><button type="button" data-add-break>휴식 추가</button></div>';
    const selection=selected,day=get(selection.day),b=selection.target==='work'?day:day.breaks[selection.target];if(!b){selected=null;return selectionHTML();}
    return `<div class="availability-selection"><div class="availability-selection-title"><strong>${date?'이 날짜':weekdays[selection.day]} · ${escape(labelOf(day,selection.target))}</strong><output>${time(b.start)}–${time(b.end)}</output>${selection.target==='work'?'<button type="button" data-add-break>휴식 추가</button>':'<button type="button" data-delete-band>휴식 삭제</button>'}</div>${selection.target==='work'?'':`<label class="availability-name">이름 <input data-break-name maxlength="60" value="${escape(labelOf(day,selection.target))}" required></label>`}<div class="availability-sliders">${(['start','end'] as const).map(edge=>`<label>${edge==='start'?'시작':'종료'} <output data-edge-output="${edge}">${time(b[edge])}</output><input type="range" data-band-range="${edge}" min="${edge==='end'?b.start+15:0}" max="${edge==='start'?b.end-15:1440}" step="15" value="${b[edge]}" aria-label="${escape(labelOf(day,selection.target))} ${edge==='start'?'시작':'종료'}" aria-valuetext="${time(b[edge])}"></label>`).join('')}</div><div class="availability-nudge"><button type="button" data-shift="-15">15분 앞당기기</button><button type="button" data-shift="15">15분 늦추기</button></div></div>`;
  };
  const repaint=(i:number)=>{const column=surface.querySelector<HTMLElement>(`[data-availability-column="${i}"]`);if(column)column.innerHTML=gridHTML()+bands(get(i),i);};
  const renderEditor=(focus?:string)=>{
    const scroll=surface.querySelector<HTMLElement>('.availability-scroll'),visibleMinute=scroll?axis.minute(scroll.scrollTop):null;
    axis=timeAxisForDays(date?[get(0)]:draft.days,1.1);
    const top=visibleMinute===null?Math.max(0,axis.position(axis.start)-12):axis.position(visibleMinute),left=scroll?.scrollLeft??0,count=date?1:7,leave=date&&form.querySelector<HTMLSelectElement>('#exception-kind')!.value==='leave';
    surface.innerHTML=leave?'<div class="availability-leave">휴가</div>':`<div class="availability-tools"><div class="availability-modes" role="group" aria-label="그릴 시간 종류"><button type="button" data-draw-mode="work" aria-pressed="${mode==='work'}"><i class="work"></i>근무 그리기</button><button type="button" data-draw-mode="break" aria-pressed="${mode==='break'}"><i class="break"></i>휴식 그리기</button></div></div><div class="availability-scroll ${date?'single-day':''}"><div class="availability-paper" style="--availability-days:${count}"><div class="availability-day-head"><span>시각</span>${Array.from({length:count},(_,i)=>`<button type="button" data-toggle-day="${i}" aria-pressed="${get(i).enabled}" aria-label="${date?'이 날짜':weekdays[i]} ${get(i).enabled?'휴무로 변경':'근무로 변경'}"><strong>${date?'이 날짜':weekdays[i].slice(0,1)}</strong><small>${get(i).enabled?'근무':'휴무'}</small></button>`).join('')}</div><div class="availability-paper-body" style="height:${axis.height}px"><div class="availability-axis">${axisHTML()}</div>${Array.from({length:count},(_,i)=>`<div class="availability-column ${get(i).enabled?'':'off'}" data-availability-column="${i}" aria-label="${date?'이 날짜':weekdays[i]} 시간 밴드">${gridHTML()}${bands(get(i),i)}</div>`).join('')}</div></div></div>${selectionHTML()}`;
    const next=surface.querySelector<HTMLElement>('.availability-scroll');if(next){next.scrollTop=top;next.scrollLeft=left;}if(focus)surface.querySelector<HTMLElement>(focus)?.focus({preventScroll:true});
  };
  const edit=(edge:AvailabilityEdge,value:number,focus?:string)=>{if(!selected)return;try{set(selected.day,changeAvailabilityBand(get(selected.day),selected.target,edge,value));publish();renderEditor(focus);}catch(e){error.textContent=(e as Error).message;}};
  const addBreak=()=>{const i=selected?.day??0,day=get(i);let start=Math.max(day.start,Math.min(720,day.end-30));const free=(m:number)=>m+30<=day.end&&!day.breaks.some(b=>m<b.end&&m+30>b.start);if(!free(start)){start=day.start;while(start+30<=day.end&&!free(start))start+=15;}try{if(!free(start))throw Error('휴식이 들어갈 빈 시간이 없습니다. 근무 끝을 늘려 주세요.');set(i,addAvailabilityBreak(day,start));selected={day:i,target:day.breaks.length};publish();renderEditor('[data-break-name]');}catch(e){error.textContent=(e as Error).message;}};
  const openMenu=(i:number,target:AvailabilityTarget,x:number,y:number)=>{
    selected={day:i,target};renderEditor();
    const day=get(i),menu=document.createElement('div'),focus=`[data-band-select="${target}"][data-day="${i}"]`;
    menu.className='availability-context-menu';menu.setAttribute('popover','auto');menu.setAttribute('role','menu');menu.setAttribute('aria-label',`${date?'이 날짜':weekdays[i]} ${day.enabled?labelOf(day,target):'휴무'}`);
    menu.innerHTML=(day.enabled?'<button type="button" role="menuitem" data-context-edit>시간 조정</button><button type="button" role="menuitem" data-shift="-15">15분 앞당기기</button><button type="button" role="menuitem" data-shift="15">15분 늦추기</button><hr><button type="button" role="menuitem" data-add-break>휴식 추가</button>'+(target==='work'?'':'<button type="button" role="menuitem" data-delete-band>휴식 삭제</button>')+'<hr>':'')+`<button type="button" role="menuitem" data-toggle-day="${i}">${day.enabled?'휴무로 변경':'근무로 변경'}</button>`;
    surface.append(menu);menu.showPopover();const rect=menu.getBoundingClientRect();menu.style.left=`${Math.max(8,Math.min(x,window.innerWidth-rect.width-8))}px`;menu.style.top=`${Math.max(8,Math.min(y,window.innerHeight-rect.height-8))}px`;
    const buttons=Array.from(menu.querySelectorAll<HTMLButtonElement>('button'));buttons[0]?.focus();
    menu.addEventListener('keydown',event=>{const index=buttons.indexOf(document.activeElement as HTMLButtonElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();}else if(event.key==='Escape'||event.key==='Tab'){event.preventDefault();menu.hidePopover();surface.querySelector<HTMLElement>(day.enabled?focus:`[data-toggle-day="${i}"]`)?.focus({preventScroll:true});}});
    menu.addEventListener('toggle',event=>{if((event as ToggleEvent).newState==='closed')menu.remove();});
  };
  surface.oncontextmenu=e=>{const el=(e.target as HTMLElement),column=el.closest<HTMLElement>('[data-availability-column]');if(!column)return;e.preventDefault();const band=el.closest<HTMLElement>('[data-band]');openMenu(Number(column.dataset.availabilityColumn),band?targetOf(band.dataset.band):'work',e.clientX,e.clientY);};
  surface.onclick=e=>{
    const t=e.target as HTMLElement,draw=t.closest<HTMLElement>('[data-draw-mode]'),toggle=t.closest<HTMLElement>('[data-toggle-day]'),select=t.closest<HTMLElement>('[data-band-select]'),shift=t.closest<HTMLElement>('[data-shift]');
    if(t.closest('[data-context-edit]'))renderEditor('[data-band-range="start"]');
    else if(draw){mode=draw.dataset.drawMode as typeof mode;renderEditor(`[data-draw-mode="${mode}"]`);}
    else if(toggle){const i=Number(toggle.dataset.toggleDay),day=structuredClone(get(i));day.enabled=!day.enabled;set(i,day);selected=day.enabled?{day:i,target:'work'}:null;publish();renderEditor(`[data-toggle-day="${i}"]`);}
    else if(select){selected={day:Number(select.dataset.day),target:targetOf(select.dataset.bandSelect)};renderEditor(`[data-band-select="${selected.target}"][data-day="${selected.day}"]`);}
    else if(t.closest('[data-add-break]'))addBreak();
    else if(t.closest('[data-delete-band]')&&selected&&selected.target!=='work'){const day=structuredClone(get(selected.day));day.breaks.splice(selected.target,1);set(selected.day,day);selected.target='work';publish();renderEditor();}
    else if(shift&&selected){const day=get(selected.day),b=selected.target==='work'?day:day.breaks[selected.target];edit('move',b.start+Number(shift.dataset.shift),`[data-shift="${shift.dataset.shift}"]`);}
  };
  surface.oninput=e=>{
    const input=e.target as HTMLInputElement;if(!selected)return;
    if(input.hasAttribute('data-break-name')&&selected.target!=='work'){const day=structuredClone(get(selected.day));day.breaks[selected.target].label=input.value;set(selected.day,day);repaint(selected.day);publish();}
    if(input.dataset.bandRange){try{const day=changeAvailabilityBand(get(selected.day),selected.target,input.dataset.bandRange as AvailabilityEdge,Number(input.value));set(selected.day,day);const b=selected.target==='work'?day:day.breaks[selected.target];input.value=String(b[input.dataset.bandRange as 'start'|'end']);input.setAttribute('aria-valuetext',time(Number(input.value)));surface.querySelector<HTMLOutputElement>(`[data-edge-output="${input.dataset.bandRange}"]`)!.value=time(Number(input.value));surface.querySelector<HTMLOutputElement>('.availability-selection-title output')!.value=time(b.start)+'–'+time(b.end);repaint(selected.day);publish();}catch(e){error.textContent=(e as Error).message;}}
  };
  surface.onchange=e=>{const input=e.target as HTMLInputElement;if(input.dataset.bandRange)renderEditor(`[data-band-range="${input.dataset.bandRange}"]`);};
  surface.onkeydown=e=>{const element=e.target as HTMLElement,band=element.closest<HTMLElement>('[data-band]');if(band&&(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10')){e.preventDefault();const rect=band.getBoundingClientRect();openMenu(Number(band.dataset.day),targetOf(band.dataset.band),rect.left,Math.max(8,rect.top));return;}const handle=element.closest<HTMLElement>('[data-availability-edge]');if(!handle||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();selected={day:Number(handle.dataset.day),target:targetOf(handle.dataset.availabilityBand)};const day=get(selected.day),b=selected.target==='work'?day:day.breaks[selected.target],edge=handle.dataset.availabilityEdge as 'start'|'end';edit(edge,b[edge]+(e.key==='ArrowUp'?-15:15),`[data-availability-edge="${edge}"][data-availability-band="${selected.target}"][data-day="${selected.day}"]`);};
  surface.onpointerdown=e=>{
    if(e.button!==0||!e.isPrimary)return;const t=e.target as HTMLElement,column=t.closest<HTMLElement>('[data-availability-column]');if(!column)return;
    const i=Number(column.dataset.availabilityColumn),source=structuredClone(get(i)),el=t.closest<HTMLElement>('[data-band]'),handle=t.closest<HTMLElement>('[data-availability-edge]'),originMinute=axis.minute(e.clientY-column.getBoundingClientRect().top),origin=Math.min(1425,Math.floor(originMinute/15)*15),startY=e.clientY,originalAxis=axis,originalSelected=selected;
    const drawing=!el||mode==='break'&&el.dataset.band==='work'&&!handle,target=el?targetOf(el.dataset.band):'work',edge:AvailabilityEdge=handle?handle.dataset.availabilityEdge as AvailabilityEdge:drawing?'draw':'move';
    let moved=false,candidate=source,valid=true,selectionTarget=target;
    const update=(event:PointerEvent)=>{
      if(event.pointerId!==e.pointerId||!moved&&Math.abs(event.clientY-startY)<10)return;moved=true;event.preventDefault();
      const scroll=surface.querySelector<HTMLElement>('.availability-scroll')!,rect=scroll.getBoundingClientRect();
      if(event.clientY<rect.top+70)scroll.scrollTop-=16;else if(event.clientY>rect.bottom-24)scroll.scrollTop+=16;
      const pointMinute=axis.minute(event.clientY-column.getBoundingClientRect().top),nextAxis=expandTimeAxis(axis,pointMinute),delta=Math.round((pointMinute-originMinute)/15)*15;
      if(nextAxis!==axis){const shift=nextAxis.position(pointMinute)-axis.position(pointMinute);axis=nextAxis;surface.querySelector<HTMLElement>('.availability-paper-body')!.style.height=axis.height+'px';surface.querySelector<HTMLElement>('.availability-axis')!.innerHTML=axisHTML();for(let j=0;j<(date?1:7);j++)repaint(j);scroll.scrollTop+=shift;}
      try{if(drawing){const point=Math.max(0,Math.min(1425,origin+delta)),a=Math.min(origin,point),b=Math.max(origin,point)+15;candidate=mode==='break'?addAvailabilityBreak(source,a,b):changeAvailabilityBand(source,'work','draw',a,b);selectionTarget=mode==='break'?source.breaks.length:'work';}else {const b=target==='work'?source:source.breaks[target];candidate=changeAvailabilityBand(source,target,edge,(edge==='end'?b.end:b.start)+delta);}valid=true;error.textContent='';selected={day:i,target:selectionTarget};column.innerHTML=gridHTML()+bands(candidate,i);column.classList.add('editing');}catch(err){valid=false;error.textContent=(err as Error).message;}
    };
    const cleanup=()=>{document.removeEventListener('pointermove',update);document.removeEventListener('pointerup',finish);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',escapeGesture);window.removeEventListener('blur',cancel);column.classList.remove('editing');};
    const finish=(event:PointerEvent)=>{if(event.pointerId!==e.pointerId)return;cleanup();if(valid&&moved){set(i,candidate);selected={day:i,target:selectionTarget};publish();}else if(el)selected={day:i,target};renderEditor(selected?`[data-band-select="${selected.target}"][data-day="${selected.day}"]`:undefined);if(moved){const suppress=(click:MouseEvent)=>{click.preventDefault();click.stopPropagation();};document.addEventListener('click',suppress,{capture:true,once:true});setTimeout(()=>document.removeEventListener('click',suppress,true),0);}};
    const cancel=()=>{cleanup();axis=originalAxis;selected=originalSelected;error.textContent='';renderEditor();},escapeGesture=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();cancel();}};
    document.addEventListener('pointermove',update,{passive:false});document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',escapeGesture);window.addEventListener('blur',cancel);
  };
  root.addEventListener('availability-select',e=>{selected={day:0,target:(e as CustomEvent<AvailabilityTarget>).detail};const details=root.matches('details')?root as HTMLDetailsElement:root.querySelector<HTMLDetailsElement>('details');if(details)details.open=true;renderEditor('[data-band-range="start"]');});
  metadata().forEach(input=>input.oninput=()=>{if(input.id==='exception-kind'&&input.value!=='leave'){const day=structuredClone(get(0));day.enabled=true;set(0,day);}publish();if(input.id==='exception-kind')renderEditor();});
  const save=(value:Settings)=>{const move=conflicts.querySelector<HTMLInputElement>('#move-conflicts')?.checked??false;if(findConflicts().length&&!move){error.textContent='충돌 작업을 미계획으로 이동하도록 선택하거나 밴드를 조정하세요.';return;}form.inert=true;hooks.save(structuredClone(value),move,()=>{form.inert=false;});};
  form.onsubmit=e=>{e.preventDefault();try{readMetadata();if(date?get(0).breaks.some(b=>!b.label.trim()):draft.days.some(d=>d.breaks.some(b=>!b.label.trim())))throw Error('휴식 이름을 입력하세요.');save(draft);}catch(err){error.textContent=(err as Error).message;stash(true);}};
  form.querySelector('#reset-day')?.addEventListener('click',()=>{
    const previous=structuredClone(draft);draft.exceptions=draft.exceptions?.filter(e=>e.date!==date);renderConflicts();
    if(findConflicts().length&&!conflicts.querySelector<HTMLInputElement>('#move-conflicts')?.checked){draft=previous;error.textContent='반복 일정과 충돌합니다. 미계획 이동을 선택하고 다시 복원하세요.';return;}
    form.querySelector<HTMLSelectElement>('#exception-kind')!.value='custom';selected={day:0,target:'work'};renderEditor();hooks.changed(structuredClone(draft));stash();save(draft);
  });
  form.querySelector('#reset-availability')?.addEventListener('click',hooks.reset);
  const exceptions=form.querySelector('[data-exception-list]');if(exceptions)exceptions.addEventListener('click',e=>{const button=(e.target as HTMLElement).closest<HTMLElement>('[data-remove-exception]');if(button){draft.exceptions=draft.exceptions?.filter(e=>e.date!==button.dataset.removeException);publish();exceptions.innerHTML=exceptionList(draft);}});
  renderEditor();renderConflicts();
}


