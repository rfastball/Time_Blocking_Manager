import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SaveQueue} from './queue.ts';
import {CaptureDraft,StoredDraft,captureEnterAction,isCompositionKey,createCommand,requestLifetimeMs,requestTimeIssue,releaseCaptureCommand,needsSavedReview} from './capture.ts';

test('failure keeps later writes pending and explicit retry preserves order',async()=>{
  const q=new SaveQueue(()=>{});const written:number[]=[];let fail=true;
  const first=q.add(async()=>{if(fail)throw Error('disk full');written.push(1);});
  const second=q.add(async()=>{written.push(2);});
  await assert.rejects(first,/disk full/);
  assert.equal(q.busy,true);assert.deepEqual(written,[]);
  fail=false;q.retry();await second;
  assert.deepEqual(written,[1,2]);assert.equal(q.busy,false);
});
test('earlier response cannot report idle while a newer write remains',async()=>{
  const q=new SaveQueue(()=>{});let release!:()=>void;let releaseNext!:()=>void;
  const first=q.add(()=>new Promise<void>(r=>{release=r;}));
  const second=q.add(()=>new Promise<void>(r=>{releaseNext=r;}));
  release();await first;assert.equal(q.busy,true);
  releaseNext();await second;assert.equal(q.busy,false);
});

test('exit waits for follow-up writes and fails instead of acknowledging an unsaved queue',async()=>{
  const q=new SaveQueue(()=>{});let release!:()=>void,releaseDraft!:()=>void,finished=false;
  void q.add(async()=>{await new Promise<void>(r=>{release=r;});void q.add(()=>new Promise<void>(r=>{releaseDraft=r;}));});
  const idle=q.whenIdle().then(()=>{finished=true;});
  release();await Promise.resolve();await Promise.resolve();
  assert.equal(finished,false);releaseDraft();await idle;assert.equal(q.busy,false);
  let fail!:()=>void;
  const write=q.add(async()=>{await new Promise<void>(r=>{fail=r;});throw Error('disk full');});
  const waiting=assert.rejects(q.whenIdle(),/disk full/),failed=assert.rejects(write,/disk full/);
  fail();await Promise.all([waiting,failed]);
  await assert.rejects(q.whenIdle(),/disk full/);
  q.discardFailed();await q.whenIdle();
});

test('retried capture acknowledges only its own draft, preserving newer input',async()=>{
  const q=new SaveQueue(()=>{}),draft=new CaptureDraft();let fail=true,hidden=false;
  draft.edit('first');
  const at=1800000000000,saved=draft.command=createCommand({type:'create',id:'a',title:draft.text},'epoch',at),sent:string[]=[];
  await assert.rejects(q.add(async()=>{sent.push(JSON.stringify(saved));if(fail)throw Error('disk full');hidden=draft.acknowledge(saved);}),/disk full/);
  draft.edit('newer input');
  fail=false;q.retry();await q.add(async()=>{});
  assert.equal(sent.length,2);assert.equal(sent[0],sent[1]);assert.equal(saved.issued_at,at,'retry does not renew its timestamp');
  assert.equal(draft.text,'newer input');assert.equal(hidden,false);
  const next=draft.command=createCommand({...saved.action},'epoch',at+1);
  assert.equal(releaseCaptureCommand(next,saved),next,'recovering the old write keeps newer input identity');
  assert.equal(releaseCaptureCommand(saved,saved),null);
  assert.equal(draft.text,'newer input','release never discards text or submits it');
  assert.equal(requestTimeIssue(saved,at+requestLifetimeMs-1),null);
  for(const issued_at of [undefined,at-requestLifetimeMs,at+1,NaN,1.5]){
    const issue=requestTimeIssue({...saved,issued_at},at);assert.equal(issue?.code,'expired');assert.equal(needsSavedReview(issue?.code),true);
  }
  assert.equal(requestTimeIssue(saved,at+requestLifetimeMs)?.code,'expired');
  assert.equal(requestTimeIssue(saved,at+requestLifetimeMs-1,at)?.code,'expired','purged requests stay expired after modest clock rollback');
  assert.equal(requestTimeIssue(saved,at,at)?.code,'clock','large clock rollback gets a clock diagnostic');
  assert.equal(draft.acknowledge(next),true);assert.equal(draft.text,'');
});

test('capture Enter saves only outside IME and Shift+Enter retains a newline',()=>{
  const enter={key:'Enter',shiftKey:false,isComposing:false,keyCode:13};
  assert.deepEqual([
    enter,{...enter,shiftKey:true},{...enter,isComposing:true},{...enter,keyCode:229},{...enter,key:'Escape'}
  ].map(captureEnterAction),['submit','newline','compose','compose',null]);
  assert.deepEqual([enter,{...enter,isComposing:true},{...enter,keyCode:229}].map(isCompositionKey),[false,true,true]);
});

test('unread drafts block writes, and malformed content retains its known sequence for explicit discard',()=>{
  const draft=new StoredDraft();
  assert.throws(()=>draft.nextSequence(),/초안/);
  assert.throws(()=>draft.discardSequence(),/초안/);
  assert.throws(()=>draft.read(12,'{broken'),SyntaxError);
  assert.equal(draft.loaded,false);assert.equal(draft.sequence,12);
  assert.throws(()=>draft.nextSequence(),/초안/);
  assert.equal(draft.discardSequence(),13);
  assert.deepEqual(draft.read(13,'{"capture":"보관 입력"}'),{capture:'보관 입력'});
  assert.equal(draft.nextSequence(),14);
  assert.equal(draft.read(14,''),null);assert.equal(draft.loaded,true);
  const command=createCommand({type:'create',id:'a',title:'보관 입력'},'epoch',1800000000000);
  const stored=draft.read(15,JSON.stringify({capture:'보관 입력',captureCommand:command}));
  assert.deepEqual(stored.captureCommand,command,'reload preserves the original request envelope');
  const {issued_at:_,...legacy}=command;
  const old=draft.read(16,JSON.stringify({capture:'보관 입력',captureCommand:legacy}));
  assert.equal(requestTimeIssue(old.captureCommand,1800000000000)?.code,'expired');assert.equal(old.capture,'보관 입력');
});
