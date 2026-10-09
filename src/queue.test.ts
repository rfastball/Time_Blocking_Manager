import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SaveQueue} from './queue.ts';
import {CaptureDraft,captureEnterAction} from './capture.ts';

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

test('retried capture acknowledges only its own draft, preserving newer input',async()=>{
  const q=new SaveQueue(()=>{}),draft=new CaptureDraft();let fail=true,hidden=false;
  draft.edit('first');
  const saved=draft.command={request_id:'request-a',epoch:'epoch',action:{type:'create' as const,id:'a',title:draft.text}};
  await assert.rejects(q.add(async()=>{if(fail)throw Error('disk full');hidden=draft.acknowledge(saved);}),/disk full/);
  draft.edit('newer input');
  fail=false;q.retry();await q.add(async()=>{});
  assert.equal(draft.text,'newer input');assert.equal(hidden,false);
  const next=draft.command={...saved,request_id:'request-b'};
  assert.equal(draft.acknowledge(next),true);assert.equal(draft.text,'');
});

test('capture Enter saves only outside IME and Shift+Enter retains a newline',()=>{
  const enter={key:'Enter',shiftKey:false,isComposing:false,keyCode:13};
  assert.deepEqual([
    enter,{...enter,shiftKey:true},{...enter,isComposing:true},{...enter,keyCode:229},{...enter,key:'Escape'}
  ].map(captureEnterAction),['submit','newline','compose','compose',null]);
});
