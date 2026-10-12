import {test} from 'node:test';
import assert from 'node:assert/strict';
import {search} from './search.ts';
import type {Task,Trashed} from './types.ts';

const task=(id:string,title:string,extra:Partial<Task>={}):Task=>({id,title,body:'',starts_at:null,duration:30,completed:false,revision:1,plan_date:null,flow_order:null,pile_id:null,pile_order:1,...extra});
const source={
  piles:[{id:'p',position:1}],
  tasks:[
    task('in','설계 문서 정리'),
    task('top','설계 문서 작성',{pile_id:'p',pile_order:1}),task('p2','자료 조사',{pile_id:'p',pile_order:2}),
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
    ['설계 문서 정리','작업대'],['설계 문서 작성','작업대'],
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
});
