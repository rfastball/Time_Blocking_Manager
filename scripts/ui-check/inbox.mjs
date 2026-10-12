import assert from 'node:assert/strict';
import {dockState,setDock,toBench,toPlan,view} from './support/nav.mjs';

// 준비, now the wide dock beside the calendar: the 들어옴 (sheets and blocks not yet placed, then overdue work)
// and one shelf at the timetable's scale. The calendar beside it took the place of the five date columns.
const open=toBench;
const titles=(page,list)=>page.js(`[...document.querySelectorAll(${JSON.stringify(list+' .jb-card .ttl')})].map(e=>e.textContent)`);
const card=(page,title)=>page.rect('.jb-card',title);
const task=(page,title)=>page.js(`(async()=>{const {getState}=await import('/src/app/store/state.ts');const t=getState().snapshot.tasks.find(t=>t.title===${JSON.stringify(title)});return t&&{proto:!!t.proto,duration:t.duration,pile:t.pile_id??null,date:t.plan_date};})()`);
const focusCard=(page,title)=>page.js(`[...document.querySelectorAll('.jb .main')].find(e=>e.textContent.includes(${JSON.stringify(title)})).focus()`);
const shelf=['회의록 템플릿 업데이트','SQLite 백업 방식 조사','메일 답장','결재 처리'];
// A later working date to ship to: in the shown week if there is one, else the next week.
async function laterDay(page){
  const find=()=>page.js(`(()=>{const today=document.querySelector('.wk-head.today')?.dataset.date??'';return [...document.querySelectorAll('.wk-head:not(.off)')].map(h=>h.dataset.date).find(d=>d>today)??null;})()`);
  let day=await find();
  if(!day){await page.click('header.topbar button[aria-label="다음 주"]');await page.sleep(400);day=await find();}
  await page.js(`document.querySelector('.wk-head[data-date="${day}"]').scrollIntoView({block:'nearest',inline:'nearest'})`);await page.sleep(300);
  return day;
}

const scenarios=[
  {name:'준비 shows the 들어옴, a time-scaled shelf and the next days',run:async page=>{
    await open(page);
    assert.deepEqual(await titles(page,'.jb-inbox'),['주간 보고 초안','경쟁사 동향 정리']);
    assert.deepEqual(await titles(page,'.jb-shelf'),shelf);
    // Height is length at 72px an hour, as on 오늘; a sheet has none yet.
    const [sheet,thirty,fortyfive,fifteen]=[await card(page,'주간 보고'),await card(page,'회의록'),await card(page,'SQLite'),await card(page,'메일')];
    assert.equal(sheet.h,34);assert.equal(thirty.h,34);assert.equal(fortyfive.h,52);assert.equal(fifteen.h,16);
    // Thin blocks keep their title and length on one readable row.
    assert.ok(await page.js(`(()=>{const c=[...document.querySelectorAll('.jb-card')].find(e=>e.textContent.includes('메일')),r=c.getBoundingClientRect();return [...c.querySelectorAll('.ttl,.meta')].every(e=>{const b=e.getBoundingClientRect();return b.top>=r.top-1&&b.bottom<=r.bottom+1;});})()`));
    // The next days are the calendar beside the bench (docs/one-screen-plan.md: 날짜 기둥 5일은 없앤다).
    const dock=await page.rect('#dock'),main=await page.rect('.plan-main');
    assert.ok(dock.x+dock.w<=main.x,'the calendar sits beside the bench');
    assert.equal(await page.js('document.querySelectorAll(".plan-main .wk-col").length'),7);
    assert.equal(await page.js('document.querySelectorAll(".jb-day,.jb-dock").length'),0,'no date columns of its own');
    assert.equal(await page.js('document.querySelectorAll(".wb-canvas,.wb-tools,.wb-world").length'),0,'no free canvas or its tools');
    await page.shot('junbi-initial');
    // The rail badge became one count on the folded dock: 들어옴 + 지난 미완료 + 선반.
    await setDock(page,'hidden');
    assert.equal(await page.js(`document.querySelector('.dock-unfold').getAttribute('aria-label')`),'준비 펴기, 6건');
    assert.equal(await page.text('.dock-unfold .cnt'),'6');
  }},
  {name:'pulling a sheet gives it thickness in place; arrows size it too, and nothing moves',run:async page=>{
    await open(page);
    const sheet=await card(page,'주간 보고');
    const during=await page.drag({x:sheet.cx,y:sheet.y+sheet.h},{x:sheet.cx,y:sheet.y+sheet.h+52},{before:()=>page.js('document.querySelector(".jb-len")?.textContent')});
    assert.equal(during,'45분','the length under the hand shows while pulling');
    assert.deepEqual(await task(page,'주간 보고 초안'),{proto:false,duration:45,pile:null,date:null});
    assert.equal((await card(page,'주간 보고')).h,52);
    assert.deepEqual(await titles(page,'.jb-inbox'),['주간 보고 초안','경쟁사 동향 정리'],'length never moves the card');
    await page.shot('junbi-pulled');
    // A new capture is a sheet on top with no length steps to fill; ↓ gives its first length, then arrows change it by 15 minutes.
    await page.click('#inbox-capture');await page.type('보안 점검 결과 회신');await page.key('Enter');await page.sleep(400);
    assert.deepEqual((await titles(page,'.jb-inbox')).slice(0,2),['보안 점검 결과 회신','주간 보고 초안']);
    const fresh=await card(page,'보안 점검');await page.mouse('mouseMoved',fresh.cx,fresh.cy,0);await page.sleep(80);
    assert.equal(await page.js('document.querySelectorAll(".jb-steps").length'),0);
    await focusCard(page,'보안 점검');await page.key('ArrowDown');await page.sleep(250);
    assert.deepEqual(await task(page,'보안 점검 결과 회신'),{proto:false,duration:15,pile:null,date:null});
    await page.key('ArrowDown');await page.sleep(250);
    assert.equal((await task(page,'보안 점검 결과 회신')).duration,30);
  }},
  {name:'a block dragged onto the shelf lands where the gap opened; Alt+arrows move between the 들어옴 and the shelf',run:async page=>{
    await open(page);
    const past=await card(page,'경쟁사 동향'),meeting=await card(page,'회의록'),sqlite=await card(page,'SQLite');
    // The landing follows the held block's middle: above the next block's middle, before it.
    const during=await page.drag({x:past.cx,y:past.y+12},{x:sqlite.cx,y:sqlite.y-14},{before:()=>page.js('[...document.querySelectorAll(".jb-shelf .jb-card")].map(e=>e.classList.contains("hollow")?"[]":e.querySelector(".ttl").textContent)')});
    assert.deepEqual(during,['회의록 템플릿 업데이트','[]','SQLite 백업 방식 조사','메일 답장','결재 처리'],'the shelf makes room where the block will land');
    assert.deepEqual(await titles(page,'.jb-shelf'),['회의록 템플릿 업데이트','경쟁사 동향 정리',...shelf.slice(1)]);
    assert.deepEqual(await task(page,'경쟁사 동향 정리'),{proto:false,duration:60,pile:'shelf',date:null},'overdue work loses its date on the shelf');
    assert.ok(meeting.h>0);
    await focusCard(page,'경쟁사 동향');await page.key('ArrowLeft',{modifiers:1});await page.sleep(350);
    assert.deepEqual(await titles(page,'.jb-inbox'),['경쟁사 동향 정리','주간 보고 초안']);
    await focusCard(page,'주간 보고');await page.key('ArrowRight',{modifiers:1});
    // A move without a drag still travels: a flat copy flies from the old place to the new one.
    assert.ok(await page.js(`new Promise(r=>{const t=performance.now(),look=()=>document.querySelector('.flight')?r(true):performance.now()-t>600?r(false):requestAnimationFrame(look);look();})`),'the move flies');
    await page.sleep(350);
    assert.equal((await titles(page,'.jb-shelf')).at(-1),'주간 보고 초안');
    assert.deepEqual(await task(page,'주간 보고 초안'),{proto:false,duration:30,pile:'shelf',date:null},'a sheet on the shelf takes its default length');
    await focusCard(page,'메일');await page.key('ArrowUp',{modifiers:1});await page.sleep(350);
    assert.deepEqual((await titles(page,'.jb-shelf')).slice(0,3),['회의록 템플릿 업데이트','메일 답장','SQLite 백업 방식 조사']);
    assert.equal(await page.js('document.activeElement?.textContent'),'메일 답장15분');
  }},
  // The date columns are gone: a bench card goes onto a date head of the calendar beside the dock (docs/one-screen-plan.md, 날짜 기둥에 놓기·머리로 일 보기).
  {name:'dropping on a date shows the landing at its real size and ships to the end of that day',run:async page=>{
    await open(page);
    const day=await laterDay(page),from=await card(page,'SQLite'),head=await page.rect(`.wk-head[data-date="${day}"]`);
    const during=await page.drag({x:from.cx,y:from.y+10},{x:head.cx,y:head.cy},{before:()=>page.js(`(()=>{const head=document.querySelector('.wk-head[data-date="${day}"]'),h=document.querySelector('.held')?.getBoundingClientRect();const slot=document.querySelector('.wk-col[data-date="${day}"] .blk.hollow');return {hot:head.classList.contains('hot'),held:h&&[Math.round(h.width),Math.round(h.height)],column:head.clientWidth,slot:slot&&Math.round(slot.getBoundingClientRect().height)};})()`)});
    assert.equal(during.hot,true,'the date takes the drop');
    assert.equal(during.slot,during.held?.[1],'the slot in that day is the block at the same scale');
    assert.deepEqual(during.held,[during.column-21,43],'the held block narrows to the column it is over, keeping its 45 minutes on the week scale');
    assert.deepEqual(await task(page,'SQLite 백업 방식 조사'),{proto:false,duration:45,pile:null,date:day});
    assert.ok(!(await titles(page,'.jb-shelf')).includes('SQLite 백업 방식 조사'));
    assert.equal((await page.blocks(`.wk-col[data-date="${day}"] .space`)).map(b=>b.split(',')[0]).at(-1),'SQLite 백업 방식 조사','at the end of that day');
    // A date head opens that day in the 일 view.
    await page.click(`.wk-head[data-date="${day}"] .wk-date`);await page.sleep(400);
    assert.equal(await view(page),'plan');
    assert.equal(await page.text('.segmented [aria-checked=true]'),'일');
    assert.ok(await page.js(`!!document.querySelector('.dv-day [data-task]')`));
  }},
  {name:'range selection ships and merges in screen order; background click and Escape clear it',run:async page=>{
    await open(page);
    await page.click('.jb-shelf .main','회의록');await page.sleep(200);
    assert.equal(await page.js('!!document.querySelector(".ed-title")'),true,'a click opens the editor');await page.key('Escape');await page.sleep(250);
    await page.click('.jb-shelf .main','SQLite',{modifiers:2});await page.click('.jb-shelf .main','결재',{modifiers:8});await page.sleep(150);
    assert.equal(await page.js('document.querySelectorAll(".jb-card.sel").length'),3);
    assert.equal(await page.text('.jb-selinfo'),'선택 3 · 1시간 15분');
    await page.click('.jb-head h2','선반');await page.sleep(100);
    assert.equal(await page.js('document.querySelectorAll(".jb-card.sel").length'),0);
    await page.click('.jb-shelf .main','메일',{modifiers:2});await page.click('.jb-shelf .main','결재',{modifiers:2});await page.sleep(100);
    await page.shot('junbi-selection');
    await page.click('.jb-selbar .btn','하나로 합치기');await page.sleep(500);
    assert.deepEqual(await titles(page,'.jb-shelf'),['회의록 템플릿 업데이트','SQLite 백업 방식 조사','메일 답장']);
    assert.equal((await task(page,'메일 답장')).duration,30);
    await page.key('Escape');await page.sleep(250);
    await page.click('.jb-shelf .main','회의록',{modifiers:2});await page.key('Escape');await page.sleep(100);
    assert.equal(await page.js('document.querySelectorAll(".jb-card.sel").length'),0);
  }},
  {name:'delete keeps the keyboard in the lists and restore returns the block to its shelf place',run:async page=>{
    await open(page);
    await focusCard(page,'SQLite');await page.key('Delete');await page.sleep(350);
    assert.equal(await page.js('document.activeElement?.textContent'),'메일 답장15분');
    await page.click('.inbox-trash>summary');await page.sleep(150);
    await page.click('.irow-restore');await page.sleep(350);
    assert.deepEqual(await titles(page,'.jb-shelf'),shelf);
  }},
  {name:'the cutting board opens over 준비 and pieces stay where the block stood',run:async page=>{
    await open(page);
    const sqlite=await card(page,'SQLite');await page.mouse('mouseMoved',sqlite.cx,sqlite.cy,0);await page.sleep(80);
    // No 나누기 label on the card: the block menu opens the board.
    assert.equal(await page.js('document.querySelectorAll(".jb-split").length'),0);
    await page.js(`(()=>{const c=[...document.querySelectorAll('.jb-shelf .jb-card')].find(e=>e.textContent.includes('SQLite')),r=c.getBoundingClientRect();c.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+20,clientY:r.top+10}));})()`);await page.sleep(200);
    assert.deepEqual(await page.js('[...document.querySelectorAll(".ctx-menu [role=menuitem]")].map(b=>b.textContent)'),['오늘에 싣기','나누기','완료','삭제'],'a shelf block offers only what its place needs');
    await page.click('.ctx-menu [role=menuitem]','나누기');await page.sleep(400);
    assert.ok(await page.js('!!document.querySelector(".cut-inline")'));
    assert.ok(await page.js('document.querySelector(".jb-layer").inert'));
    // The calendar waits while the board is open, as the date columns did.
    assert.ok(await page.js('document.querySelector(".plan-wrap").inert'),'the calendar beside the board is held still');
    await page.click('.cut .btn.primary');await page.sleep(400);
    assert.deepEqual(await titles(page,'.jb-shelf'),shelf);
  }},
  {name:'오늘 and 계획 read 준비 shelf first; a block sent back from a date goes on top of the shelf',run:async page=>{
    await toPlan(page);
    assert.equal(await page.js('document.querySelector("#dock h2")?.textContent.trim().startsWith("준비")'),true);
    assert.deepEqual(await page.js('[...document.querySelectorAll("#dock .tblk .ttl")].map(e=>e.textContent)'),[...shelf,'주간 보고 초안','경쟁사 동향 정리']);
    await page.js(`(async()=>{const [{getState},{unplan}]=await Promise.all([import('/src/app/store/state.ts'),import('/src/app/store/tasks.ts')]);await unplan(getState().snapshot.tasks.find(t=>t.title==='회의록 정리'));})()`);await page.sleep(300);
    await open(page);
    assert.equal((await titles(page,'.jb-shelf'))[0],'회의록 정리');
  }},
  {name:'a capture dragged onto the shelf can be dragged again there',run:async page=>{
    await open(page);
    await page.click('#inbox-capture');await page.type('새 일');await page.key('Enter');await page.sleep(400);
    const fresh=await card(page,'새 일'),sqlite=await card(page,'SQLite');
    await page.drag({x:fresh.cx,y:fresh.y+10},{x:sqlite.cx,y:sqlite.y+sqlite.h+10});
    assert.ok((await titles(page,'.jb-shelf')).includes('새 일'));
    const moved=await page.rect('.jb-shelf .jb-card','새 일'),top=await card(page,'회의록');
    const held=await page.drag({x:moved.cx,y:moved.y+10},{x:top.cx,y:top.y+2},{before:()=>page.js('!!document.querySelector(".held")')});
    assert.equal(held,true,'the block lifts again');
    assert.equal((await titles(page,'.jb-shelf'))[0],'새 일');
  }},
  {name:'the shelf ceiling picks or carries the whole shelf',run:async page=>{
    await open(page);
    await page.click('.jb-ceiling');await page.sleep(150);
    assert.equal(await page.text('.jb-selinfo'),'선택 4 · 1시간 45분','pressing the ceiling picks every block on the shelf');
    await page.key('Escape');await page.click('.jb-head h2','선반');await page.sleep(100);
    // The date columns are gone: the shelf goes onto a date head of the calendar beside the dock.
    const day=await laterDay(page),ceiling=await page.rect('.jb-ceiling'),head=await page.rect(`.wk-head[data-date="${day}"]`);
    const during=await page.drag({x:ceiling.cx,y:ceiling.cy},{x:head.cx,y:head.cy},{before:()=>page.js(`({shelf:document.querySelectorAll(".jb-shelf .jb-card").length,hot:document.querySelector('.wk-head[data-date="${day}"]').classList.contains('hot'),height:Math.round(document.querySelector('.held')?.getBoundingClientRect().height??0),slots:[...document.querySelectorAll('.wk-col[data-date="${day}"] .blk.hollow .ttl')].map(e=>e.textContent)})`)});
    assert.deepEqual({shelf:during.shelf,hot:during.hot,height:during.height},{shelf:0,hot:true,height:103},'over a date the whole shelf is carried there as its 1시간 45분');
    assert.deepEqual(during.slots,shelf,'over a day the whole shelf previews there, in order');
    assert.deepEqual(await titles(page,'.jb-shelf'),[]);
    assert.deepEqual(await page.js(`(async()=>{const {getState}=await import('/src/app/store/state.ts');return getState().snapshot.tasks.filter(t=>t.plan_date===${JSON.stringify(day)}&&!t.completed).sort((a,b)=>a.flow_order-b.flow_order).map(t=>t.title);})()`),shelf,'shipped in shelf order');
  }},
  {name:'work completed on 준비 stays in sight and goes back to where it stood',run:async page=>{
    await open(page);
    await page.js(`[...document.querySelectorAll('.jb-shelf .jb-card')].find(e=>e.textContent.includes('SQLite')).querySelector('.chk').click()`);await page.sleep(500);
    assert.deepEqual(await page.js('[...document.querySelectorAll(".jb-done .chip .ttl")].map(e=>e.textContent)'),['SQLite 백업 방식 조사']);
    assert.ok(!(await titles(page,'.jb-shelf')).includes('SQLite 백업 방식 조사'));
    await page.shot('junbi-done-here');
    await page.click('.jb-done .chip-undo');await page.sleep(700);
    assert.deepEqual(await titles(page,'.jb-shelf'),shelf,'back in its place on the shelf');
    assert.equal(await page.js('document.querySelectorAll(".jb-done").length'),0);
  }},
  {name:'at 960px the bench and the calendar stay inside the page; at 720px everything stacks inside the page',viewport:{width:960,height:640},run:async page=>{
    await open(page);
    const page960=await page.js('({scroll:document.documentElement.scrollWidth,width:innerWidth})');
    assert.ok(page960.scroll<=page960.width+1);
    await page.shot('junbi-960');
    await page.goto('/?now=10:20',{width:720,height:900});await open(page);
    const page720=await page.js('({scroll:document.documentElement.scrollWidth,width:innerWidth})');
    assert.ok(page720.scroll<=page720.width+1);
    await page.shot('junbi-720');
  }},
];
export default scenarios;
