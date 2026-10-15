import assert from 'node:assert/strict';
import {ready,setDock,toFocus,toPlan} from './support/nav.mjs';

// A day's 근무 외 carries its own fix, and today states when its remaining plan ends (planned, never a countdown).
const task=async(page,title)=>{const t=await page.task(title);return t&&{date:t.plan_date,fixed:!!t.starts_at};};
const head=sel=>`.wk-head.today ${sel}`;
// What in today's head the fix covers: the date line, the pill, the meter and each count it shows. Empty means clear.
const covered=(page,scope)=>page.js(`(()=>{const h=document.querySelector(${JSON.stringify(scope)}),b=h.querySelector('.wk-return').getBoundingClientRect();
  return [...h.querySelectorAll('.wk-day>*,.pm,.wk-alloc>span')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.left<b.right&&r.right>b.left&&r.top<b.bottom-2&&r.bottom>b.top+2;}).map(e=>e.className||e.textContent);})()`);
const headHeight=page=>page.js(`document.querySelector('.wk-head.today').offsetHeight`);

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
    const before=await headHeight(page);
    await page.click(head('.wk-return'));await page.sleep(900);
    assert.equal(await headHeight(page),before,'the head keeps its height as the fix leaves, so the axis stays put');
    assert.equal(await page.js(`document.activeElement===document.querySelector('.wk-head.today .wk-date')`),true,'focus lands on the day’s head as the fix leaves');
    assert.equal((await task(page,'경쟁사 자료 조사')).date,null,'back in 준비');
    assert.equal(await page.text('#dock .tray .tblk .ttl'),'경쟁사 자료 조사','on top of the shelf');
    assert.deepEqual(await task(page,'설계 워크숍'),fixedBefore,'fixed work keeps its reservation');
    assert.equal(await page.js(`!!document.querySelector('.wk-head.today .wk-return')`),false,'the fix goes with the overflow');
    assert.doesNotMatch(await page.text(head('.wk-alloc')),/근무 외/);
    await page.shot('overflow-returned');
  }},
  {name:'준비로 covers nothing in a 118px head and stays in its strip head in 일',viewport:{width:1180,height:900},run:async page=>{
    await setDock(page,'wide');
    assert.ok(Math.round((await page.rect('.wk-head.today')).w)<=120,'the columns are at their narrowest');
    assert.deepEqual(await covered(page,'.wk-head.today'),[],'the fix clears the date, the 오늘 pill and the counts');
    const heights=await page.js(`new Set([...document.querySelectorAll('.wk-head')].map(e=>e.offsetHeight)).size`);
    assert.equal(heights,1,'all seven heads keep one height');
    await page.shot('overflow-head-1180-wide');
    // Beside the wide dock and the folded 기다림 band the week scrolls sideways, so a late weekday is brought in first.
    await page.js(`document.querySelector('.wk-head.today').scrollIntoView({block:'nearest',inline:'center'})`);await page.sleep(150);
    await page.click('.wk-head.today .wk-date');await page.sleep(500);
    for(const width of [1180,390]){
      if(width===390){
        await page.goto('/?now=10:20',{width:390,height:900});await ready(page);
        if(!await page.js(`!!document.querySelector('.dv-strip')`)){await page.js(`document.querySelector('.wk-head.today').scrollIntoView({block:'center',inline:'center'})`);await page.click('.wk-head.today .wk-date');await page.sleep(500);}
      }
      await page.js(`document.querySelector('.dv-strip').scrollIntoView({block:'center'})`);
      const inside=await page.js(`(()=>{const h=document.querySelector('.dv-strip .wk-head.today'),b=h.querySelector('.wk-return');const r=b.getBoundingClientRect(),o=h.getBoundingClientRect();
        return {parent:b.offsetParent===h,inside:r.left>=o.left-0.5&&r.right<=o.right+0.5&&r.top>=o.top-0.5&&r.bottom<=o.bottom+0.5,h:Math.round(r.height)};})()`);
      assert.equal(inside.parent&&inside.inside,true,`the fix stays inside its strip head at ${width}`);
      assert.deepEqual(await covered(page,'.dv-strip .wk-head.today'),[],`the fix covers nothing at ${width}`);
      if(width===390){
        assert.ok(inside.h>=44,'a touch-sized fix');
        assert.ok((await page.rect('.dv-strip .wk-head.today .pill')).h<24,'the 오늘 pill stays on one line');
      }
      await page.shot('overflow-day-'+width);
    }
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
