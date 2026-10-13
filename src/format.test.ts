import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quotedObject} from './format.ts';

test('announcements pick 을 or 를 from the title’s last syllable', ()=>{
  assert.equal(quotedObject('회의록 정리'),'‘회의록 정리’를');
  assert.equal(quotedObject('경쟁사 자료 조사'),'‘경쟁사 자료 조사’를');
  assert.equal(quotedObject('결재 처리 건'),'‘결재 처리 건’을');
  assert.equal(quotedObject('배포 v2'),'‘배포 v2’을(를)');
});
