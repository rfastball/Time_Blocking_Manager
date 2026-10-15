import {useState} from 'react';
import {time} from '../../dates.ts';
import type {Routine} from '../../types.ts';
import {useApp} from '../store/state.ts';
import {cancelRoutineDraft,deleteRoutine,editRoutineDraft,saveRoutine,startRoutineEdit} from '../store/schedule.ts';
import {Icon} from '../ui/icons.tsx';
import {focusLater} from '../ui/focus.ts';

const dayNames=['월','화','수','목','금','토','일'];
const blank={title:'',body:'',weekdays:[0,1,2,3,4],start:'09:00',duration:'30'};

export function Routines(){
  const {snapshot,drafts,busy,failed}=useApp();
  const routines=[...(snapshot!.settings.routines??[])].sort((a,b)=>a.start-b.start||a.title.localeCompare(b.title));
  const draft=drafts.routineDraft,form=draft??blank,editing=!!draft&&routines.some(r=>r.id===draft.id);
  const [error,setError]=useState('');
  const edit=(patch:Partial<typeof blank>)=>{setError('');editRoutineDraft(patch);};
  function open(r:Routine){
    const issue=startRoutineEdit(r);setError(issue??'');
    if(!issue)focusLater('#routine-title',{scroll:true});
  }
  return <section className="st-routines" aria-labelledby="routines-heading">
    <h2 id="routines-heading">정기 업무</h2>
    {routines.length>0&&<ul className="st-routine-list">{routines.map(r=><li key={r.id} className={draft?.id===r.id?'st-editing':''}>
      <button type="button" className="st-routine" onClick={()=>open(r)}>
        <strong>{r.title}</strong><small>{r.weekdays.map(d=>dayNames[d]).join('·')} · {time(r.start)}–{time(r.start+r.duration)}</small>
      </button>
      <button type="button" className="ibtn danger" aria-label={`${r.title} 정기 업무 삭제`} title="삭제" onClick={()=>void deleteRoutine(r).then(m=>setError(m??''))}><Icon name="delete" size={17}/></button>
    </li>)}</ul>}
    <form id="routine-form" noValidate onSubmit={e=>{e.preventDefault();void saveRoutine().then(m=>setError(m??''));}}
      onKeyDown={e=>{if(e.key==='Enter'&&(e.nativeEvent.isComposing||e.keyCode===229))e.preventDefault();}}>
      <label htmlFor="routine-title">{editing?'정기 업무 수정':'새 정기 업무'}</label>
      <input id="routine-title" value={form.title} placeholder="업무 이름" maxLength={650} required onChange={e=>edit({title:e.target.value})}/>
      <fieldset className="st-weekdays"><legend>반복 요일</legend>
        {dayNames.map((label,i)=><label key={i}><input type="checkbox" checked={form.weekdays.includes(i)}
          onChange={e=>edit({weekdays:e.target.checked?[...form.weekdays,i].sort():form.weekdays.filter(d=>d!==i)})}/>{label}</label>)}
      </fieldset>
      <div className="st-two">
        <div><label htmlFor="routine-start">시작 시각</label><input id="routine-start" type="time" step={900} value={form.start} required onChange={e=>edit({start:e.target.value})}/></div>
        <div><label htmlFor="routine-duration">소요시간 (분)</label><input id="routine-duration" type="number" min={15} max={1440} step={15} value={form.duration} required onChange={e=>edit({duration:e.target.value})}/></div>
      </div>
      <label htmlFor="routine-body">메모</label>
      <textarea id="routine-body" rows={2} value={form.body} onChange={e=>edit({body:e.target.value})}/>
      {error&&<p className="error" role="alert">{error}</p>}
      <div className="st-actions">
        {draft&&<button type="button" className="btn" onClick={()=>void cancelRoutineDraft().then(()=>setError(''))}>되돌리기</button>}
        <button type="submit" className="btn primary" disabled={busy||!!failed}>{editing?'저장':'추가'}</button>
      </div>
    </form>
  </section>;
}
