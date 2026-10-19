import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initials,jump,keyInitial,parseTrigger,staleLabel,triggerOptions,waitGroups,waitOrderAction} from './waiting.ts';
import type {Task} from './types.ts';

const TODAY='2026-10-14';
const w=(id:string,since:string,trigger:{for?:string;until?:string},extra:Partial<Task>={}):Task=>({id,title:id,body:'',starts_at:null,duration:30,completed:false,revision:1,plan_date:null,flow_order:null,
  wait_for:trigger.for??'',wait_until:trigger.until??null,wait_since:since,...extra});

test('the band reads met dates, then triggers in 가나다 order with the unnamed first, then later dates; the oldest leads a pile',()=>{
  const tasks=[w('a','2026-10-10',{for:'법무팀 검토'}),w('b','2026-10-08',{for:'김부장 결재'}),w('c','2026-10-12',{until:'2026-10-20'}),w('d','2026-10-01',{until:'2026-10-14'}),
    w('e','2026-10-13',{}),w('f','2026-10-06',{for:'김부장 결재'}),w('g','2026-10-11',{until:'2026-10-16'}),w('dated','2026-10-11',{for:'김부장 결재'},{plan_date:TODAY,flow_order:1})];
  const groups=waitGroups(tasks,TODAY);
  assert.deepEqual(groups.map(g=>[g.kind,g.text,g.items.map(t=>t.id).join('')]),[
    ['ready','10/14 이후','d'],['who','','e'],['who','김부장 결재','fb'],['who','법무팀 검토','a'],['date','10/16 이후','g'],['date','10/20 이후','c']]);
});

test('how long a block has waited shows only from a week on',()=>{
  assert.deepEqual(['2026-10-14','2026-10-08','2026-10-07','2026-09-14'].map(since=>staleLabel(w('a',since,{for:'회신'}),TODAY)),['','','7일째','30일째']);
  assert.equal(staleLabel(w('a','2026-10-07',{for:'회신'},{wait_since:null}),TODAY),'');
});

test('a typed trigger is a date when it reads as one, else the text itself',()=>{
  assert.deepEqual(parseTrigger('  김부장   결재 ',TODAY),{trigger:'김부장 결재',until:null});
  assert.deepEqual(parseTrigger('10/20',TODAY),{trigger:'',until:'2026-10-20'});
  assert.deepEqual(parseTrigger('10.20 이후',TODAY),{trigger:'',until:'2026-10-20'});
  assert.deepEqual(parseTrigger('1/5',TODAY),{trigger:'',until:'2027-01-05'},'well behind today means next year');
  assert.deepEqual(parseTrigger('10/1',TODAY),{trigger:'',until:'2026-10-01'},'a recent past date is met already');
  assert.deepEqual(parseTrigger('내일',TODAY),{trigger:'',until:'2026-10-15'});
  assert.deepEqual(parseTrigger('2/30',TODAY),{trigger:'2/30',until:null});
  assert.deepEqual(parseTrigger('',TODAY),{trigger:'',until:null});
});

test('choices are the triggers already waiting and the near dates, narrowed by what was typed',()=>{
  const tasks=[w('a','2026-10-10',{for:'법무팀 검토'}),w('b','2026-10-08',{for:'김부장 결재'}),w('c','2026-10-08',{for:'김주무관 확인'}),w('d','2026-10-08',{for:'행안부 회신'})];
  assert.deepEqual(triggerOptions('',tasks,TODAY).map(o=>o.text),['김부장 결재','김주무관 확인','법무팀 검토','10/15 이후','10/19 이후']);
  assert.deepEqual(triggerOptions('김',tasks,TODAY).map(o=>o.text),['김부장 결재','김주무관 확인']);
  assert.deepEqual(triggerOptions('김부장 결재',tasks,TODAY),[]);
});

test('letters jump by initial consonant, a pile by its trigger before any title',()=>{
  assert.equal(initials('김부장 결재'),'ㄱㅂㅈㄱㅈ');assert.equal(initials('쌍용'),'ㅅㅇ');
  assert.equal(keyInitial('KeyR','r'),'ㄱ');assert.equal(keyInitial('KeyR','ㄱ'),'ㄱ');assert.equal(keyInitial('Digit3','3'),'3');assert.equal(keyInitial('KeyK','k'),'');
  const entries=[{id:'1',top:true,trigger:'감사팀 자료',title:'내부통제'},{id:'2',top:true,trigger:'법무팀',title:'계약서 수정'},{id:'3',top:false,trigger:'법무팀',title:'협약서'},{id:'4',top:true,trigger:'김부장',title:'출장비'}];
  assert.equal(jump(entries,'1','ㄱ')?.id,'4','the next trigger starting with ㄱ');
  assert.equal(jump(entries,'4','ㄱ')?.id,'1','wraps around');
  assert.equal(jump(entries,'1','ㅎ')?.id,'3','a title inside a pile when no trigger matches');
  assert.equal(jump(entries,'1','ㅂㅁ')?.id,'2');
  assert.equal(jump(entries,'1','ㄱㄱ')?.id,'4','the same letter again steps on');
});


test('a waiting group preserves a moved block position without changing its trigger or other groups',()=>{
  const tasks=[w('a','2026-10-01',{for:'회신'}),w('b','2026-10-02',{for:'회신'}),w('c','2026-10-03',{for:'회신'}),w('x','2026-10-01',{for:'결재'})];
  const action=waitOrderAction(tasks,'a',2);
  assert.equal(action?.type,'reorder_wait');
  if(action?.type!=='reorder_wait')return;
  assert.deepEqual(action.expected.map(t=>t.id),['b','c','a']);
  const ordered=tasks.map(t=>({...t,pile_order:action.expected.findIndex(x=>x.id===t.id)+1||null}));
  assert.deepEqual(waitGroups(ordered,TODAY).find(g=>g.text==='회신')!.items.map(t=>t.id),['b','c','a']);
  assert.equal(waitOrderAction(ordered,'a',2),null);
  assert.deepEqual(waitOrderAction(ordered,'a',0)?.type,'reorder_wait');
});
