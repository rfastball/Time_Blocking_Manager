import assert from 'node:assert/strict';

// Preview data: two 미계획 items (회의록 템플릿 업데이트 30분, SQLite 백업 방식 조사 45분). The preview opens on 오늘.
const rows='.inbox-page > .inbox-rows > .irow',done='.inbox-done:not(.inbox-trash) .irow',trashed='.inbox-trash .irow';
// Deleting must never open a dialog; any confirm() call is recorded and refused.
const stubDialogs=page=>page.js('window.__asked=[];window.confirm=t=>{window.__asked.push(t);return false;}');
const titles=(page,selector=rows)=>page.js(`[...document.querySelectorAll(${JSON.stringify(selector)})].map(r=>r.querySelector('strong').textContent)`);
const open=async page=>{await page.click('.rail-nav .nav-button','미계획');await page.sleep(300);assert.ok(await page.js('!!document.querySelector(".inbox-page")'),'미계획 page');};
const check=(page,title)=>page.click(`input[aria-label=${JSON.stringify(title+' 완료')}]`);

// Text left in the capture row would stop the next navigation at the app's unsaved-input guard.
const discard=async page=>{
  await page.js(`(()=>{const el=document.querySelector('#inbox-capture');if(!el)return;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await page.sleep(300);
};

const scenarios=[
  {name:'the page lists 미계획 work with its total and a capture row',run:async page=>{
    await open(page);
    assert.deepEqual(await titles(page),['회의록 템플릿 업데이트','SQLite 백업 방식 조사']);
    assert.match(await page.text('.inbox-head'),/배치를 기다리는 일\s*2/);
    assert.match(await page.text('.inbox-head'),/1시간 15분 분량/);
    assert.equal(await page.js('document.querySelectorAll(".inbox-head button").length'),1);
    await page.shot('inbox-initial');
  }},
  {name:'Enter captures a row and clears the input',run:async page=>{
    await open(page);
    await page.click('#inbox-capture');await page.type('주간 보고 정리');await page.key('Enter');await page.sleep(160);
    await page.shot('inbox-captured-landing');
    await page.sleep(600);
    assert.deepEqual(await titles(page),['회의록 템플릿 업데이트','SQLite 백업 방식 조사','주간 보고 정리']);
    assert.equal(await page.js('document.querySelector("#inbox-capture").value'),'');
    assert.equal(await page.js('document.activeElement?.id'),'inbox-capture');
    assert.match(await page.text('.inbox-head'),/배치를 기다리는 일\s*3/);
    await page.shot('inbox-captured');
  }},
  {name:'completing moves the row into the collapsed 완료 list; unchecking returns it',run:async page=>{
    await open(page);
    await check(page,'회의록 템플릿 업데이트');await page.sleep(500);
    assert.deepEqual(await titles(page),['SQLite 백업 방식 조사']);
    assert.match(await page.text('.inbox-done > summary'),/완료 1/);
    assert.equal(await page.js('document.querySelector(".inbox-done").open'),false);
    await page.click('.inbox-done > summary');await page.sleep(400);
    assert.deepEqual(await titles(page,done),['회의록 템플릿 업데이트']);
    assert.equal(await page.js(`document.querySelector('.inbox-done input[type=checkbox]').checked`),true);
    await page.shot('inbox-done-open');
    await check(page,'회의록 템플릿 업데이트');await page.sleep(500);
    assert.deepEqual((await titles(page)).sort(),['SQLite 백업 방식 조사','회의록 템플릿 업데이트'].sort());
    assert.equal(await page.js('!!document.querySelector(".inbox-done")'),false);
  }},
  {name:'the title opens the editor; the size button opens it at the duration',run:async page=>{
    await open(page);
    await page.click(rows+' .irow-main','SQLite');
    assert.ok(await page.js(`!!document.querySelector('dialog[open]')`),'editor dialog');
    await page.click('dialog[open] .ed-close');
    await page.click(rows+' .irow-size','45분');
    assert.ok(await page.js(`!!document.querySelector('dialog[open]')`),'editor dialog from size');
  }},
  {name:'delete moves the row to the collapsed 휴지통 without a dialog; restore brings it back',run:async page=>{
    await open(page);
    await stubDialogs(page);
    await page.click('button[aria-label="SQLite 백업 방식 조사 삭제"]');await page.sleep(500);
    assert.deepEqual(await page.js('window.__asked'),[],'no dialog');
    assert.deepEqual(await titles(page),['회의록 템플릿 업데이트']);
    assert.equal(await page.text('[role=status]'),'‘SQLite 백업 방식 조사’을 휴지통으로 옮겼어요');
    assert.match(await page.text('.inbox-trash > summary'),/휴지통 1/);
    assert.equal(await page.js('document.querySelector(".inbox-trash").open'),false);
    await page.click('.inbox-trash > summary');await page.sleep(400);
    assert.deepEqual(await titles(page,trashed),['SQLite 백업 방식 조사']);
    assert.match(await page.text(trashed+' small'),/\d+월 \d+일 삭제/);
    await page.shot('inbox-trash-open');
    await page.click('button[aria-label="SQLite 백업 방식 조사 복원"]');await page.sleep(500);
    assert.deepEqual((await titles(page)).sort(),['SQLite 백업 방식 조사','회의록 템플릿 업데이트'].sort());
    assert.equal(await page.js('!!document.querySelector(".inbox-trash")'),false,'no empty trash label');
    assert.equal(await page.text('[role=status]'),'‘SQLite 백업 방식 조사’을 복원했어요');
    assert.equal(await page.js('document.activeElement?.id'),'inbox-capture','focus stays on the page');
  }},
  {name:'영구 삭제 removes one item; 휴지통 비우기 asks in place and Esc keeps everything',run:async page=>{
    await open(page);
    await stubDialogs(page);
    for(const t of ['회의록 템플릿 업데이트','SQLite 백업 방식 조사']){await page.click(`button[aria-label="${t} 삭제"]`);await page.sleep(400);}
    await page.click('.inbox-trash > summary');await page.sleep(300);
    await page.click('button[aria-label="회의록 템플릿 업데이트 영구 삭제"]');await page.sleep(500);
    assert.deepEqual(await titles(page,trashed),['SQLite 백업 방식 조사']);
    assert.match(await page.text('.inbox-trash > summary'),/휴지통 1/);
    assert.equal(await page.js('document.activeElement?.getAttribute("aria-label")'),'SQLite 백업 방식 조사 영구 삭제','focus moves to the next row');
    await page.click('.inbox-trash-foot button','휴지통 비우기');await page.sleep(250);
    assert.match(await page.text('.inbox-trash-foot'),/휴지통의 1개를 영구 삭제할까요\?/);
    assert.equal(await page.js('document.activeElement?.textContent'),'정말 비우기');
    await page.shot('inbox-trash-confirm');
    await page.key('Escape');await page.sleep(200);
    assert.equal(await page.js('document.activeElement?.textContent'),'휴지통 비우기');
    assert.deepEqual(await titles(page,trashed),['SQLite 백업 방식 조사']);
    await page.click('.inbox-trash-foot button','휴지통 비우기');await page.sleep(200);
    await page.click('.inbox-trash-foot button','정말 비우기');await page.sleep(500);
    assert.equal(await page.js('!!document.querySelector(".inbox-trash")'),false);
    assert.equal(await page.text('[role=status]'),'‘SQLite 백업 방식 조사’을 영구 삭제했어요');
    assert.deepEqual(await page.js('window.__asked'),[],'no dialog');
  }},
  {name:'계획에 배치하기 opens 계획 with the 미계획 drawer',run:async page=>{
    await open(page);
    await page.click('.inbox-head button','계획에 배치하기');await page.sleep(300);
    assert.ok(await page.js(`!!document.querySelector('.content[data-view=plan]')`),'plan view');
    assert.ok(await page.js(`!!document.querySelector('.content[data-view=plan] .tray')`),'drawer');
  }},
  {name:'an empty 미계획 shows only the input',run:async page=>{
    await open(page);
    for(const t of ['회의록 템플릿 업데이트','SQLite 백업 방식 조사']){await page.click(`button[aria-label="${t} 삭제"]`);await page.sleep(400);}
    await page.click('.inbox-trash > summary');await page.sleep(300);
    await page.click('.inbox-trash-foot button','휴지통 비우기');await page.sleep(200);
    await page.click('.inbox-trash-foot button','정말 비우기');await page.sleep(500);
    assert.equal(await page.js('document.querySelectorAll(".inbox-page .irow").length'),0);
    assert.equal(await page.js('!!document.querySelector(".inbox-trash")'),false);
    assert.equal(await page.js('!!document.querySelector(".inbox-head")'),false);
    assert.doesNotMatch(await page.text('.inbox-page'),/0/);
    await page.shot('inbox-empty');
  }},
];
export default scenarios.map(s=>({...s,run:async page=>{try{await s.run(page);}catch(e){await page.shot(`FAIL-inbox-${s.name}`.replace(/[^\w가-힣-]+/g,'_')).catch(()=>{});await discard(page).catch(()=>{});throw e;}}}));
