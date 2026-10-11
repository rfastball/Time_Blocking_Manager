import {test} from 'node:test';
import assert from 'node:assert/strict';
import {benchOrder,benchPiles,normalize,pileName,place} from './bench.ts';
import {previewMutation} from './preview.ts';
import type {Action,Pile,Snapshot,Task} from './types.ts';

const card=(id:string,pile:string|null,order:number,extra:Partial<Task>={}):Task=>({id,title:id,body:'',starts_at:null,duration:30,completed:false,revision:1,plan_date:null,flow_order:null,pile_id:pile,pile_order:order,...extra});
const view=(tasks:Task[],piles:Pile[])=>benchPiles(tasks,piles).map(p=>[p.id,p.cards.map(t=>t.id)]);

test('the bench reads the 투입구 first, piles left to right, cards top to bottom',()=>{
  const tasks=[card('a','p2',1),card('b',null,2),card('c','p1',2),card('d','p1',1),card('e',null,1),card('dated',null,0,{plan_date:'2026-10-14',pile_order:null}),card('done',null,0,{completed:true,pile_order:null})];
  const piles=[{id:'p2',position:2},{id:'p1',position:1}];
  assert.deepEqual(view(tasks,piles),[[null,['e','b']],['p1',['d','c']],['p2',['a']]]);
  assert.deepEqual(benchOrder(tasks,piles).map(t=>t.id),['e','b','d','c','a']);
  // An unknown pile reads as the 투입구 rather than hiding work.
  assert.deepEqual(view([card('x','gone',1)],[]),[[null,['x']]]);
});

test('reading names follow the top card and say the total; piles are never named',()=>{
  const piles=benchPiles([card('설계 문서 작성','p1',1,{duration:180}),card('조사','p1',2,{duration:45}),card('메일',null,1,{duration:15})],[{id:'p1',position:1}]);
  assert.equal(pileName(piles[0]),'투입구, 1개, 15분');
  assert.equal(pileName(piles[1]),'‘설계 문서 작성’ 외 1 더미, 3시간 45분');
  assert.equal(pileName(benchPiles([],[])[0]),'투입구, 비어 있음');
});

test('placing inserts before the card at the index among the others and keeps order numbers dense',()=>{
  const tasks=[card('a','p',1),card('b','p',2),card('c','p',3),card('x',null,1)];
  const ids=(list:Task[])=>benchPiles(list,[{id:'p',position:1}])[1].cards.map(t=>t.id);
  assert.deepEqual(ids(place(tasks,['x'],'p',1)),['a','x','b','c']);
  assert.deepEqual(ids(place(tasks,['c'],'p',0)),['c','a','b']);
  assert.deepEqual(ids(place(tasks,['a','x'],'p',99)),['b','c','a','x']);
});

test('normalizing drops empty piles, strips non-bench places and renumbers',()=>{
  const {tasks,piles}=normalize([card('a','p2',5),card('b',null,7),card('d','p1',1,{plan_date:'2026-10-14',proto:true}),card('n',null,0,{pile_order:null,proto:true})],[{id:'p1',position:3},{id:'p2',position:9}]);
  assert.deepEqual(piles,[{id:'p2',position:1}]);
  const by=(id:string)=>tasks.find(t=>t.id===id)!;
  assert.deepEqual([by('n').pile_order,by('b').pile_order,by('a').pile_order],[1,2,1]);
  assert.deepEqual([by('d').pile_id,by('d').pile_order,by('d').proto],[null,null,false]);
  assert.equal(by('n').proto,true);
});

test('the preview store follows the bench rules of the Rust store',()=>{
  let s:Snapshot={epoch:'e',tasks:[],settings:{revision:1,days:[]},layouts:[],trash:[],piles:[]};
  const run=(action:Action)=>{s=previewMutation(s,{request_id:crypto.randomUUID(),epoch:'e',action},new Set());return s;};
  const rev=(...ids:string[])=>ids.map(id=>({id,revision:s.tasks.find(t=>t.id===id)!.revision}));
  for(const id of ['a','b','c'])run({type:'create',id,title:id});
  assert.deepEqual(view(s.tasks,s.piles!),[[null,['c','b','a']]]);assert.ok(s.tasks.every(t=>t.proto));
  run({type:'place_unplanned',items:rev('a'),pile:'p1',create_at:1,index:0});
  run({type:'place_unplanned',items:rev('b'),pile:'p1',index:0});
  assert.deepEqual(view(s.tasks,s.piles!),[[null,['c']],['p1',['b','a']]]);
  // Same length but chosen: sized. A date: sized, out of its pile, and the emptied pile goes.
  const a=s.tasks.find(t=>t.id==='a')!;
  run({type:'update',id:'a',expected_revision:a.revision,title:'a',body:'',starts_at:null,duration:30,plan_date:null,sized:true});
  assert.equal(s.tasks.find(t=>t.id==='a')!.proto,false);
  run({type:'ship_flow',date:'2026-10-14',items:rev('b','a')});
  assert.deepEqual(s.piles,[]);assert.deepEqual(s.tasks.filter(t=>t.plan_date).sort((x,y)=>x.flow_order!-y.flow_order!).map(t=>t.id),['b','a']);
  // Back by a button: top of the 투입구.
  const b=s.tasks.find(t=>t.id==='b')!;
  run({type:'update',id:'b',expected_revision:b.revision,title:'b',body:'',starts_at:null,duration:30,plan_date:null});
  assert.deepEqual(view(s.tasks,s.piles!),[[null,['b','c']]]);
});

test('the preview store records 미계획 completion on the given day and returns old dateless ones to the 투입구',()=>{
  let s:Snapshot={epoch:'e',tasks:[card('a',null,1,{proto:true}),card('old',null,0,{completed:true,pile_order:null})],settings:{revision:1,days:[]},layouts:[],trash:[],piles:[]};
  const run=(action:Action)=>{s=previewMutation(s,{request_id:crypto.randomUUID(),epoch:'e',action},new Set());return s;};
  assert.throws(()=>run({type:'set_completed',id:'a',expected_revision:1,completed:true}),/날짜/);
  run({type:'set_completed',id:'a',expected_revision:1,completed:true,date:'2026-10-11'});
  const a=s.tasks.find(t=>t.id==='a')!;
  assert.deepEqual([a.completed,a.plan_date,a.flow_order,a.proto,a.pile_order],[true,'2026-10-11',1,false,null]);
  assert.deepEqual(s.layouts,[]);
  assert.throws(()=>run({type:'update',id:'a',expected_revision:a.revision,title:'a',body:'',starts_at:null,duration:30,plan_date:null}),/완료한 작업/);
  run({type:'set_completed',id:'old',expected_revision:1,completed:false});
  assert.deepEqual(view(s.tasks,s.piles!),[[null,['old']]]);
});
