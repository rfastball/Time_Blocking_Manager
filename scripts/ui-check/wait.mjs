import assert from 'node:assert/strict';
import {dockState,setDock,toFocus,toPlan} from './support/nav.mjs';

// 기다림: the band right of the calendar. Sample data has a pile of three on 김부장 결재, one on 법무팀 검토, one met date
// (today) and one later date.
const band=page=>page.js(`(()=>{const b=document.querySelector('#wait');return b?(b.classList.contains('closed')?'closed':'open'):null;})()`);
async function openBand(page){if(await band(page)==='closed'){await page.click('#wait .wait-unfold');await page.sleep(300);}assert.equal(await band(page),'open');}
const task=async(page,title)=>{const t=await page.task(title);return t&&{date:t.plan_date,pile:t.pile_id??null,order:t.pile_order??null,for:t.wait_for??null,until:t.wait_until??null,since:t.wait_since??null};};
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
    // How long it has waited shows only from a week on: the pile's oldest (9 days) says so, the 4-day one does not.
    assert.deepEqual(await page.js(`[...document.querySelectorAll('#wait .since')].map(e=>e.textContent)`),['9일째']);
    assert.match(await page.js(`document.querySelector('#wait [data-wait="sample-w4"]').getAttribute('aria-label')`),/, \d+\/\d+부터$/,'the day it began stays in its name');
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
    const slice=sel=>page.js(`Math.round(document.querySelector('${sel} .wcard.front .wslice').getBoundingClientRect().width)`);
    assert.equal(await slice('.wpile-layer'),0,'peeking, the front still reads as one block');
    await page.click('.wpile-layer .wcard.front .wbody');await page.sleep(700);
    assert.equal(await slice('.wpile-layer'),30,'raised, each block shows its own handle');
    const cards=await page.js(`[...document.querySelectorAll('.wpile-layer .wcard')].map(c=>Math.round(c.getBoundingClientRect().top))`);
    assert.ok(cards.every((y,i)=>i===0||y-cards[i-1]>=36),'the blocks stand in a list');
    await page.shot('wait-open');
    await page.key('Escape');await page.sleep(700);
    assert.equal(await page.js(`document.querySelectorAll('.wpile-layer').length`),0,'folded back into its row');
    assert.equal(await slice('#wait .wpile-rest'),0,'resting, no handle column');
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
  {name:'collapsed destinations keep an anchored block from arrival through editing in both directions',run:async page=>{
    const preview=async side=>{
      await page.until(`(()=>{const e=document.querySelector('.held.rail-token'),r=e?.getBoundingClientRect();return !!document.querySelector('.rail-panel.${side} .rail-face')&&r&&getComputedStyle(e).opacity==='0';})()`,{message:side+' rail hides the held block completely'});
      assert.equal(await page.js(`document.querySelectorAll('.rail-panel.${side} .rail-face .ttl').length`),1,'the destination shows one preview title');
      assert.equal(await page.js(`document.querySelectorAll('.rail-panel.${side} input').length`),0,'the preview waits for release before editing');
    };
    const anchored=async(side,field)=>{
      const panel='.rail-panel.'+side;
      await page.until(`document.activeElement?.id===${JSON.stringify(field)}&&!!document.querySelector('${panel} #${field}')`,{message:side+' panel owns the focused editor'});
      assert.equal(await page.js(`document.querySelectorAll('.flight.unified,.held').length`),0,'arrival clears the travelling copy');
      assert.ok(await page.js(`!!document.querySelector('${panel} [data-flight]')`),'the editor has an arrival block');
      const p=await page.rect(panel),i=await page.rect('#'+field),rail=await page.rect(side==='left'?'#dock':'#wait');
      assert.ok(i.x>=p.x-1&&i.y>=p.y-1&&i.x+i.w<=p.x+p.w+1&&i.y+i.h<=p.y+p.h+1,'input stays inside its block panel');
      assert.ok(side==='left'?Math.abs(p.x-(rail.x+rail.w))<24:Math.abs(p.x+p.w-rail.x)<24,'panel stays attached to its collapsed rail');
      assert.ok(p.y>=0&&p.y+p.h<=1000,'panel fits the viewport');
      await page.mouse('mouseMoved',720,100,0);await page.sleep(200);
      assert.ok(await page.js(`!!document.querySelector('${panel} #${field}')`),'leaving the rail keeps the editor available');
    };
    await setDock(page,'hidden');await openBand(page);
    await page.click('#wait [data-flight="sample-w4"] .handle');
    await page.until(`!!document.querySelector('.flight.unified')`,{message:'release moves the waiting block as one face'});
    assert.equal(await page.js(`document.querySelectorAll('.wtag.off,.rail-panel .ttl,.rail-panel input').length`),0,'the travelling block has no separate departing tag or duplicate arrival content');
    await anchored('left','wait-rename');
    assert.equal(await dockState(page),'hidden','release preserves the collapsed dock');
    assert.equal((await task(page,'협약서 문안')).since,null);
    await page.shot('wait-hidden-dock-arrival');
    await page.type('협약서 발송');await page.key('Enter');
    await page.until(`!document.querySelector('.rail-panel.left')`,{message:'left panel closes after naming'});
    assert.ok(await task(page,'협약서 발송'),'the arrival title is saved');
    assert.equal(await dockState(page),'hidden');

    await setDock(page,'narrow'); // User opens the source; the destination remains collapsed.
    assert.equal(await band(page),'closed');
    const from=await page.rect('#dock .tblk','협약서 발송'),to=await page.rect('#wait');
    assert.ok(from);
    await page.mouse('mouseMoved',from.cx,from.cy,0);await page.mouse('mousePressed',from.cx,from.cy);
    for(let i=1;i<=14;i++){
      await page.mouse('mouseMoved',from.cx+(to.cx-from.cx)*i/14,from.cy+(to.y+to.h-40-from.cy)*i/14);await page.sleep(16);
    }
    await preview('right');
    assert.equal(await band(page),'closed','preview preserves the collapsed band');
    await page.mouse('mouseMoved',720,100);await page.sleep(250);
    assert.equal(await page.js(`document.querySelectorAll('.rail-panel.right,.held.rail-token').length`),0,'leaving the rail restores the held block and removes its arrival slot');
    await page.mouse('mouseMoved',to.cx,to.y+to.h-40);await preview('right');
    await page.sleep(200); // Let the panel entrance finish before crossing into its arrival face.
    const arrival=await page.rect('.rail-panel.right [data-flight]');
    await page.mouse('mouseMoved',arrival.cx,arrival.cy);await page.sleep(250);
    assert.ok(await page.js(`!!document.querySelector('.rail-panel.right [data-flight]')`),'crossing from the rail into its preview keeps the destination available');
    await page.mouse('mouseReleased',arrival.cx,arrival.cy,0);
    await anchored('right','wait-trigger');
    assert.equal(await band(page),'closed','dropping preserves the collapsed band');
    assert.equal(await dockState(page),'narrow','the source dock width is unchanged');
    await page.shot('wait-closed-band-arrival');
    await page.type('법무팀 회신');await page.key('Enter');
    await page.until(`!document.querySelector('.rail-panel.right')`,{message:'right panel closes after naming'});
    assert.equal((await task(page,'협약서 발송')).for,'법무팀 회신');
    assert.equal(await band(page),'closed');

    await setDock(page,'hidden');await openBand(page);
    const waiting=await page.rect('#wait [data-flight="sample-w4"] .wbody'),dock=await page.rect('#dock');
    await page.mouse('mouseMoved',waiting.cx,waiting.cy,0);await page.mouse('mousePressed',waiting.cx,waiting.cy);
    for(let i=1;i<=14;i++){
      await page.mouse('mouseMoved',waiting.cx+(dock.cx-waiting.cx)*i/14,waiting.cy+(dock.cy-waiting.cy)*i/14);await page.sleep(16);
    }
    await preview('left');
    await page.shot('wait-hidden-dock-preview');
    await page.mouse('mouseReleased',dock.cx,dock.cy,0);
    await anchored('left','wait-rename');
    assert.equal(await dockState(page),'hidden','dragging back preserves the collapsed dock');
    assert.equal(await band(page),'open','dragging back preserves the source band');
    assert.equal((await task(page,'협약서 발송')).since,null,'the returning block is released from waiting');
    await page.key('Escape');
    await page.until(`!document.querySelector('.rail-panel.left')`,{message:'left panel closes after cancelling rename'});
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
  {name:'an open waiting pile saves pointer and keyboard reordering',run:async page=>{
    await toPlan(page);await openBand(page);
    await page.click('#wait .wpile .wtag-text');await page.sleep(650);
    const first=await page.rect('.wpile-layer [data-flight="sample-w1"]'),last=await page.rect('.wpile-layer [data-flight="sample-w3"]');
    await page.drag({x:first.cx,y:first.cy},{x:last.cx,y:last.y+last.h-2},{hold:400});
    const order=()=>page.js(`(async()=>{const {getState}=await __mod('/src/app/store/state.ts');const {waitGroups}=await __mod('/src/waiting.ts');const s=getState();return waitGroups(s.snapshot.tasks,s.today).find(g=>g.text==='김부장 결재').items.map(t=>t.id);})()`);
    assert.deepEqual(await order(),['sample-w2','sample-w3','sample-w1'],'drag saves the last position');
    await page.js(`document.querySelector('.wpile-layer [data-wait="sample-w1"]').focus()`);
    await page.key('ArrowUp',{modifiers:1});await page.sleep(200);
    assert.deepEqual(await order(),['sample-w2','sample-w1','sample-w3'],'Alt+Up saves one position up');
    const moved=await page.rect('.wpile-layer [data-flight="sample-w1"]');
    assert.ok(Math.abs(moved.y-(first.y+38))<1,'waiting neighbors settle at the same 160ms pace as the calendar');
    await page.key('Escape');await page.mouse('mouseMoved',720,100,0);await page.sleep(650);
    await page.click('#wait .wpile .wtag-text');await page.sleep(650);
    assert.deepEqual(await page.js(`[...document.querySelectorAll('.wpile-layer [data-wait]')].map(e=>e.dataset.wait)`),['sample-w2','sample-w1','sample-w3'],'reopening retains the saved order');
    await page.shot('wait-reordered');
  }},
  {name:'waiting details edit one trigger with the task and keep unsaved input as a draft',run:async page=>{
    await toPlan(page);await openBand(page);
    await page.click('#wait .wpile .wtag-text');await page.sleep(650);
    await page.click('.wpile-layer [data-wait="sample-w2"]');
    const input='.ed input[aria-label="트리거"]';
    assert.equal(await page.js(`document.querySelector('${input}')?.value`),'김부장 결재');
    const before=await page.task('출장비 정산');
    await page.js(`document.querySelector('${input}').select()`);await page.type('법무팀 회신');
    await page.click('.ed textarea');await page.type('정산 확인 요청');
    await page.key('Escape');await page.click('.ed-confirm button','초안으로 남기고 닫기');
    assert.equal((await page.task('출장비 정산')).wait_for,'김부장 결재','closing a draft does not save the trigger');
    await page.click('.status button','이어서 편집');
    assert.equal(await page.js(`document.querySelector('${input}')?.value`),'법무팀 회신','draft retains trigger input');
    await page.shot('wait-editor-trigger');
    await page.click('.ed button[type="submit"]');await page.sleep(350);
    const saved=await page.task('출장비 정산');
    assert.equal(saved.wait_for,'법무팀 회신');assert.match(saved.body,/정산 확인 요청/);
    assert.equal(saved.wait_since,before.wait_since);assert.equal(saved.revision,before.revision+1,'one atomic update');
    assert.equal((await page.task('상신 문서 보완')).wait_for,'김부장 결재','siblings keep their trigger');
    await page.click('#wait [data-wait="sample-w2"]');
    await page.js(`document.querySelector('${input}').select()`);await page.type('내일');
    await page.click('.ed button[type="submit"]');await page.sleep(350);
    const dated=await page.task('출장비 정산');
    assert.ok(dated.wait_until);assert.equal(dated.wait_for,'');assert.equal(dated.wait_since,before.wait_since);
    await page.js(`(async()=>{const {openEditor}=await __mod('/src/app/store/editor.ts');openEditor('sample-c');})()`);
    assert.equal(await page.js(`!!document.querySelector('${input}')`),false,'ordinary blocks have no trigger field');
    await page.key('Escape');
  }},
  {name:'raised waiting cards keep the grab point and a hovered pile expands onto the calendar',run:async page=>{
    await toPlan(page);await openBand(page);
    await page.click('#wait .wpile .wtag-text');await page.sleep(650);
    const card=await page.rect('.wpile-layer [data-flight="sample-w2"]');
    assert.ok(card);
    const x=card.x+card.w*.7,y=card.cy;
    await page.mouse('mouseMoved',x,y,0);await page.mouse('mousePressed',x,y);
    await page.mouse('mouseMoved',x-6,y);await page.sleep(50);
    await page.mouse('mouseMoved',x-12,y);await page.sleep(100);
    const lifted=await page.rect('.held');
    assert.ok(lifted,'one card lifts');
    assert.ok(Math.abs(lifted.x-(card.x-12))<3&&Math.abs(lifted.y-card.y)<3,`grab point stays on the card: ${JSON.stringify({card,lifted})}`);
    await page.key('Escape');await page.mouse('mouseReleased',x-12,y,0);await page.sleep(400);
    await page.key('Escape');await page.mouse('mouseMoved',720,100,0);await page.sleep(650);
    const pile=await page.rect('#wait .wpile-rest');
    await page.mouse('mouseMoved',pile.cx,pile.y+45,0);await page.sleep(650);
    const head=await page.rect('.wpile-layer .wtag-text'),day=await page.rect('.wk-head:not(.past):not(.today)');
    assert.ok(head&&day);
    await page.drag({x:head.cx,y:head.cy},{x:day.cx,y:day.y+day.h+200},{hold:500,before:async()=>{
      const copy=await page.rect('.held');
      assert.ok(copy&&Number.isFinite(copy.y)&&copy.h>80,'the entire pile takes its time-axis height');
      assert.equal(await page.js(`document.querySelector('.held-more')?.textContent`),'+2','all three are carried');
      assert.ok(await page.js(`document.querySelector('.held')?.classList.contains('column')`),'the calendar owns the shape');
      await page.shot('wait-pile-calendar');
    }});
    const moved=await Promise.all(['상신 문서 보완','출장비 정산','물품 구매 요청'].map(name=>task(page,name)));
    assert.ok(moved.every(t=>t.date&&t.date===moved[0].date&&t.since===null),'all three land on the day and leave waiting');
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
    const since=await page.js(`(async()=>{const {getState}=await __mod('/src/app/store/state.ts');return getState().snapshot.tasks.find(t=>t.id===${JSON.stringify(before)})?.wait_since??null;})()`);
    assert.ok(since,'it waits, unnamed');
  }},
];
export default scenarios;
