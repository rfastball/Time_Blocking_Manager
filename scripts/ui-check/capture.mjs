import assert from 'node:assert/strict';

// The quick capture window at its native size. The browser preview cannot hide an OS window, so Esc hides the panel.
const path='/?capture&now=10:20',viewport={width:620,height:176};
const value=page=>page.js('document.querySelector("#capture").value');
const saveDisabled=page=>page.js('document.querySelector(".capture-save").disabled');
// Text left behind would stop the next navigation at the app's unsaved-input guard.
const discard=async page=>{
  await page.js(`(()=>{const el=document.querySelector('#capture');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await page.sleep(300);
};

const scenarios=[
  {name:'the field has focus and 저장 waits for text',path,viewport,run:async page=>{
    assert.equal(await page.js('document.activeElement?.id'),'capture');
    assert.equal(await saveDisabled(page),true);
    await page.shot('capture-empty');
    await page.type('   ');assert.equal(await saveDisabled(page),true,'blank text cannot be saved');
    await discard(page);
  }},
  {name:'Shift+Enter makes a newline and Enter saves and clears',path,viewport,run:async page=>{
    await page.type('분기 보고서 검토');
    assert.equal(await saveDisabled(page),false);
    await page.key('Enter',{modifiers:8,text:'\r'});await page.type('표 수치 확인');
    assert.equal(await value(page),'분기 보고서 검토\n표 수치 확인');
    await page.shot('capture-typed');
    await page.key('Enter');await page.sleep(400);
    assert.equal(await value(page),'');
    assert.equal(await saveDisabled(page),true);
    assert.equal(await page.js('document.activeElement?.id'),'capture');
    assert.equal(await page.js('document.querySelector(".capture-status").textContent'),'');
  }},
  {name:'Esc hides and keeps the draft',path,viewport,run:async page=>{
    await page.type('다음 주 일정 확인');
    await page.key('Escape');await page.sleep(100);
    assert.equal(await page.js('document.querySelector(".capture-window").hidden'),true);
    assert.equal(await value(page),'다음 주 일정 확인');
    await page.mouse('mousePressed',300,80);await page.mouse('mouseReleased',300,80,0);await page.sleep(100);
    assert.equal(await page.js('document.querySelector(".capture-window").hidden'),false);
    assert.equal(await value(page),'다음 주 일정 확인');
    await discard(page);
  }},
  {name:'expired saved capture commands keep the draft until a fresh Enter saves',path,viewport,run:async page=>{
    const before=await page.js(`(async()=>{const {getState}=await import('/src/app/store/state.ts');return JSON.stringify(getState().snapshot);})()`);
    const expired=[
      {name:'legacy',issued_at:null},
      {name:'exactly 30 days old',issued_at:Date.now()-30*24*60*60*1000},
    ];
    try{
      for(const [index,stale] of expired.entries()){
        const text=`만료 캡처 ${stale.name}`,id=`expired-capture-${index}`;
        const command={request_id:`expired-request-${index}`,epoch:'current',action:{type:'create',id,title:text},...(stale.issued_at===null?{}:{issued_at:stale.issued_at})};
        await page.js(`(async()=>{const {getState,setDrafts,setState}=await import('/src/app/store/state.ts'),s=getState(),command=${JSON.stringify(command)};command.epoch=s.snapshot.epoch;setState({error:'',message:''});setDrafts({capture:${JSON.stringify(text)},captureCommand:command});})()`);
        await page.click('#capture');
        await page.key('Enter');await page.sleep(250);
        assert.equal(await page.js(`(async()=>{const {getState}=await import('/src/app/store/state.ts');return getState().failed?.code;})()`),'expired',`${stale.name} command is rejected`);
        assert.equal(await page.js(`(async()=>{const {getState}=await import('/src/app/store/state.ts');return JSON.stringify(getState().snapshot);})()`),before,'rejection does not mutate the snapshot');
        assert.equal(await value(page),text,'rejection keeps capture text');
        await page.click('.capture-status button','저장된 내용 확인');await page.sleep(250);
        assert.equal(await page.js(`(async()=>{const {getState}=await import('/src/app/store/state.ts');const s=getState();return JSON.stringify({text:s.drafts.capture,command:s.drafts.captureCommand,failed:s.failed,snapshot:s.snapshot});})()`),JSON.stringify({text,command:null,failed:null,snapshot:JSON.parse(before)}),'recovery reloads without the expired command');
      }
      await page.click('#capture');
      await page.key('Enter');await page.sleep(300);
      assert.equal(await value(page),'');
      const saved=await page.js(`(async()=>{const {getState}=await import('/src/app/store/state.ts');const tasks=getState().snapshot.tasks;return {count:tasks.length,task:tasks.find(t=>t.title==='만료 캡처 exactly 30 days old')};})()`);
      assert.equal(saved.count,JSON.parse(before).tasks.length+1,'fresh Enter saves once');
      assert.ok(saved.task&&saved.task.id!=='expired-capture-1','fresh Enter gives the saved task a new identity');
    }finally{
      await page.js(`(async()=>{const [{setDrafts,setState},{release}]=await Promise.all([import('/src/app/store/state.ts'),import('/src/app/store/session.ts')]);release();setDrafts({capture:'',captureCommand:null,composer:null});setState({error:'',message:''});})()`).catch(()=>{});
      await page.sleep(250);
    }
  }},
  {name:'the panel keeps its shape in the other themes and at 480px',path,viewport,run:async page=>{
    await page.type('테마 확인용 입력');
    for(const theme of ['g1','g3','g4']){await page.js(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);await page.sleep(80);await page.shot('capture-'+theme);}
    await discard(page);
    await page.goto(path,{width:440,height:176});
    await page.type('좁은 창');
    assert.equal(await page.js('getComputedStyle(document.querySelector(".capture-mark")).display'),'none');
    await page.shot('capture-narrow');
    await discard(page);
  }},
];
// A failed step must not leave text that blocks the next scenario's navigation.
export default scenarios.map(s=>({...s,run:async page=>{try{await s.run(page);}catch(e){await page.shot(`FAIL-capture-${s.name}`.replace(/[^\w가-힣-]+/g,'_')).catch(()=>{});await discard(page).catch(()=>{});throw e;}}}));
