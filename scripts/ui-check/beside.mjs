import assert from 'node:assert/strict';
import {ready,setDock,toPlan} from './support/nav.mjs';

// On the work screen the editor opens beside the block it came from; it is the same modal dialog, only placed.
const dialog=page=>page.rect('dialog.ed-dialog[open]');
const overlaps=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
// The element holding the keyboard, as the selector it matches and its task.
const focused=(page,selector)=>page.js(`(()=>{const a=document.activeElement;return a?.matches(${JSON.stringify(selector)})?a.closest('[data-task]')?.dataset.task??'':null;})()`);
const taskOf=(page,selector)=>page.js(`document.querySelector(${JSON.stringify(selector)}).closest('[data-task]')?.dataset.task??''`);

export default [
  {name:'a block on the week opens its editor beside it, leaving the block in sight and the calendar where it was',run:async page=>{
    await toPlan(page);
    const cal=await page.rect('.plan-main');
    const block=await page.rect('.wk-col .blk .main');
    await page.click('.wk-col .blk .main');await page.sleep(400);
    const d=await dialog(page);
    assert.ok(d,'the editor is open');
    assert.ok(await page.js(`document.querySelector('dialog.ed-dialog[open]').classList.contains('beside')`),'placed beside its block');
    assert.equal(overlaps(d,block),false,'the block stays visible');
    assert.ok(d.y>=16&&d.y+d.h<=900-16+1,'inside the window');
    assert.deepEqual(await page.rect('.plan-main'),cal,'the calendar does not move');
    await page.shot('editor-beside');
    const id=await taskOf(page,'.wk-col .blk .main');
    await page.key('Escape');await page.sleep(300);
    assert.equal(await dialog(page),null);
    assert.equal(await focused(page,'.wk-col .blk .main'),id,'the keyboard is back on the week block');
    // From the keyboard too.
    await page.js(`document.querySelector('.wk-col .blk .main').focus()`);
    await page.key('Enter',{text:'\r'});await page.sleep(400);
    assert.ok(await page.js(`document.querySelector('dialog.ed-dialog[open]')?.classList.contains('beside')`),'beside from the keyboard too');
    await page.key('Escape');await page.sleep(300);
    assert.equal(await dialog(page),null,'Esc closes it as before');
    assert.equal(await focused(page,'.wk-col .blk .main'),id,'and back on the block');
    // A press on the veil asks to close like Esc does.
    await page.click('.wk-col .blk .main');await page.sleep(400);
    const open=await dialog(page);
    await page.mouse('mouseMoved',open.x-6,open.y+open.h-4,0);await page.mouse('mousePressed',open.x-6,open.y+open.h-4);await page.mouse('mouseReleased',open.x-6,open.y+open.h-4,0);await page.sleep(300);
    assert.equal(await dialog(page),null,'a press outside closes it');
    assert.equal(await focused(page,'.wk-col .blk .main'),id,'and the keyboard is back on the block');
  }},
  {name:'beside follows a window resize, rises before it shrinks, and narrows before it centres',run:async page=>{
    await page.goto('/?now=10:20',{width:1280,height:720});await ready(page);await toPlan(page);
    await page.click('.wk-col .blk .main');await page.sleep(400);
    const short=await dialog(page);
    assert.ok(await page.js(`document.querySelector('dialog.ed-dialog[open]').classList.contains('beside')`),'beside at 1280×720');
    assert.ok(short.y+short.h<=720-16+1,'inside a short window');
    assert.equal(await page.js(`(()=>{const b=document.querySelector('dialog.ed-dialog[open] .ed-body');return b.scrollHeight>b.clientHeight+1&&document.querySelector('dialog.ed-dialog[open]').getBoundingClientRect().top>17;})()`),false,'it rises before its body has to scroll');
    await page.key('Escape');await page.sleep(300);
    for(const width of [1024,761]){
      await page.goto('/?now=10:20',{width,height:900});await ready(page);await toPlan(page);
      const b=await page.rect('.wk-col .blk .main');
      await page.click('.wk-col .blk .main');await page.sleep(400);
      const d=await dialog(page),beside=await page.js(`document.querySelector('dialog.ed-dialog[open]').classList.contains('beside')`);
      assert.ok(beside,`beside, narrowed, at ${width}px`);
      assert.equal(overlaps(d,b),false,`the block stays visible at ${width}px`);
      assert.ok(d.x>=0&&d.x+d.w<=width,`inside the window at ${width}px`);
      await page.key('Escape');await page.sleep(300);
    }
    // A window that narrows under the open dialog takes it back to the centre (the width is stood in for; the runner cannot resize live).
    await page.goto('/?now=10:20',{width:1440,height:900});await ready(page);await toPlan(page);
    await page.click('.wk-col .blk .main');await page.sleep(400);
    assert.ok(await page.js(`document.querySelector('dialog.ed-dialog[open]').classList.contains('beside')`));
    await page.js(`Object.defineProperty(window,'innerWidth',{value:720,configurable:true});dispatchEvent(new Event('resize'))`);await page.sleep(100);
    assert.equal(await page.js(`document.querySelector('dialog.ed-dialog[open]').classList.contains('beside')`),false,'centred again at 720px');
    assert.equal(await page.js(`document.querySelector('dialog.ed-dialog[open]').style.left`),'','no stale position');
    await page.key('Escape');await page.sleep(300);
  }},
  {name:'a card in the narrow dock opens beside the dock; a narrow window keeps the centred dialog',run:async page=>{
    await setDock(page,'narrow');
    const card=await page.rect('#dock .tblk'),id=await taskOf(page,'#dock .tblk .main');
    await page.click('#dock .tblk .main');await page.sleep(400);
    const d=await dialog(page);
    assert.ok(d.x>=card.x+card.w,'to the right of the dock card');
    await page.key('Escape');await page.sleep(300);
    assert.equal(await focused(page,'#dock .tblk .main'),id,'the keyboard is back on the dock card');
    await page.goto('/?now=10:20',{width:720,height:900});await ready(page);await toPlan(page);
    await page.click('.wk-col .blk .main');await page.sleep(400);
    assert.equal(await page.js(`document.querySelector('dialog.ed-dialog[open]')?.classList.contains('beside')`),false,'centred at 720px');
    await page.key('Escape');await page.sleep(300);
  }},
];
