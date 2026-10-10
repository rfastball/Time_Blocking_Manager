import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyIntent,intentAction,noIntent,type Intent} from './intent.ts';
import type {Task} from './types.ts';

const day='2026-10-12',other='2026-10-13';
const task=(id:string,extra:Partial<Task>={}):Task=>({id,title:id,body:'',starts_at:null,duration:30,completed:false,revision:1,plan_date:day,flow_order:null,...extra});
const tasks=[task('a',{flow_order:1}),task('b',{flow_order:2}),task('c',{flow_order:3}),task('w',{starts_at:day+'T14:00'}),task('i',{plan_date:null}),task('x',{flow_order:4,completed:true})];
const at=(patch:Partial<Intent>&{id:string}):Intent=>({...noIntent(patch.id),...patch});
const orderOf=(list:Task[],date=day)=>list.filter(t=>t.plan_date===date&&!t.starts_at&&!t.completed).sort((p,q)=>p.flow_order!-q.flow_order!).map(t=>t.id);

test('a held block previews and stores order, date, time and 미계획 as one command each',()=>{
  // Body: same day is a reorder of the whole remaining order.
  const move=at({id:'c',zone:'body',date:day,before:'a'});
  assert.deepEqual(orderOf(applyIntent(tasks,move)),['c','a','b']);
  assert.deepEqual(intentAction(tasks,move),{type:'reorder_flow',date:day,expected:[{id:'c',revision:1},{id:'a',revision:1},{id:'b',revision:1}]});
  // Body: from 미계획 it is a date assignment before the target, without a time.
  const assign=at({id:'i',zone:'body',date:day,before:'b'});
  assert.deepEqual(orderOf(applyIntent(tasks,assign)),['a','i','b','c']);
  assert.equal(intentAction(tasks,assign)?.type,'update');
  assert.deepEqual((({plan_date,starts_at,before})=>({plan_date,starts_at,before}))(intentAction(tasks,assign) as {plan_date:string;starts_at:null;before:string}),{plan_date:day,starts_at:null,before:'b'});
  // A fixed block dropped on the body leaves its time and joins the order.
  const unfix=at({id:'w',zone:'body',date:day,before:'b'});
  assert.deepEqual(orderOf(applyIntent(tasks,unfix)),['a','w','b','c']);
  assert.equal((intentAction(tasks,unfix) as {starts_at:string|null}).starts_at,null);
  // Date cells and the shelf append to that day's order.
  assert.deepEqual(orderOf(applyIntent(tasks,at({id:'a',zone:'date',date:other})),other),['a']);
  assert.deepEqual(orderOf(applyIntent(tasks,at({id:'i',zone:'below',date:day}))),['a','b','c','i']);
  // Rail fixes the time; a refused slot changes nothing.
  const rail=at({id:'b',zone:'rail',date:day,start:900});
  assert.equal(applyIntent(tasks,rail).find(t=>t.id==='b')!.starts_at,day+'T15:00');
  assert.equal(intentAction(tasks,at({id:'b',zone:'rail',date:day,start:720,ok:false,reason:'점심'})),null);
  assert.equal(applyIntent(tasks,at({id:'b',zone:'rail',date:day,start:720,ok:false})),tasks);
  // Tray returns planned work to 미계획; nothing happens for 미계획 work or outside every zone.
  assert.equal(applyIntent(tasks,at({id:'a',zone:'tray'})).find(t=>t.id==='a')!.plan_date,null);
  assert.equal(intentAction(tasks,at({id:'i',zone:'tray'})),null);
  assert.equal(intentAction(tasks,noIntent('a')),null);
  // Dropping a block back where it was stores nothing.
  assert.equal(intentAction(tasks,at({id:'b',zone:'body',date:day,before:'c'})),null);
});
