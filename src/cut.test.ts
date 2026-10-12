import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addPiece,cut,fromChecklist,halve,initialSegs,join,knifeAt,move,piecesOf,sizedTotal,trade,type Seg} from './cut.ts';
import {previewMutation} from './preview.ts';
import {inboxCards} from './bench.ts';
import type {Snapshot,Task} from './types.ts';

const task=(extra:Partial<Task>={}):Task=>({id:'t',title:'설계 문서 작성',body:'메모',starts_at:null,duration:180,completed:false,revision:1,plan_date:null,flow_order:null,pile_id:null,pile_order:1,...extra});
const shape=(segs:Seg[])=>segs.map(s=>`${s.name||'-'}:${s.sized?s.duration:'?'}${s.done?'✓':''}`);

test('the knife cuts in 15-minute steps with 15 on each side; Enter halves or starts an unsized piece',()=>{
  const [s]=initialSegs(task());
  assert.equal(knifeAt(s,7),15);assert.equal(knifeAt(s,175),165);assert.equal(knifeAt(s,52),45);
  const once=cut([s],0,52)!;assert.deepEqual(shape(once.segs),['-:45','-:135']);assert.equal(once.focus,once.segs[1].key);
  assert.equal(cut([{...s,duration:15}],0,10),null,'too short to cut');
  assert.deepEqual(shape(halve(once.segs,1).segs),['-:45','-:75','-:60']);
  const proto=initialSegs(task({proto:true,duration:30}));
  assert.deepEqual(shape(halve(proto,0).segs),['-:?','-:?'],'a proto cannot be cut, so Enter lists another piece');
});

test('seams trade time and keep the total; the bottom edge changes it; an unsized piece gets its first length',()=>{
  const segs=cut(initialSegs(task()),0,60)!.segs;
  assert.deepEqual(shape(trade(segs,0,30)),['-:90','-:90']);assert.equal(sizedTotal(trade(segs,0,500)),180);
  assert.deepEqual(shape(trade(segs,0,500)),['-:165','-:15'],'each side keeps 15');
  assert.deepEqual(shape(trade(segs,1,45)),['-:60','-:165']);
  assert.deepEqual(shape(trade(addPiece(segs,'추가'),2,15)),['-:60','-:120','추가:45']);
});

test('joining undoes a cut; pieces reorder; checklist items become pieces and leave the memo',()=>{
  const segs=cut(initialSegs(task()),0,60)!.segs;
  assert.deepEqual(shape(join([{...segs[0],name:'앞'},segs[1]],0)),['앞:180']);
  assert.deepEqual(shape(move([{...segs[0],name:'a'},{...segs[1],name:'b'}],0,1)),['b:120','a:60']);
  const body='배경\n[x] 요구사항 확인\n[ ] 초안 작성\n- [ ] 리뷰 반영';
  const items=fromChecklist(body,initialSegs(task({body})))!;
  assert.deepEqual(shape(items.segs),['요구사항 확인:60✓','초안 작성:60','리뷰 반영:60']);assert.equal(items.body,'배경');
  assert.deepEqual(shape(fromChecklist(body,initialSegs(task({body,proto:true})))!.segs),['요구사항 확인:?✓','초안 작성:?','리뷰 반영:?']);
  assert.equal(fromChecklist('[ ] 하나',initialSegs(task())),null);
});

test('committed pieces: unnamed ones repeat the title and take the memo; unsized ones are protos only on the bench',()=>{
  let n=0;const id=()=>'n'+(++n);
  const segs:Seg[]=[{key:'a',name:'',duration:45,sized:true,done:false},{key:'b',name:'초안',duration:30,sized:true,done:true},{key:'c',name:'',duration:30,sized:false,done:false}];
  assert.deepEqual(piecesOf(task(),' 새 제목 ',' 메모 ',segs,id),[
    {id:'t',title:'새 제목',body:' 메모 ',duration:45,proto:false,completed:false},
    {id:'n1',title:'초안',body:'',duration:30,proto:false,completed:true},
    {id:'n2',title:'새 제목',body:' 메모 ',duration:30,proto:true,completed:false}]);
  assert.equal(piecesOf(task({plan_date:'2026-10-14',flow_order:2,pile_order:null}),'','',segs,id)[2].proto,false);
  assert.equal(piecesOf(task(),'  ','',segs,id)[0].title,'설계 문서 작성');
});

test('the preview store places pieces where the original stood, as the Rust store does',()=>{
  const day='2026-10-14';
  let s:Snapshot={epoch:'e',settings:{revision:1,days:Array.from({length:7},()=>({enabled:true,start:540,end:1080,breaks:[]}))},layouts:[],trash:[],piles:[],tasks:[
    task({id:'x',pile_order:1}),task({id:'t',pile_order:2}),task({id:'y',pile_order:3}),
    task({id:'a',plan_date:day,flow_order:1,pile_order:null}),task({id:'f',plan_date:day,flow_order:2,pile_order:null}),task({id:'b',plan_date:day,flow_order:3,pile_order:null})]};
  const run=(id:string,pieces:{id:string;completed?:boolean;duration?:number;title?:string;body?:string}[],date?:string)=>{const t=s.tasks.find(x=>x.id===id)!;
    s=previewMutation(s,{request_id:'r'+Math.random(),epoch:'e',issued_at:Date.now(),action:{type:'split_pieces',id,expected_revision:t.revision,date,pieces:pieces.map(p=>({title:'조각',body:'',duration:30,proto:false,completed:false,...p}))}},new Set());};
  run('t',[{id:'t'},{id:'n1'},{id:'n2',completed:true}],'2026-10-11');
  assert.deepEqual(inboxCards(s.tasks).map(c=>c.id),['x','t','n1','y']);
  assert.deepEqual(s.tasks.find(t=>t.id==='n2')!.plan_date,'2026-10-11');
  run('f',[{id:'f'},{id:'f2'}]);
  assert.deepEqual(s.tasks.filter(t=>t.plan_date===day).sort((p,q)=>p.flow_order!-q.flow_order!).map(t=>t.id),['a','f','f2','b']);
  assert.throws(()=>run('a',[{id:'a'},{id:'f2'}]),/조각/);
  const before=structuredClone(s);
  for(const pieces of [
    [{id:'a',duration:1455}],[{id:'a',title:'가'.repeat(667)}],[{id:'a',body:'x'.repeat(200001)}],
    [{id:'a'},{id:'가'.repeat(34)}],Array.from({length:101},(_,n)=>({id:n?'new'+n:'a'}))
  ]){assert.throws(()=>run('a',pieces),{code:'validation'});assert.deepEqual(s,before);}
  const fixed:Snapshot={...s,tasks:[task({id:'w',plan_date:day,starts_at:day+'T10:00',flow_order:null,pile_order:null,duration:60}),task({id:'m',plan_date:day,starts_at:day+'T11:00',flow_order:null,pile_order:null,duration:30})]};
  const pieces=[{id:'w',title:'  준비  ',body:'',duration:60,completed:false,proto:false},{id:'w2',title:'정리',body:'',duration:30,completed:false,proto:false}];
  const command={request_id:'fixed',epoch:'e',issued_at:Date.now(),action:{type:'split_pieces' as const,id:'w',expected_revision:1,pieces}};
  const kept=structuredClone(fixed);assert.throws(()=>previewMutation(fixed,command,new Set()),{code:'overlap'});assert.deepEqual(fixed,kept);
  pieces[0].duration=30;
  const cutFixed=previewMutation(fixed,command,new Set());
  assert.deepEqual(cutFixed.tasks.filter(t=>t.id!=='m').map(t=>[t.title,t.starts_at]),[['준비',day+'T10:00'],['정리',day+'T10:30']]);
});
