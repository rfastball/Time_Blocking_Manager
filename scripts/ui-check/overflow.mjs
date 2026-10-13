import assert from 'node:assert/strict';
import {ready,toFocus,toPlan} from './support/nav.mjs';

// A day's 근무 외 carries its own fix, and today states when its remaining plan ends (planned, never a countdown).
const task=(page,title)=>page.js(`(async()=>{const {getState}=await import('/src/app/store/state.ts');const t=getState().snapshot.tasks.find(t=>t.title===${JSON.stringify(title)});return t&&{date:t.plan_date,fixed:!!t.starts_at};})()`);
const head=sel=>`.wk-head.today ${sel}`;

export default [
  {name:'준비로 beside a day’s 근무 외 sends what runs past working time to the top of the shelf, fixed work stays',run:async page=>{
    await page.goto('/?now=10:20');await ready(page);await toPlan(page);
    assert.match(await page.text(head('.wk-alloc')),/근무 외 2h/);
    assert.match(await page.text(head('.wk-end')),/^끝 \d\d:\d\d$/,'today states its planned end');
    const label=await page.js(`document.querySelector('.wk-head.today .wk-return')?.getAttribute('aria-label')`);
    assert.match(label??'',/근무 외 블록 1개 준비로$/);
    assert.equal(await page.js(`document.querySelectorAll('.wk-head.past .wk-return').length`),0,'past days keep what happened');
    const fixedBefore=await task(page,'설계 워크숍');
    await page.shot('overflow-head');
    await page.click(head('.wk-return'));await page.sleep(900);
    assert.equal((await task(page,'경쟁사 자료 조사')).date,null,'back in 준비');
    assert.equal(await page.text('#dock .tray .tblk .ttl'),'경쟁사 자료 조사','on top of the shelf');
    assert.deepEqual(await task(page,'설계 워크숍'),fixedBefore,'fixed work keeps its reservation');
    assert.equal(await page.js(`!!document.querySelector('.wk-head.today .wk-return')`),false,'the fix goes with the overflow');
    assert.doesNotMatch(await page.text(head('.wk-alloc')),/근무 외/);
    await page.shot('overflow-returned');
  }},
  {name:'the focus bar states the planned end beside the meter and nothing about time left',run:async page=>{
    await page.goto('/?now=10:20');await toFocus(page);
    assert.match(await page.text('.today-bar .plan-end'),/^예상 끝 \d\d:\d\d$/);
    const end=await page.text('.today-bar .plan-end');
    await page.goto('/?now=17:40');await toFocus(page);
    assert.equal(await page.text('.today-bar .plan-end'),end,'the clock does not move the planned end');
    assert.equal(await page.js(`/남음|초과|지연/.test(document.querySelector('.today-bar').textContent)`),false);
  }},
];
