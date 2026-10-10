import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layoutDay,insertionBefore,moveInOrder,byFlowOrder} from './flow.ts';
import type {WorkingDay} from './types.ts';

// Redesign §10: work 09:00–18:00, lunch 12:00–13:00, workshop fixed 14:00–15:00.
const rule:WorkingDay={enabled:true,start:540,end:1080,breaks:[{start:720,end:780,label:'점심'}]};
const workshop=[{start:840,end:900}];
const block=(id:string,duration:number)=>({id,duration});
const [A,B,C,D]=[block('A',60),block('B',45),block('C',30),block('D',60)];
const clock=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const shape=(result:ReturnType<typeof layoutDay<{id:string;duration:number}>>)=>result.placed.map(b=>`${b.task.id} ${clock(b.start)}–${clock(b.end)}`);

test('completion scenarios reproduce the redesign table without measuring elapsed time',()=>{
  assert.deepEqual(shape(layoutDay(rule,workshop,[A,B,C,D],null)),['A 09:00–10:00','B 10:00–10:45','C 10:45–11:15','D 13:00–14:00']);
  assert.deepEqual(shape(layoutDay(rule,workshop,[B,C,D],580)),['B 09:40–10:25','C 10:25–10:55','D 10:55–11:55']);
  assert.deepEqual(shape(layoutDay(rule,workshop,[B,C,D],620)),['B 10:20–11:05','C 11:05–11:35','D 13:00–14:00']);
  assert.deepEqual(shape(layoutDay(rule,workshop,[D],690)),['D 13:00–14:00']);
});

test('the same anchor gives the same layout however late it is',()=>{
  const morning=layoutDay(rule,workshop,[A,B,C,D],null),evening=layoutDay(rule,workshop,[A,B,C,D],null);
  assert.deepEqual(evening,morning);
  assert.deepEqual(shape(layoutDay(rule,workshop,[A],400)),['A 09:00–10:00'],'an anchor before work starts at work start');
});

test('blocks cross lunch and fixed work in order and keep later blocks behind the first that cannot fit',()=>{
  const detour=layoutDay(rule,workshop,[block('L',90),block('S',15)],660);
  assert.deepEqual(shape(detour),['L 15:00–16:30','S 16:30–16:45'],'a 90 minute block skips the gaps before lunch and around the workshop');
  const late=layoutDay(rule,workshop,[block('X',120),block('Y',15)],1000);
  assert.deepEqual(late.placed,[]);
  assert.deepEqual(late.unplaced.map(u=>[u.task.id,u.reason]),[['X','total'],['Y','queued']]);
  const split=layoutDay(rule,workshop,[block('Z',90)],690);
  assert.deepEqual(shape(split),['Z 15:00–16:30']);
  const fragmented=layoutDay({...rule,end:900},workshop,[block('W',75)],690);
  assert.deepEqual(fragmented.unplaced.map(u=>u.reason),['contiguous'],'enough total minutes but no single gap');
  assert.deepEqual(layoutDay({...rule,enabled:false},[],[A],null).unplaced.map(u=>u.reason),['dayOff']);
});

test('insertion targets the first block below the pointer and ordering moves stay in bounds',()=>{
  const {placed}=layoutDay(rule,workshop,[A,B,C,D],null);
  assert.equal(insertionBefore(placed,560),'A');
  assert.equal(insertionBefore(placed,610),'B');
  assert.equal(insertionBefore(placed,610,'B'),'C','the dragged block is not its own target');
  assert.equal(insertionBefore(placed,1000),null);
  assert.deepEqual(moveInOrder(['A','B','C'],'C',-1),['A','C','B']);
  assert.equal(moveInOrder(['A','B','C'],'A',-1),null);
  assert.deepEqual([{id:'b',flow_order:1},{id:'a',flow_order:1},{id:'c',flow_order:0}].sort(byFlowOrder).map(t=>t.id),['c','a','b']);
});
