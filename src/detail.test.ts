import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkCount,checklist,durationValid,memoPreview,quarter,scheduleHint,scheduleSummary,taskState,toggleCheck,withSchedule} from './detail.ts';

const body='진행 상황\n[ ] 계획 화면 정리\n- [x] 검토 의견 반영\n  [X] 들여쓴 항목\n[] 아님\n끝';

test('checklist reads [ ], [x] and "- [ ]" lines with their line numbers',()=>{
  assert.deepEqual(checklist(body),[{line:1,checked:false,label:'계획 화면 정리'},{line:2,checked:true,label:'검토 의견 반영'},{line:3,checked:true,label:'들여쓴 항목'}]);
  assert.deepEqual(checkCount(body),{done:2,total:3});
  assert.deepEqual(checklist('메모만'),[]);
});

test('toggling rewrites only that line mark and leaves the memo otherwise unchanged',()=>{
  const on=toggleCheck(body,1,true);
  assert.equal(on,body.replace('[ ] 계획','[x] 계획'));
  assert.equal(toggleCheck(on,1,false),body);
  assert.equal(toggleCheck(body,3,false),body.replace('[X] 들여쓴','[ ] 들여쓴'));
  // A line that is not an item, or a line past the end, is never touched.
  assert.equal(toggleCheck(body,0,true),body);
  assert.equal(toggleCheck(body,40,true),body);
  assert.equal(toggleCheck('[ ] a [ ] b',0,true),'[x] a [ ] b');
});

test('the memo preview shows checklist marks as ✓ and · without blank lines',()=>{
  assert.equal(memoPreview('진행 메모\n\n[x] 요구사항 확인\n- [ ] 초안에 반영'),'진행 메모\n✓ 요구사항 확인\n· 초안에 반영');
});

test('state badge follows completion, then date, then fixed time',()=>{
  assert.equal(taskState({completed:true,plan_date:'2026-10-10',starts_at:null}),'완료');
  assert.equal(taskState({completed:false,plan_date:null,starts_at:null}),'준비');
  assert.equal(taskState({completed:false,plan_date:'2026-10-10',starts_at:'2026-10-10T14:00'}),'시각 고정');
  assert.equal(taskState({completed:false,plan_date:'2026-10-10',starts_at:null}),'계획');
});

test('schedule fields: fixed needs both date and time; summaries read the draft',()=>{
  assert.deepEqual(withSchedule('2026-10-10',true,'09:15'),{plan_date:'2026-10-10',starts_at:'2026-10-10T09:15'});
  assert.deepEqual(withSchedule('2026-10-10',true,''),{plan_date:'2026-10-10',starts_at:null});
  assert.deepEqual(withSchedule('',true,'09:15'),{plan_date:null,starts_at:null});
  assert.deepEqual(withSchedule('2026-10-10',false,'09:15'),{plan_date:'2026-10-10',starts_at:null});
  assert.equal(scheduleSummary({duration:90,plan_date:'2026-10-10',starts_at:'2026-10-10T14:00'}),'일정 · 1시간 30분 · 10월 10일 14:00 고정');
  assert.equal(scheduleSummary({duration:30,plan_date:'2026-10-09',starts_at:null}),'일정 · 30분 · 10월 9일');
  assert.equal(scheduleSummary({duration:0,plan_date:null,starts_at:null}),'일정 · 크기 미정 · 준비');
  assert.equal(scheduleHint({duration:45,plan_date:'2026-10-10',starts_at:'2026-10-10T23:30'}),'23:30–24:15');
  assert.equal(scheduleHint({duration:45,plan_date:'2026-10-10',starts_at:null},{start:600,end:645}),'예상 10:00–10:45');
  assert.equal(scheduleHint({duration:45,plan_date:'2026-10-10',starts_at:null}),'10월 10일');
  assert.equal(scheduleHint({duration:45,plan_date:null,starts_at:null}),'준비');
});

test('quarter rounding and duration rule',()=>{
  assert.deepEqual([quarter(607),quarter(608),quarter(540)],[600,615,540]);
  assert.deepEqual([15,1440,45,0,10,1455,22.5].map(durationValid),[true,true,true,false,false,false,false]);
});
