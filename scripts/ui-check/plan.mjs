import assert from 'node:assert/strict';

// Preview data puts every block on today. Each scenario starts fresh; "other" is a neighbouring day of the same week.
// A cold dev server may still be compiling on the first load.
const toPlan=async page=>{for(let i=0;i<40&&!await page.rect('.nav-button','계획');i++)await page.sleep(250);await page.click('.nav-button','계획');await page.sleep(500);};
const sp=date=>`.wk-col[data-date="${date}"] .space`;
const titles=async(page,scope)=>(await page.blocks(scope)).map(b=>b.split(',')[0]);
async function days(page){
  const dates=await page.js(`[...document.querySelectorAll('.wk-col')].map(c=>c.dataset.date)`),today=await page.js(`document.querySelector('.wk-head.today')?.dataset.date`);
  const i=dates.indexOf(today);return {dates,today,other:dates[i===0?1:i-1]};
}
const hourY=async(page,h,scope='.wk-hours')=>(await page.rect(scope+' span',String(h).padStart(2,'0'))).cy;
const block=(page,date,text)=>page.rect(`${sp(date)} .blk`,text);
async function press(page,x,y,moves=[]){
  await page.mouse('mouseMoved',x,y,0);await page.mouse('mousePressed',x,y);
  for(const m of moves){await page.mouse('mouseMoved',m.x,m.y);await page.sleep(16);}
  const end=moves.at(-1)??{x,y};await page.mouse('mouseReleased',end.x,end.y,0);await page.sleep(250);
}

export default [
  {name:'week shows seven day spaces on one shared axis with date heads',run:async page=>{
    await toPlan(page);
    assert.equal(await page.js(`document.querySelectorAll('.wk .dayspace').length`),7);
    const boxes=await page.js(`[...document.querySelectorAll('.wk .space')].map(s=>Math.round(s.getBoundingClientRect().top)+':'+s.offsetHeight)`);
    assert.equal(new Set(boxes).size,1,'every column starts at the same top with the same height');
    const {today}=await days(page),first=await block(page,today,'설계 문서 자료 조사');
    assert.ok(Math.abs(first.y-1-await hourY(page,9))<=2,'the shared ruler lines up with the blocks');
    assert.match(await page.text('.wk-head.today'),/오늘.*[\d.]+ \/ [\d.]+h/);
    assert.match(await page.text('.plan-bar .week-summary'),/선택한 주 근무 .+ \/ .+ · \d \/ \d일/);
    assert.equal(await page.js(`document.querySelector('.drawer-toggle').getAttribute('aria-expanded')`),'true');
    await page.shot('plan-week');
  }},
  {name:'at 960px the week scrolls sideways inside its card',viewport:{width:960,height:900},run:async page=>{
    await toPlan(page);
    assert.ok(await page.js(`(()=>{const s=document.querySelector('.wk-scroll');return s.scrollWidth>s.clientWidth;})()`),'week scrolls');
    assert.ok(await page.js(`document.documentElement.scrollWidth<=innerWidth`),'page itself does not scroll sideways');
    await page.shot('plan-week-960');
  }},
  {name:'a flow block carried into another column body joins that day in order',run:async page=>{
    await toPlan(page);
    const {today,other}=await days(page),col=await page.rect(sp(other));
    const c=await block(page,today,'회의록 정리');
    const during=await page.drag({x:c.x+40,y:c.y+6},{x:col.x+60,y:c.y+6},{before:async()=>{await page.shot('plan-held-column');return page.js(`!!document.querySelector('${sp(other)} .blk.hollow')`);}});
    assert.equal(during,true,'the target column opens a hollow while held');
    assert.deepEqual(await titles(page,sp(other)),['회의록 정리']);
    assert.ok(!(await titles(page,sp(today))).includes('회의록 정리'));
    const a=await block(page,today,'설계 문서 자료 조사'),placed=await block(page,other,'회의록 정리');
    await page.drag({x:a.x+40,y:a.y+6},{x:col.x+60,y:placed.y-40});
    assert.deepEqual(await titles(page,sp(other)),['설계 문서 자료 조사','회의록 정리']);
  }},
  {name:'dropping on a date head appends to the end of that day',run:async page=>{
    await toPlan(page);
    const {today,other}=await days(page),col=await page.rect(sp(other)),head=await page.rect(`.wk-head[data-date="${other}"]`);
    const c=await block(page,today,'회의록 정리');
    await page.drag({x:c.x+40,y:c.y+6},{x:col.x+60,y:c.y+6});
    const b=await block(page,today,'설계 문서 초안 작성');
    const hot=await page.drag({x:b.x+40,y:b.y+6},{x:head.cx,y:head.cy},{before:async()=>{await page.shot('plan-held-head');return page.js(`document.querySelector('.wk-head[data-date="${other}"]').classList.contains('hot')`);}});
    assert.equal(hot,true);
    assert.deepEqual(await titles(page,sp(other)),['회의록 정리','설계 문서 초안 작성']);
  }},
  // Kept on today's column: the neighbouring column is a past day on every weekday but Monday.
  {name:'held over a body the copy settles on its slot and shows the time it will get',run:async page=>{
    await toPlan(page);
    const {today}=await days(page),y16=await hourY(page,16),c=await block(page,today,'회의록 정리');
    assert.ok(await page.js(`(()=>{const s=document.querySelector('${sp(today)}'),shoe=s.querySelector('.blk.flow .runner .shoe').getBoundingClientRect(),rail=s.querySelector('.rail').getBoundingClientRect();return Math.abs((shoe.left+shoe.right)/2-(rail.left+rail.right)/2)<=1.5;})()`),'flow blocks ride the rail groove on a runner');
    // The hollow springs into its slot; measure once it has come to rest.
    const during=await page.drag({x:c.x+40,y:c.y+6},{x:c.x+40,y:y16+6},{hold:900,before:async()=>{await page.shot('plan-held-slot');return page.js(`(()=>{
      const hollow=document.querySelector('${sp(today)} .blk.hollow'),held=document.querySelector('.held');
      return {gap:Math.abs(held.getBoundingClientRect().top-hollow.getBoundingClientRect().top),fixed:held.classList.contains('fixed'),
        range:hollow.querySelector('.main').getAttribute('aria-label').match(/\\d\\d:\\d\\d–\\d\\d:\\d\\d/)[0],held:held.textContent};})()`);}});
    assert.ok(during.gap<=3,`the copy sits on the hollow, not under the pointer (${during.gap}px off)`);
    assert.ok(during.held.includes(during.range),'the copy shows the time it will get');
    assert.equal(during.fixed,false,'the body only orders');
  }},
  {name:'pushed into the rail a block latches to that time; a fixed block slides along and lets go when pulled away',run:async page=>{
    await toPlan(page);
    const {today}=await days(page),y16=await hourY(page,16),y17=await hourY(page,17),c=await block(page,today,'회의록 정리');
    // A nudge toward the rail only gives; the block keeps its order.
    await page.drag({x:c.x+40,y:c.y+6},{x:c.x+32,y:y16+6});
    assert.match((await page.blocks(sp(today))).find(b=>b.startsWith('회의록 정리')),/예상/,'an 8px push does not latch');
    // The pointer stays over the body; only the block's left edge goes past the column's resting edge.
    const n=await block(page,today,'회의록 정리');
    await page.drag({x:n.x+40,y:n.y+6},{x:n.x+24,y:y16+6},{before:()=>page.shot('plan-held-bite')});
    assert.ok((await page.blocks(sp(today))).includes('회의록 정리, 시각 고정 16:00–16:30'),'latched at 16:00');
    const f=await block(page,today,'회의록 정리');
    await page.drag({x:f.x+40,y:f.y+6},{x:f.x+40,y:y17+6});
    assert.ok((await page.blocks(sp(today))).includes('회의록 정리, 시각 고정 17:00–17:30'),'still latched, now at 17:00');
    const g=await block(page,today,'회의록 정리');
    await page.drag({x:g.x+40,y:g.y+6},{x:g.x+72,y:g.y+6});
    assert.match((await page.blocks(sp(today))).find(b=>b.startsWith('회의록 정리')),/예상/,'pulled clear, it joins the order again');
  }},
  {name:'the rail of a column fixes the time it is dropped at',run:async page=>{
    await toPlan(page);
    const {today,other}=await days(page),rail=await page.rect(`${sp(other)} .rail`),y16=await hourY(page,16);
    const c=await block(page,today,'회의록 정리');
    await page.drag({x:c.x+40,y:c.y+6},{x:rail.cx,y:y16+6},{before:()=>page.shot('plan-held-rail')});
    assert.deepEqual(await page.blocks(sp(other)),['회의록 정리, 시각 고정 16:00–16:30']);
  }},
  {name:'2주 keeps its rows while a date is chosen; arrows switch to 월',run:async page=>{
    await toPlan(page);
    await page.click('.segmented [role=radio]','2주');
    assert.equal(await page.js(`document.querySelectorAll('.cal-grid.two .cal-cell').length`),14);
    const first=await page.js(`document.querySelector('.cal-cell').dataset.date`),second=await page.js(`document.querySelectorAll('.cal-cell')[10].dataset.date`);
    await page.click(`.cal-cell[data-date="${second}"] .cal-date`);
    assert.equal(await page.js(`document.querySelector('.cal-cell').dataset.date`),first,'start row stays');
    assert.equal(await page.js(`document.querySelector('.cal-cell[data-date="${second}"] .cal-date').getAttribute('aria-pressed')`),'true');
    assert.equal(await page.js(`document.querySelector('.plan-day').getAttribute('aria-label').startsWith(new Date('${second}T12:00:00').toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long'}))`),true);
    const today=await page.js(`document.querySelector('.cal-cell.today').dataset.date`);
    assert.ok(await page.js(`document.querySelectorAll('.cal-cell[data-date="${today}"] .mini').length`)===4);
    assert.match(await page.text(`.cal-cell[data-date="${today}"] .cal-more`),/\+3건/);
    await page.shot('plan-two');
    await page.js(`document.querySelector('.segmented [aria-checked=true]').focus()`);await page.key('ArrowRight');await page.sleep(300);
    const cells=await page.js(`document.querySelectorAll('.cal-grid.month .cal-cell').length`);
    assert.ok(cells>=28&&cells%7===0,'month grid of whole weeks');
    assert.equal(await page.js(`document.activeElement.textContent`),'월');
    await page.shot('plan-month');
  }},
  {name:'at 1024px 2주 puts 미계획 below and the date panel takes a new block',viewport:{width:1024,height:900},run:async page=>{
    await toPlan(page);
    await page.click('.segmented [role=radio]','2주');
    const cal=await page.rect('.cal'),drawer=await page.rect('#plan-drawer'),day=await page.rect('.plan-day');
    assert.ok(drawer.y>=cal.y+cal.h&&drawer.x<day.x,'drawer moves under the calendar, beside the date panel');
    const empty=await page.js(`[...document.querySelectorAll('.cal-cell')].find(c=>!c.classList.contains('today')).dataset.date`);
    await page.click(`.cal-cell[data-date="${empty}"] .cal-date`);
    const box=await page.rect('.plan-day .space'),y11=await hourY(page,11,'.plan-day .ruler');
    await press(page,box.x+box.w-40,y11+5);
    assert.match(await page.text('.composer .cm-head'),/순서 끝 · \d\d:\d\d–\d\d:\d\d/);
    const form=await page.rect('.composer'),card=await page.rect('.plan-day');
    assert.ok(form.x>=card.x&&form.x+form.w<=card.x+card.w,'composer stays inside the panel');
    await page.shot('plan-two-1024');
  }},
  {name:'the week reads in the other themes',run:async page=>{
    await toPlan(page);
    for(const theme of ['g1','g3','g4']){await page.js(`document.documentElement.dataset.theme='${theme}'`);await page.sleep(200);await page.shot('plan-week-'+theme);}
  }},
  {name:'2주 titles open the task and carry it to another date',run:async page=>{
    await toPlan(page);
    await page.click('.segmented [role=radio]','2주');
    const today=await page.js(`document.querySelector('.cal-cell.today').dataset.date`),other=await page.js(`(()=>{const c=[...document.querySelectorAll('.cal-cell')];const i=c.findIndex(e=>e.classList.contains('today'));return c[i===0?1:i-1].dataset.date;})()`);
    await page.click(`.cal-cell[data-date="${today}"] .mini button`,'설계 문서 자료 조사');
    assert.ok(await page.js(`!!document.querySelector('dialog[open]')`),'editor dialog opens');
    await page.click('dialog[open] .ed-close');
    const m=await page.rect(`.cal-cell[data-date="${today}"] .mini`,'회의록 정리'),target=await page.rect(`.cal-cell[data-date="${other}"]`);
    await page.drag({x:m.x+20,y:m.cy},{x:target.cx,y:target.cy});
    assert.match(await page.text(`.cal-cell[data-date="${other}"] .cal-tasks`),/회의록 정리/);
  }},
  {name:'clicking empty column time opens a flow composer that adds to the end of that day',run:async page=>{
    await toPlan(page);
    const {other}=await days(page),col=await page.rect(sp(other)),y11=await hourY(page,11);
    await press(page,col.x+70,y11+5);
    assert.match(await page.text('.composer .cm-head'),/순서 끝 · \d\d:\d\d–\d\d:\d\d/);
    assert.equal(await page.js(`document.activeElement?.id`),'composer-title');
    assert.ok(await page.js(`!!document.querySelector('${sp(other)} .ghost')`),'the landing slot is outlined');
    await page.shot('plan-composer-flow');
    await page.type('새 블록 테스트');await page.key('Enter',{text:'\r'});await page.sleep(700);
    assert.deepEqual(await page.blocks(sp(other)),['새 블록 테스트, 예상 09:00–09:30']);
    assert.equal(await page.js(`!!document.querySelector('.composer')`),false);
  }},
  {name:'a range drag reserves that time; the rail reserves 30 minutes and 고정 can be undone',run:async page=>{
    await toPlan(page);
    const {other}=await days(page),col=await page.rect(sp(other)),y13=await hourY(page,13),y14=await hourY(page,14),y15=await hourY(page,15);
    await page.mouse('mouseMoved',col.x+70,y13+2,0);await page.mouse('mousePressed',col.x+70,y13+2);
    for(let i=1;i<=10;i++){await page.mouse('mouseMoved',col.x+70,y13+2+(y14-4-y13)*i/10);await page.sleep(16);}
    assert.match(await page.text(`${sp(other)} .range`),/13:00–14:00/);
    await page.shot('plan-range');
    await page.mouse('mouseReleased',col.x+70,y14-2,0);await page.sleep(250);
    assert.match(await page.text('.composer .cm-head'),/13:00–14:00/);
    assert.equal(await page.js(`document.querySelector('.composer .cm-fix input').checked`),true);
    await page.type('범위 블록');await page.click('.composer button[type=submit]');await page.sleep(700);
    assert.deepEqual(await page.blocks(sp(other)),['범위 블록, 시각 고정 13:00–14:00']);
    const rail=await page.rect(`${sp(other)} .rail`);
    await press(page,rail.cx,y15+3);
    assert.match(await page.text('.composer .cm-head'),/15:00–15:30/);
    await page.click('.composer .cm-fix input');
    assert.match(await page.text('.composer .cm-head'),/순서 끝 · \d\d:\d\d–\d\d:\d\d/);
    await page.key('Escape');await page.sleep(200);
    assert.equal(await page.js(`!!document.querySelector('.composer')`),false);
  }},
  {name:'a range over lunch is marked and cannot be placed',run:async page=>{
    await toPlan(page);
    const {other}=await days(page),col=await page.rect(sp(other)),y11=await hourY(page,11),y13=await hourY(page,13);
    await page.mouse('mouseMoved',col.x+70,y11+2,0);await page.mouse('mousePressed',col.x+70,y11+2);
    for(let i=1;i<=10;i++){await page.mouse('mouseMoved',col.x+70,y11+2+(y13-y11-4)*i/10);await page.sleep(16);}
    assert.equal(await page.js(`document.querySelector('${sp(other)} .range').classList.contains('bad')`),true);
    await page.mouse('mouseReleased',col.x+70,y13-2,0);await page.sleep(250);
    assert.equal(await page.js(`!!document.querySelector('.composer')`),false);
    assert.match(await page.text('.status'),/점심/);
  }},
  {name:'today: clicking empty time opens the composer and an unfitting block runs past the end of work',run:async page=>{
    const box=await page.rect('.today-day .space'),last=await page.rect('.today-day .blk','신규 입사자 교육');
    await press(page,box.x+box.w-60,last.y+last.h+20);
    assert.match(await page.text('.composer .cm-head'),/순서 끝 · \d\d:\d\d–\d\d:\d\d/);
    await page.shot('today-composer');
    await page.type('오늘 추가');await page.key('Enter',{text:'\r'});await page.sleep(700);
    assert.ok((await page.blocks('.today-day .space')).includes('오늘 추가, 예상 20:00–20:30'));
  }},
];
