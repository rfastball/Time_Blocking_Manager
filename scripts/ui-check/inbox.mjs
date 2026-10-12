import assert from 'node:assert/strict';

// Preview data on the bench: the 투입구 holds 주간 보고 초안 (proto), 회의록 템플릿 업데이트 30분, SQLite 백업 방식 조사 45분;
// one pile holds 메일 답장 and 결재 처리 (15분 each); 경쟁사 동향 정리 is left over from two days ago. The preview opens on 오늘.
const trashed='.inbox-trash .irow';
const stubDialogs=page=>page.js('window.__asked=[];window.confirm=t=>{window.__asked.push(t);return false;}');
// Each pile as "IN:title|title" / "P:title|title", left to right.
const bench=page=>page.js(`[...document.querySelectorAll('.wb-pile')].map(e=>(e.dataset.pile?'P':'IN')+':'+[...e.querySelectorAll('[data-card] .ttl')].map(t=>t.textContent).join('|'))`);
const titles=(page,selector)=>page.js(`[...document.querySelectorAll(${JSON.stringify(selector)})].map(r=>r.querySelector('strong').textContent)`);
const open=async page=>{await page.click('.rail-nav .nav-button','미계획');await page.sleep(300);assert.ok(await page.js('!!document.querySelector(".wb")'),'미계획 작업대');};
const card=(page,title)=>page.rect('.wb-card',title);
const focusCard=(page,title)=>page.js(`[...document.querySelectorAll('.wb-card .main')].find(e=>e.textContent.includes(${JSON.stringify(title)})).focus()`);
const label=page=>page.js('document.activeElement?.getAttribute("aria-label")');

// Text left in the capture row would stop the next navigation at the app's unsaved-input guard.
const discard=async page=>{
  await page.js(`(()=>{const el=document.querySelector('#inbox-capture');if(!el)return;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await page.sleep(300);
};

const scenarios=[
  {name:'the bench shows 지난 미완료, the 투입구 first and its piles, with five date columns beside it',run:async page=>{
    await open(page);
    assert.deepEqual(await bench(page),['IN:주간 보고 초안|회의록 템플릿 업데이트|SQLite 백업 방식 조사','P:메일 답장|결재 처리']);
    assert.match(await page.text('.wb-sec[aria-label="지난 미완료"]'),/경쟁사 동향 정리.*\d+월 \d+일 · 1시간/);
    assert.equal(await page.js(`document.querySelector('.wb-card.proto .meta')`),null,'a proto shows no size');
    assert.equal(await page.js(`document.querySelector('.wb-card.proto .main').getAttribute('aria-label')`),'주간 보고 초안, 길이 미정');
    assert.equal(await page.js(`document.querySelector('.wb-pile[data-pile=""] .wb-handle').getAttribute('aria-label')`),'투입구, 3개, 1시간 45분');
    assert.equal(await page.js(`document.querySelector('.wb-pile[data-pile="pile-errands"] .wb-handle').getAttribute('aria-label')`),'‘메일 답장’ 외 1 더미, 30분');
    assert.equal(await page.js('document.querySelectorAll(".wb-day").length'),5);
    assert.ok(await page.js(`document.querySelector('.wb-day').classList.contains('today')`),'today first');
    // Cards keep their sizes: 45 minutes is taller than 30, nothing is squeezed.
    const [a,b]=[await card(page,'회의록'),await card(page,'SQLite')];assert.ok(b.h>a.h+10,`${a.h} < ${b.h}`);
    await page.shot('inbox-initial');
  }},
  {name:'Enter captures a proto on top of the 투입구 and clears the input',run:async page=>{
    await open(page);
    await page.click('#inbox-capture');await page.type('주간 보고 정리');await page.key('Enter');await page.sleep(160);
    await page.shot('inbox-captured-landing');
    await page.sleep(500);
    assert.equal((await bench(page))[0],'IN:주간 보고 정리|주간 보고 초안|회의록 템플릿 업데이트|SQLite 백업 방식 조사');
    assert.ok(await page.js(`document.querySelector('.wb-pile .wb-card').classList.contains('proto')`),'a capture is a proto');
    assert.equal(await page.js('document.querySelector("#inbox-capture").value'),'');
    assert.equal(await page.js('document.activeElement?.id'),'inbox-capture');
  }},
  {name:'completing records the card as today’s completion; 미계획 has no 완료 list',run:async page=>{
    await open(page);
    await page.click('.wb-card .chk[aria-label="회의록 템플릿 업데이트 완료"]');await page.sleep(500);
    assert.equal((await bench(page))[0],'IN:주간 보고 초안|SQLite 백업 방식 조사');
    assert.equal(await page.js('!!document.querySelector(".inbox-done:not(.inbox-trash)")'),false,'no 완료 or archive section');
    await page.click('.rail-nav .nav-button','오늘');await page.sleep(500);
    assert.ok(await page.js(`!!document.querySelector('.today-day .bin')?.textContent.includes('회의록 템플릿 업데이트')`),'recorded on today');
  }},
  {name:'a card drops into a pile at its place, into empty space as a new pile, and onto a date column at its end',run:async page=>{
    await open(page);
    let from=await card(page,'회의록'),to=await card(page,'결재 처리');
    await page.js(`(async()=>{const {enqueue}=await import('/src/app/store/session.ts');window.dropFrames=[];window.dropStoreGate=enqueue(()=>new Promise(resolve=>{window.releaseDropStore=resolve;}));})()`);
    const during=await page.drag({x:from.x+60,y:from.cy},{x:to.cx,y:to.y+2},{before:async()=>{
      await page.js(`document.addEventListener('pointerup',()=>{const begun=performance.now();const sample=()=>{const held=document.querySelector('.held'),r=held?.getBoundingClientRect();window.dropFrames.push({x:r?.left,visible:[...document.querySelectorAll('[data-card="sample-4"]')].filter(e=>getComputedStyle(e).visibility==='visible').map(e=>e.closest('[data-pile]').dataset.pile)});if(performance.now()-begun<1300)requestAnimationFrame(sample);};requestAnimationFrame(sample);},{once:true});`);
      return {slot:await page.js('!!document.querySelector(".wb-pile[data-pile=\\"pile-errands\\"] .wb-slot")'),lifted:await page.js('document.querySelector(".wb-card.lifted .ttl")?.textContent')};
    }});
    assert.deepEqual(during,{slot:true,lifted:'회의록 템플릿 업데이트'},'the landing slot shows before the drop');
    const waiting=await page.js(`(()=>{const held=document.querySelector('.held'),source=document.querySelector('[data-card="sample-4"]'),r=held?.getBoundingClientRect();return {overlay:!!held,source:getComputedStyle(source).visibility,pile:source.closest('[data-pile]').dataset.pile,rect:r&&{x:r.left,y:r.top}};})()`);
    await page.shot('inbox-drop-awaiting-store');
    await page.js(`window.releaseDropStore();`);await page.sleep(450);
    assert.equal(waiting.overlay,true,'the released overlay remains at the destination while persistence is pending');
    assert.equal(waiting.source,'hidden','the stale source does not reappear before persistence completes');
    const frames=await page.js('window.dropFrames');
    assert.ok(frames.length>10,'intermediate frames were sampled');
    assert.ok(frames.filter(f=>f.x!==undefined).every(f=>f.x>from.x+70),'the released overlay never travels back to the source');
    assert.ok(frames.every(f=>f.visible.length<=1&&!f.visible.includes('')),'no visible duplicate or stale source appears during the handoff');
    assert.deepEqual(await bench(page),['IN:주간 보고 초안|SQLite 백업 방식 조사','P:메일 답장|회의록 템플릿 업데이트|결재 처리']);
    await page.shot('inbox-drop-saved');
    from=await card(page,'SQLite');const end=await page.rect('.wb-gutter.end');
    await page.drag({x:from.x+60,y:from.cy},{x:end.x+40,y:end.y+40});
    assert.deepEqual(await bench(page),['IN:주간 보고 초안','P:메일 답장|회의록 템플릿 업데이트|결재 처리','P:SQLite 백업 방식 조사']);
    const pileHandle=await page.rect('.wb-pile:has([data-card="sample-5"]) .wb-handle'),gap=await page.rect('.wb-gutter:not(.end)');
    await page.drag({x:pileHandle.x+20,y:pileHandle.cy},{x:gap.cx,y:gap.y+40});
    assert.deepEqual(await bench(page),['IN:주간 보고 초안','P:SQLite 백업 방식 조사','P:메일 답장|회의록 템플릿 업데이트|결재 처리'],'a whole pile settles into the chosen gap');
    from=await card(page,'주간 보고');const col=await page.rect('.wb-day:nth-child(2) .wb-dbody');
    const hint=await page.drag({x:from.x+60,y:from.cy},{x:col.cx,y:col.y+60},{before:()=>page.text('.held-why.where')});
    assert.match(hint,/\d+월 \d+일 순서 끝/);
    assert.equal((await bench(page))[0],'IN:');
    assert.match(await page.text('.wb-day:nth-child(2) .wb-dload'),/^0\.5 \/ \d/,'a proto lands at 30 minutes');
    from=await card(page,'메일 답장');
    await page.mouse('mouseMoved',from.x+60,from.cy,0);await page.mouse('mousePressed',from.x+60,from.cy);await page.mouse('mouseMoved',from.x+85,from.cy,1);await page.sleep(80);
    await page.js(`(async()=>{const [{getState},{deleteTask}]=await Promise.all([import('/src/app/store/state.ts'),import('/src/app/store/tasks.ts')]);await deleteTask(getState().snapshot.tasks.find(t=>t.id==='sample-m'));})()`);
    await page.mouse('mouseReleased',from.x+85,from.cy,0);await page.sleep(220);
    assert.deepEqual(await page.js(`(async()=>{const {getState}=await import('/src/app/store/state.ts');return {overlay:!!document.querySelector('.held'),gesture:getState().gesture};})()`),{overlay:false,gesture:false},'removing the source during a drag does not leave a stuck handoff');
  }},
  {name:'a pile handle carries the pile: onto another pile it stacks below, and pressing it selects the cards',run:async page=>{
    await open(page);
    const handle=await page.rect('.wb-pile[data-pile="pile-errands"] .wb-handle'),inbox=await card(page,'SQLite');
    const original=await bench(page);
    await page.mouse('mouseMoved',handle.x+20,handle.cy,0);await page.mouse('mousePressed',handle.x+20,handle.cy);await page.mouse('mouseMoved',inbox.cx,inbox.cy,1);await page.sleep(120);
    await page.key('Escape');await page.sleep(110);
    const returning=await page.rect('.held');
    assert.ok(!returning||Math.abs(returning.y-handle.y)<4,'a cancelled pile returns to its handle rather than its first card');
    await page.mouse('mouseReleased',inbox.cx,inbox.cy,0);await page.sleep(180);
    assert.deepEqual(await bench(page),original,'cancelling a carried pile restores the source');
    assert.equal(await page.js('!!document.querySelector(".held")'),false);
    await page.js(`(async()=>{const {setState}=await import('/src/app/store/state.ts');window.dropPreviousIPC=window.__TAURI_INTERNALS__;window.__TAURI_INTERNALS__={invoke:async cmd=>{if(cmd==='mutate')throw {code:'storage',message:'드롭 저장 실패',retryable:true};if(cmd==='set_dirty')return;throw Error('Unexpected mock IPC '+cmd);}};setState({native:true});})()`);
    await page.drag({x:handle.x+20,y:handle.cy},{x:inbox.cx,y:inbox.cy});
    assert.deepEqual(await bench(page),original,'a rejected store write returns the whole pile without changing its cards');
    assert.equal(await page.js('!!document.querySelector(".held")'),false,'failed persistence completes the rollback');
    await page.js(`(async()=>{const [{setState},{queue}]=await Promise.all([import('/src/app/store/state.ts'),import('/src/app/store/session.ts')]);queue.discardFailed();setState({native:false,error:''});if(window.dropPreviousIPC)window.__TAURI_INTERNALS__=window.dropPreviousIPC;else delete window.__TAURI_INTERNALS__;delete window.dropPreviousIPC;window.dropOriginalMatchMedia=window.matchMedia;window.matchMedia=q=>q==='(prefers-reduced-motion: reduce)'?{matches:true}:window.dropOriginalMatchMedia.call(window,q);window.dropOriginalAnimate=Element.prototype.animate;window.dropOverlayAnimations=0;Element.prototype.animate=function(...args){if(this.querySelector('.held'))window.dropOverlayAnimations++;return window.dropOriginalAnimate.apply(this,args);};const {enqueue}=await import('/src/app/store/session.ts');window.dropStoreGate=enqueue(()=>new Promise(resolve=>{window.releaseDropStore=resolve;}));})()`);
    await page.drag({x:handle.x+20,y:handle.cy},{x:inbox.cx,y:inbox.cy});
    assert.equal(await page.js('!!document.querySelector(".held")'),true,'reduced motion still retains the released pile until storage completes');
    assert.equal(await page.js('getComputedStyle(document.querySelector(".wb-pile[data-pile=\\"pile-errands\\"]")).visibility'),'hidden');
    await page.js('window.releaseDropStore();');await page.sleep(220);
    assert.equal(await page.js('window.dropOverlayAnimations'),0,'reduced motion settles without an overlay transition');
    await page.js('window.matchMedia=window.dropOriginalMatchMedia;Element.prototype.animate=window.dropOriginalAnimate;delete window.dropOriginalMatchMedia;delete window.dropOriginalAnimate;');
    assert.deepEqual(await bench(page),['IN:주간 보고 초안|회의록 템플릿 업데이트|SQLite 백업 방식 조사|메일 답장|결재 처리']);
    await page.click('.wb-pile[data-pile=""] .wb-handle');
    assert.match(await page.text('.wb-selbar'),/선택 5 · 2시간 15분/);
    await page.click('.wb-selbar .btn','오늘에 싣기');await page.sleep(500);
    assert.equal((await bench(page))[0],'IN:');
    assert.equal(await page.js('!!document.querySelector(".wb-selbar")'),false);
  }},
  {name:'keyboard sets lengths, moves cards within and across piles, and opens the pile menu',run:async page=>{
    await open(page);
    await focusCard(page,'주간 보고 초안');await page.key('ArrowDown');await page.sleep(300);
    assert.equal(await label(page),'주간 보고 초안, 45분','a length sizes the proto');
    await page.key('ArrowDown',{modifiers:1});await page.sleep(300);
    assert.equal((await bench(page))[0],'IN:회의록 템플릿 업데이트|주간 보고 초안|SQLite 백업 방식 조사');
    await page.key('ArrowRight',{modifiers:1});await page.sleep(300);
    assert.deepEqual(await bench(page),['IN:회의록 템플릿 업데이트|SQLite 백업 방식 조사','P:메일 답장|주간 보고 초안|결재 처리'],'the pile beside it, at the same height');
    await page.key('ArrowRight',{modifiers:1});await page.sleep(300);
    assert.deepEqual((await bench(page)).slice(1),['P:메일 답장|결재 처리','P:주간 보고 초안'],'past the last pile: a new pile');
    assert.equal(await label(page),'주간 보고 초안, 45분','focus follows the card');
    await page.js(`document.querySelector('.wb-pile[data-pile="pile-errands"] .wb-handle').focus()`);await page.key('F10',{modifiers:8});await page.sleep(300);
    assert.deepEqual(await page.js(`[...document.querySelectorAll('.wb-menu [role=menuitem]')].map(b=>b.textContent).slice(0,3)`),['투입구에 합치기','오른쪽 더미에 합치기','오늘에 싣기']);
    await page.key('Escape');await page.sleep(200);
    assert.match(await label(page),/더미/,'focus returns to the handle');
  }},
  {name:'a card delete button moves even a 15-minute card to 휴지통 without drag or a dialog; restore keeps its pile',run:async page=>{
    await open(page);
    await stubDialogs(page);
    await page.click('button[aria-label="메일 답장 삭제"]');await page.sleep(500);
    assert.deepEqual(await page.js('window.__asked'),[],'no dialog');
    assert.equal((await bench(page))[1],'P:결재 처리');
    assert.equal(await label(page),'결재 처리 삭제','focus moves to the next delete button');
    assert.equal(await page.js(`!!document.querySelector('.held, .cut')`),false,'no drag or cutting board');
    assert.equal(await page.text('[role=status]'),'‘메일 답장’을 휴지통으로 옮겼어요');
    assert.equal(await page.js('document.querySelector(".inbox-trash").open'),false);
    assert.equal(await page.js(`document.querySelectorAll(${JSON.stringify(trashed)}).length`),0,'closed trash disclosure does not mount rows');
    await page.click('.inbox-trash > summary');await page.sleep(400);
    assert.deepEqual(await titles(page,trashed),['메일 답장']);
    await page.shot('inbox-trash-open');
    await page.click('button[aria-label="메일 답장 복원"]');await page.sleep(500);
    assert.equal((await bench(page))[1],'P:메일 답장|결재 처리');
    assert.equal(await page.js('!!document.querySelector(".inbox-trash")'),false,'no empty trash label');
    await focusCard(page,'메일 답장');await page.key('Delete');await page.sleep(300);
    assert.equal(await label(page),'결재 처리, 15분','keyboard Delete keeps focus in the cards');
    await page.click('button[aria-label="결재 처리 삭제"]');await page.sleep(300);
    assert.equal(await label(page),'SQLite 백업 방식 조사 삭제','last card uses the previous card');
    for(const title of ['SQLite 백업 방식 조사','회의록 템플릿 업데이트','주간 보고 초안','경쟁사 동향 정리']){
      await page.click(`button[aria-label="${title} 삭제"]`);await page.sleep(200);
    }
    assert.equal(await page.js('document.activeElement?.id'),'inbox-capture','last deletion returns to capture');
  }},
  {name:'영구 삭제 removes one item; 휴지통 비우기 asks in place and Esc keeps everything',run:async page=>{
    await open(page);
    await stubDialogs(page);
    for(const t of ['회의록 템플릿 업데이트','SQLite 백업 방식 조사']){await focusCard(page,t);await page.key('Delete');await page.sleep(400);}
    await page.click('.inbox-trash > summary');await page.sleep(300);
    await page.click('button[aria-label="회의록 템플릿 업데이트 영구 삭제"]');await page.sleep(500);
    assert.deepEqual(await titles(page,trashed),['SQLite 백업 방식 조사']);
    assert.equal(await label(page),'SQLite 백업 방식 조사 영구 삭제','focus moves to the next row');
    await page.click('.inbox-trash-foot button','휴지통 비우기');await page.sleep(250);
    assert.match(await page.text('.inbox-trash-foot'),/휴지통의 1개를 영구 삭제할까요\?/);
    assert.equal(await page.js('document.activeElement?.textContent'),'정말 비우기');
    await page.key('Escape');await page.sleep(200);
    assert.equal(await page.js('document.activeElement?.textContent'),'휴지통 비우기');
    await page.click('.inbox-trash-foot button','휴지통 비우기');await page.sleep(200);
    await page.click('.inbox-trash-foot button','정말 비우기');await page.sleep(500);
    assert.equal(await page.js('!!document.querySelector(".inbox-trash")'),false);
    assert.deepEqual(await page.js('window.__asked'),[],'no dialog');
  }},
  {name:'flow: capture → 투입구 → a pile → the cutting board → shipped to a day in order',run:async page=>{
    await open(page);
    await page.click('#inbox-capture');await page.type('설계 문서 작성');await page.key('Enter');await page.sleep(500);
    // Into the errands pile's handle: its top.
    const from=await card(page,'설계 문서 작성'),handle=await page.rect('.wb-pile[data-pile="pile-errands"] .wb-handle');
    await page.drag({x:from.x+60,y:from.cy},{x:handle.cx,y:handle.cy});
    assert.equal((await bench(page))[1],'P:설계 문서 작성|메일 답장|결재 처리');
    // The board: a proto gets a length by its bottom edge, then a knife cut and a name.
    await page.click('.wb-card .main','설계 문서 작성');await page.sleep(400);
    assert.ok(await page.js(`document.querySelector('.wb-card.onboard')?.textContent.includes('설계 문서 작성')`),'its place stays as an outline');
    assert.ok(await page.js(`!!document.querySelector('.wb-layer.wb-dim')`),'the rest of the bench waits');
    const edge=await page.rect('.cut-edge.open');
    await page.drag({x:edge.cx,y:edge.cy},{x:edge.cx,y:edge.cy+60},{steps:6,hold:80});
    assert.deepEqual(await page.js(`[...document.querySelectorAll('.cut-len')].map(e=>e.textContent)`),['1시간']);
    const b=await page.rect('.cut-block');
    await page.mouse('mouseMoved',b.x+150,b.y+60,0);await page.sleep(150);
    assert.match(await page.text('.cut-knife'),/30분 │ 30분/);
    await page.mouse('mousePressed',b.x+150,b.y+60);await page.mouse('mouseReleased',b.x+150,b.y+60,0);await page.sleep(250);
    assert.equal(await page.js('document.activeElement?.className'),'cut-name','the new piece is named next');
    await page.type('검토');await page.shot('inbox-cut');
    await page.click('.cut-foot .btn','2개로 나누기');await page.sleep(600);
    assert.equal((await bench(page))[1],'P:설계 문서 작성|검토|메일 답장|결재 처리');
    // The whole pile to tomorrow's column: in order, to the end of that day.
    const h=await page.rect('.wb-pile[data-pile="pile-errands"] .wb-handle'),col=await page.rect('.wb-day:nth-child(2) .wb-dbody');
    await page.drag({x:h.x+20,y:h.cy},{x:col.cx,y:col.y+40});
    assert.equal(await page.js('document.querySelectorAll(".wb-pile").length'),1,'the shipped pile is gone; the 투입구 stays');
    assert.match(await page.text('.wb-day:nth-child(2) .wb-dload'),/^1\.5 \/ /,'30 + 30 + 15 + 15 minutes');
  }},
  {name:'part of a 지난 미완료 is done: the done piece stays on its date, the rest waits on the shelf',run:async page=>{
    await open(page);
    await page.click('.wb-card .main','경쟁사 동향 정리');await page.sleep(400);
    assert.match(await page.text('.cut-where'),/\d+월 \d+일 미완료/);
    await page.js(`document.querySelector('.cut-name').focus()`);await page.key('Enter',{text:'\r'});await page.sleep(200);
    await page.click('.cut-check');
    await page.key('Escape');await page.sleep(600);
    assert.match(await page.text('[role=status]'),/2개로 나눴어요\. 1개는 \d+월 \d+일 완료로 남겼어요/);
    assert.equal(await page.js(`document.querySelectorAll('.wb-sec[aria-label="지난 미완료"] .wb-card').length`),1);
    assert.match(await page.text('.wb-sec[aria-label="지난 미완료"] .meta'),/30분/);
  }},
  {name:'960×640 keeps the date columns beside the bench; 760px and below stacks them under it',viewport:{width:960,height:640},run:async page=>{
    await open(page);
    const [b,d]=[await page.rect('.wb-bench'),await page.rect('.wb-dock')];
    assert.ok(d.x>=b.x+b.w,'columns to the right at the minimum window');
    assert.equal(await page.js('document.documentElement.scrollWidth<=innerWidth'),true,'no sideways page scroll');
  }},
  {name:'at 720px the date columns follow the bench in one column',viewport:{width:720,height:900},run:async page=>{
    await open(page);
    const [b,d]=[await page.rect('.wb-bench'),await page.rect('.wb-dock')];
    assert.ok(d.y>=b.y+b.h,'columns under the bench');
    assert.equal(await page.js('document.documentElement.scrollWidth<=innerWidth'),true,'no sideways page scroll');
    await page.shot('inbox-narrow');
    await page.click('button[aria-label="주간 보고 초안 삭제"]');await page.sleep(300);
    assert.equal(await label(page),'회의록 템플릿 업데이트 삭제','proto deletion works at the narrow viewport');
    assert.equal(await page.js(`!!document.querySelector('.held, .cut')`),false);
  }},
];
export default scenarios.map(s=>({...s,run:async page=>{try{await s.run(page);}catch(e){await page.shot(`FAIL-inbox-${s.name}`.replace(/[^\w가-힣-]+/g,'_')).catch(()=>{});await discard(page).catch(()=>{});throw e;}}}));
