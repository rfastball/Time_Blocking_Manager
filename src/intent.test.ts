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

test('the bench stores card, new-pile, pile-move and stack drops, and nothing when put back',()=>{
  const card=(id:string,pile:string|null,order:number):Task=>task(id,{plan_date:null,pile_id:pile,pile_order:order});
  const bench=[card('a',null,1),card('b',null,2),card('c','p1',1),card('d','p1',2),card('e','p2',1)],piles=[{id:'p1',position:1},{id:'p2',position:2}];
  const act=(patch:Partial<Intent>&{id:string})=>intentAction(bench,at({zone:'pile',...patch}),piles,()=>'new');
  assert.deepEqual(act({id:'a',pile:'p1',index:1}),{type:'place_unplanned',items:[{id:'a',revision:1}],pile:'p1',index:1});
  assert.equal(act({id:'c',pile:'p1',index:0}),null);
  assert.equal(act({id:'b',pile:null,index:1}),null);
  assert.deepEqual(act({id:'d',pile:'p1',index:0}),{type:'place_unplanned',items:[{id:'d',revision:1}],pile:'p1',index:0});
  assert.deepEqual(act({id:'a',create:2}),{type:'place_unplanned',items:[{id:'a',revision:1}],pile:'new',create_at:2,index:0});
  // A pile by its handle: between piles moves it, onto a pile stacks below its cards; the 투입구 never moves.
  assert.deepEqual(act({id:'e',ids:['e'],carry:{pile:'p2'},create:1}),{type:'move_pile',pile:'p2',position:1});
  assert.equal(act({id:'a',ids:['a','b'],carry:{pile:null},create:1}),null);
  assert.deepEqual(act({id:'c',ids:['c','d'],carry:{pile:'p1'},pile:'p2'}),{type:'place_unplanned',items:[{id:'c',revision:1},{id:'d',revision:1}],pile:'p2',index:1});
  // Several onto a date: in order to its end, previewed the same way.
  const ship=at({id:'a',ids:['a','c'],zone:'date',date:day});
  assert.deepEqual(intentAction(bench,ship),{type:'ship_flow',date:day,items:[{id:'a',revision:1},{id:'c',revision:1}]});
  assert.deepEqual(orderOf(applyIntent(bench,ship)),['a','c']);
  // A multi-drop on the timetable body inserts before the pointed remaining card.
  const mixed=[...bench,task('x',{flow_order:1}),task('y',{flow_order:2}),task('z',{flow_order:3})];
  const insert=at({id:'a',ids:['a','c'],zone:'body',date:day,before:'y'});
  assert.deepEqual(orderOf(applyIntent(mixed,insert)),['x','a','c','y','z']);
  assert.deepEqual(intentAction(mixed,insert),{type:'ship_flow',date:day,items:[{id:'a',revision:1},{id:'c',revision:1}],before:'y'});
  const reorder=at({id:'z',ids:['z','x'],zone:'body',date:day,before:'y'});
  assert.deepEqual(orderOf(applyIntent(mixed,reorder)),['z','x','y']);
  const spatial=at({id:'a',ids:['a','c'],zone:'canvas',positions:[{id:'a',x:-32,y:75},{id:'c',x:292,y:195}]});
  assert.deepEqual(intentAction(bench,spatial),{type:'place_board',items:[{id:'a',x:-32,y:75,revision:1},{id:'c',x:292,y:195,revision:1}]});
  const placed=applyIntent(bench,spatial);
  assert.deepEqual(placed.filter(t=>['a','c'].includes(t.id)).map(t=>[t.id,t.board_x,t.board_y]),[['a',-32,75],['c',292,195]]);
  assert.equal(intentAction(placed,spatial),null,'releasing at the saved coordinates stores nothing');
});
