import assert from 'node:assert/strict';
import {ready,setDock,toPlan} from './support/nav.mjs';

// On the work screen the editor opens beside the block it came from; it is the same modal dialog, only placed.
const dialog=page=>page.rect('dialog.ed-dialog[open]');
const overlaps=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;

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
    await page.key('Escape');await page.sleep(300);
    assert.equal(await dialog(page),null);
    // From the keyboard too. (Focus does not come back to a week block after closing, centred or beside: an existing gap, not this change.)
    await page.js(`document.querySelector('.wk-col .blk .main').focus()`);
    await page.key('Enter',{text:'\r'});await page.sleep(400);
    assert.ok(await page.js(`document.querySelector('dialog.ed-dialog[open]')?.classList.contains('beside')`),'beside from the keyboard too');
    await page.key('Escape');await page.sleep(300);
    assert.equal(await dialog(page),null,'Esc closes it as before');
  }},
  {name:'a card in the narrow dock opens beside the dock; a narrow window keeps the centred dialog',run:async page=>{
    await setDock(page,'narrow');
    const card=await page.rect('#dock .tblk');
    await page.click('#dock .tblk .main');await page.sleep(400);
    const d=await dialog(page);
    assert.ok(d.x>=card.x+card.w,'to the right of the dock card');
    await page.key('Escape');await page.sleep(300);
    await page.goto('/?now=10:20',{width:720,height:900});await ready(page);await toPlan(page);
    await page.click('.wk-col .blk .main');await page.sleep(400);
    assert.equal(await page.js(`document.querySelector('dialog.ed-dialog[open]')?.classList.contains('beside')`),false,'centred at 720px');
    await page.key('Escape');await page.sleep(300);
  }},
];
