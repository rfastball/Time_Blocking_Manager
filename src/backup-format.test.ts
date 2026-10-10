import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backupCount,backupDate,backupKind,errorText} from './backup-format.ts';

test('backup kinds read as the user-facing labels',()=>{
  assert.deepEqual((['hour','day','manual','safety','migration'] as const).map(backupKind),['시간별','일별','직접','복원 전','업데이트 전']);
});
test('backup times show local date and 24-hour time, with the year only for other years',()=>{
  const now=new Date(2026,9,10,12,0);
  assert.equal(backupDate(new Date(2026,9,10,15,5).toISOString(),now),'10월 10일 15:05');
  assert.equal(backupDate(new Date(2025,11,31,9,0).toISOString(),now),'2025년 12월 31일 09:00');
  assert.equal(backupDate(null,now),'시각 정보 없음');
  assert.equal(backupDate('not a time',now),'시각 정보 없음');
});
test('damaged backups never report a task count',()=>{
  assert.equal(backupCount({tasks:12,error:null}),'작업 12건');
  assert.equal(backupCount({tasks:null,error:'file is not a database'}),'손상됨');
  assert.equal(backupCount({tasks:3,error:'checksum'}),'손상됨');
});
test('store errors keep their message',()=>{
  assert.equal(errorText({code:'io',message:'디스크가 가득 찼습니다.'}),'디스크가 가득 찼습니다.');
  assert.equal(errorText('plain'),'plain');
});
