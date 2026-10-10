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
