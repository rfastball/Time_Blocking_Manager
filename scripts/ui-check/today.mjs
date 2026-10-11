import assert from 'node:assert/strict';

// Preview data: §10 example (A 60, B 45, C 30, D 60 flow; workshop 14:00 fixed; E 90, F 120) at 10:20.
const space='.today-day .space';
const find=(page,text)=>page.rect('.today-day .blk, .tray .tblk',text);
export default [
  {name:'initial layout follows the stored order without times on flow blocks',run:async page=>{
    assert.deepEqual(await page.blocks(space),['설계 문서 자료 조사, 예상 09:00–10:00','설계 문서 초안 작성, 예상 10:00–10:45','회의록 정리, 예상 10:45–11:15','분리망 배포 의존성 검토, 예상 13:00–14:00','설계 워크숍, 시각 고정 14:00–15:00','신규 입사자 교육 자료, 예상 15:00–16:30','경쟁사 자료 조사, 예상 18:00–20:00']);
    assert.match(await page.text('.today-day .blk.over'),/경쟁사 자료 조사/,'work that no longer fits runs past the end of work instead of leaving the timetable');
    await page.shot('today-initial');
  }},
  {name:'a block past the end of work drags back into the order while the space holds still',viewport:{width:1440,height:900},run:async page=>{
    await page.js(`document.querySelector('.today-day .blk.over').scrollIntoView({block:'end'})`);await page.sleep(300);
    const o=await find(page,'경쟁사 자료 조사'),c=await find(page,'신규 입사자 교육');
    const tops=[],top=()=>page.js(`document.querySelector('${space}').getBoundingClientRect().top`);
    await page.mouse('mouseMoved',o.x+60,o.y+10,0);await page.mouse('mousePressed',o.x+60,o.y+10);
    for(let i=1;i<=20;i++){await page.mouse('mouseMoved',o.x+60,o.y+10+(c.y-20-o.y)*i/20);await page.sleep(20);tops.push(await top());}
    for(let i=0;i<8;i++){await page.mouse('mouseMoved',o.x+60,c.y-20+(i%2));await page.sleep(30);tops.push(await top());}
    await page.mouse('mouseReleased',o.x+60,c.y-20,0);await page.sleep(700);
    assert.equal(new Set(tops.map(Math.round)).size,1,'the space never shifts under a held block');
    const order=(await page.blocks(space)).map(b=>b.split(',')[0]);
    assert.equal(order.indexOf('경쟁사 자료 조사'),order.indexOf('신규 입사자 교육 자료')-1);
  }},
  {name:'completing at 10:20 pulls the block into the intake and lays the rest out from now',run:async page=>{
    await page.js(`document.querySelector('.queue .chk').focus()`);
    await page.key('Enter',{text:'\r'});await page.sleep(900);
    assert.equal(await page.js(`document.activeElement?.getAttribute('aria-label')`),'설계 문서 초안 작성 완료','completion keeps the keyboard on the next completion button');
    assert.deepEqual((await page.blocks(space)).slice(0,3),['설계 문서 초안 작성, 예상 10:20–11:05','회의록 정리, 예상 11:05–11:35','분리망 배포 의존성 검토, 예상 13:00–14:00']);
    assert.match(await page.text('.today-day .bin'),/완료 1/);
    assert.match(await page.text('.today-bar .anchor'),/10:20 기준/);
    const gap=await page.js(`(()=>{const c=document.querySelector('${space} .ceiling').getBoundingClientRect(),b=document.querySelector('${space} .blk.flow').getBoundingClientRect();return Math.round(b.top-c.bottom);})()`);
    assert.ok(gap>=0&&gap<=2,`the first flow block hangs right under the ceiling (${gap}px)`);
    await page.shot('today-ceiling');
    await page.js(`(()=>{const button=document.querySelector('.queue .chk');button.focus();button.click();document.querySelector('.today-side #tray-capture').focus();})()`);await page.sleep(200);
    assert.equal(await page.js(`document.activeElement?.id`),'tray-capture','completion does not take focus back after another control was chosen');
    for(let i=0;i<6&&await page.rect('.queue .chk');i++){
      await page.js(`document.querySelector('.queue .chk').focus()`);await page.key('Enter',{text:'\r'});await page.sleep(200);
    }
    assert.equal(await page.rect('.queue'),null);
    assert.equal(await page.js(`document.activeElement?.id`),'tray-capture','the last completion lands on the stable capture input');
  }},
  {name:'a 미계획 block held over the body opens a gap and drops into that order',run:async page=>{
    const tray=await find(page,'회의록 템플릿'),c=await find(page,'회의록 정리');
    const during=await page.drag({x:tray.x+30,y:tray.y+10},{x:c.x+200,y:c.y+6},{before:async()=>{await page.shot('today-held-body');return {hollow:await page.js('document.querySelectorAll(".today-day .blk.hollow").length'),held:await page.js('!!document.querySelector(".held")')};}});
    assert.deepEqual(during,{hollow:1,held:true});
    const order=(await page.blocks(space)).map(b=>b.split(',')[0]);
    assert.equal(order.indexOf('회의록 템플릿 업데이트'),order.indexOf('회의록 정리')-1);
  }},
  {name:'held on the rail it snaps to a slot and drops as fixed; lunch refuses',run:async page=>{
    const c=await find(page,'회의록 정리'),rail=await page.rect(space+' .rail'),lunch=await page.rect(space+' .brk');
    const work=await find(page,'설계 워크숍');
    await page.drag({x:c.x+80,y:c.y+6},{x:rail.cx,y:work.y+work.h+40},{before:()=>page.shot('today-held-rail')});
    assert.ok((await page.blocks(space)).includes('회의록 정리, 시각 고정 15:30–16:00'),'fixed at 15:30');
    const d=await find(page,'분리망 배포');
    const before=await page.blocks(space);
    await page.drag({x:d.x+80,y:d.y+6},{x:rail.cx,y:lunch.y+10},{before:async()=>{await page.shot('today-held-lunch');assert.match(await page.text('.held'),/점심/);}});
    assert.deepEqual(await page.blocks(space),before);
  }},
  {name:'the grip resizes and the following blocks are laid out again',run:async page=>{
    await page.js(`document.querySelector('.today-day .blk.next')?.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))`);
    const grip=await page.rect('.today-day .blk.next .grip'),before=await page.rect('.today-day .blk.next');
    await page.mouse('mouseMoved',grip.cx,grip.cy,0);await page.mouse('mousePressed',grip.cx,grip.cy);
    await page.mouse('mouseMoved',grip.cx,grip.cy+36);
    const resized=await page.js(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(document.querySelector('.today-day .blk.next').getBoundingClientRect().bottom))))`);
    assert.ok(Math.abs(resized-(before.y+before.h)-36)<=2,`the snapped resize boundary follows the 36px drag within two frames (${resized-(before.y+before.h)}px)`);
    await page.mouse('mouseReleased',grip.cx,grip.cy+36,0);await page.sleep(700);
    // Each scenario starts from the preview data: 60 → 90 minutes pushes the next block to 10:30.
    assert.deepEqual((await page.blocks(space)).slice(0,2),['설계 문서 자료 조사, 예상 09:00–10:30','설계 문서 초안 작성, 예상 10:30–11:15']);
  }},
  {name:'clicking a block opens it beside the space with title and memo first',run:async page=>{
    await page.click('.today-day .blk .main','설계 문서 초안');
    assert.equal(await page.js('document.querySelector(".today-day .blk.sel")?.textContent.includes("설계 문서 초안")'),true);
    assert.ok(await page.js('!!document.querySelector(".today-main [aria-label=\'블록 상세\']")'));
  }},
  {name:'at 960px 미계획 follows the main cards without waiting for the timeline',viewport:{width:960,height:640},run:async page=>{
    const main=await page.rect('.today-main'),side=await page.rect('.today-side'),day=await page.rect('.today-day');
    assert.ok(Math.abs(side.y-main.y-main.h-18)<=2,'the side starts directly below the main cards');
    assert.ok(side.y<day.y+day.h,'the tall timeline does not push capture below the whole day');
    assert.ok(await page.js(`document.documentElement.scrollWidth<=innerWidth`),'the page fits the viewport');
    await page.js(`document.querySelector('.today-side #tray-capture').focus()`);
    const capture=await page.rect('.today-side #tray-capture');
    assert.equal(await page.js(`document.activeElement?.id`),'tray-capture');
    assert.ok(capture.y>=0&&capture.y+capture.h<=640,'focusing capture scrolls it into view');
    await page.shot('today-960');
  }},
];
