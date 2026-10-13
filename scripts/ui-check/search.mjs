import assert from 'node:assert/strict';
import {dockState,toPlan} from './support/nav.mjs';

// Global search over the preview data. Ctrl is modifier 2 in CDP key events.
const CTRL=2;
const hits=page=>page.js(`[...document.querySelectorAll('.search-hit')].map(h=>h.querySelector('.hit-title').textContent+' | '+h.querySelector('.hit-where').textContent)`);
const active=page=>page.js(`document.activeElement?.getAttribute('aria-label')??document.activeElement?.id`);
const open=async page=>{await page.key('k',{code:'KeyK',modifiers:CTRL});await page.sleep(200);assert.ok(await page.js('!!document.querySelector(".search-panel")'),'search panel');};

const scenarios=[
  {name:'Ctrl+K and the top bar button open search; Esc closes it and gives focus back',run:async page=>{
    // The rail is gone: the top bar carries the way home, the dates, the range, search, focus and the gear, in that order.
    await toPlan(page);
    assert.equal(await page.js(`!!document.querySelector('.rail-nav')`),false);
    const bar=await page.js(`[...document.querySelectorAll('header.topbar>*,header.topbar>.bar-end>*')].map(e=>e.matches('.brand')?'로고':e.matches('.date-nav')?'날짜':e.matches('h1')?'제목':e.matches('.segmented')?'기간':e.matches('.search-open')?'검색':e.matches('button[aria-label="단축키"]')?'단축키':e.matches('button[aria-label="설정"]')?'설정':e.matches('button')?e.textContent.trim():null).filter(Boolean)`);
    assert.deepEqual(bar,['로고','날짜','제목','기간','검색','몰입','단축키','설정']);
    assert.equal(await page.js(`document.querySelector('.search-open').getAttribute('aria-keyshortcuts')`),'Control+K');
    await page.js(`document.querySelector('#tray-capture').focus()`);
    await open(page);
    assert.equal(await active(page),'검색');
    assert.equal(await page.js('document.querySelector(".search-panel").getAttribute("role")'),'dialog');
    await page.key('Escape');await page.sleep(150);
    assert.equal(await page.js('!!document.querySelector(".search-panel")'),false);
    assert.equal(await active(page),'tray-capture');
    await page.click('header.topbar .search-open');
    assert.equal(await active(page),'검색');
    await page.key('Escape');
    // Tab closes the panel too and, like Esc, gives focus back rather than letting it fall to the page.
    await page.js(`document.querySelector('#tray-capture').focus()`);
    await open(page);await page.key('Tab');await page.sleep(150);
    assert.equal(await page.js('!!document.querySelector(".search-panel")'),false,'Tab closes search');
    assert.equal(await active(page),'tray-capture');
  }},
  {name:'results show the title and where the work is now; arrows choose and Enter goes to the block in 계획 일',run:async page=>{
    await open(page);await page.type('설계');await page.sleep(150);
    const list=await hits(page);
    assert.equal(list.length,3);assert.match(list[0],/설계 문서 자료 조사 \| \d+월 \d+일 · 순서 1/);assert.match(list[2],/설계 워크숍 \| \d+월 \d+일 · 14:00/);
    await page.key('ArrowDown');
    assert.equal(await page.js(`document.querySelector('.search-hit[aria-selected=true] .hit-title').textContent`),'설계 문서 초안 작성');
    assert.equal(await page.js(`document.querySelector('[role=combobox]').getAttribute('aria-activedescendant')`),'hit-sample-b');
    assert.notEqual(await page.js(`getComputedStyle(document.querySelector('.search-hit.active')).boxShadow`),'none','the chosen result has an edge');
    await page.shot('search-results');
    await page.key('Enter');await page.sleep(900);
    assert.equal(await page.js(`document.querySelector('.content').dataset.view`),'plan');
    assert.ok(await page.js(`document.querySelector('.segmented [aria-checked=true]').textContent==='일'`),'the 일 view');
    assert.match(await active(page),/^설계 문서 초안 작성, 예상/);
    assert.ok(await page.js('!!document.querySelector(".found-ring")'),'the block is ringed');
  }},
  {name:'a bench card, the trash and a memo-only match are found; Korean being composed already updates the list',run:async page=>{
    await toPlan(page);
    await open(page);await page.type('결재');await page.sleep(100);
    assert.deepEqual(await hits(page),['결재 처리 | 선반 · 4번째']);
    await page.key('Enter');await page.sleep(900);
    assert.equal(await page.js(`document.querySelector('.content').dataset.view`),'plan');
    assert.equal(await dockState(page),'wide','bench work opens on the work screen with the dock wide');
    assert.equal(await active(page),'결재 처리, 15분');
    await page.key('Delete');await page.sleep(400);
    await open(page);await page.type('결재');await page.sleep(100);
    assert.deepEqual(await hits(page),['결재 처리 | 휴지통']);
    await page.key('Enter');await page.sleep(900);
    assert.equal(await page.js('document.querySelector(".inbox-trash").open'),true,'the trash unfolds');
    assert.equal(await active(page),'결재 처리 복원');
    // An input event during composition (isComposing) still refreshes the results; Enter while composing does nothing.
    await open(page);
    await page.js(`(()=>{const el=document.querySelector('[role=combobox]');el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'요구');el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'구'}));})()`);
    await page.sleep(100);
    assert.deepEqual(await hits(page),[(await hits(page))[0]]);assert.match((await hits(page))[0],/^설계 문서 자료 조사/,'memo match: “[x] 요구사항 확인”');
    await page.js(`document.querySelector('[role=combobox]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,isComposing:true,keyCode:229}))`);await page.sleep(200);
    assert.ok(await page.js('!!document.querySelector(".search-panel")'),'still open');
    await page.key('Escape');
  }},
  {name:'nothing found is said in the panel; at 720px the panel fits the window',viewport:{width:720,height:900},run:async page=>{
    await open(page);await page.type('없는 일');await page.sleep(100);
    assert.equal(await page.text('.search-none'),'찾은 일이 없어요');
    assert.equal(await page.js(`document.getElementById(document.querySelector('[role=combobox]').getAttribute('aria-controls'))?.hidden`),true,'the controlled list is there, hidden');
    assert.equal(await page.js(`document.querySelectorAll('.search-panel [role=status]').length`),1);
    const r=await page.rect('.search-panel');assert.ok(r.x>=8&&r.x+r.w<=712,'inside the window');
    await page.key('Escape');
  }},
];
export default scenarios;
