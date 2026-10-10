import assert from 'node:assert/strict';

// Preview data at 10:20: A 60 (checklist), B 45 (memo + checklist), C 30, D 60 flow; workshop fixed 14:00; E 90; F 120 unplaced.
const space='.today-day .space',panel=".today-main [aria-label='블록 상세']";
const CTRL=2,SHIFT=8;
const value=(page,selector)=>page.js(`document.querySelector(${JSON.stringify(selector)})?.value??null`);
const active=page=>page.js(`(()=>{const a=document.activeElement;return a?{tag:a.tagName,text:a.textContent.trim(),label:a.getAttribute('aria-label'),task:a.dataset.task??null,value:a.value??null,type:a.type??null}:null;})()`);
const caretEnd=(page,selector)=>page.js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();e.setSelectionRange(e.value.length,e.value.length);})()`);
// The right mouse button is not part of the page API; the block listens to the contextmenu event itself.
const rightClick=(page,selector,text)=>page.js(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text?`e.textContent.includes(${JSON.stringify(text)})`:'true'});const r=e.getBoundingClientRect();e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+40,clientY:r.top+8,button:2}));})()`);
const menuItems=page=>page.js(`[...document.querySelectorAll('.ctx-menu [role=menuitem]')].map(b=>b.textContent)`);
const focusBlock=(page,title)=>page.js(`[...document.querySelectorAll('${space} .blk .main')].find(b=>b.textContent.includes(${JSON.stringify(title)})).focus()`);
// Pressed by its title: on a short block the button's center sits on the resize grip.
async function openBlock(page,title){
  const r=await page.rect(space+' .blk .main',title);if(!r)throw Error('no block '+title);
  await page.mouse('mouseMoved',r.x+60,r.y+10,0);await page.mouse('mousePressed',r.x+60,r.y+10);await page.mouse('mouseReleased',r.x+60,r.y+10,0);await page.sleep(200);
}
// An unsaved draft makes the next navigation stop at the leave-page prompt, so every scenario ends clean.
async function discard(page){
  for(let i=0;i<6;i++){
    const step=await page.js(`(()=>{
      const pick=(sel,text)=>[...document.querySelectorAll(sel)].find(b=>b.textContent.includes(text));
      const drop=pick('.ed-confirm button','변경 버리기');if(drop){drop.click();return 'drop';}
      const close=document.querySelector('.ed-dirty')&&document.querySelector('.ed-close');if(close){close.click();return 'close';}
      const resume=pick('.status button','이어서 편집');if(resume){resume.click();return 'resume';}
      return 'clean';})()`);
    if(step==='clean')return;
    await page.sleep(200);
  }
}

const scenarios=[
  {name:'a block opens beside the space with title and memo; Ctrl+Enter saves the title',run:async page=>{
    await openBlock(page,'설계 문서 초안');
    assert.equal(await value(page,panel+' .ed-title'),'설계 문서 초안 작성');
    assert.match(await value(page,panel+' textarea[aria-label="메모"]'),/진행 상황과 필요한 맥락/);
    assert.equal((await active(page)).label,'제목','title takes the first focus');
    assert.equal(await page.js(`document.querySelector(${JSON.stringify(panel+' .ed-schedule')}).open`),false,'schedule starts folded');
    await page.shot('editor-panel');
    await caretEnd(page,panel+' .ed-title');await page.type(' 보완');
    assert.match(await page.text(panel+' .ed-badges'),/저장 안 됨/);
    await page.key('Enter',{modifiers:CTRL});await page.sleep(500);
    assert.ok((await page.blocks(space)).includes('설계 문서 초안 작성 보완, 예상 10:00–10:45'));
    assert.doesNotMatch(await page.text(panel+' .ed-badges'),/저장 안 됨/);
    assert.match(await page.text(panel+' .ed-status'),/미리보기에 반영했어요/);
  }},
  {name:'a checklist toggle rewrites that memo line',run:async page=>{
    await openBlock(page,'설계 문서 초안');
    assert.match(await page.text(panel+' .ed-checklist summary'),/체크리스트 0\/2/);
    await page.click(panel+' .ed-checklist summary');
    await page.click(panel+' .ed-check','계획 화면 정리');
    const memo=await value(page,panel+' textarea[aria-label="메모"]');
    assert.match(memo,/^\[x\] 계획 화면 정리$/m);assert.match(memo,/^\[ \] 검토 의견 반영$/m);
    assert.match(await page.text(panel+' .ed-checklist summary'),/체크리스트 1\/2/);
    assert.equal(await page.js(`document.querySelector(${JSON.stringify(panel+' .ed-checklist')}).open`),true,'stays unfolded');
    assert.equal((await page.blocks(space)).filter(b=>b.startsWith('설계 문서 초안 작성')).length,1,'the task is not completed by its checklist');
    await page.shot('editor-checklist');
  }},
  {name:'closing with changes asks inline; a kept draft resumes from the status bar in the dialog',run:async page=>{
    await openBlock(page,'회의록 정리');
    await page.click(panel+' textarea[aria-label="메모"]');await page.type('결정 사항 정리');
    await page.click(panel+' .ed-close');
    assert.ok(await page.rect(panel+' .ed-confirm'),'confirm bar shown');
    assert.equal((await active(page)).text,'저장하고 닫기');
    await page.shot('editor-confirm');
    await page.click(panel+' .ed-confirm button','초안으로 남기고 닫기');
    assert.equal(await page.rect(panel),null);
    assert.match(await page.text('.status'),/‘회의록 정리’ 이어서 편집/);
    await page.click('.status button','이어서 편집');
    assert.ok(await page.js(`document.querySelector('dialog.ed-dialog')?.open`),'dialog open');
    assert.equal(await value(page,'dialog.ed-dialog textarea'),'결정 사항 정리');
    await page.sleep(300);await page.shot('editor-dialog');
    await page.key('Escape');
    assert.ok(await page.rect('dialog.ed-dialog .ed-confirm'),'Esc asks too');
    await page.click('dialog.ed-dialog .ed-confirm button','변경 버리기');
    assert.equal(await page.js(`!!document.querySelector('dialog.ed-dialog')`),false);
    assert.equal(await page.js(`document.querySelector('.status')?.textContent.includes('이어서 편집')??false`),false);
  }},
  {name:'fixing in the schedule section moves the block to the rail',run:async page=>{
    await openBlock(page,'회의록 정리');
    await page.click(panel+' .ed-schedule summary');
    await page.click(panel+' .ed-fix input');
    assert.equal(await value(page,panel+' input[aria-label="고정 시각"]'),'10:45','starts from the block’s current place');
    assert.match(await page.text(panel+' .ed-hint'),/10:45–11:15/);
    await page.shot('editor-schedule');
    await page.click(panel+' button[type=submit]');await page.sleep(500);
    assert.ok((await page.blocks(space)).includes('회의록 정리, 시각 고정 10:45–11:15'));
    assert.match(await page.text(panel+' .ed-state'),/시각 고정/);
  }},
  {name:'the block menu releases a fixed block and moves another to 미계획',run:async page=>{
    await rightClick(page,space+' .blk.fixed','설계 워크숍');await page.sleep(200);
    assert.match(await page.text('.ctx-menu .menu-head'),/설계 워크숍/);
    assert.deepEqual(await menuItems(page),['메모 열기','완료로 표시','고정 해제','나누기 위치 정하기','미계획으로 옮기기','삭제']);
    await page.shot('editor-context-menu');
    await page.click('.ctx-menu [role=menuitem]','고정 해제');await page.sleep(500);
    assert.ok((await page.blocks(space)).some(b=>b.startsWith('설계 워크숍, 예상')),'released into the flow');
    await rightClick(page,space+' .blk','분리망 배포');await page.sleep(200);
    assert.ok((await menuItems(page)).includes('시각 고정…'));
    await page.click('.ctx-menu [role=menuitem]','미계획으로 옮기기');await page.sleep(500);
    assert.ok(!(await page.blocks(space)).some(b=>b.startsWith('분리망 배포')));
    assert.match(await page.text('.today-side .tray'),/분리망 배포 의존성 검토/);
    // Empty time offers a new block there and the day's working time.
    await page.js(`(()=>{const s=document.querySelector('${space}'),r=s.getBoundingClientRect();s.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+r.width-40,clientY:r.top+20}));})()`);await page.sleep(200);
    const empty=await menuItems(page);
    assert.match(empty[0],/^\d\d:\d\d에 블록 만들기$/);assert.equal(empty[1],'이 날짜의 근무시간 조정');
    await page.mouse('mouseMoved',5,5,0);await page.mouse('mousePressed',5,5);await page.mouse('mouseReleased',5,5,0);await page.sleep(150);
    assert.equal(await page.rect('.ctx-menu'),null,'outside press closes');
  }},
  {name:'삭제 in the block menu and the detail goes to 휴지통 without a dialog; restore returns the block to its place',run:async page=>{
    await page.js('window.__asked=[];window.confirm=t=>{window.__asked.push(t);return false;}');
    await rightClick(page,space+' .blk','회의록 정리');await page.sleep(200);
    await page.click('.ctx-menu [role=menuitem]','삭제');await page.sleep(500);
    assert.ok(!(await page.blocks(space)).some(b=>b.startsWith('회의록 정리')),'left the day');
    assert.equal(await page.text('[role=status]'),'‘회의록 정리’을 휴지통으로 옮겼어요');
    await openBlock(page,'분리망 배포');
    await page.click(panel+' .ed-more > button');await page.click('.ed-menu [role=menuitem]','삭제');await page.sleep(500);
    assert.equal(await page.rect(panel),null,'detail closed');
    assert.ok(!(await page.blocks(space)).some(b=>b.startsWith('분리망 배포')));
    assert.deepEqual(await page.js('window.__asked'),[],'no dialog');
    await page.click('.rail-nav .nav-button','미계획');await page.sleep(300);
    assert.match(await page.text('.inbox-trash > summary'),/휴지통 2/);
    await page.click('.inbox-trash > summary');await page.sleep(300);
    await page.click('button[aria-label="회의록 정리 복원"]');await page.sleep(400);
    await page.click('.rail-nav .nav-button','오늘');await page.sleep(400);
    assert.ok((await page.blocks(space)).includes('회의록 정리, 예상 10:45–11:15'),'back at its old place in the order');
  }},
  {name:'Shift+F10 opens the menu by keyboard; arrows move and Esc returns focus to the block',run:async page=>{
    await focusBlock(page,'회의록 정리');
    await page.key('F10',{modifiers:SHIFT});await page.sleep(200);
    assert.equal((await active(page)).text,'메모 열기');
    await page.key('ArrowDown');assert.equal((await active(page)).text,'완료로 표시');
    await page.key('ArrowUp');await page.key('ArrowUp');assert.equal((await active(page)).text,'삭제','wraps');
    await page.key('Home');assert.equal((await active(page)).text,'메모 열기');
    await page.key('End');assert.equal((await active(page)).text,'삭제');
    await page.key('Escape');await page.sleep(100);
    assert.equal(await page.rect('.ctx-menu'),null);
    assert.equal((await active(page)).task,'sample-c');
    // 시각 고정… opens the detail at the fixed time, prefilled from the block.
    await page.key('F10',{modifiers:SHIFT});await page.sleep(200);
    await page.click('.ctx-menu [role=menuitem]','시각 고정…');await page.sleep(200);
    const a=await active(page);
    assert.equal(a.label,'고정 시각');assert.equal(a.value,'10:45');
  }},
  {name:'a 60-minute block splits into 30 + 30 and the second part goes to 미계획',run:async page=>{
    await focusBlock(page,'설계 문서 자료 조사');
    await page.key('F10',{modifiers:SHIFT});await page.sleep(200);
    await page.click('.ctx-menu [role=menuitem]','나누기 위치 정하기');await page.sleep(250);
    assert.match(await page.text('.split-pop output'),/30분 \+ 30분/);
    assert.equal((await active(page)).type,'range');
    await page.key('ArrowRight');assert.match(await page.text('.split-pop output'),/45분 \+ 15분/);
    await page.key('ArrowLeft');
    await page.shot('editor-split');
    await page.click('.split-pop .btn','나누기');await page.sleep(600);
    assert.equal(await page.rect('.split-pop'),null);
    assert.ok((await page.blocks(space)).includes('설계 문서 자료 조사, 예상 09:00–09:30'));
    assert.match(await page.text('.today-side .tray'),/설계 문서 자료 조사/);
    // Esc closes the chooser without splitting.
    await focusBlock(page,'분리망 배포');await page.key('F10',{modifiers:SHIFT});await page.sleep(200);
    await page.click('.ctx-menu [role=menuitem]','나누기 위치 정하기');await page.sleep(200);
    await page.key('Escape');await page.sleep(100);
    assert.equal(await page.rect('.split-pop'),null);
    assert.equal((await active(page)).task,'sample-d');
  }},
  {name:'the more menu refuses to split unsaved changes and moves the draft to 미계획',run:async page=>{
    await openBlock(page,'분리망 배포');
    await caretEnd(page,panel+' .ed-title');await page.type('!');
    await page.click(panel+' .ed-more>.btn');
    assert.equal((await active(page)).text,'블록 나누기');
    await page.key('Enter',{text:'\r'});await page.sleep(150);
    assert.equal(await page.rect('.split-pop'),null,'no chooser while dirty');
    assert.match(await page.text('.status'),/변경을 저장한 뒤 블록을 나눠 주세요/);
    await page.click(panel+' .ed-more>.btn');await page.key('ArrowDown');
    assert.equal((await active(page)).text,'미계획으로 돌리기');
    await page.key('Enter',{text:'\r'});await page.sleep(100);
    assert.match(await page.text(panel+' .ed-state'),/미계획/);
    await page.key('Enter',{modifiers:CTRL});await page.sleep(500);
    assert.match(await page.text('.today-side .tray'),/분리망 배포 의존성 검토!/);
  }},
  {name:'the panel keeps to the role tokens in every theme',run:async page=>{
    for(const theme of ['g1','g3','g4']){
      await page.js(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
      await openBlock(page,'설계 문서 초안');
      await page.click(panel+' .ed-schedule summary');
      await page.shot('editor-theme-'+theme);
      assert.equal(await page.js(`getComputedStyle(document.querySelector(${JSON.stringify(panel)})).backgroundColor`),await page.js(`getComputedStyle(document.querySelector('.today-side .tray')).backgroundColor`),'panel sits on the panel surface');
      await page.click(panel+' .ed-close');
    }
  }},
];
export default scenarios.map((s,i)=>({...s,run:async page=>{
  try{await s.run(page);}
  catch(e){await page.shot('editor-fail-'+(i+1)).catch(()=>{});throw e;}
  finally{await discard(page);}
}}));
