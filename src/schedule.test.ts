import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatDuration,rangeTitle} from './format.ts';
import {agenda,dayPlan,calendarRefreshAllowed} from './today.ts';
import {placementIssue,selectionRange,splitDuration} from './placement.ts';
import {createTimeAxis,timeAxisForDays,expandTimeAxis,timeAxisLabelVisible} from './time-axis.ts';
import type {Task,WorkingDay} from './types.ts';
import {suppressGestureClick} from './calendar-gestures.ts';

const date='2026-10-08',rule:WorkingDay={enabled:true,start:540,end:1080,breaks:[{start:720,end:780,label:'점심'}]};
const task:Task={id:'a',title:'초안',body:'',starts_at:date+'T13:00',duration:90,completed:false,revision:1,plan_date:date,flow_order:null};

test('a completed drag suppresses its delayed click and keeps the next pointer or keyboard action',async()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'document'),document=new EventTarget();
  Object.defineProperty(globalThis,'document',{value:document,configurable:true});
  const click=(pointerId:number,detail=1)=>Object.assign(new Event('click',{cancelable:true}),{pointerId,detail});
  try{
    suppressGestureClick(7);
    await new Promise(resolve=>setTimeout(resolve,1));
    const dragged=click(7);document.dispatchEvent(dragged);assert.equal(dragged.defaultPrevented,true);
    const following=click(7);document.dispatchEvent(following);assert.equal(following.defaultPrevented,false);
    suppressGestureClick(7);
    const keyboard=click(-1,0);document.dispatchEvent(keyboard);assert.equal(keyboard.defaultPrevented,false);
    document.dispatchEvent(new Event('keydown'));
    const keyboardPointer=click(7);document.dispatchEvent(keyboardPointer);assert.equal(keyboardPointer.defaultPrevented,false);
    suppressGestureClick(7);document.dispatchEvent(new Event('pointerdown'));
    const nextPointer=click(7);document.dispatchEvent(nextPointer);assert.equal(nextPointer.defaultPrevented,false);
  }finally{
    document.dispatchEvent(new Event('pointerdown'));
    if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');
  }
});

test('focused time axes preserve all-day boundaries and invert compressed coordinates',()=>{
  for(const axis of [timeAxisForDays([rule],1.2),createTimeAxis(0,1440,.8),createTimeAxis(1380,1440,1)]){
    assert.equal(axis.position(0),0);assert.equal(axis.position(1440),axis.height);
    assert.equal(axis.minute(-100),0);assert.equal(axis.minute(axis.height+100),1440);
    for(const minute of [0,15,180,510,540,720,1080,1110,1380,1425,1440])assert.ok(Math.abs(axis.minute(axis.position(minute))-minute)<1e-8,`${minute} must map back to itself`);
  }
  const axis=timeAxisForDays([rule],1.2);
  assert.equal(axis.start,510);assert.equal(axis.end,1110);
  const workingHour=axis.position(600)-axis.position(540);
  assert.ok(axis.position(axis.start)<workingHour,'morning off-hours fit within one working-hour height');
  assert.ok(axis.height-axis.position(axis.end)<workingHour,'evening off-hours fit within one working-hour height');
  assert.equal(axis.position(555)-axis.position(540),15*axis.scale);
  assert.ok(axis.position(60)-axis.position(0)<axis.position(600)-axis.position(540));
  assert.equal(timeAxisLabelVisible(axis,60),false);assert.equal(timeAxisLabelVisible(axis,600),true);
  assert.deepEqual([timeAxisForDays([{...rule,enabled:false}]).start,timeAxisForDays([]).end],[510,1110]);
});

test('drag expansion opens the pointed outer hours without shrinking the working range',()=>{
  const axis=timeAxisForDays([rule]),morning=expandTimeAxis(axis,420),evening=expandTimeAxis(morning,1230);
  assert.equal(expandTimeAxis(axis,720),axis);
  assert.deepEqual([morning.start,morning.end],[360,1110]);assert.deepEqual([evening.start,evening.end],[360,1320]);
  assert.equal(morning.position(435)-morning.position(420),15);
  assert.equal(evening.position(1245)-evening.position(1230),15);
  const full=expandTimeAxis(expandTimeAxis(axis,0),1440);
  assert.deepEqual([full.start,full.end,full.height],[0,1440,1440]);
});

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
test('a day plan keeps fixed reservations, lays out flow and moves completed flow out of time',()=>{
  const flow=(id:string,order:number,completed=false):Task=>({...task,id,starts_at:null,duration:60,flow_order:order,completed});
  const plan=dayPlan(date,[task,{...task,id:'done-fixed',starts_at:date+'T16:00',completed:true},flow('f2',2),flow('f1',1),flow('gone',0,true),{...flow('other',1),plan_date:'2026-10-09'}],rule,[{date,anchor:600}]);
  assert.deepEqual(plan.items.map(i=>[i.task.id,i.start,i.fixed]),[['f1',600,false],['f2',660,false],['a',780,true],['done-fixed',960,true]]);
  assert.deepEqual(plan.completed.map(t=>t.id),['gone']);
  assert.equal(plan.anchor,600);
});
test('agenda marks the first remaining flow block next, never late, and skips gaps behind the anchor',()=>{
  const flow:Task={...task,id:'f',starts_at:null,flow_order:1};
  const plan=dayPlan(date,[task,flow],rule,[{date,anchor:600}]);
  const items=agenda(plan.items,rule,plan.anchor);
  assert.deepEqual(items.map(i=>[i.kind,i.start,i.end,i.kind==='task'?i.state:'']),[
    ['task',600,690,'next'],['gap',690,720,''],['unavailable',720,780,''],['task',780,870,'upcoming'],['gap',870,1080,'']
  ]);
  assert.deepEqual(agenda([],{...rule,enabled:false}),[]);
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
