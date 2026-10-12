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
  {name:'unresolved captures retain their identity until completion or explicit review',path,viewport,run:async page=>{
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
        assert.deepEqual(await page.js(`(async()=>{const {getState}=await import('/src/app/store/state.ts');const s=getState();return {text:s.drafts.capture,id:s.drafts.captureCommand?.request_id,failed:s.failed?.code,snapshot:s.snapshot};})()`),{text,id:command.request_id,failed:'expired',snapshot:JSON.parse(before)},'review preserves the unresolved command without executing it');
        await page.js('window.confirm=()=>false');
        await page.click('.capture-status button','입력 유지하고 수정');await page.sleep(100);
        assert.equal(await page.js(`(async()=>{const {getState}=await import('/src/app/store/state.ts');return getState().drafts.captureCommand?.request_id;})()`),command.request_id,'declining renewal retains the original identity');
        await page.js('window.confirm=()=>true');
        await page.click('.capture-status button','입력 유지하고 수정');await page.sleep(100);
        assert.deepEqual(await page.js(`(async()=>{const {getState}=await import('/src/app/store/state.ts');const s=getState();return {text:s.drafts.capture,command:s.drafts.captureCommand,failed:s.failed,snapshot:s.snapshot};})()`),{text,command:null,failed:null,snapshot:JSON.parse(before)},'explicit confirmation unlocks editing but does not save');
      }
      await page.click('#capture');
      await page.key('Enter');await page.sleep(300);
      assert.equal(await value(page),'');
      const saved=await page.js(`(async()=>{const {getState}=await import('/src/app/store/state.ts');const tasks=getState().snapshot.tasks;return {count:tasks.length,task:tasks.find(t=>t.title==='만료 캡처 exactly 30 days old')};})()`);
      assert.equal(saved.count,JSON.parse(before).tasks.length+1,'fresh Enter saves once');
      assert.ok(saved.task&&saved.task.id!=='expired-capture-1','a deliberately renewed save gets a new identity');
      const oldReceipt=await page.js(`(async()=>{const [{getState,setDrafts},{createCommand},{submitCapture}]=await Promise.all([import('/src/app/store/state.ts'),import('/src/capture.ts'),import('/src/app/store/tasks.ts')]);const command=createCommand({type:'create',id:'known-retry',title:'이미 저장한 입력'},getState().snapshot.epoch);setDrafts({capture:command.action.title,captureCommand:command});await submitCapture();return command;})()`);
      await page.js(`(async()=>{const [{setDrafts},{editCapture}]=await Promise.all([import('/src/app/store/state.ts'),import('/src/app/store/tasks.ts')]);setDrafts({capture:'이미 저장한 입력',captureCommand:${JSON.stringify(oldReceipt)}});editCapture('새로운 입력');})()`);
      await page.click('#capture');await page.key('Enter');await page.sleep(200);
      assert.equal(await value(page),'새로운 입력','receipt completion keeps changed input');
      assert.deepEqual(await page.js(`(async()=>{const {getState}=await import('/src/app/store/state.ts');const s=getState();return {pending:s.drafts.captureCommand,count:s.snapshot.tasks.filter(t=>t.id==='known-retry').length};})()`),{pending:null,count:1},'a recorded capture retry acknowledges once without creating another task');
      await page.js(`(async()=>{const {setDrafts}=await import('/src/app/store/state.ts');setDrafts({capture:'',captureCommand:${JSON.stringify(oldReceipt)}});})()`);
      assert.equal(await saveDisabled(page),false,'a pending request can be resolved after its editable input is cleared');
      await page.click('#capture');await page.key('Enter');await page.sleep(150);
      assert.equal(await saveDisabled(page),true,'completion releases an empty pending draft');
      const blocked=await page.js(`(async()=>{
        const [{getState,setDrafts,setState},{queue},{submitCapture},{previewMutation}]=await Promise.all([import('/src/app/store/state.ts'),import('/src/app/store/session.ts'),import('/src/app/store/tasks.ts'),import('/src/preview.ts')]);
        window.saveRecoveryPreviousIPC=window.__TAURI_INTERNALS__;
        const mock=window.saveRecoveryMock={snapshot:structuredClone(getState().snapshot),draft:[0,''],receipts:new Set(),accepted:null,mutations:0,lookups:0,failDraft:true,loseResponse:true,failLookup:false};
        window.__TAURI_INTERNALS__={invoke:async(cmd,args)=>{
          if(cmd==='save_draft'){if(mock.failDraft)throw {code:'storage',message:'초안 저장 실패',retryable:true};mock.draft=[args.sequence,args.content];return;}
          if(cmd==='load_draft')return mock.draft;
          if(cmd==='load')return structuredClone(mock.snapshot);
          if(cmd==='mutate'){mock.mutations++;mock.snapshot=previewMutation(mock.snapshot,args.command,mock.receipts);mock.accepted=args.command;if(mock.loseResponse)throw {code:'storage',message:'저장 응답을 받지 못했습니다.',retryable:true};return structuredClone(mock.snapshot);}
          if(cmd==='acknowledge'){mock.lookups++;if(mock.failLookup)throw {code:'storage',message:'처리 기록 읽기 실패',retryable:true};return mock.accepted&&JSON.stringify(mock.accepted)===JSON.stringify(args.command)?structuredClone(mock.snapshot):null;}
          if(cmd==='diagnostics')return {db_path:'mock',warning:null,last_backup:null};
          if(cmd==='plugin:dialog|message')return mock.confirmDraft?'Ok':'Cancel';
          if(cmd==='autostart'||cmd==='exit_on_close')return false;
          if(cmd==='capture_shortcut')return 'Ctrl+Shift+Space';
          if(cmd==='set_dirty'||cmd==='hide_capture')return;
          throw Error('Unexpected mock IPC '+cmd);
        }};
        setState({native:true});setDrafts({capture:'응답을 잃은 입력',captureCommand:null,composer:null});
        const saved=await submitCapture();return {saved,mutations:mock.mutations,pending:getState().drafts.captureCommand?.request_id,failed:queue.failed.code};
      })()`);
      assert.equal(blocked.saved,false);assert.equal(blocked.mutations,0,'draft persistence failure prevents mutation transmission');assert.equal(blocked.failed,'storage');assert.ok(blocked.pending);
      const lost=await page.js(`(async()=>{const [{getState},{queue,retry},{submitCapture}]=await Promise.all([import('/src/app/store/state.ts'),import('/src/app/store/session.ts'),import('/src/app/store/tasks.ts')]);window.saveRecoveryMock.failDraft=false;await retry();await queue.whenIdle();await submitCapture();return {mutations:window.saveRecoveryMock.mutations,pending:getState().drafts.captureCommand?.request_id,failed:queue.failed.code};})()`);
      assert.deepEqual(lost,{mutations:1,pending:blocked.pending,failed:'storage'},'retrying persistence keeps the same request before uncertain completion');
      const restored=await page.js(`(async()=>{
        const [{getState,setDrafts,setState},{queue,storedDraft,reload}]=await Promise.all([import('/src/app/store/state.ts'),import('/src/app/store/session.ts')]);
        queue.discardFailed();await queue.whenIdle();setDrafts({capture:'',captureCommand:null,composer:null});storedDraft.loaded=false;setState({snapshot:null,ready:false,draftLoaded:false,error:''});
        await reload();await queue.whenIdle();const s=getState();return {text:s.drafts.capture,pending:s.drafts.captureCommand,count:s.snapshot.tasks.filter(t=>t.title==='응답을 잃은 입력').length,mutations:window.saveRecoveryMock.mutations,lookups:window.saveRecoveryMock.lookups};
      })()`);
      assert.deepEqual(restored,{text:'',pending:null,count:1,mutations:1,lookups:1},'reload confirms the lost response through read-only IPC without replaying the mutation');
      const lookupFailure=await page.js(`(async()=>{
        const [{getState,setDrafts},{storedDraft,loadStoredDraft,queue}]=await Promise.all([import('/src/app/store/state.ts'),import('/src/app/store/session.ts')]);
        const mock=window.saveRecoveryMock;mock.failLookup=true;mock.draft=[mock.draft[0]+1,JSON.stringify({capture:'보존할 입력',captureCommand:mock.accepted})];setDrafts({capture:'',captureCommand:null});storedDraft.loaded=false;
        await loadStoredDraft();await queue.whenIdle();const s=getState();return {text:s.drafts.capture,pending:s.drafts.captureCommand.request_id,error:s.error,mutations:mock.mutations};
      })()`);
      assert.deepEqual(lookupFailure,{text:'보존할 입력',pending:blocked.pending,error:'처리 기록 읽기 실패',mutations:1},'failed receipt lookup retains input and unresolved identity');
      const damaged=await page.js(`(async()=>{
        const [{getState,setDrafts,setState},{storedDraft,loadStoredDraft,queue}]=await Promise.all([import('/src/app/store/state.ts'),import('/src/app/store/session.ts')]);
        const mock=window.saveRecoveryMock;mock.failLookup=false;mock.draft=[mock.draft[0]+1,'{'];setDrafts({capture:'',captureCommand:null});storedDraft.loaded=false;setState({error:''});
        await loadStoredDraft();await queue.whenIdle();return {loaded:getState().draftLoaded,known:getState().draftSequenceKnown,snapshot:JSON.stringify(getState().snapshot)};
      })()`);
      assert.equal(damaged.loaded,false);assert.equal(damaged.known,true);
      assert.equal(await page.js(`document.querySelector('#capture').disabled`),true,'malformed draft blocks editing');
      assert.equal(await saveDisabled(page),true);
      await page.shot('capture-damaged-draft');
      await page.click('.capture-status button','보관 초안 버리기');
      assert.equal(await page.js(`window.saveRecoveryMock.draft[1]`),'{','declining confirmation preserves the damaged draft');
      assert.equal(await page.js(`document.querySelector('#capture').disabled`),true);
      await page.js(`window.saveRecoveryMock.confirmDraft=true`);
      await page.click('.capture-status button','보관 초안 버리기');
      await page.js(`(async()=>{const {queue}=await import('/src/app/store/session.ts');await queue.whenIdle();})()`);
      assert.equal(await page.js(`window.saveRecoveryMock.draft[1]`),'','confirmed recovery discards only the stored draft');
      assert.equal(await page.js(`document.querySelector('#capture').disabled`),false,'capture can be used again');
      assert.equal(await page.js(`document.activeElement.id`),'capture','recovery returns focus to the field');
      assert.equal(await page.js(`(async()=>{const {getState}=await import('/src/app/store/state.ts');return JSON.stringify(getState().snapshot);})()`),damaged.snapshot,'recovery preserves saved tasks');
      await page.shot('capture-draft-recovered');
    }finally{
      await page.js(`(async()=>{const [{setDrafts,setState},{queue,storedDraft}]=await Promise.all([import('/src/app/store/state.ts'),import('/src/app/store/session.ts')]);queue.discardFailed();await queue.whenIdle();setDrafts({capture:'',captureCommand:null,composer:null});setState({native:false,error:'',message:'',draftLoaded:true});storedDraft.loaded=true;if(window.saveRecoveryMock){if(window.saveRecoveryPreviousIPC)window.__TAURI_INTERNALS__=window.saveRecoveryPreviousIPC;else delete window.__TAURI_INTERNALS__;delete window.saveRecoveryMock;delete window.saveRecoveryPreviousIPC;}})()`).catch(()=>{});
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
