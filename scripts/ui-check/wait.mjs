import assert from 'node:assert/strict';
import {setDock,toFocus,toPlan} from './support/nav.mjs';

// 기다림: the band right of the calendar. Sample data has a pile of three on 김부장 결재, one on 법무팀 검토, one met date
// (today) and one later date.
const band=page=>page.js(`(()=>{const b=document.querySelector('#wait');return b?(b.classList.contains('closed')?'closed':'open'):null;})()`);
async function openBand(page){if(await band(page)==='closed'){await page.click('#wait .wait-unfold');await page.sleep(300);}assert.equal(await band(page),'open');}
const task=(page,title)=>page.js(`(async()=>{const {getState}=await import('/src/app/store/state.ts');const t=getState().snapshot.tasks.find(t=>t.title===${JSON.stringify(title)});return t&&{date:t.plan_date,pile:t.pile_id??null,order:t.pile_order??null,for:t.wait_for??null,until:t.wait_until??null,since:t.wait_since??null};})()`);
const rows=page=>page.js(`[...document.querySelectorAll('#wait .wait-list>*')].map(r=>r.matches('.wpile')?r.getAttribute('aria-label'):r.querySelector('.trig')?.textContent+' / '+r.querySelector('.wbody .ttl')?.textContent)`);
const shelfTop=page=>page.js(`document.querySelector('#dock .tblk .ttl')?.textContent??null`);

const scenarios=[
  {name:'the band reads met dates, then triggers, then later dates; a pile rests as one block',run:async page=>{
    await toPlan(page);await openBand(page);
    const r=await rows(page);
    assert.equal(r[0],'10/14 이후 / 교육 결과 보고'.replace('10/14',await page.js(`(()=>{const d=new Date();return (d.getMonth()+1)+'/'+d.getDate();})()`)),'the met date leads');
    assert.ok(r.includes('김부장 결재 3건'),'three on one trigger are one pile');
    assert.ok(r.indexOf('김부장 결재 3건')<r.indexOf('법무팀 검토 / 협약서 문안'),'가나다 order');
    assert.ok(/이후 \/ 분기 실적 취합$/.test(r[r.length-1]),'the later date last');
    // The met date pokes over the band's edge; waiting ones stay inside.
    const bandBox=await page.rect('#wait'),ready=await page.rect('#wait .wrow.ready');
    assert.ok(ready.x<bandBox.x,'a met date pokes out');
    // At 1440px the week still fits beside a narrow dock and the open band.
    assert.ok(await page.js(`(()=>{const g=document.querySelector('.wk-grid'),p=g.parentElement;return g.scrollWidth<=p.clientWidth+1&&g.getBoundingClientRect().right<=document.querySelector('#wait').getBoundingClientRect().left;})()`),'the week fits');
    await page.shot('wait-band');
  }},
  {name:'B pushes a block out and the trigger field names it; the tag handle brings it back to the shelf top',run:async page=>{
    await toPlan(page);await openBand(page);
    await page.js(`document.querySelector('.space button.main[data-task="sample-c"]')?.focus()`);
    await page.key('b',{code:'KeyB'});await page.sleep(500);
    assert.ok(await page.js(`document.activeElement?.id==='wait-trigger'`),'the field takes the keyboard');
    assert.equal((await task(page,'회의록 정리')).date,null,'its day lets it go');
    await page.type('김부장 결재');await page.sleep(100);
    await page.key('Enter');await page.sleep(500);
    assert.equal((await task(page,'회의록 정리')).for,'김부장 결재');
    assert.ok((await rows(page)).includes('김부장 결재 4건'),'it joins the pile');
    await page.shot('wait-pushed');
    // A single block's handle: the tag comes off and the block lands on top of the shelf, named in place.
    const handle=await page.rect('#wait .wrow:not(.ready) .handle');
    const title=await page.js(`document.querySelector('#wait .wrow:not(.ready) .wbody .ttl').textContent`);
    await page.click('#wait .wrow:not(.ready) .handle');await page.sleep(900);
    assert.ok(handle);
    assert.equal(await shelfTop(page),title,'back on top of the shelf');
    assert.ok(await page.js(`document.activeElement?.id==='wait-rename'`),'renamed in place');
    // The title is selected, ready to be replaced by the next action.
    await page.type('시행문 발송');await page.key('Enter');await page.sleep(500);
    assert.equal(await shelfTop(page),'시행문 발송');
    assert.ok(await page.js(`!!document.querySelector('.wtoast')`),'the way back is offered');
  }},
  {name:'a pile parts under a resting mouse and drops into a list on a press; Esc folds it',run:async page=>{
    await toPlan(page);await openBand(page);
    const pile=await page.rect('#wait .wpile');
    await page.mouse('mouseMoved',pile.cx,pile.y+40,0);await page.sleep(700);
    assert.ok(await page.js(`!!document.querySelector('.wpile-layer')`),'peeking lifts it into a layer');
    await page.shot('wait-peek');
    await page.click('.wpile-layer .wcard.front .wbody');await page.sleep(700);
    const cards=await page.js(`[...document.querySelectorAll('.wpile-layer .wcard')].map(c=>Math.round(c.getBoundingClientRect().top))`);
    assert.ok(cards.every((y,i)=>i===0||y-cards[i-1]>=36),'the blocks stand in a list');
    await page.shot('wait-open');
    await page.key('Escape');await page.sleep(700);
    assert.equal(await page.js(`document.querySelectorAll('.wpile-layer').length`),0,'folded back into its row');
  }},
  {name:'dragging a block onto the band pushes it; the band folds to its count',run:async page=>{
    await toPlan(page);await openBand(page);
    const from=await page.rect('.space button.main[data-task="sample-d"]'),to=await page.rect('#wait .wait-list');
    await page.drag({x:from.cx,y:from.cy},{x:to.cx,y:to.y+120},{hold:400});await page.sleep(400);
    assert.equal((await task(page,'분리망 배포 의존성 검토')).date,null);
    assert.ok((await task(page,'분리망 배포 의존성 검토')).since,'it waits');
    await page.key('Escape');await page.sleep(300);
    await page.click('#wait .wait-fold');await page.sleep(300);
    assert.equal(await band(page),'closed');await page.shot('wait-closed');
    assert.match(await page.js(`document.querySelector('.wait-unfold').getAttribute('aria-label')`),/^기다림 펴기, \d+건, 충족 1건$/);
    await page.key('\\',{code:'Backslash'});await page.sleep(300);
    assert.equal(await band(page),'open','\\ opens it again');
  }},
  {name:'the band is one tab stop: arrows walk rows, → raises a pile, letters jump by 초성, F2 changes a trigger, B meets one',run:async page=>{
    await toPlan(page);await openBand(page);
    await page.js(`document.querySelector('#wait [data-wait][tabindex="0"]').focus()`);
    assert.equal(await page.js(`document.querySelectorAll('#wait [data-wait][tabindex="0"]').length`),1,'one tab stop');
    const focused=()=>page.js(`document.activeElement?.dataset.wait??null`);
    assert.equal(await focused(),'sample-w5','the met date first');
    await page.key('ArrowDown');await page.sleep(150);
    assert.equal(await focused(),'sample-w1','then the pile, by its front');
    await page.key('ArrowRight');await page.sleep(600);
    assert.ok(await page.js(`!!document.querySelector('.wpile-layer .wtray')`),'→ raises it');
    await page.key('ArrowDown');await page.sleep(150);
    assert.equal(await focused(),'sample-w2','arrows stay inside the raised pile');
    await page.key('ArrowLeft');await page.sleep(600);
    assert.equal(await focused(),'sample-w1','← folds it back to its front');
    // ㅂ (KeyQ) jumps to 법무팀 by its trigger; F2 opens its trigger for a change in place.
    await page.key('q',{code:'KeyQ'});await page.sleep(150);
    assert.equal(await focused(),'sample-w4');
    await page.key('F2');await page.sleep(300);
    assert.equal(await page.js(`document.activeElement?.value`),'법무팀 검토','the trigger, ready to change');
    await page.js(`(()=>{const i=document.activeElement;i.select();})()`);await page.type('법무팀 회신');await page.key('Enter');await page.sleep(500);
    assert.equal((await task(page,'협약서 문안')).for,'법무팀 회신');
    assert.equal(await focused(),'sample-w4','the keyboard returns to the block');
    const since=(await task(page,'협약서 문안')).since;
    await page.key('b',{code:'KeyB'});await page.sleep(900);
    assert.equal((await task(page,'협약서 문안')).since,null,'B meets it');
    assert.ok(since);
    assert.ok(await page.js(`document.activeElement?.id==='wait-rename'`));
    await page.key('Escape');await page.sleep(300);
    assert.equal(await shelfTop(page),'협약서 문안','Esc keeps its title');
  }},
  {name:'a waiting block dragged onto a day is planned there and named in place; a pile goes to 준비 whole',run:async page=>{
    await toPlan(page);await openBand(page);
    const from=await page.rect('#wait .wrow:not(.ready) .wbody'),title=await page.js(`document.querySelector('#wait .wrow:not(.ready) .wbody .ttl').textContent`);
    const day=await page.rect('.wk-head:not(.past):not(.today)');
    await page.drag({x:from.cx,y:from.cy},{x:day.cx,y:day.y+day.h+200},{hold:400});await page.sleep(500);
    const t=await task(page,title);
    assert.ok(t.date&&t.since===null,'a date ends the wait');
    assert.ok(await page.js(`document.activeElement?.id==='wait-rename'`),'named in place');
    await page.key('Escape');await page.sleep(300);
    // The whole pile: dragged from its front onto the narrow dock's list, every block lands on top of the shelf.
    const pile=await page.rect('#wait .wpile-rest'),tray=await page.rect('#dock .tray .well');
    await page.mouse('mouseMoved',pile.cx,pile.y+45,0);
    await page.drag({x:pile.cx,y:pile.y+45},{x:tray.cx,y:tray.y+20},{hold:400});await page.sleep(500);
    for(const name of ['상신 문서 보완','출장비 정산','물품 구매 요청'])assert.equal((await task(page,name)).since,null,name+' revived');
    assert.equal(await shelfTop(page),'상신 문서 보완','in the pile’s order, on top');
    for(let i=0;i<3;i++){await page.key('Enter');await page.sleep(250);}
    assert.equal(await page.js(`!!document.querySelector('#wait-rename')`),false,'Enter walks the revived blocks, then lets go');
  }},
  {name:'the band and its blocks take each theme’s corners, edges and ink',run:async page=>{
    await toPlan(page);await openBand(page);
    const pile=await page.rect('#wait .wpile'),off=[];
    try{
      for(const theme of ['default','g1','g3','g4']){
        await page.js(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);await page.sleep(150);
        const look=await page.js(`(()=>{const s=e=>getComputedStyle(document.querySelector(e)),root=getComputedStyle(document.documentElement);
          return {block:root.getPropertyValue('--radius-block').trim(),panel:root.getPropertyValue('--radius-panel').trim(),edge:root.getPropertyValue('--border-panel-width').trim(),
            tag:s('#wait .wrow:not(.ready) .wtag').borderTopLeftRadius,body:s('#wait .wrow:not(.ready) .wbody').borderBottomRightRadius,
            band:s('#wait').borderTopLeftRadius,bandEdge:s('#wait').borderTopWidth};})()`);
        const px=v=>parseFloat(v)||0;
        for(const [a,b,what] of [[look.tag,look.block,'a tag rounds like a block'],[look.body,look.block,'a body rounds like a block'],[look.band,look.panel,'the band rounds like a panel'],[look.bandEdge,look.edge,'the band’s edge is the panel’s']])
          if(px(a)!==px(b))off.push(`${theme}: ${what} (${a} vs ${b})`);
        await page.shot('wait-theme-'+theme);
        await page.mouse('mouseMoved',pile.cx,pile.y+40,0);await page.sleep(500);
        await page.click('.wpile-layer .wcard.front .wbody');await page.sleep(700);
        await page.shot('wait-theme-open-'+theme);
        await page.key('Escape');await page.mouse('mouseMoved',pile.x-200,pile.y,0);await page.sleep(700);
      }
    }finally{await page.js(`document.documentElement.dataset.theme='default'`);}
    assert.deepEqual(off,[]);
  }},
  {name:'on the focus screen B pushes the next block and the field floats beside it',run:async page=>{
    await toFocus(page);
    await page.js(`document.querySelector('.ed-next .ed-next-open')?.focus()`);
    const before=await page.js(`document.activeElement?.closest('[data-task]')?.dataset.task??null`);
    assert.ok(before,'a block has the keyboard');
    await page.key('b',{code:'KeyB'});await page.sleep(500);
    assert.ok(await page.js(`!!document.querySelector('.wname.floating')`),'the field floats');
    await page.key('Escape');await page.sleep(300);
    const since=await page.js(`(async()=>{const {getState}=await import('/src/app/store/state.ts');return getState().snapshot.tasks.find(t=>t.id===${JSON.stringify(before)})?.wait_since??null;})()`);
    assert.ok(since,'it waits, unnamed');
  }},
];
export default scenarios;
