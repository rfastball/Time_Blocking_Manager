import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mondayOf,periodDates,plusDays,startAt,startMinute,weekday} from './dates.ts';

test('a stored start is the date at a minute, and reads back to the same minute',()=>{
  assert.equal(startAt('2026-10-14',545),'2026-10-14T09:05');
  assert.deepEqual(['2026-10-14T00:00','2026-10-14T09:05','2026-10-14T23:45'].map(startMinute),[0,545,1425]);
});

test('weeks start on Monday, across months and years',()=>{
  assert.deepEqual(['2026-10-12','2026-10-14','2026-10-18'].map(weekday),[0,2,6]);
  assert.deepEqual(['2026-10-18','2027-01-01','2026-06-01'].map(mondayOf),['2026-10-12','2026-12-28','2026-06-01']);
  assert.equal(plusDays('2026-12-31',1),'2027-01-01');
});

test('a plan period shows its week, two weeks, or the whole weeks around its month',()=>{
  const span=(d:string[])=>[d[0],d[d.length-1],d.length];
  assert.deepEqual(span(periodDates('week','2026-10-14')),['2026-10-12','2026-10-18',7]);
  assert.deepEqual(span(periodDates('day','2026-10-18')),['2026-10-12','2026-10-18',7]);
  assert.deepEqual(span(periodDates('two','2026-12-30')),['2026-12-28','2027-01-10',14]);
  assert.deepEqual(span(periodDates('month','2026-10-20')),['2026-09-28','2026-11-01',35],'October 2026 starts on a Thursday');
  assert.deepEqual(span(periodDates('month','2026-06-15')),['2026-06-01','2026-07-05',35],'June 2026 starts on a Monday');
  assert.deepEqual(span(periodDates('month','2027-02-10')),['2027-02-01','2027-02-28',28],'February 2027 fills four weeks exactly');
});
