import {test} from 'node:test';
import assert from 'node:assert/strict';
import {benchOrder,inboxCards,normalize,place,placeLabel,shelfCards} from './bench.ts';
import {previewMutation} from './preview.ts';
import {requestLifetimeMs} from './capture.ts';
import type {Action,Pile,Settings,Snapshot,Task} from './types.ts';

const card=(id:string,pile:string|null,order:number,extra:Partial<Task>={}):Task=>({id,title:id,body:'',starts_at:null,duration:30,completed:false,revision:1,plan_date:null,flow_order:null,pile_id:pile,pile_order:order,...extra});
const view=(tasks:Task[],piles:Pile[])=>[inboxCards(tasks).map(t=>t.id),shelfCards(tasks,piles).map(t=>t.id)];
const settings=():Settings=>({revision:1,days:Array.from({length:7},()=>({enabled:true,start:540,end:1080,breaks:[]})),exceptions:[],weekly_target:2400,work_days:5,routines:[]});

test('준비 reads the 들어옴 and the shelf in their own orders; elsewhere the shelf comes first',()=>{
  const tasks=[card('a','shelf',2),card('b',null,2),card('c','shelf',1),card('d','old',1),card('e',null,1),card('dated',null,0,{plan_date:'2026-10-14',pile_order:null}),card('done',null,0,{completed:true,pile_order:null})];
  const piles=[{id:'old',position:2},{id:'shelf',position:1}];
  assert.deepEqual(view(tasks,piles),[['e','b'],['c','a','d']],'an unmigrated pile reads after the shelf');
  assert.deepEqual(benchOrder(tasks,piles).map(t=>t.id),['c','a','d','e','b']);
  assert.equal(placeLabel(tasks[0],tasks,piles),'선반 · 2번째');assert.equal(placeLabel(tasks[1],tasks,piles),'들어옴');
});

test('placing inserts before the card at the index among the others and keeps order numbers dense',()=>{
  const tasks=[card('a','shelf',1),card('b','shelf',2),card('c','shelf',3),card('x',null,1)];
  const ids=(list:Task[])=>shelfCards(list).map(t=>t.id);
  assert.deepEqual(ids(place(tasks,['x'],'shelf',1)),['a','x','b','c']);
  assert.deepEqual(ids(place(tasks,['c'],'shelf',0)),['c','a','b']);
  assert.deepEqual(ids(place(tasks,['a','x'],'shelf',99)),['b','c','a','x']);
});

test('normalizing shelves sized orphans on top, sizes protos on the shelf, drops empty piles and renumbers',()=>{
  const {tasks,piles}=normalize([card('a','shelf',5),card('b',null,7),card('d','p1',1,{plan_date:'2026-10-14',proto:true}),card('n',null,0,{pile_order:null,proto:true}),
    card('back',null,0,{pile_order:null}),card('s','shelf',9,{proto:true})],[{id:'p1',position:3},{id:'shelf',position:9}]);
  assert.deepEqual(piles,[{id:'shelf',position:1}]);
  const by=(id:string)=>tasks.find(t=>t.id===id)!;
  assert.deepEqual(view(tasks,piles),[['n','b'],['back','a','s']]);
  assert.deepEqual([by('d').pile_id,by('d').pile_order,by('d').proto],[null,null,false]);
  assert.deepEqual([by('n').proto,by('s').proto],[true,false]);
  assert.deepEqual(normalize([card('back',null,0,{pile_order:null})],[]).piles,[{id:'shelf',position:1}],'the shelf appears with its first card');
});

test('the preview store follows the 준비 rules of the Rust store',()=>{
  let s:Snapshot={epoch:'e',tasks:[],settings:{revision:1,days:[]},layouts:[],trash:[],piles:[]};
  const run=(action:Action)=>{s=previewMutation(s,{request_id:crypto.randomUUID(),epoch:'e',issued_at:Date.now(),action},new Set());return s;};
  const rev=(...ids:string[])=>ids.map(id=>({id,revision:s.tasks.find(t=>t.id===id)!.revision}));
  for(const id of ['a','b','c'])run({type:'create',id,title:id});
  assert.deepEqual(view(s.tasks,s.piles!),[['c','b','a'],[]]);assert.ok(s.tasks.every(t=>t.proto));
  // Choosing a length, even the same one, sizes it in place.
  const a=s.tasks.find(t=>t.id==='a')!;
  run({type:'update',id:'a',expected_revision:a.revision,title:'a',body:'',starts_at:null,duration:30,plan_date:null,sized:true});
  assert.equal(s.tasks.find(t=>t.id==='a')!.proto,false);assert.deepEqual(view(s.tasks,s.piles!),[['c','b','a'],[]]);
  // The first card creates the shelf; a proto put there is sized.
  run({type:'place_unplanned',items:rev('a'),pile:'shelf',create_at:1,index:0});
  run({type:'place_unplanned',items:rev('b'),pile:'shelf',index:0});
  assert.deepEqual(view(s.tasks,s.piles!),[['c'],['b','a']]);assert.equal(s.tasks.find(t=>t.id==='b')!.proto,false);
  run({type:'ship_flow',date:'2026-10-14',items:rev('b','a')});
  assert.deepEqual(s.piles,[]);assert.deepEqual(s.tasks.filter(t=>t.plan_date).sort((x,y)=>x.flow_order!-y.flow_order!).map(t=>t.id),['b','a']);
  // Back by a button: top of the shelf. A cleared day: on top of it in the day's order.
  const b=s.tasks.find(t=>t.id==='b')!;
  run({type:'update',id:'b',expected_revision:b.revision,title:'b',body:'',starts_at:null,duration:30,plan_date:null});
  assert.deepEqual(view(s.tasks,s.piles!),[['c'],['b']]);
  run({type:'clear_day',date:'2026-10-14',expected_tasks:rev('a')});
  assert.deepEqual(view(s.tasks,s.piles!),[['c'],['a','b']]);
  // Trash: back to its place on the shelf.
  run({type:'delete',id:'b',expected_revision:s.tasks.find(t=>t.id==='b')!.revision});run({type:'restore_trashed',id:'b'});
  assert.deepEqual(view(s.tasks,s.piles!),[['c'],['a','b']]);
});

test('the preview store records 준비 completion on the given day and returns old dateless ones to the shelf',()=>{
  let s:Snapshot={epoch:'e',tasks:[card('a',null,1,{proto:true}),card('old',null,0,{completed:true,pile_order:null})],settings:{revision:1,days:[]},layouts:[],trash:[],piles:[]};
  const run=(action:Action)=>{s=previewMutation(s,{request_id:crypto.randomUUID(),epoch:'e',issued_at:Date.now(),action},new Set());return s;};
  assert.throws(()=>run({type:'set_completed',id:'a',expected_revision:1,completed:true}),/날짜/);
  run({type:'set_completed',id:'a',expected_revision:1,completed:true,date:'2026-10-11'});
  const a=s.tasks.find(t=>t.id==='a')!;
  assert.deepEqual([a.completed,a.plan_date,a.flow_order,a.proto,a.pile_order],[true,'2026-10-11',1,false,null]);
  assert.deepEqual(s.layouts,[]);
  assert.throws(()=>run({type:'update',id:'a',expected_revision:a.revision,title:'a',body:'',starts_at:null,duration:30,plan_date:null}),/완료한 작업/);
  run({type:'set_completed',id:'old',expected_revision:1,completed:false});
  assert.deepEqual(view(s.tasks,s.piles!),[[],['old']]);
});

test('merging creates one sized task in selection order at the first selected place and keeps whole originals in trash',()=>{
  const a=card('a','shelf',1),b=card('b','shelf',2,{title:'첫 작업',body:'메모\r\n- [x] 기존 확인',duration:45,proto:true,board_x:700,board_y:-200}),c=card('c','shelf',3),d=card('d',null,1,{title:'다음\n작업',body:'[ ] 남은 일',duration:15,board_x:-100,board_y:200});
  const s:Snapshot={epoch:'e',tasks:[a,b,c,d],settings:settings(),layouts:[],trash:[],piles:[{id:'shelf',position:1}]},receipts=new Set<string>();
  const command={request_id:'merge',epoch:'e',issued_at:Date.now(),action:{type:'merge_unplanned' as const,id:'merged',items:[{id:'b',revision:1},{id:'d',revision:1}]}};
  const result=previewMutation(s,command,receipts),merged=result.tasks.find(t=>t.id==='merged')!;
  assert.deepEqual(view(result.tasks,result.piles!),[[],['a','merged','c']]);
  assert.deepEqual([merged.title,merged.duration,merged.proto,merged.revision,merged.plan_date,merged.starts_at],['첫 작업',60,false,1,null,null]);
  assert.equal(merged.body,'- [ ] 첫 작업\n\n메모\r\n- [x] 기존 확인\n\n- [ ] 다음 작업\n\n[ ] 남은 일');
  assert.deepEqual(result.trash.map(({deleted_at:_,...t})=>t),[b,d]);
  assert.deepEqual(previewMutation(result,command,receipts),result,'retry never duplicates the replacement or originals');
  const restored=previewMutation(result,{request_id:'restore',epoch:'e',issued_at:Date.now(),action:{type:'restore_trashed',id:'b'}},receipts);
  assert.equal(restored.tasks.find(t=>t.id==='b')!.body,b.body);
});

test('merge rejects stale sources, ineligible work, reused ids and oversized aggregates without any state change',()=>{
  const a=card('a','p',1,{duration:720}),b=card('b','p',2,{duration:735}),day='2026-10-14';
  const base:Snapshot={epoch:'e',tasks:[a,b,card('done',null,0,{completed:true,pile_order:null}),card('dated',null,0,{plan_date:day,flow_order:1,pile_order:null})],settings:settings(),layouts:[{date:day,anchor:600}],trash:[{...card('trash',null,1),deleted_at:'2026-10-11T00:00:00Z'}],piles:[{id:'p',position:1}]};
  const item=(id:string,revision=1)=>({id,revision});
  const cases:{snapshot:Snapshot;id:string;items:{id:string;revision:number}[];code:string}[]=[
    {snapshot:base,id:'new',items:[item('a')],code:'validation'},
    {snapshot:base,id:'new',items:[item('a'),item('a')],code:'validation'},
    {snapshot:base,id:'new',items:[item('a'),item('b',2)],code:'conflict'},
    ...['done','dated','missing'].map(id=>({snapshot:base,id:'new',items:[item('a'),item(id)],code:'conflict'})),
    ...['a','trash','', '가'.repeat(34)].map(id=>({snapshot:base,id,items:[item('a'),item('b')],code:'validation'})),
    {snapshot:base,id:'new',items:[item('a'),item('b')],code:'validation'},
    {snapshot:{...base,tasks:[{...a,duration:30,body:'가'.repeat(66666)},{...b,duration:30}]},id:'new',items:[item('a'),item('b')],code:'validation'}
  ];
  for(const {snapshot,id,items,code} of cases){const before=structuredClone(snapshot),receipts=new Set<string>();
    assert.throws(()=>previewMutation(snapshot,{request_id:'merge',epoch:'e',issued_at:Date.now(),action:{type:'merge_unplanned',id,items}},receipts),{code});assert.deepEqual(snapshot,before);assert.equal(receipts.size,0);
  }
  const boundary={...base,tasks:[a,{...b,duration:720}]};
  const accepted=previewMutation(boundary,{request_id:'merge',epoch:'e',issued_at:Date.now(),action:{type:'merge_unplanned',id:'new',items:[item('b'),item('a')]}},new Set());
  assert.equal(accepted.tasks.find(t=>t.id==='new')!.duration,1440);
});

test('shipping several cards inserts in selection order before the destination flow card',()=>{
  const day='2026-10-14',s:Snapshot={epoch:'e',tasks:[card('a',null,1),card('b',null,2),...['first','target','last'].map((id,n)=>card(id,null,0,{plan_date:day,flow_order:n+1,pile_order:null}))],settings:settings(),trash:[],piles:[],layouts:[]};
  const items=(...ids:string[])=>ids.map(id=>({id,revision:1}));
  const run=(snapshot:Snapshot,action:Action)=>previewMutation(snapshot,{request_id:crypto.randomUUID(),epoch:'e',issued_at:Date.now(),action},new Set());
  for(const action of [
    {type:'ship_flow',date:day,items:items('a','b'),before:'missing'},
    {type:'ship_flow',date:day,items:items('a','target'),before:'target'}
  ] satisfies Action[]){assert.throws(()=>run(s,action),{code:'validation'});assert.equal(s.tasks[3].flow_order,2);}
  const result=run(s,{type:'ship_flow',date:day,items:items('b','a'),before:'target'}),order=(snapshot:Snapshot)=>snapshot.tasks.filter(t=>t.plan_date===day).sort((a,b)=>a.flow_order!-b.flow_order!).map(t=>t.id);
  assert.deepEqual(order(result),['first','b','a','target','last']);assert.equal(result.tasks.find(t=>t.id==='target')!.revision,1);
  const moved=run(result,{type:'ship_flow',date:day,items:['last','b'].map(id=>({id,revision:result.tasks.find(t=>t.id===id)!.revision})),before:'target'});
  assert.deepEqual(order(moved),['first','a','last','b','target']);
});

test('the preview rejects stale editors and settings and trims accepted titles like Rust',()=>{
  let s:Snapshot={epoch:'e',tasks:[],settings:settings(),layouts:[],trash:[],piles:[]};
  const run=(action:Action)=>s=previewMutation(s,{request_id:crypto.randomUUID(),epoch:'e',issued_at:Date.now(),action},new Set());
  for(const action of [
    {type:'create',id:'a',title:'  업무  '},
    {type:'create_scheduled',id:'b',title:'  고정  ',starts_at:'2026-10-14T09:00',duration:30},
    {type:'create_flow',id:'c',title:'  유동  ',date:'2026-10-14',duration:30}
  ] satisfies Action[])run(action);
  assert.deepEqual(s.tasks.map(t=>t.title),['업무','고정','유동']);
  s.tasks.find(t=>t.id==='c')!.flow_order=99;
  run({type:'update',id:'c',expected_revision:1,title:'유동',body:'',starts_at:null,duration:30,plan_date:'2026-10-15'});
  assert.equal(s.tasks.find(t=>t.id==='c')!.flow_order,1,'an old day\'s order is not carried into the new day');
  const update:Action={type:'update',id:'a',expected_revision:1,title:'  최신  ',body:'메모',starts_at:null,duration:45,plan_date:null};
  run(update);assert.equal(s.tasks.find(t=>t.id==='a')!.title,'최신');
  run({type:'set_settings',expected_revision:1,days:settings().days});
  const before=structuredClone(s);
  for(const action of [update,{type:'delete',id:'a',expected_revision:1},{type:'set_completed',id:'a',expected_revision:1,completed:true,date:'2026-10-11'},
    {type:'set_settings',expected_revision:1,days:settings().days},
    {type:'set_schedule',expected_revision:1,days:settings().days,exceptions:[],weekly_target:2400,work_days:5,move_conflicts:false},
    {type:'set_routines',expected_revision:1,routines:[]},{type:'delete',id:'gone',expected_revision:1}] satisfies Action[]){
    assert.throws(()=>run(action),{code:'conflict'},action.type);assert.deepEqual(s,before);
  }
  assert.throws(()=>previewMutation(s,{request_id:'r',epoch:'old',issued_at:Date.now(),action:update},new Set()),{code:'epoch'});
  assert.throws(()=>previewMutation(s,{request_id:'',epoch:'e',issued_at:Date.now(),action:update},new Set()),{code:'validation'});
  const now=1800000000000,command={request_id:'r',epoch:'e',issued_at:now,action:{type:'create' as const,id:'new',title:'업무'}};
  assert.equal(previewMutation(s,command,new Set(),now+requestLifetimeMs-1).tasks.length,s.tasks.length+1);
  const receipts=new Set<string>(),applied=previewMutation(s,command,receipts,now);
  assert.deepEqual(previewMutation(applied,command,receipts,now+requestLifetimeMs),applied,'an existing receipt acknowledges instead of executing after expiration');
  assert.deepEqual(previewMutation(applied,command,receipts,now-1),applied,'an existing receipt acknowledges despite clock skew');
  assert.throws(()=>previewMutation(applied,{...command,issued_at:now+1},receipts,now),{code:'validation'},'request payload cannot change');
  assert.throws(()=>previewMutation(s,command,new Set(),now+requestLifetimeMs),{code:'expired'});
  const {issued_at:_,...legacy}=command;
  assert.throws(()=>previewMutation(s,legacy,new Set(),now),{code:'expired'});assert.deepEqual(s,before);
});

test('the preview rejects invalid command inputs without changing work, trash, piles or anchors',()=>{
  const day='2026-10-14',a=card('a','p',1),f=card('f',null,0,{plan_date:day,flow_order:1,pile_order:null}),g=card('g',null,0,{plan_date:day,flow_order:2,pile_order:null});
  const s:Snapshot={epoch:'e',settings:settings(),tasks:[a,f,g],trash:[{...card('deleted',null,1),deleted_at:'2026-10-11T00:00:00Z'}],piles:[{id:'p',position:1}],layouts:[{date:day,anchor:540}]};
  const before=structuredClone(s),occurrences=new Set(['kept:2026-10-11']),item={id:'a',revision:1},fi={id:'f',revision:1};
  const update:Action={type:'update',id:'a',expected_revision:1,title:'업무',body:'',starts_at:null,duration:30,plan_date:null};
  const cases:Action[]=[
    {type:'create',id:'a',title:'중복'},{type:'create',id:'deleted',title:'휴지통 중복'},
    {type:'create',id:'x',title:' '},{type:'create',id:'가'.repeat(34),title:'긴 식별자'},{type:'create',id:'x',title:'가'.repeat(667)},
    {...update,body:'가'.repeat(66667)},{...update,duration:1455},{...update,duration:NaN},
    {type:'create_flow',id:'x',title:'업무',date:'2026-02-30',duration:30},
    {type:'create_flow',id:'x',title:'업무',date:'2026-1-01',duration:30},
    {type:'create_scheduled',id:'x',title:'업무',starts_at:'2026-10-14T23:45',duration:30},
    {type:'create_scheduled',id:'x',title:'업무',starts_at:'2026-10-14T09:10',duration:30},
    {type:'create_scheduled',id:'x',title:'업무',starts_at:'2026-10-14T09:60',duration:30},
    {...update,starts_at:day+'T09:00',plan_date:'2026-10-15'},
    {...update,before:'f'},{...update,starts_at:day+'T09:00',plan_date:day,before:'f'},
    {type:'set_completed',id:'a',expected_revision:1,completed:true,date:'2026-02-30'},
    {type:'ensure_routines',from:day,to:'2026-10-13'},{type:'ensure_routines',from:day,to:'2026-12-15'},
    {type:'clear_day',date:'2026-02-30',expected_tasks:[]},
    {type:'clear_day',date:day,expected_tasks:[fi,fi]},
    {type:'complete_flow',date:day,items:[fi,fi],at:null},
    {type:'complete_flow',date:day,items:[fi],at:day+'T24:00'},
    {type:'complete_flow',date:day,items:[fi],at:'2026-10-15T09:00'},
    {type:'reflow',date:day,at:day+'T9:00'},
    {type:'reorder_flow',date:day,expected:[fi,fi]},
    {type:'purge_trashed',ids:['deleted','deleted']},
    {type:'place_unplanned',items:[item,item],pile:'p',index:0},
    {type:'place_unplanned',items:[item],pile:'p',index:-1},
    {type:'place_unplanned',items:[item],pile:'new',create_at:0,index:0},
    {type:'ship_flow',date:day,items:[]},{type:'ship_flow',date:day,items:[item,item]}
  ];
  for(const action of cases){
    assert.throws(()=>previewMutation(s,{request_id:'r',epoch:'e',issued_at:Date.now(),action},occurrences),{code:'validation'},JSON.stringify(action));
    assert.deepEqual(s,before);assert.deepEqual([...occurrences],['kept:2026-10-11']);
  }
  const fixed=previewMutation(s,{request_id:'r',epoch:'e',issued_at:Date.now(),action:{...update,starts_at:day+'T04:00',plan_date:day}},occurrences);
  assert.equal(fixed.tasks.find(t=>t.id==='a')!.starts_at,day+'T04:00','explicit off-hours are allowed');
});

test('the preview validates settings and generates routines atomically with independent saved values',()=>{
  const day='2026-10-14',occurrences=new Set<string>();
  let s:Snapshot={epoch:'e',settings:settings(),tasks:[],trash:[],piles:[],layouts:[]};
  const run=(action:Action)=>s=previewMutation(s,{request_id:crypto.randomUUID(),epoch:'e',issued_at:Date.now(),action},occurrences);
  const days=settings().days;
  run({type:'set_settings',expected_revision:1,days});days[0].start=0;assert.equal(s.settings.days[0].start,540);
  const routine={id:'r',title:'  정기 확인  ',body:'메모',weekdays:[2],start:540,duration:30};
  run({type:'set_routines',expected_revision:2,routines:[routine,{...routine,id:'off',start:480},{...routine,id:'overlap'}]});
  assert.equal(s.settings.routines![0].title,'정기 확인');routine.weekdays.push(3);assert.deepEqual(s.settings.routines![0].weekdays,[2]);
  const before=structuredClone(s),schedule:Action={type:'set_schedule',expected_revision:3,days:settings().days,exceptions:[],weekly_target:2400,work_days:5,move_conflicts:false};
  for(const action of [
    {...schedule,days:[]},{...schedule,weekly_target:-15},{...schedule,work_days:8},
    {...schedule,exceptions:[{date:'2026-02-30',kind:'custom',day:settings().days[0]}]},
    {...schedule,days:settings().days.map(d=>({...d,breaks:[{start:600,end:630,label:'a'},{start:615,end:645,label:'b'}]}))},
    {type:'set_routines',expected_revision:3,routines:[{...routine,weekdays:[2,2]}]},
    {type:'set_routines',expected_revision:3,routines:[{...routine,start:1425,duration:30}]}
  ] satisfies Action[]){assert.throws(()=>run(action),{code:'validation'});assert.deepEqual(s,before);}
  run({type:'ensure_routines',from:day,to:day});
  assert.deepEqual(s.tasks.map(t=>[t.starts_at,t.flow_order]),[[day+'T09:00',null],[null,1],[null,2]]);
  const generated=structuredClone(s);run({type:'ensure_routines',from:day,to:day});assert.deepEqual(s,generated);
  // A rejected batch must not remember its earlier successful occurrence.
  const broken={...before,settings:{...before.settings,routines:[before.settings.routines![0],{...before.settings.routines![1],body:'x'.repeat(200001)}]}};
  const brokenBefore=structuredClone(broken),markers=new Set<string>();
  assert.throws(()=>previewMutation(broken,{request_id:'r',epoch:'e',issued_at:Date.now(),action:{type:'ensure_routines',from:day,to:day}},markers),{code:'validation'});
  assert.deepEqual(broken,brokenBefore);assert.equal(markers.size,0);
});
