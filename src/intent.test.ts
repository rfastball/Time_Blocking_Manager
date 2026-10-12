import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyIntent,intentAction,noIntent,type Intent} from './intent.ts';
import type {Task} from './types.ts';

const day='2026-10-12',other='2026-10-13';
const task=(id:string,extra:Partial<Task>={}):Task=>({id,title:id,body:'',starts_at:null,duration:30,completed:false,revision:1,plan_date:day,flow_order:null,...extra});
const tasks=[task('a',{flow_order:1}),task('b',{flow_order:2}),task('c',{flow_order:3}),task('w',{starts_at:day+'T14:00'}),task('i',{plan_date:null}),task('x',{flow_order:4,completed:true})];
const at=(patch:Partial<Intent>&{id:string}):Intent=>({...noIntent(patch.id),...patch});
const orderOf=(list:Task[],date=day)=>list.filter(t=>t.plan_date===date&&!t.starts_at&&!t.completed).sort((p,q)=>p.flow_order!-q.flow_order!).map(t=>t.id);

test('a held block previews and stores order, date, time and 준비 as one command each',()=>{
  // Body: same day is a reorder of the whole remaining order.
  const move=at({id:'c',zone:'body',date:day,before:'a'});
  assert.deepEqual(orderOf(applyIntent(tasks,move)),['c','a','b']);
  assert.deepEqual(intentAction(tasks,move),{type:'reorder_flow',date:day,expected:[{id:'c',revision:1},{id:'a',revision:1},{id:'b',revision:1}]});
  // Body: from 준비 it is a date assignment before the target, without a time.
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
  // Tray returns planned work to 준비; nothing happens for 준비 work or outside every zone.
  assert.equal(applyIntent(tasks,at({id:'a',zone:'tray'})).find(t=>t.id==='a')!.plan_date,null);
  assert.equal(intentAction(tasks,at({id:'i',zone:'tray'})),null);
  assert.equal(intentAction(tasks,noIntent('a')),null);
  // Dropping a block back where it was stores nothing.
  assert.equal(intentAction(tasks,at({id:'b',zone:'body',date:day,before:'c'})),null);
});

test('the 준비 lists store moves into the 들어옴 and the shelf, create the shelf once, and store nothing when put back',()=>{
  const card=(id:string,pile:string|null,order:number,extra:Partial<Task>={}):Task=>task(id,{plan_date:null,pile_id:pile,pile_order:order,...extra});
  const bench=[card('a',null,1,{proto:true}),card('b',null,2),card('c','shelf',1),card('d','shelf',2),task('p',{plan_date:'2026-10-10',flow_order:1})],piles=[{id:'shelf',position:1}];
  const act=(patch:Partial<Intent>&{id:string},list=bench,known=piles)=>intentAction(list,at({zone:'shelf',...patch}),known);
  assert.deepEqual(act({id:'b',index:1}),{type:'place_unplanned',items:[{id:'b',revision:1}],pile:'shelf',index:1});
  assert.equal(act({id:'c',index:0}),null);assert.equal(act({id:'d',index:5}),null,'past the end is the end');
  assert.deepEqual(act({id:'d',index:0}),{type:'place_unplanned',items:[{id:'d',revision:1}],pile:'shelf',index:0});
  assert.deepEqual(act({id:'c',zone:'inbox',index:0}),{type:'place_unplanned',items:[{id:'c',revision:1}],pile:null,index:0});
  assert.equal(act({id:'b',zone:'inbox',index:1}),null);
  // The first card on an empty shelf creates it.
  const empty=bench.map(t=>t.pile_id?{...t,pile_id:null,pile_order:t.pile_order!+2}:t);
  assert.deepEqual(act({id:'b',index:0},empty,[]),{type:'place_unplanned',items:[{id:'b',revision:1}],pile:'shelf',index:0,create_at:1});
  // A proto previews sized on the shelf; overdue work previews undated; the 들어옴 keeps a proto.
  const onto=applyIntent(bench,at({id:'a',ids:['a','p'],zone:'shelf',index:1}));
  assert.deepEqual(onto.filter(t=>t.pile_id==='shelf').sort((x,y)=>x.pile_order!-y.pile_order!).map(t=>[t.id,!!t.proto,t.plan_date]),[['c',false,null],['a',false,null],['p',false,null],['d',false,null]]);
  assert.equal(applyIntent(bench,at({id:'a',zone:'inbox',index:1})).find(t=>t.id==='a')!.proto,true);
  // A tray drop from a date previews on top of the shelf.
  const back=applyIntent(bench,at({id:'p',zone:'tray'})).find(t=>t.id==='p')!;
  assert.deepEqual([back.plan_date,back.pile_id,back.pile_order],[null,'shelf',1]);
  // Several onto a date: in order to its end, previewed the same way.
  const ship=at({id:'a',ids:['a','c'],zone:'date',date:day});
  assert.deepEqual(intentAction(bench,ship),{type:'ship_flow',date:day,items:[{id:'a',revision:1},{id:'c',revision:1}]});
  assert.deepEqual(orderOf(applyIntent(bench,ship)),['p','a','c'].filter(id=>id!=='p'));
  // A multi-drop on the timetable body inserts before the pointed remaining card.
  const mixed=[...bench,task('x',{flow_order:1}),task('y',{flow_order:2}),task('z',{flow_order:3})];
  const insert=at({id:'a',ids:['a','c'],zone:'body',date:day,before:'y'});
  assert.deepEqual(orderOf(applyIntent(mixed,insert)),['x','a','c','y','z']);
  assert.deepEqual(intentAction(mixed,insert),{type:'ship_flow',date:day,items:[{id:'a',revision:1},{id:'c',revision:1}],before:'y'});
  const reorder=at({id:'z',ids:['z','x'],zone:'body',date:day,before:'y'});
  assert.deepEqual(orderOf(applyIntent(mixed,reorder)),['z','x','y']);
});
