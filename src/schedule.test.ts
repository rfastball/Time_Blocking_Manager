import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatDuration,rangeTitle} from './format.ts';
import {agenda,calendarRefreshAllowed} from './today.ts';
import {placementIssue,selectionRange,splitDuration} from './placement.ts';
import type {Task,WorkingDay} from './types.ts';

const date='2026-10-08',rule:WorkingDay={enabled:true,start:540,end:1080,breaks:[{start:720,end:780,label:'점심'}]};
const task:Task={id:'a',title:'초안',body:'',starts_at:date+'T13:00',duration:90,completed:false,revision:1};

test('calendar selection includes the pointed quarter hour in either direction',()=>{
  assert.deepEqual(selectionRange(540,540),{start:540,duration:15});
  assert.deepEqual(selectionRange(540,585),{start:540,duration:60});
  assert.deepEqual(selectionRange(585,540),{start:540,duration:60});
});

test('durations and visible ranges retain minutes and month/year boundaries',()=>{
  assert.deepEqual([0,45,120,405].map(formatDuration),['0분','45분','2시간','6시간 45분']);
  assert.equal(rangeTitle('two','2026-10-26'),'10월 26일 – 11월 8일');
  assert.equal(rangeTitle('week','2027-01-01'),'2026년 12월 28일 – 2027년 1월 3일');
  assert.equal(rangeTitle('four','2026-12-28'),'2026년 12월 28일 – 2027년 1월 24일');
});
test('agenda enters current at start and overdue at end without completing tasks',()=>{
  const states=[779,780,869,870,null].map(now=>agenda(date,[task],rule,now).find(i=>i.kind==='task')).map(i=>i?.kind==='task'?i.state:null);
  assert.deepEqual(states,['upcoming','current','current','overdue','upcoming']);
  assert.equal(task.completed,false);
  const done=agenda(date,[{...task,completed:true}],rule,800).find(i=>i.kind==='task');
  assert.equal(done?.kind==='task'&&done.state,'done');
});
test('agenda fills only available gaps, in order, and excludes other dates',()=>{
  assert.deepEqual(agenda(date,[task,{...task,id:'other',starts_at:'2026-10-09T09:00'}],rule,null).map(i=>[i.kind,i.start,i.end]),[
    ['gap',540,720],['unavailable',720,780],['task',780,870],['gap',870,1080]
  ]);
  assert.deepEqual(agenda(date,[],{...rule,enabled:false},null),[]);
});
test('placement explains each refusal and permits touching boundaries and self moves',()=>{
  const cases:[number,number,WorkingDay,string][]=[
    [780,30,rule,'overlap'],[720,30,rule,'unavailable'],[525,15,rule,'outside'],[780,30,{...rule,enabled:false},'dayOff'],[781,30,rule,'grid']
  ];
  for(const [start,length,day,kind] of cases)assert.equal(placementIssue('new',date,start,length,day,[task])?.kind,kind);
  assert.equal(placementIssue('new',date,780,30,rule,[task])?.label,'‘초안’과 겹침');
  assert.equal(placementIssue('new',date,870,30,rule,[task]),null);
  assert.equal(placementIssue('a',date,780,90,rule,[task]),null);
});

test('split boundaries snap and preserve two nonempty blocks at both edges',()=>{
  assert.deepEqual([-50,14,22,23,75,100].map(position=>splitDuration(90,position)),[15,15,15,30,75,75]);
  assert.deepEqual([0,15,30].map(position=>splitDuration(30,position)),[15,15,15]);
});

test('clock refresh covers calendar views and waits until editing and gestures end',()=>{
  const idle={view:'today',ready:true,visible:true,dirty:false,input:false,modal:false,gesture:false};
  assert.deepEqual(['today','plan','inbox','settings'].map(view=>calendarRefreshAllowed({...idle,view})),[true,true,false,false]);
  for(const blocked of [{ready:false},{visible:false},{dirty:true},{input:true},{modal:true},{gesture:true}])assert.equal(calendarRefreshAllowed({...idle,...blocked}),false);
  assert.equal(calendarRefreshAllowed(idle),true);
});
