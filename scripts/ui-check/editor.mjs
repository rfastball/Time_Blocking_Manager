import assert from 'node:assert/strict';
import {toBench,toFocus,toPlan} from './support/nav.mjs';

// Runs on the focus screen (the former 오늘), entered with 몰입. Preview data at 10:20: A 60 (checklist), B 45 (memo + checklist), C 30, D 60 flow; workshop fixed 14:00; E 90; F 120 unplaced.
const space='.today-day .space',panel=".today-main [aria-label='블록 상세']";
const SHIFT=8;
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
  {name:'a block opens beside the space and automatically saves title and memo before switching',run:async page=>{
    await openBlock(page,'설계 문서 초안');
    assert.equal(await value(page,panel+' .ed-title'),'설계 문서 초안 작성');
    assert.match(await value(page,panel+' textarea[aria-label="메모"]'),/진행 상황과 필요한 맥락/);
    assert.equal((await active(page)).label,'제목','title takes the first focus');
    assert.equal(await page.js(`document.querySelector(${JSON.stringify(panel+' .ed-schedule')}).open`),false,'schedule starts folded');
    await page.shot('editor-panel');
    await caretEnd(page,panel+' .ed-title');await page.type(' 보완');
    assert.match(await page.text(panel+' .ed-badges'),/저장 안 됨/);
    assert.equal(await page.rect(panel+' button[type=submit]'),null,'focus has no Save button');
    await page.until(`!document.querySelector(${JSON.stringify(panel+' .ed-dirty')})`,{message:'automatic title save'});
    assert.ok((await page.blocks(space)).includes('설계 문서 초안 작성 보완, 예상 10:00–10:45'));
    assert.doesNotMatch(await page.text(panel+' .ed-badges'),/저장 안 됨/);
    await page.click(panel+' textarea');await page.type('자동 저장 메모');
    await openBlock(page,'회의록 정리');
    await page.until(`document.querySelector(${JSON.stringify(panel+' .ed-title')})?.value==='회의록 정리'`,{message:'the next task to open after saving'});
    assert.match((await page.task('설계 문서 초안 작성 보완')).body,/자동 저장 메모/);
    assert.equal(await page.rect(panel+' .ed-note'),null,'ordinary switching has no discard prompt');
    const clock=await page.js(`(async()=>{const [{getState,setState},{time}]=await Promise.all([__mod('/src/app/store/state.ts'),__mod('/src/dates.ts')]);const before=getState().now;setState({now:before+15});return {before,expected:time(before+15)};})()`);
    try{
      await page.until(`document.querySelector('${space} .nowline span')?.textContent===${JSON.stringify(clock.expected)}`,{message:'the existing timetable to follow the minute clock'});
      assert.equal(await page.text(space+' .nowline span'),clock.expected);
    }finally{
      await page.js(`(async()=>{const {setState}=await __mod('/src/app/store/state.ts');setState({now:${clock.before}});})()`);
    }
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
  {name:'automatic saves preserve newer typing, composition, failed drafts and conflict recovery',run:async page=>{
    await openBlock(page,'설계 문서 초안');
    await page.js(`(async()=>{const [{getState,setState},{previewMutation}]=await Promise.all([__mod('/src/app/store/state.ts'),__mod('/src/preview.ts')]);window.autoPriorIPC=window.__TAURI_INTERNALS__;window.autoWrites=[];window.autoHeld=[];window.autoHold=true;window.autoFailure=null;window.autoStored=new Set();window.__TAURI_INTERNALS__={invoke:async(cmd,args)=>{if(cmd==='mutate'){window.autoWrites.push(args.command);if(window.autoFailure)throw {code:window.autoFailure,message:'자동 저장 실패',retryable:true};if(window.autoHold)await new Promise(resolve=>window.autoHeld.push(resolve));return previewMutation(getState().snapshot,args.command,window.autoStored);}if(cmd==='save_draft'||cmd==='set_dirty')return;if(cmd==='plugin:dialog|message')return 'Ok';throw Error('Unexpected mock IPC '+cmd);}};setState({native:true});})()`);
    try{
      await page.click(panel+' textarea');await page.type('먼저 입력');
      await page.until('window.autoHeld.length===1',{message:'the first automatic write to wait for storage'});
      await page.js(`document.querySelector(${JSON.stringify(panel+' textarea')}).dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}))`);
      await page.type(' 조합 중');
      await page.js(`(async()=>{const {openEditor}=await __mod('/src/app/store/editor.ts');openEditor('sample-c','panel','fix');window.autoHeld.shift()();})()`);
      await page.until(`(async()=>{const {getState}=await __mod('/src/app/store/state.ts');return !getState().busy;})()`,{message:'the earlier response to arrive'});
      assert.match(await value(page,panel+' textarea'),/먼저 입력 조합 중/,'the earlier response preserves newer typing');
      assert.equal(await page.js('window.autoWrites.length'),1,'the save drain pauses during composition');
      await page.js(`document.querySelector(${JSON.stringify(panel+' textarea')}).dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}))`);
      await page.until('window.autoHeld.length===1',{message:'the committed composition to save'});
      await page.js('window.autoHold=false;window.autoHeld.shift()()');
      await page.until(`document.querySelector(${JSON.stringify(panel+' .ed-title')})?.value==='회의록 정리'`,{message:'the requested task to open'});
      assert.match((await page.task('설계 문서 초안 작성')).body,/먼저 입력 조합 중/);
      assert.equal((await active(page)).label,'고정 시각','pending switches preserve their requested field');
      await page.until(`!document.querySelector(${JSON.stringify(panel+' .ed-dirty')})`,{message:'requested schedule edit to finish'});
      const writes=await page.js('window.autoWrites.length');await page.sleep(500);
      assert.equal(await page.js('window.autoWrites.length'),writes,'typing timers do not write the same clean draft twice');
      await page.js('window.autoHold=true');await page.click(panel+' .ed-actions button','완료로 표시');
      await page.until('window.autoHeld.length===1',{message:'completion to wait for storage'});
      await page.click(panel+' textarea');await page.type(' 완료 중 입력');await page.sleep(450);
      assert.equal(await page.js('window.autoHeld.length'),1,'automatic edits wait for the completion revision');
      await page.js('window.autoHold=false;window.autoHeld.shift()()');
      await page.until(`!document.querySelector(${JSON.stringify(panel+' .ed-dirty')})`,{message:'typing during completion to save'});
      assert.equal((await page.task('회의록 정리')).completed,true);
      assert.match((await page.task('회의록 정리')).body,/완료 중 입력/);
      await page.js(`window.autoFailure='storage'`);
      await page.click(panel+' textarea');await page.type('실패해도 남는 메모');
      await openBlock(page,'분리망 배포');
      await page.until(`document.querySelector('.status')?.textContent.includes('자동 저장 실패')`,{message:'the write failure to be visible'});
      assert.equal(await value(page,panel+' .ed-title'),'회의록 정리','failed input prevents replacing the draft');
      assert.match(await value(page,panel+' textarea'),/실패해도 남는 메모/);
      await page.js('window.autoFailure=null');await page.click('.status button','다시 시도');
      await page.until(`document.querySelector(${JSON.stringify(panel+' .ed-title')})?.value==='분리망 배포 의존성 검토'`,{message:'retry to store the draft and finish its pending switch'});
      assert.match((await page.task('회의록 정리')).body,/실패해도 남는 메모/);
      await page.click(panel+' textarea');await page.type('충돌에도 남는 메모');
      await page.js(`(async()=>{const {getState,setState}=await __mod('/src/app/store/state.ts');const s=getState();setState({snapshot:{...s.snapshot,tasks:s.snapshot.tasks.map(t=>t.id==='sample-d'?{...t,body:'다른 창의 메모',revision:t.revision+1}:t)}});})()`);
      await page.until(`(async()=>{const {getState}=await __mod('/src/app/store/state.ts');return getState().failed?.code==='conflict';})()`,{message:'a revision conflict'});
      assert.match(await value(page,panel+' textarea'),/충돌에도 남는 메모/);
      assert.equal((await page.task('분리망 배포 의존성 검토')).body,'다른 창의 메모','a conflict does not overwrite external changes');
      await page.click('.status button','입력 유지하고 수정');
      await page.js('window.confirm=()=>true');await page.click(panel+' .ed-note button','내 입력으로 저장');
      await page.until(`!document.querySelector(${JSON.stringify(panel+' .ed-dirty')})`,{message:'explicit conflict recovery'});
      assert.match((await page.task('분리망 배포 의존성 검토')).body,/충돌에도 남는 메모/);
    }finally{
      await page.js(`(async()=>{const [{setState},{queue},{setEditorComposing}]=await Promise.all([__mod('/src/app/store/state.ts'),__mod('/src/app/store/session.ts'),__mod('/src/app/store/editor.ts')]);setEditorComposing(false);window.autoHeld.splice(0).forEach(resolve=>resolve());queue.discardFailed();setState({native:false,error:''});if(window.autoPriorIPC)window.__TAURI_INTERNALS__=window.autoPriorIPC;else delete window.__TAURI_INTERNALS__;})()`);
    }
  }},
  {name:'focus closing saves without confirmation while work dialogs keep their draft choices',run:async page=>{
    await openBlock(page,'회의록 정리');
    await page.click(panel+' textarea[aria-label="메모"]');await page.type('결정 사항 정리');
    await page.click(panel+' .ed-close');
    await page.until(`!document.querySelector(${JSON.stringify(panel)})`,{message:'focus detail to save and close'});
    assert.equal(await page.rect(panel),null);
    assert.match((await active(page)).label,/회의록 정리, 예상/,'panel close returns to the block that opened it');
    assert.equal((await page.task('회의록 정리')).body,'결정 사항 정리');
    await toPlan(page);
    await page.js(`(async()=>{const {openEditor}=await __mod('/src/app/store/editor.ts');openEditor('sample-c');})()`);
    await page.click('dialog.ed-dialog textarea');await page.type(' 수동 초안');
    await page.click('dialog.ed-dialog .ed-close');
    assert.ok(await page.rect('dialog.ed-dialog .ed-confirm'),'work dialog keeps its confirmation');
    await page.click('dialog.ed-dialog .ed-confirm button','초안으로 남기고 닫기');
    assert.match(await page.text('.status'),/‘회의록 정리’ 이어서 편집/);
    await page.click('.status button','이어서 편집');
    assert.ok(await page.js(`document.querySelector('dialog.ed-dialog')?.open`),'dialog open');
    assert.match(await value(page,'dialog.ed-dialog textarea'),/수동 초안/);
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
    await page.until(`!document.querySelector(${JSON.stringify(panel+' .ed-dirty')})`,{message:'automatic fixed schedule save'});
    assert.ok((await page.blocks(space)).includes('회의록 정리, 시각 고정 10:45–11:15'));
    assert.match(await page.text(panel+' .ed-state'),/시각 고정/);
  }},
  {name:'the block menu releases a fixed block and moves another to 준비',run:async page=>{
    await rightClick(page,space+' .blk.fixed','설계 워크숍');await page.sleep(200);
    assert.match(await page.text('.ctx-menu .menu-head'),/설계 워크숍/);
    assert.deepEqual(await menuItems(page),['고정 해제','나누기','준비로 보내기','완료','삭제']);
    await page.shot('editor-context-menu');
    await page.click('.ctx-menu [role=menuitem]','고정 해제');await page.sleep(500);
    assert.ok((await page.blocks(space)).some(b=>b.startsWith('설계 워크숍, 예상')),'released into the flow');
    await rightClick(page,space+' .blk','분리망 배포');await page.sleep(200);
    assert.ok((await menuItems(page)).includes('시각 고정…'));
    await page.click('.ctx-menu [role=menuitem]','준비로 보내기');await page.sleep(500);
    assert.ok(!(await page.blocks(space)).some(b=>b.startsWith('분리망 배포')));
    assert.match(await page.text('.today-side .tray'),/분리망 배포 의존성 검토/);
    // On 오늘 empty time only adjusts the day's working time; new blocks are made where the day is planned.
    const emptyMenu=async scope=>{await page.js(`(()=>{const s=document.querySelector('${scope}'),r=s.getBoundingClientRect();s.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+r.width-40,clientY:r.top+20}));})()`);await page.sleep(200);return menuItems(page);};
    assert.deepEqual(await emptyMenu(space),['근무시간 조정']);
    await page.mouse('mouseMoved',5,5,0);await page.mouse('mousePressed',5,5);await page.mouse('mouseReleased',5,5,0);await page.sleep(150);
    assert.equal(await page.rect('.ctx-menu'),null,'outside press closes');
    await toPlan(page);await page.click('.segmented [role=radio]','일');await page.sleep(400);
    const create=(await emptyMenu('.dv-day .space'))[0];
    assert.match(create,/^\d\d:\d\d에 새 블록$/);
    await page.click('.ctx-menu [role=menuitem]',create);await page.sleep(200);
    assert.equal(await page.js(`document.querySelector('.plan-desk').classList.contains('day')`),true);
    assert.equal(await page.js('document.activeElement?.id'),'composer-title','creation takes focus in the plan day');
    await page.shot('today-menu-create-plan');
    await page.type('메뉴에서 만든 블록');await page.click('.composer button[type=submit]');await page.sleep(400);
    assert.ok((await page.blocks('.dv-day .space')).some(b=>b.startsWith('메뉴에서 만든 블록, 시각 고정')),'the creation route stores a usable block');
  }},
  {name:'삭제 in the block menu and the detail goes to 휴지통 without a dialog; restore returns the block to its place',run:async page=>{
    await page.js('window.__asked=[];window.confirm=t=>{window.__asked.push(t);return false;}');
    await rightClick(page,space+' .blk','회의록 정리');await page.sleep(200);
    await page.click('.ctx-menu [role=menuitem]','삭제');await page.sleep(500);
    assert.ok(!(await page.blocks(space)).some(b=>b.startsWith('회의록 정리')),'left the day');
    assert.equal(await page.text('[role=status]'),'‘회의록 정리’를 휴지통으로 옮겼어요');
    await openBlock(page,'분리망 배포');
    assert.equal(await page.js(`document.querySelector(${JSON.stringify(panel)}).querySelector('[aria-label="더보기"]')`),null);
    await page.click(panel+' .ed-actions button','삭제');await page.sleep(500);
    assert.equal(await page.rect(panel),null,'detail closed');
    assert.ok(!(await page.blocks(space)).some(b=>b.startsWith('분리망 배포')));
    assert.ok((await active(page)).task,'focus moves to a remaining block');
    assert.deepEqual(await page.js('window.__asked'),[],'no dialog');
    await toBench(page);
    assert.match(await page.text('.inbox-trash > summary'),/휴지통 2/);
    await page.js(`document.querySelector('.inbox-trash > summary').scrollIntoView({block:'center'})`);
    await page.click('.inbox-trash > summary');await page.sleep(300);
    await page.js(`document.querySelector('button[aria-label="회의록 정리 복원"]').scrollIntoView({block:'center'})`);
    await page.click('button[aria-label="회의록 정리 복원"]');await page.sleep(400);
    await toFocus(page);
    assert.ok((await page.blocks(space)).includes('회의록 정리, 예상 10:45–11:15'),'back at its old place in the order');
  }},
  {name:'Shift+F10 opens the menu by keyboard; arrows move and Esc returns focus to the block',run:async page=>{
    await focusBlock(page,'회의록 정리');
    await page.key('F10',{modifiers:SHIFT});await page.sleep(200);
    assert.equal((await active(page)).text,'시각 고정…');
    await page.key('ArrowDown');assert.equal((await active(page)).text,'나누기');
    await page.key('ArrowUp');await page.key('ArrowUp');assert.equal((await active(page)).text,'삭제','wraps');
    await page.key('Home');assert.equal((await active(page)).text,'시각 고정…');
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
  {name:'나누기 opens the cutting board as a dialog: Enter halves, Esc commits the pieces in place, 취소 keeps the block',run:async page=>{
    await focusBlock(page,'설계 문서 자료 조사');
    await page.key('F10',{modifiers:SHIFT});await page.sleep(200);
    await page.click('.ctx-menu [role=menuitem]','나누기');await page.sleep(300);
    assert.ok(await page.js(`!!document.querySelector('dialog.cut-dialog[open]')`),'board dialog');
    assert.equal((await active(page)).label,null);assert.equal(await page.js('document.activeElement?.id'),'cut-title');
    await page.js(`document.querySelector('.cut-name').focus()`);await page.key('Enter',{text:'\r'});await page.sleep(200);
    assert.deepEqual(await page.js(`[...document.querySelectorAll('.cut-len')].map(e=>e.textContent)`),['30분','30분']);
    await page.type('자료 정리');
    await page.shot('editor-split');
    await page.key('Escape');await page.sleep(600);
    assert.equal(await page.js(`!!document.querySelector('dialog.cut-dialog[open]')`),false);
    const blocks=await page.blocks(space);
    assert.ok(blocks.includes('설계 문서 자료 조사, 예상 09:00–09:30'),blocks.join(' / '));
    assert.ok(blocks.includes('자료 정리, 예상 09:30–10:00'),'the second piece follows in the day, not in 준비');
    // 취소 throws the edit away; focus returns to the block.
    await focusBlock(page,'분리망 배포');await page.key('F10',{modifiers:SHIFT});await page.sleep(200);
    await page.click('.ctx-menu [role=menuitem]','나누기');await page.sleep(300);
    await page.js(`document.querySelector('.cut-name').focus()`);await page.key('Enter',{text:'\r'});await page.sleep(150);
    await page.click('.cut-foot .btn','취소');await page.sleep(300);
    assert.equal(await page.js(`!!document.querySelector('dialog.cut-dialog[open]')`),false);
    assert.equal((await page.blocks(space)).filter(b=>b.startsWith('분리망 배포')).length,1);
    assert.equal((await active(page)).task,'sample-d');
    await page.key('F10',{modifiers:SHIFT});await page.sleep(150);
    await page.click('.ctx-menu [role=menuitem]','나누기');await page.sleep(200);
    await page.click('.cut-name');await page.type('한 조각 이름 수정');
    await page.click('.cut-foot .primary');await page.sleep(300);
    assert.ok((await page.blocks(space)).some(b=>b.startsWith('한 조각 이름 수정, 예상')),'a single name-only edit persists');
  }},
  {name:'a failed narrow cutting board retries or releases inside its dialog without losing the input',viewport:{width:720,height:900},run:async page=>{
    await focusBlock(page,'설계 문서 자료 조사');await page.key('F10',{modifiers:SHIFT});await page.sleep(150);
    await page.click('.ctx-menu [role=menuitem]','나누기');await page.sleep(200);
    await page.js(`(async()=>{const [{getState,setState},{previewMutation}]=await Promise.all([__mod('/src/app/store/state.ts'),__mod('/src/preview.ts')]);window.cutPriorIPC=window.__TAURI_INTERNALS__;window.cutFailure='storage';window.cutStored=new Set();window.__TAURI_INTERNALS__={invoke:async(cmd,args)=>{if(cmd==='mutate'){if(window.cutFailure)throw {code:window.cutFailure,message:'도마 저장 실패',retryable:true};return previewMutation(getState().snapshot,args.command,window.cutStored);}if(cmd==='save_draft'||cmd==='set_dirty')return;throw Error('Unexpected mock IPC '+cmd);}};setState({native:true});})()`);
    try{
      await page.click('.cut-name');await page.type('도마 복구 입력');
      await page.click('.cut-foot .primary');await page.sleep(250);
      assert.match(await page.text('.cut-error'),/도마 저장 실패/);
      assert.equal(await page.js(`[...document.querySelectorAll('.cut .ed-row button')].every(b=>!b.disabled)`),true,'recovery stays enabled with a failed queue');
      assert.equal(await value(page,'.cut-name'),'도마 복구 입력');
      await page.js(`document.querySelector('.cut .ed-row button').focus()`);await page.key('Escape');
      assert.ok(await page.rect('.cut'),'Escape on recovery keeps the board');
      await page.shot('cut-recovery-narrow');
      await page.js(`window.cutFailure=null`);await page.key('Enter',{text:'\r'});await page.sleep(400);
      assert.equal(await page.rect('.cut'),null,'keyboard retry closes after storing');
      assert.ok((await page.blocks(space)).some(b=>b.startsWith('도마 복구 입력, 예상')));
      await focusBlock(page,'도마 복구 입력');await page.key('F10',{modifiers:SHIFT});await page.sleep(150);
      await page.click('.ctx-menu [role=menuitem]','나누기');await page.sleep(200);
      await page.click('.cut-name');await page.type('도마 수정 유지');
      await page.js(`window.cutFailure='validation'`);await page.click('.cut-foot .primary');await page.sleep(250);
      await page.click('.cut .ed-row button','입력 유지하고 수정');await page.sleep(200);
      assert.equal(await value(page,'.cut-name'),'도마 수정 유지');
      assert.equal(await page.js(`(async()=>{const {getState}=await __mod('/src/app/store/state.ts');return !!getState().failed;})()`),false);
      await page.js(`window.cutFailure=null`);await page.click('.cut-foot .primary');await page.sleep(300);
      assert.ok((await page.blocks(space)).some(b=>b.startsWith('도마 수정 유지, 예상')));
    }finally{
      await page.js(`(async()=>{const [{setState},{queue}]=await Promise.all([__mod('/src/app/store/state.ts'),__mod('/src/app/store/session.ts')]);queue.discardFailed();setState({native:false,error:''});if(window.cutPriorIPC)window.__TAURI_INTERNALS__=window.cutPriorIPC;else delete window.__TAURI_INTERNALS__;})()`);
    }
  }},
  {name:'the detail exposes deletion directly and splitting flushes automatic focus edits',run:async page=>{
    await openBlock(page,'분리망 배포');
    await caretEnd(page,panel+' .ed-title');await page.type('!');
    assert.deepEqual(await page.js(`[...document.querySelectorAll(${JSON.stringify(panel+' .ed-actions button')})].map(b=>b.textContent)`),['완료로 표시','삭제']);
    await rightClick(page,space+' .blk','분리망 배포');await page.sleep(150);
    await page.click('.ctx-menu [role=menuitem]','나누기');await page.sleep(150);
    assert.ok(await page.rect('.cut'),'board opens after saving');
    assert.match(await value(page,'#cut-title'),/!$/,'the cutting board sees the latest title');
    await page.click('.cut-foot .btn','취소');
    await page.js(`document.querySelector(${JSON.stringify(panel+' .ed-actions .danger')}).focus()`);
    await page.key('Enter',{text:'\r'});await page.sleep(400);
    assert.equal(await page.rect(panel),null,'deletion clears the unsaved detail');
    assert.equal(await page.js(`!!document.querySelector('.status')?.textContent.includes('이어서 편집')`),false);
    assert.equal(await page.text('[role=status]'),'‘분리망 배포 의존성 검토!’을(를) 휴지통으로 옮겼어요');
  }},
  {name:'the panel keeps to the role tokens in every theme',run:async page=>{
    for(const theme of ['g1','g3','g4']){
      await page.js(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
      await openBlock(page,'설계 문서 초안');
      await page.click(panel+' .ed-schedule summary');
      await page.shot('editor-theme-'+theme);
      assert.equal(await page.js(`getComputedStyle(document.querySelector(${JSON.stringify(panel)})).backgroundColor`),await page.js(`getComputedStyle(document.querySelector('.today-side .tray')).backgroundColor`),'panel sits on the panel surface');
      await page.click(panel+' .ed-close');
      assert.match((await active(page)).label,/설계 문서 초안 작성, 예상/,'closing restores the opening block');
    }
    await page.js(`document.querySelector('.ed-next-open').focus()`);await page.key('Enter',{text:'\r'});await page.sleep(200);
    await page.key('Escape');await page.sleep(200);
    assert.equal(await page.js(`document.activeElement?.classList.contains('ed-next-open')`),true,'the remounted Next card takes focus again');
  }},
  {name:'the narrow detail keeps its direct delete action visible',viewport:{width:720,height:900},run:async page=>{
    await openBlock(page,'분리망 배포');
    assert.equal(await page.rect('dialog.ed-dialog button[type=submit]'),null,'narrow focus also has no Save button');
    await page.click('dialog.ed-dialog textarea');await page.type('좁은 몰입 메모');
    await page.key('Escape');
    await page.until(`!document.querySelector('dialog.ed-dialog')`,{message:'narrow automatic close'});
    assert.match((await page.task('분리망 배포 의존성 검토')).body,/좁은 몰입 메모/);
    await openBlock(page,'분리망 배포');
    const selector='dialog.ed-dialog .ed-actions .danger',r=await page.rect(selector);
    assert.ok(r&&r.x>=0&&r.x+r.w<=720&&r.y+r.h<=900,'delete fits the viewport');
    assert.equal(await page.js(`!!document.querySelector('dialog.ed-dialog [aria-label="더보기"]')`),false);
    await page.shot('editor-direct-delete-narrow');
    await page.click(selector);await page.sleep(400);
    assert.equal(await page.rect('dialog.ed-dialog'),null);
    assert.ok((await active(page)).task,'focus returns to a remaining block');
  }},
];
export default scenarios.map((s,i)=>({...s,run:async page=>{
  try{await toFocus(page);await s.run(page);}
  catch(e){await page.shot('editor-fail-'+(i+1)).catch(()=>{});throw e;}
  finally{await discard(page);}
}}));
