import assert from 'node:assert/strict';

// Preview data: §10 example (A 60, B 45, C 30, D 60 flow; workshop 14:00 fixed; E 90, F 120) at 10:20.
const space='.today-day .space';
const find=(page,text)=>page.rect('.today-day .blk, .tray .tblk, .today-day .ublk',text);
export default [
  {name:'initial layout follows the stored order without times on flow blocks',run:async page=>{
    assert.deepEqual(await page.blocks(space),['설계 문서 자료 조사, 예상 09:00–10:00','설계 문서 초안 작성, 예상 10:00–10:45','회의록 정리, 예상 10:45–11:15','분리망 배포 의존성 검토, 예상 13:00–14:00','설계 워크숍, 시각 고정 14:00–15:00','신규 입사자 교육 자료, 예상 15:00–16:30']);
    assert.match(await page.text('.today-day .shelf'),/경쟁사 자료 조사/);
    await page.shot('today-initial');
  }},
  {name:'completing at 10:20 pulls the block into the intake and lays the rest out from now',run:async page=>{
    await page.click('.today-day .blk.next .chk');await page.sleep(900);
    assert.deepEqual((await page.blocks(space)).slice(0,3),['설계 문서 초안 작성, 예상 10:20–11:05','회의록 정리, 예상 11:05–11:35','분리망 배포 의존성 검토, 예상 13:00–14:00']);
    assert.match(await page.text('.today-day .bin'),/완료 1/);
    assert.match(await page.text('.today-bar .anchor'),/10:20 기준/);
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
    const grip=await page.rect('.today-day .blk.next .grip');
    await page.mouse('mouseMoved',grip.cx,grip.cy,0);await page.mouse('mousePressed',grip.cx,grip.cy);
    for(let i=1;i<=6;i++){await page.mouse('mouseMoved',grip.cx,grip.cy+i*6);await page.sleep(16);}
    await page.mouse('mouseReleased',grip.cx,grip.cy+36,0);await page.sleep(700);
    // Each scenario starts from the preview data: 60 → 90 minutes pushes the next block to 10:30.
    assert.deepEqual((await page.blocks(space)).slice(0,2),['설계 문서 자료 조사, 예상 09:00–10:30','설계 문서 초안 작성, 예상 10:30–11:15']);
  }},
  {name:'clicking a block opens it beside the space with title and memo first',run:async page=>{
    await page.click('.today-day .blk .main','설계 문서 초안');
    assert.equal(await page.js('document.querySelector(".today-day .blk.sel")?.textContent.includes("설계 문서 초안")'),true);
    assert.ok(await page.js('!!document.querySelector(".today-side [aria-label=\'블록 상세\']")'));
  }},
];
