import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addBreak,bandGesture,deleteBreak,gestureDay,hourLabels,missingBreakName,moveEdge,readTargets,rhythmTotal,shiftBand,toggleDay,withException,withoutException} from './availability-edit.ts';
import {timeAxisForDays} from './time-axis.ts';
import type {Settings,WorkingDay} from './types.ts';

const day:WorkingDay={enabled:true,start:540,end:1080,breaks:[{start:720,end:780,label:'점심'}]};

test('a press on empty space draws, on a band moves, on an edge resizes; break mode draws over the work body',()=>{
  assert.deepEqual(bandGesture(null,null,'work'),{drawing:true,target:'work',edge:'draw'});
  assert.deepEqual(bandGesture('work',null,'work'),{drawing:false,target:'work',edge:'move'});
  assert.deepEqual(bandGesture('work',null,'break'),{drawing:true,target:'work',edge:'draw'});
  assert.deepEqual(bandGesture('work','end','break'),{drawing:false,target:'work',edge:'end'});
  assert.deepEqual(bandGesture(0,null,'break'),{drawing:false,target:0,edge:'move'});
});

test('gestures snap to 15 minutes and keep every band',()=>{
  // Dragging the work end down by 37 minutes lands on 18:30.
  assert.equal(gestureDay(day,bandGesture('work','end','work'),'work',1080,1117).day.end,1110);
  // Moving the work band carries its breaks.
  const moved=gestureDay(day,bandGesture('work',null,'work'),'work',600,660).day;
  assert.deepEqual([moved.start,moved.end,moved.breaks[0].start],[600,1140,780]);
  // Drawing a break upward from 15:10 by 70 minutes covers the 15:00 slot back to 13:45 and selects the new break.
  const drawn=gestureDay(day,bandGesture('work',null,'break'),'break',910,840);
  assert.deepEqual([drawn.day.breaks[1].start,drawn.day.breaks[1].end,drawn.target],[825,915,1]);
  // Drawing work redefines the range but still covers the existing lunch.
  const work=gestureDay(day,bandGesture(null,null,'work'),'work',480,600).day;
  assert.deepEqual([work.start,work.end],[480,780]);
  assert.throws(()=>gestureDay(day,bandGesture('work',null,'break'),'break',700,760),/다른 휴식과 겹칩니다/);
});

test('keyboard nudges, toggles and break edits',()=>{
  assert.equal(moveEdge(day,'work','start',-15).start,525);
  assert.equal(moveEdge(day,0,'end',15).breaks[0].end,795);
  assert.deepEqual([shiftBand(day,0,15).breaks[0].start,shiftBand(day,0,15).breaks[0].end],[735,795]);
  assert.equal(toggleDay(day).enabled,false);
  assert.equal(deleteBreak(day,0).breaks.length,0);
  assert.equal(day.breaks.length,1,'source untouched');
  const added=addBreak(day);
  assert.deepEqual([added.target,added.day.breaks[1].start,added.day.breaks[1].end],[1,540,570],'noon is taken, so the first free slot');
  assert.equal(addBreak({...day,breaks:[]}).day.breaks[0].start,720);
  assert.throws(()=>addBreak({enabled:true,start:540,end:570,breaks:[{start:540,end:570,label:'x'}]}),/빈 시간이 없습니다/);
});

test('targets, names and totals',()=>{
  assert.deepEqual(readTargets('40','5'),{weekly_target:2400,work_days:5});
  assert.deepEqual(readTargets('37.5','5'),{weekly_target:2250,work_days:5});
  for(const [h,d] of [['','5'],['40',''],['40','8'],['0.1','5'],['40','2.5']])assert.throws(()=>readTargets(h,d),/15분 단위/);
  assert.equal(missingBreakName([day,{...day,breaks:[{start:720,end:780,label:' '}]}]),true);
  assert.deepEqual(rhythmTotal([day,day,{...day,enabled:false}]),{minutes:960,days:2});
});

test('date exceptions replace and restore one date only',()=>{
  const settings:Settings={revision:1,days:Array.from({length:7},()=>day),exceptions:[{date:'2026-10-09',kind:'custom',day}]};
  const leave=withException(settings,'2026-10-10','leave',day);
  assert.equal(leave.exceptions!.length,2);
  assert.equal(leave.exceptions!.find(e=>e.date==='2026-10-10')!.day.enabled,false);
  assert.deepEqual(withoutException(leave,'2026-10-10').exceptions!.map(e=>e.date),['2026-10-09']);
});

test('hour labels never crowd on the compressed axis',()=>{
  const axis=timeAxisForDays([day],1.1),labels=hourLabels(axis);
  assert.ok(labels.includes(0)&&labels.includes(540)&&labels.includes(1080));
  for(let i=1;i<labels.length;i++)assert.ok(axis.position(labels[i])-axis.position(labels[i-1])>=23);
});
