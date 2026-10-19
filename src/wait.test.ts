import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inboxCards,normalize,onBench,placeLabel,shelfCards,triggerText,waitCards,waiting} from './bench.ts';
import {previewMutation} from './preview.ts';
import {search} from './search.ts';
import type {Action,Pile,Settings,Snapshot,Task} from './types.ts';

const card=(id:string,pile:string|null,order:number|null,extra:Partial<Task>={}):Task=>({id,title:id,body:'',starts_at:null,duration:30,completed:false,revision:1,plan_date:null,flow_order:null,pile_id:pile,pile_order:order,...extra});
const view=(tasks:Task[],piles:Pile[])=>[inboxCards(tasks).map(t=>t.id),shelfCards(tasks,piles).map(t=>t.id)];
const settings=():Settings=>({revision:1,days:Array.from({length:7},()=>({enabled:true,start:540,end:1080,breaks:[]})),exceptions:[],weekly_target:2400,work_days:5,routines:[]});
const today='2026-10-11',day='2026-10-14';
const trigger=(t:Task)=>[t.wait_for??null,t.wait_until??null,t.wait_since??null];

test('waiting work is out of 준비 and says what it waits on',()=>{
  const tasks=[card('a',null,1),card('w',null,null,{wait_for:'김부장 결재',wait_since:today}),card('d',null,null,{wait_for:'',wait_until:'2026-10-20',wait_since:today}),
    card('both',null,null,{wait_for:' 회신 ',wait_until:'2026-01-05',wait_since:today}),card('none',null,null,{wait_for:'',wait_since:today})];
  assert.deepEqual(waitCards(tasks).map(t=>t.id),['w','d','both','none']);assert.equal(tasks.filter(onBench).length,1);
  assert.deepEqual(tasks.map(triggerText),['','김부장 결재','10/20 이후','회신 · 1/5 이후','']);
  assert.deepEqual(tasks.map(t=>placeLabel(t,tasks)),['들어옴','기다림 · 김부장 결재','기다림 · 10/20 이후','기다림 · 회신 · 1/5 이후','기다림 · 정하지 않음']);
  assert.equal(waiting(card('dated',null,null,{wait_since:today,plan_date:day})),false);
  assert.deepEqual(search({tasks},'w').map(h=>[h.where,h.kind]),[['기다림 · 김부장 결재','wait']]);
});

test('normalizing ends a wait on a date or a completion and keeps waiting protos out of every pile',()=>{
  const {tasks,piles}=normalize([card('p',null,4,{proto:true,wait_for:'',wait_since:today}),card('s','shelf',1,{wait_for:'x',wait_since:today}),
    card('dated',null,null,{plan_date:day,flow_order:1,wait_for:'x',wait_until:day,wait_since:today}),card('a',null,null)],[{id:'shelf',position:1}]);
  const by=(id:string)=>tasks.find(t=>t.id===id)!;
  assert.deepEqual([by('p').proto,by('p').pile_id,by('p').pile_order,trigger(by('p'))],[true,null,4,['',null,today]]);
  assert.deepEqual([by('s').pile_id,by('s').pile_order],[null,null]);
  assert.deepEqual(trigger(by('dated')),[null,null,null]);
  assert.deepEqual(view(tasks,piles),[[],['a']],'the orphan rule leaves waiting work alone');
});

test('the preview store keeps waiting work with its trigger and revives it like the Rust store',()=>{
  let s:Snapshot={epoch:'e',tasks:[],settings:settings(),layouts:[],trash:[],piles:[]};
  const run=(action:Action)=>{s=previewMutation(s,{request_id:crypto.randomUUID(),epoch:'e',issued_at:Date.now(),action},new Set());return s;};
  const rev=(...ids:string[])=>ids.map(id=>({id,revision:s.tasks.find(t=>t.id===id)!.revision}));
  const by=(id:string)=>s.tasks.find(t=>t.id===id)!;
  for(const id of ['p','a','b','keep'])run({type:'create',id,title:id});
  run({type:'place_unplanned',items:rev('a','b','keep'),pile:'shelf',create_at:1,index:0});
  run({type:'create_flow',id:'f',title:'f',date:day,duration:30});run({type:'create_flow',id:'g',title:'g',date:day,duration:30});
  run({type:'create_scheduled',id:'x',title:'고정',starts_at:day+'T10:00',duration:60});
  const before=structuredClone(s);
  run({type:'wait',items:rev('p','a','f','x'),trigger:'  김부장 결재  ',until:null,since:today});
  for(const id of ['p','a','f','x']){
    const t=by(id);assert.equal(t.revision,before.tasks.find(x=>x.id===id)!.revision+1);
    assert.deepEqual([t.plan_date,t.starts_at,t.flow_order,t.pile_id,t.pile_order,t.completed,...trigger(t)],[null,null,null,null,null,false,'김부장 결재',null,today]);
  }
  assert.equal(by('p').proto,true);assert.equal(by('a').proto,false);
  assert.deepEqual(view(s.tasks,s.piles!),[[],['b','keep']]);assert.deepEqual(by('g').flow_order,2,'the day keeps its other order numbers');
  // A new trigger keeps the day it was first pushed.
  run({type:'wait',items:rev('a'),trigger:'',until:'2026-10-20',since:'2026-10-13'});assert.deepEqual(trigger(by('a')),['','2026-10-20',today]);
  run({type:'create',id:'q',title:'q'});
  run({type:'revive',items:rev('x','p','a')});
  assert.deepEqual(view(s.tasks,s.piles!),[['p','q'],['x','a','b','keep']]);assert.equal(by('p').proto,true);
  assert.deepEqual(waitCards(s.tasks).map(t=>t.id),['f']);assert.deepEqual(trigger(by('x')),[null,null,null]);
  const kept=structuredClone(s);
  assert.throws(()=>run({type:'revive',items:rev('a')}),{code:'validation'});
  assert.throws(()=>run({type:'revive',items:[{id:'f',revision:1}]}),{code:'conflict'});
  for(const action of [
    {type:'wait',items:rev('a'),trigger:'',until:null,since:'2026-02-30'},{type:'wait',items:rev('a'),trigger:'',until:'2026-10-32',since:today},
    {type:'wait',items:rev('a'),trigger:'',until:null,since:'10/11'},{type:'wait',items:[],trigger:'',until:null,since:today},
    {type:'wait',items:[...rev('a'),...rev('a')],trigger:'',until:null,since:today},{type:'wait',items:rev('a'),trigger:'가'.repeat(67),until:null,since:today}
  ] satisfies Action[])assert.throws(()=>run(action),{code:'validation'},JSON.stringify(action));
  assert.throws(()=>run({type:'wait',items:[{id:'b',revision:9}],trigger:'',until:null,since:today}),{code:'conflict'});
  assert.deepEqual(s,kept);
  run({type:'wait',items:rev('a'),trigger:`  ${'가'.repeat(66)}  `,until:null,since:today});assert.equal(by('a').wait_for!.length,66);
});

test('a date, a completion or a placement ends the wait in the preview; trash and pieces keep it',()=>{
  let s:Snapshot={epoch:'e',tasks:[],settings:settings(),layouts:[],trash:[],piles:[]};
  const run=(action:Action)=>{s=previewMutation(s,{request_id:crypto.randomUUID(),epoch:'e',issued_at:Date.now(),action},new Set());return s;};
  const rev=(...ids:string[])=>ids.map(id=>({id,revision:s.tasks.find(t=>t.id===id)!.revision}));
  const by=(id:string)=>s.tasks.find(t=>t.id===id)!;
  for(const id of ['a','b','c','d','e'])run({type:'create',id,title:id});
  run({type:'wait',items:rev('a','b','c','d','e'),trigger:'회신',until:'2026-10-20',since:today});
  const edit=(t:Task,plan_date:string|null):Action=>({type:'update',id:t.id,expected_revision:t.revision,title:t.title,body:t.body,starts_at:null,duration:t.duration,plan_date});
  run(edit(by('a'),day));assert.deepEqual([by('a').plan_date,by('a').flow_order,by('a').proto,...trigger(by('a'))],[day,1,false,null,null,null]);
  run({type:'ship_flow',date:day,items:rev('b')});assert.deepEqual([by('b').flow_order,...trigger(by('b'))],[2,null,null,null]);
  const c=by('c');run(edit(c,null));assert.deepEqual([by('c').pile_id??null,by('c').wait_since],[null,today]);
  run({type:'place_unplanned',items:rev('c'),pile:null,index:0});
  assert.deepEqual(view(s.tasks,s.piles!),[['c'],[]]);assert.deepEqual(trigger(by('c')),[null,null,null]);assert.equal(by('c').revision,c.revision+2);
  run({type:'set_completed',id:'d',expected_revision:by('d').revision,completed:true,date:today});assert.deepEqual([by('d').plan_date,...trigger(by('d'))],[today,null,null,null]);
  const e=by('e');run({type:'delete',id:'e',expected_revision:e.revision});assert.equal(s.trash[0].wait_since,today);
  run({type:'restore_trashed',id:'e'});assert.deepEqual(by('e'),{...e,revision:e.revision+1,pile_id:null,pile_order:null});assert.deepEqual(s.piles,[]);
  assert.throws(()=>run({type:'wait',items:rev('d'),trigger:'',until:null,since:today}),{code:'conflict'});
  run({type:'create',id:'z',title:'z'});
  assert.throws(()=>run({type:'merge_unplanned',id:'m',items:rev('z','e')}),{code:'conflict'});
  run({type:'split_pieces',id:'e',expected_revision:by('e').revision,date:today,pieces:[{id:'e',title:'앞',body:'',duration:15,proto:false,completed:false},{id:'e2',title:'뒤',body:'',duration:15,proto:false,completed:false},{id:'e3',title:'끝',body:'',duration:15,proto:false,completed:true}]});
  assert.deepEqual(waitCards(s.tasks).map(t=>[t.id,...trigger(t)]),[['e','회신','2026-10-20',today],['e2','회신','2026-10-20',today]]);
  assert.deepEqual([by('e3').completed,by('e3').plan_date,by('e3').wait_since??null],[true,today,null]);assert.deepEqual(view(s.tasks,s.piles!),[['z','c'],[]]);
});
