import assert from 'node:assert/strict';
import {toFocus} from './support/nav.mjs';

// 몰입: the next block is the first remaining flow block whatever the clock says. The card acts on it; nothing counts down or turns late.
const go=async(page,now='10:20')=>{await page.goto('/?now='+now);await toFocus(page);};
const next=page=>page.text('.ed-next .ed-next-title');
const nextTime=page=>page.text('.ed-next .ed-next-time');
const task=async(page,title)=>{const t=await page.task(title);return t&&{duration:t.duration,date:t.plan_date,done:t.completed};};
const act=async(page,label)=>{await page.click('.ed-next .ed-next-acts button',label);await page.sleep(700);};

export default [
  {name:'the next card lengthens by 15 minutes and keeps no clock: no time left, no overtime',run:async page=>{
    await go(page);
    const title=await next(page),before=await task(page,title);
    assert.ok(title,'there is a next block');
    assert.match(await nextTime(page),/^예상 \d\d:\d\d–\d\d:\d\d · /,'planned slot and length');
    assert.match(await page.js(`document.querySelector('.ed-next .ed-next-open').getAttribute('aria-label')`),new RegExp(`^${title}, 예상 \\d\\d:\\d\\d–\\d\\d:\\d\\d, \\d`),'the card reads as title, slot, length');
    await act(page,'+15분');
    assert.equal((await task(page,title)).duration,before.duration+15);
    assert.match(await page.text('[role=status]'),new RegExp(`^‘${title}’ \\d`),'the new length is announced');
    assert.equal(await next(page),title,'still the same next block');
    // Much later, the same block is still next and nothing reads as late.
    await go(page,'17:50');
    assert.equal(await next(page),title,'the clock does not change which block is next');
    assert.equal(await page.js(`/남음|초과|지연|늦/.test(document.querySelector('.ed-next').textContent)`),false,'no countdown or lateness');
    await act(page,'+15분');await page.sleep(100);
    // Put the length back for the scenarios after this one.
    await page.js(`(async()=>{const {getState}=await __mod('/src/app/store/state.ts');const {resize}=await __mod('/src/app/store/tasks.ts');const t=getState().snapshot.tasks.find(t=>t.title===${JSON.stringify(title)});await resize(t,${before.duration});})()`);
    await page.sleep(400);
    assert.equal((await task(page,title)).duration,before.duration);
  }},
  {name:'Esc lets go of a selection before it leaves 몰입, and the bar reads its allocation',run:async page=>{
    await go(page);
    assert.match(await page.text('.today-bar .cap .sr-only'),/^배분 .+ \/ 가용 /,'the allocation has a spoken label');
    await page.click('.today-day .blk .main',undefined,{modifiers:8});await page.sleep(200);
    assert.match(await page.text('.multi-bar'),/^1개 선택/);
    await page.key('Escape');await page.sleep(300);
    assert.equal(await page.js(`!!document.querySelector('.multi-bar')`),false,'the selection is let go');
    assert.equal(await page.js(`document.querySelector('.content').dataset.view`),'today','still on 몰입');
    await page.key('Escape');await page.sleep(300);
    assert.equal(await page.js(`document.querySelector('.content').dataset.view`),'plan','the next Esc leaves');
  }},
  {name:'나중에 sends the next block to the top of the shelf and the keyboard stays on the card',run:async page=>{
    await go(page);
    const title=await next(page);
    await page.js(`document.querySelector('.ed-next .ed-next-done').focus()`);
    await act(page,'나중에');
    assert.equal((await task(page,title)).date,null,'back in 준비');
    assert.equal(await page.text('.today-side .tray .tblk .ttl'),title,'on top of the shelf beside the day');
    assert.notEqual(await next(page),title,'the following block is next');
    assert.equal(await page.js(`document.activeElement?.classList.contains('ed-next-done')`),true,'focus is on the new next block’s 완료');
  }},
  {name:'완료 moves to the following block and a day with nothing left says so',run:async page=>{
    await go(page);
    let guard=0,count=0;
    while(await page.js(`!!document.querySelector('.ed-next .ed-next-done')`)&&guard++<20){
      const title=await next(page);
      await act(page,'완료');count++;
      assert.equal((await task(page,title)).done,true,title+' is done');
      if(await page.js(`!!document.querySelector('.ed-next .ed-next-done')`))assert.equal(await page.js(`document.activeElement?.classList.contains('ed-next-done')`),true,'focus follows to the next card');
    }
    assert.ok(count>0);
    // Fixed blocks are not "next"; finish them from the queue so nothing is left.
    while(await page.js(`!!document.querySelector('.queue .chk')`)&&guard++<40){await page.click('.queue .chk');await page.sleep(600);}
    assert.match(await page.text('.today-bar .day-end'),/^오늘 끝 · 완료 \d+$/,'오늘 끝 shows beside the meter');
    assert.equal(await page.js(`document.querySelector('.today-bar .day-end').textContent.match(/\\d+$/)[0]`),await page.js(`document.querySelector('.today-day .bin-label b').textContent`),'the same count as the 완료 bin');
    assert.match(await page.text('[role=status]'),/오늘 끝$/,'finishing the day is said once, with the completion');
    assert.equal(await page.js(`!!document.querySelector('.today-main .ed-next')`),false,'the side keeps 준비 on top');
    await page.shot('focus-day-done');
  }},
];
