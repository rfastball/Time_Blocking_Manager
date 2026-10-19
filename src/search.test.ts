import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSearch,search} from './search.ts';
import type {Task,Trashed} from './types.ts';

const task=(id:string,title:string,extra:Partial<Task>={}):Task=>({id,title,body:'',starts_at:null,duration:30,completed:false,revision:1,plan_date:null,flow_order:null,pile_id:null,pile_order:1,...extra});
const source={
  piles:[{id:'shelf',position:1}],
  tasks:[
    task('in','설계 문서 정리'),
    task('top','설계 문서 작성',{pile_id:'shelf',pile_order:1}),task('p2','자료 조사',{pile_id:'shelf',pile_order:2}),
    task('f1','회의록',{plan_date:'2026-10-14',flow_order:1,pile_order:null}),task('f2','설계 검토',{plan_date:'2026-10-14',flow_order:2,pile_order:null}),
    task('fx','설계 워크숍',{plan_date:'2026-10-15',starts_at:'2026-10-15T14:00',pile_order:null}),
    task('done','설계 초안',{plan_date:'2026-10-09',flow_order:1,completed:true,pile_order:null}),
    task('old','설계 메모',{completed:true,pile_order:null}),
    task('memo','주간 보고',{plan_date:'2026-10-14',flow_order:3,pile_order:null,body:'설계 일정 공유'}),
  ],
  trash:[{...task('gone','설계 폐기안'),deleted_at:'2026-10-10T01:00:00Z'} as Trashed],
};

test('search finds titles and memos everywhere and says where each one is now',()=>{
  const hits=search(source,'설계');
  assert.deepEqual(hits.map(h=>[h.title,h.where]),[
    ['설계 문서 정리','들어옴'],['설계 문서 작성','선반 · 1번째'],
    ['설계 검토','10월 14일 · 순서 2'],['설계 워크숍','10월 15일 · 14:00'],
    ['설계 초안','10월 9일 · 완료'],['설계 메모','날짜 없는 완료'],['설계 폐기안','휴지통'],
    ['주간 보고','10월 14일 · 순서 3'],
  ]);
  assert.deepEqual(hits.map(h=>h.kind),['bench','bench','dated','dated','done','archive','trash','dated']);
});

test('the match is a plain partial match, any case, partly typed Korean included; nothing for blank input',()=>{
  assert.deepEqual(search({tasks:[task('a','SQLite 백업')]},'sqli').map(h=>h.id),['a']);
  assert.deepEqual(search(source,'설').length,8,'a lone syllable already matches');
  assert.deepEqual(search(source,'   '),[]);
  assert.deepEqual(search(source,'ㅅㄱ'),[],'no initial-consonant search');
  assert.equal(search(source,'설계',3).length,3);
  assert.deepEqual(search(source,'설계',-2),search(source,'설계').slice(0,-2));
  assert.deepEqual(search(source,'설계',0),[]);
  assert.deepEqual(search({tasks:[task('nfc','가 SQL',{body:'메모'})]},'가').map(h=>h.id),['nfc']);
});

test('a search projection owns one snapshot and returns independent hits; a replacement rebuilds text and places',()=>{
  const original={piles:[{id:'shelf',position:1},{id:'legacy',position:2}],tasks:[
    task('legacy','검색 구형',{pile_id:'legacy',pile_order:1}),
    task('shelf','검색 선반',{pile_id:'shelf',pile_order:2}),
    task('wait','검색 기다림',{wait_since:'2026-10-01',wait_for:' 검토 ',wait_until:'2026-10-22'}),
    task('late','검색 둘째',{plan_date:'2026-10-21',flow_order:2}),
    task('early','검색 첫째',{plan_date:'2026-10-21',flow_order:1}),
    task('other','검색 다른 날',{plan_date:'2026-10-20',flow_order:1}),
  ]};
  const before=structuredClone(original),find=createSearch(original),hits=find('검색');
  assert.deepEqual(hits.map(h=>[h.id,h.where]),[
    ['shelf','선반 · 1번째'],['legacy','선반 · 2번째'],['wait','기다림 · 검토 · 10/22 이후'],
    ['other','10월 20일 · 순서 1'],['late','10월 21일 · 순서 2'],['early','10월 21일 · 순서 1'],
  ]);
  hits[0].title='외부 수정';hits[0].where='외부 수정';hits.splice(1);
  assert.equal(find('검색')[0].title,'검색 선반');
  assert.equal(find('검색')[0].where,'선반 · 1번째');
  const next={...original,tasks:original.tasks.map(t=>t.id==='shelf'?{...t,title:'바뀐 제목',body:'새 메모',pile_id:null}:t)};
  const updated=createSearch(next);
  assert.equal(find('검색').length,6,'the old snapshot remains usable');
  assert.equal(updated('검색').length,5,'replacement removes the old title');
  assert.deepEqual(updated('새 메모').map(h=>[h.id,h.where,h.inTitle]),[['shelf','들어옴',false]]);
  assert.deepEqual(original,before,'building and querying never sort or edit source arrays');
});
