import assert from 'node:assert/strict';
import {dockState,setDock,toBench,toFocus,toPlan,view} from './support/nav.mjs';

// Single-key shortcuts: they move the range, the dock and the screen, and never take a key from a field, a dialog or search.
const SHIFT=8;
const period=page=>page.text('.segmented [aria-checked=true]');
const heading=page=>page.text('header.topbar h1');
const press=async(page,key,code,extra={})=>{await page.key(key,{code,...extra});await page.sleep(300);};
const active=page=>page.js(`(()=>{const a=document.activeElement;return a?(a.id||a.className||a.tagName):null})()`);

export default [
  {name:'on the work screen D, W, 2 and M pick the range and T comes back to today, on a Korean layout too',run:async page=>{
    await toPlan(page);
    const week=await heading(page);
    await press(page,'d','KeyD');assert.equal(await period(page),'일');
    await press(page,'2','Digit2');assert.equal(await period(page),'2주');
    await press(page,'m','KeyM');assert.equal(await period(page),'월');
    await press(page,'w','KeyW');assert.equal(await period(page),'주');
    await page.click('header.topbar button[aria-label="다음 주"]');await page.sleep(200);
    assert.notEqual(await heading(page),week);
    // ㅅ is where T is on the Korean layout: the physical key decides.
    await press(page,'ㅅ','KeyT');
    assert.equal(await heading(page),week,'T returns to the week with today');
  }},
  {name:'[ folds and unfolds the dock and ] widens and narrows it, keeping the keyboard in the dock',run:async page=>{
    await toPlan(page);
    await press(page,'[','BracketLeft');assert.equal(await dockState(page),'hidden');
    await press(page,'[','BracketLeft');assert.equal(await dockState(page),'narrow');
    await press(page,']','BracketRight');assert.equal(await dockState(page),'wide');
    assert.ok(await page.js('!!document.querySelector("#dock .jb-shelf")'),'wide is the bench');
    await press(page,']','BracketRight');assert.equal(await dockState(page),'narrow');
    await press(page,'[','BracketLeft');await press(page,']','BracketRight');
    assert.equal(await dockState(page),'wide','] from a folded dock opens the bench');
    // A card on the bench has the keyboard; when its width goes, the dock's own control takes it.
    await page.js(`document.querySelector('#dock .jb-card .main').focus()`);
    await press(page,']','BracketRight');
    assert.equal(await dockState(page),'narrow');
    assert.match(await active(page),/dock-fold/,'the keyboard lands on the dock control, not the page');
  }},
  {name:'a key typed into a field, under search or under the ? list is never a shortcut',run:async page=>{
    await toPlan(page);
    await page.click('#tray-capture');await page.type('dw');await press(page,'[','BracketLeft',{text:'['});
    assert.equal(await period(page),'주');assert.equal(await dockState(page),'narrow','typing keeps the dock');
    assert.equal(await page.js(`document.querySelector('#tray-capture').value`),'dw[');
    await page.js(`document.activeElement.blur()`);
    await page.key('k',{code:'KeyK',modifiers:2});await page.sleep(300);
    assert.ok(await page.js('!!document.querySelector(".search-panel")'),'Ctrl+K opens search');
    await press(page,'f','KeyF');assert.equal(await view(page),'plan','search keeps its keys');
    await page.key('Escape');await page.sleep(300);
    assert.equal(await page.js('!!document.querySelector(".search-panel")'),false);
    await press(page,'?','Slash',{modifiers:SHIFT});
    assert.ok(await page.js(`!!document.querySelector('dialog.key-list[open]')`),'? opens the key list');
    assert.ok((await page.text('dialog.key-list')).includes('준비 넓히기'));
    await press(page,'f','KeyF');assert.equal(await view(page),'plan','F under the list does nothing');
    await page.key('Escape');await page.sleep(300);
    assert.equal(await page.js(`!!document.querySelector('dialog.key-list[open]')`),false,'Esc closes the list');
    assert.equal(await view(page),'plan','and stays on the work screen');
  }},
  {name:'F and Esc move between the screens, A goes to the capture field, and the side editor keeps its Esc',run:async page=>{
    await toPlan(page);
    await press(page,'f','KeyF');assert.equal(await view(page),'today','F opens focus');
    await press(page,'f','KeyF');assert.equal(await view(page),'plan','F again returns');
    await toFocus(page);
    await press(page,'a','KeyA');assert.equal(await active(page),'tray-capture','A goes to the capture field');
    await press(page,'Escape','Escape');assert.equal(await view(page),'today','Esc in the field stays with the field');
    await page.js(`document.activeElement.blur()`);
    await page.click('.today-day .blk .main');await page.sleep(400);
    assert.ok(await page.js(`!!document.querySelector('.ed-panel')`),'the side editor is open');
    await page.js(`document.activeElement.blur()`);
    await press(page,'Escape','Escape');
    assert.equal(await view(page),'today','with the side editor open Esc does not leave focus');
    // Leaving focus closes the side editor (its draft stays), so the next visit's Esc is free to return.
    await page.click('header.topbar button','작업 화면');await page.sleep(300);
    await toFocus(page);await page.js(`document.activeElement?.blur()`);
    assert.equal(await page.js(`!!document.querySelector('.ed-panel')`),false);
    await press(page,'Escape','Escape');assert.equal(await view(page),'plan','Esc returns to the work screen');
  }},
  {name:'settings answer only F and ?',run:async page=>{
    await toPlan(page);
    await page.click('header.topbar button[aria-label="설정"]');await page.sleep(300);
    assert.equal(await view(page),'settings');
    await press(page,'[','BracketLeft');await press(page,'d','KeyD');await press(page,'Escape','Escape');
    assert.equal(await view(page),'settings','no dock, range or Esc keys in settings');
    await press(page,'f','KeyF');assert.equal(await view(page),'today','F still opens focus');
    await setDock(page,'narrow');
  }},
];
