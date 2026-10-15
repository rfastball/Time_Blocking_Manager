import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {previewMutation} from './preview.ts';
import type {Action,Snapshot,Task} from './types.ts';

// Golden fixtures written by the Rust store (src-tauri/tests/parity.rs, UPDATE_PARITY=1): the preview store must reach the same
// state after every step, and reject the same steps with the same code. "$rev:<id>"/"$rev:settings" stand for the current revision;
// a step's own request_id lets a later step retry it.
type Step={action:Record<string,unknown>;error?:string;request_id?:string};
type Fixture={name:string;steps:Step[];known_divergence?:string};
const dir=new URL('../src-tauri/tests/parity/',import.meta.url),NOW=1_800_000_000_000;
// The fields both stores keep; board_x/y are left out (only the Rust store still assigns them).
const FIELDS=['id','title','body','starts_at','duration','completed','revision','plan_date','flow_order','proto','pile_id','pile_order','wait_for','wait_until','wait_since'] as const;
const byId=(a:{id:string},b:{id:string})=>a.id<b.id?-1:a.id>b.id?1:0;
// Routine occurrences get random ids on both sides; they are named by their date and title instead.
const task=(t:Task)=>{const out=Object.fromEntries(FIELDS.map(k=>[k,t[k]??(k==='proto'?false:null)])) as Record<string,unknown>&{id:string};if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t.id))out.id=`~${t.plan_date??''}~${t.title}`;return out;};
function normalize(s:Snapshot){
  const st=s.settings;
  return {tasks:s.tasks.map(task).sort(byId),trash:(s.trash??[]).map(t=>({...task(t),deleted_at:t.deleted_at})).sort(byId),piles:[...(s.piles??[])].sort((a,b)=>a.position-b.position).map(({id,position})=>({id,position})),
    layouts:[...(s.layouts??[])].sort((a,b)=>a.date<b.date?-1:1).map(({date,anchor})=>({date,anchor})),
    settings:{revision:st.revision,days:st.days,exceptions:st.exceptions??[],weekly_target:st.weekly_target??2400,work_days:st.work_days??5,routines:st.routines??[]}};
}
const resolve=(v:unknown,s:Snapshot):unknown=>typeof v==='string'&&v.startsWith('$rev:')?v==='$rev:settings'?s.settings.revision:s.tasks.find(t=>t.id===v.slice(5))?.revision??assert.fail(`no task for ${v}`)
  :Array.isArray(v)?v.map(x=>resolve(x,s)):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,resolve(x,s)])):v;

const files=readdirSync(dir).filter(f=>f.endsWith('.json')&&!f.endsWith('.expected.json')).sort();
test('the parity fixtures are there',()=>{assert.ok(files.length>=8);});
for(const file of files){
  const fixture:Fixture=JSON.parse(readFileSync(new URL(file,dir),'utf8'));
  test(`the preview store matches the Rust store: ${fixture.name}`,fixture.known_divergence?{todo:fixture.known_divergence}:{},()=>{
    const expected=JSON.parse(readFileSync(new URL(`${fixture.name}.expected.json`,dir),'utf8'));
    assert.equal(expected.states.length,fixture.steps.length,'golden file is stale; rerun the Rust parity test with UPDATE_PARITY=1');
    let s:Snapshot={epoch:'parity',...structuredClone(expected.initial)};const occurrences=new Set<string>();
    fixture.steps.forEach((step,n)=>{
      const action=resolve(step.action,s) as Action,before=normalize(s),label=`${fixture.name} step ${n} (${action.type})`;let state:unknown;
      try{s=previewMutation(s,{request_id:step.request_id??`${fixture.name}-${n}`,epoch:s.epoch,issued_at:NOW,action},occurrences,NOW);state=normalize(s);}
      catch(e){const code=(e as {code?:string}).code;if(!code)throw e;assert.deepEqual(normalize(s),before,label);state={error:code};}
      assert.deepEqual(state,expected.states[n],label);
    });
  });
}
