import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatDuration,rangeTitle} from './format.ts';
import {nextFlowId,dayPlan,newlyOver,calendarRefreshAllowed} from './today.ts';
import {placementIssue,selectionRange,unavailableParts,resistWorkingBoundary} from './placement.ts';
import {createTimeAxis,timeAxisForDays,expandTimeAxis} from './time-axis.ts';
import type {Task,WorkingDay} from './types.ts';

const date='2026-10-08',rule:WorkingDay={enabled:true,start:540,end:1080,breaks:[{start:720,end:780,label:'점심'}]};
const task:Task={id:'a',title:'초안',body:'',starts_at:date+'T13:00',duration:90,completed:false,revision:1,plan_date:date,flow_order:null};

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
  assert.deepEqual([timeAxisForDays([{...rule,enabled:false}]).start,timeAxisForDays([]).end],[510,1110]);
  const overrun=createTimeAxis(510,1700,1);
  assert.equal(overrun.position(1700),overrun.height,'work running past midnight ends the axis');
  assert.equal(overrun.position(1600)-overrun.position(1500),100);assert.equal(overrun.minute(overrun.height+10),1700);
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
test('only blocks a change newly pushes past working time are counted',()=>{
  const flow=(id:string,order:number):Task=>({...task,id,starts_at:null,duration:60,flow_order:order});
  const short={...rule,end:900},flows=['f1','f2','f3','f4','f5'].map((id,i)=>flow(id,i+1));
  const at=(start:string)=>dayPlan(date,[{...task,starts_at:date+'T'+start,duration:120},...flows],short,[{date,anchor:600}]);
  // Work ends at 15:00. Moving a two-hour reservation from 15:00 into 13:00 takes the last working hours.
  assert.deepEqual(newlyOver(at('15:00'),at('13:00')),['f3','f4'],'f5 was already past working time');
  assert.deepEqual(newlyOver(at('13:00'),at('15:00')),[]);
});
test('the next block is the first remaining flow block, never a fixed one and never decided by the clock',()=>{
  const flow=(id:string,order:number):Task=>({...task,id,starts_at:null,flow_order:order});
  const plan=dayPlan(date,[{...task,starts_at:date+'T09:00'},flow('f',1),flow('g',2)],rule,[{date,anchor:600}]);
  assert.equal(nextFlowId(plan.items),'f');
  // A block being completed right now hands "next" to the one after it.
  assert.equal(nextFlowId(plan.items,['f']),'g');
  assert.equal(nextFlowId([]),null);
});
test('explicit placement permits unavailable time but rejects invalid times and other reservations',()=>{
  const cases:[number,number,WorkingDay,string][]=[
    [780,30,rule,'overlap'],[-15,15,rule,'outside'],[1425,30,rule,'outside'],[781,30,rule,'grid']
  ];
  for(const [start,length,day,kind] of cases)assert.equal(placementIssue('new',date,start,length,day,[task])?.kind,kind);
  assert.equal(placementIssue('new',date,780,30,rule,[task])?.label,'‘초안’과 겹침');
  assert.equal(placementIssue('new',date,870,30,rule,[task]),null);
  assert.equal(placementIssue('a',date,780,90,rule,[task]),null);
  for(const [start,day] of [[720,rule],[525,rule],[1080,rule],[780,{...rule,enabled:false}]] as const)
    assert.equal(placementIssue('new',date,start,30,day,[]),null);
});

test('unavailable masks clip to exact partial intersections and count fixed off-hours once',()=>{
  assert.deepEqual(unavailableParts(510,570,rule),[{start:510,end:540}]);
  assert.deepEqual(unavailableParts(690,810,rule),[{start:720,end:780}]);
  assert.deepEqual(unavailableParts(1050,1110,rule),[{start:1080,end:1110}]);
  assert.deepEqual(unavailableParts(540,720,rule),[]);
  assert.deepEqual(unavailableParts(690,810,{...rule,enabled:false}),[{start:690,end:810}]);
  const partial=dayPlan(date,[{...task,starts_at:date+'T17:30',duration:60}],rule,[]).items[0];
  assert.equal(partial.over,true);assert.equal(partial.outside,30);
  assert.deepEqual(unavailableParts(690,810,{...rule,breaks:[{start:720,end:780,label:'a'},{start:750,end:795,label:'b'}]}),[{start:720,end:795}]);
});

test('working boundaries resist slight pushes, release deliberate pushes and allow returning',()=>{
  for(const scale of [1,1.2]){
    const position=(m:number)=>m*scale;
    assert.equal(resistWorkingBoundary(1020,1035,60,rule,position),1020);
    assert.equal(resistWorkingBoundary(1020,1050,60,rule,position),1050);
    assert.equal(resistWorkingBoundary(1050,1035,60,rule,position),1035);
    assert.equal(resistWorkingBoundary(540,525,60,rule,position),540);
    assert.equal(resistWorkingBoundary(540,510,60,rule,position),510);
    assert.equal(resistWorkingBoundary(660,675,60,rule,position),660);
    assert.equal(resistWorkingBoundary(660,690,60,rule,position),690);
    assert.equal(resistWorkingBoundary(540,525,60,{...rule,enabled:false},position),525);
  }
});

test('clock refresh covers calendar views and waits until editing and gestures end',()=>{
  const idle={view:'today',ready:true,visible:true,dirty:false,input:false,modal:false,gesture:false};
  assert.deepEqual(['today','plan','inbox','settings'].map(view=>calendarRefreshAllowed({...idle,view})),[true,true,false,false]);
  for(const blocked of [{ready:false},{visible:false},{dirty:true},{input:true},{modal:true},{gesture:true}])assert.equal(calendarRefreshAllowed({...idle,...blocked}),false);
  assert.equal(calendarRefreshAllowed(idle),true);
});
