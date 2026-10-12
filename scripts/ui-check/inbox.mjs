import assert from 'node:assert/strict';

const open=async page=>{await page.js('localStorage.removeItem("blokky.workbench.view")');await page.click('.rail-nav .nav-button','미계획');await page.sleep(250);assert.ok(await page.js('!!document.querySelector(".wb-canvas")'));};
const card=(page,title)=>page.rect('.wb-world .wb-card',title);
const titles=page=>page.js('[...document.querySelectorAll(".wb-world .ttl")].map(e=>e.textContent)');
const positions=page=>page.js('(async()=>{const [{getState},{seedBoardPositions}]=await Promise.all([import("/src/app/store/state.ts"),import("/src/bench.ts")]);const s=getState().snapshot;return Object.fromEntries(seedBoardPositions(s.tasks,s.piles??[]).filter(t=>!t.plan_date&&!t.completed).map(t=>[t.id,{x:t.board_x,y:t.board_y}]));})()');
const selected=page=>page.js('[...document.querySelectorAll(".wb-world .wb-card.sel")].map(e=>e.dataset.card)');
const focusCard=(page,title)=>page.js(`[...document.querySelectorAll('.wb-world .main')].find(e=>e.textContent.includes(${JSON.stringify(title)})).focus()`);
const label=page=>page.js('document.activeElement?.getAttribute("aria-label")');
const clickVisible=async(page,selector,text)=>{await page.js(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text?`e.textContent.includes(${JSON.stringify(text)})`:'true'});e?.scrollIntoView({block:'nearest'});})()`);return page.click(selector,text);};
const discard=async page=>{await page.js(`(()=>{const el=document.querySelector('#inbox-capture');if(!el)return;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await page.sleep(100);};

const scenarios=[
  {name:'the workbench is a substantial free canvas with readable cards and independent date loads',run:async page=>{
    await open(page);
    assert.equal(await page.js('document.querySelectorAll(".wb-pile,.wb-handle,.wb-gutter").length'),0,'no column or pile layout');
    assert.deepEqual(await titles(page),['주간 보고 초안','회의록 템플릿 업데이트','SQLite 백업 방식 조사','메일 답장','결재 처리']);
    const [a,b,canvas]=[await card(page,'회의록'),await card(page,'SQLite'),await page.rect('.wb-canvas')];
    assert.equal(a.w,300);assert.equal(a.h,96);assert.equal(b.h,a.h);assert.ok(canvas.h>=420);
    assert.equal(await page.text('.wb-card.proto .meta'),'30분 · 미정');
    assert.equal(await page.js('document.querySelectorAll(".wb-day").length'),5);
    assert.equal(await page.js('document.querySelector(".wb-past").open'),false,'past work starts compact');
    await page.shot('inbox-canvas-initial');
  }},
  {name:'free card dragging keeps exact coordinates and waits at its new location until storage settles',run:async page=>{
    await open(page);
    const before=await positions(page),source=await card(page,'주간 보고 초안'),canvas=await page.rect('.wb-canvas');
    const from={x:source.x+60,y:source.cy},to={x:canvas.x+190,y:canvas.y+350};
    await page.js(`(async()=>{const {getState,setState}=await import('/src/app/store/state.ts');window.dropPreviousIPC=window.__TAURI_INTERNALS__;window.__TAURI_INTERNALS__={invoke:async(cmd,args)=>{if(cmd==='set_dirty')return;if(cmd==='mutate')return new Promise(resolve=>{window.releaseDropStore=async()=>{const {previewMutation}=await import('/src/preview.ts');resolve(previewMutation(getState().snapshot,args.command,new Set()));};});throw Error('Unexpected mock IPC '+cmd);}};setState({native:true});})()`);
    const during=await page.drag(from,to,{before:()=>page.js('({slot:document.querySelectorAll(".wb-slot").length,lifted:document.querySelectorAll(".wb-world .lifted").length})')});
    assert.deepEqual(during,{slot:1,lifted:1},'the board previews an outline at the free landing point');
    assert.equal(await page.js('!!document.querySelector(".held")'),true);
    assert.equal(await page.js('getComputedStyle(document.querySelector("[data-card=sample-6]")).visibility'),'hidden');
    await page.shot('inbox-canvas-drop-awaiting');
    await page.js('window.releaseDropStore()');await page.sleep(350);
    await page.js(`(async()=>{const {setState}=await import('/src/app/store/state.ts');setState({native:false});if(window.dropPreviousIPC)window.__TAURI_INTERNALS__=window.dropPreviousIPC;else delete window.__TAURI_INTERNALS__;})()`);
    const after=await positions(page);
    assert.deepEqual(after['sample-6'],{x:before['sample-6'].x+Math.round(to.x-from.x),y:before['sample-6'].y+Math.round(to.y-from.y)});
    for(const [id,pos]of Object.entries(before))if(id!=='sample-6')assert.deepEqual(after[id],pos,'other cards stay put');
    assert.equal(await page.js('!!document.querySelector(".held")'),false);
    assert.equal((await selected(page))[0],'sample-6','the moved card stays above overlaps');
    await page.shot('inbox-canvas-free-position');
  }},
  {name:'lasso, modifier selection, multi-drag and merge preserve a spatial arrangement',run:async page=>{
    await open(page);
    const long='긴 작업 제목과 상세 내용을 두 줄에서 읽으면서 오늘 처리해야 할 문서의 검토와 수정 사항을 확인하기';
    await page.js(`(async()=>{const [{getState},{dispatch},{updateAction}]=await Promise.all([import('/src/app/store/state.ts'),import('/src/app/store/session.ts'),import('/src/intent.ts')]);const t=getState().snapshot.tasks.find(t=>t.id==='sample-4');await dispatch(updateAction({...t,title:${JSON.stringify(long)},body:${JSON.stringify('첫 번째 메모 줄\n두 번째 메모 줄도 함께 읽습니다.')}},null,null));})()`);
    const a=await card(page,'주간 보고 초안'),b=await card(page,long),area=await page.rect('.wb-canvas');
    await page.mouse('mouseMoved',area.x+8,area.y+8,0);await page.mouse('mousePressed',area.x+8,area.y+8);
    await page.mouse('mouseMoved',b.x+b.w+2,b.y+b.h+2,1);await page.sleep(70);
    assert.equal(await page.js('!!document.querySelector(".wb-selection-box")'),true);
    await page.mouse('mouseReleased',b.x+b.w+2,b.y+b.h+2,0);await page.sleep(100);
    assert.equal((await selected(page)).length,2);assert.equal(await page.js('!!document.querySelector(".ed-title")'),false);
    await page.click('.wb-world .main','SQLite',{modifiers:2});assert.equal((await selected(page)).length,3);
    await page.click('.wb-world .main','SQLite',{modifiers:8});assert.equal((await selected(page)).length,2);
    for(const theme of ['default','g1','g3','g4']){
      await page.js(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
      const fit=await page.js(`(()=>{const e=document.querySelector('[data-card="sample-4"]'),r=e.getBoundingClientRect();return {title:e.querySelector('.ttl').getBoundingClientRect().height,memo:e.querySelector('.wb-memo').getBoundingClientRect().height,bottom:e.querySelector('.meta').getBoundingClientRect().bottom<=r.bottom};})()`);
      assert.ok(fit.title>18&&fit.title<=38&&fit.memo<=17&&fit.bottom,'two-line title, one-line memo and duration fit');
      await page.shot('inbox-canvas-selection-'+theme);
    }
    await page.js('document.documentElement.dataset.theme="default"');
    const before=await positions(page),from={x:a.x+60,y:a.cy},to={x:area.x+160,y:area.y+330};
    const carried=await page.drag(from,to,{before:()=>page.js('({slots:document.querySelectorAll(".wb-slot").length,lifted:document.querySelectorAll(".wb-world .lifted").length,more:document.querySelector(".held-more")?.textContent})')});
    assert.deepEqual(carried,{slots:2,lifted:2,more:'+1'});
    const after=await positions(page),dx=after['sample-6'].x-before['sample-6'].x,dy=after['sample-6'].y-before['sample-6'].y;
    assert.deepEqual(after['sample-4'],{x:before['sample-4'].x+dx,y:before['sample-4'].y+dy},'selected offsets stay unchanged');
    await page.shot('inbox-canvas-multi-free-position');
    await page.click('.wb-tools .btn','전체 보기');await page.shot('inbox-canvas-multi-fit');
    await page.click('.wb-selbar .btn','하나로 합치기');await page.sleep(200);
    assert.equal(await page.js('document.querySelector(".ed-title")?.value'),'주간 보고 초안');
    assert.equal(await page.js('document.querySelector(".ed-memo")?.value.includes('+JSON.stringify(long)+')'),true);
    assert.equal((await selected(page)).length,0);assert.match(await page.text('.inbox-trash>summary'),/휴지통 2/);
    await page.shot('inbox-canvas-merged-editor');await page.click('.ed-close');
  }},
  {name:'pan and zoom change only the view; capture, search and keyboard focus reveal their cards',run:async page=>{
    await open(page);
    const before=await positions(page),area=await page.rect('.wb-canvas');
    await page.js('document.querySelectorAll(".wb-tools > .btn")[1].focus()');
    await page.key(' ',{code:'Space',text:' '});await page.sleep(80);
    assert.equal(await page.js('document.querySelectorAll(".wb-tools > .btn")[1].getAttribute("aria-pressed")'),'true','Space still activates a toolbar button');
    await page.drag({x:area.x+200,y:area.y+400},{x:area.x+80,y:area.y+260});
    assert.equal(await page.js('Number(document.querySelector(".wb-canvas").dataset.panX)'),-120);
    await page.click('button[aria-label="축소"]');assert.equal(await page.js('Number(document.querySelector(".wb-canvas").dataset.zoom)'),.8);
    assert.deepEqual(await positions(page),before);
    await page.shot('inbox-canvas-pan-zoom');
    await page.click('.wb-tools > .btn','선택');
    await page.click('#inbox-capture');await page.type('자유 작업대 새 작업');await page.key('Enter');await page.sleep(200);
    assert.equal(await page.js('document.querySelector("#inbox-capture").value'),'');
    const newCard=await card(page,'자유 작업대 새 작업'),vr=await page.rect('.wb-canvas');assert.ok(newCard.x>=vr.x&&newCard.y>=vr.y&&newCard.x+newCard.w<=vr.x+vr.w);
    const after=await positions(page);for(const[id,pos]of Object.entries(before))assert.deepEqual(after[id],pos);
    await page.click('.wb-tools > .btn','이동');await page.drag({x:area.x+200,y:area.y+400},{x:area.x+20,y:area.y+100});await page.click('.wb-tools > .btn','선택');
    await focusCard(page,'주간 보고 초안');
    const focused=await card(page,'주간 보고 초안');assert.ok(focused.x>=vr.x&&focused.y>=vr.y,'offscreen keyboard focus reveals the card');
    await page.js(`(async()=>{const {setUi}=await import('/src/app/store/state.ts');setUi({found:{id:'sample-4',kind:'bench',at:Date.now()}});})()`);await page.sleep(60);
    const found=await card(page,'회의록');assert.ok(found.x>=vr.x&&found.x+found.w<=vr.x+vr.w);
    await page.click('.wb-tools .btn','전체 보기');
    assert.deepEqual(await positions(page),after,'fit does not repack');
    await page.shot('inbox-canvas-fit');
  }},
  {name:'a selected group ships directly onto a date with the same total preview and no remaining selection',run:async page=>{
    await open(page);
    await page.click('.wb-world .main','주간 보고 초안',{modifiers:2});await page.click('.wb-world .main','회의록',{modifiers:2});
    const source=await card(page,'주간 보고 초안'),col=await page.rect('.wb-day:nth-child(2) .wb-dbody');
    const preview=await page.drag({x:source.x+60,y:source.cy},{x:col.cx,y:col.y+50},{before:()=>page.text('.wb-day:nth-child(2) .wb-dload')});
    assert.match(preview,/^1 \/ /);assert.match(await page.text('.wb-day:nth-child(2) .wb-dload'),/^1 \/ /);
    assert.equal((await selected(page)).length,0);assert.equal((await titles(page)).length,3);
    await page.shot('inbox-canvas-shipped');
  }},
  {name:'keyboard duration and spatial movement work together; delete and restore retain the saved position',run:async page=>{
    await open(page);
    await focusCard(page,'주간 보고 초안');await page.key('ArrowDown');await page.sleep(100);
    assert.equal(await label(page),'주간 보고 초안, 45분');
    const before=await positions(page);await page.key('ArrowRight',{modifiers:1});await page.sleep(100);
    const after=await positions(page);assert.deepEqual(after['sample-6'],{x:before['sample-6'].x+16,y:before['sample-6'].y});
    await page.click('button[aria-label="주간 보고 초안 삭제"]');await page.sleep(100);
    assert.equal(await page.js('!!document.querySelector(".cut,.held")'),false);
    await clickVisible(page,'.inbox-trash>summary');await clickVisible(page,'button[aria-label="주간 보고 초안 복원"]');await page.sleep(100);
    assert.deepEqual((await positions(page))['sample-6'],after['sample-6']);
    assert.equal(await page.js('!!document.querySelector(".inbox-trash")'),false);
  }},
  {name:'background click and Escape clear selection; pointer cancellation leaves the next card click usable',run:async page=>{
    await open(page);const area=await page.rect('.wb-canvas');
    await page.click('.wb-world .main','주간 보고 초안',{modifiers:2});await page.key('Escape');assert.deepEqual(await selected(page),[]);
    await page.click('.wb-world .main','주간 보고 초안',{modifiers:8});
    await page.mouse('mouseMoved',area.x+8,area.y+8,0);await page.mouse('mousePressed',area.x+8,area.y+8);await page.mouse('mouseReleased',area.x+8,area.y+8,0);assert.deepEqual(await selected(page),[]);
    await page.mouse('mousePressed',area.x+8,area.y+8);await page.mouse('mouseMoved',area.x+220,area.y+150,1);
    await page.js('document.querySelector(".wb-canvas").dispatchEvent(new PointerEvent("pointercancel",{bubbles:true,pointerId:1}))');await page.mouse('mouseReleased',area.x+220,area.y+150,0);
    await page.click('.wb-world .main','SQLite');assert.equal(await page.js('!!document.querySelector(".ed-title")'),true);assert.equal(await page.js('!!document.querySelector(".cut")'),false);
    await page.click('.ed-close');
  }},
  {name:'explicit cutting keeps the original position and places the new piece nearby',run:async page=>{
    await open(page);
    await page.click('#inbox-capture');await page.type('설계 문서 작성');await page.key('Enter');await page.sleep(150);
    const before=await positions(page),original=await page.js('document.querySelector(".wb-world .main[aria-label^=\\"설계 문서\\"]").dataset.task');
    await page.click('button[aria-label="설계 문서 작성 나누기"]');await page.sleep(150);
    const edge=await page.rect('.cut-edge.open');await page.drag({x:edge.cx,y:edge.cy},{x:edge.cx,y:edge.cy+60},{steps:6,hold:80});
    const block=await page.rect('.cut-block');await page.mouse('mouseMoved',block.x+150,block.y+60,0);await page.mouse('mousePressed',block.x+150,block.y+60);await page.mouse('mouseReleased',block.x+150,block.y+60,0);await page.sleep(100);
    await page.type('검토');await page.click('.cut-foot .btn','2개로 나누기');await page.sleep(150);
    const after=await positions(page);assert.deepEqual(after[original],before[original]);assert.equal(Object.keys(after).length,Object.keys(before).length+1);
    await page.shot('inbox-canvas-cut');
  }},
  {name:'past work and trash remain compact disclosures; permanent removal confirms only emptying',run:async page=>{
    await open(page);await clickVisible(page,'.wb-past>summary');assert.match(await page.text('.wb-past'),/경쟁사 동향 정리/);
    await page.js('document.querySelector(".wb-canvas").scrollIntoView({block:"start"});window.__asked=[];window.confirm=t=>{window.__asked.push(t);return false;}');
    await page.click('button[aria-label="메일 답장 삭제"]');await page.click('button[aria-label="결재 처리 삭제"]');await page.sleep(100);
    assert.deepEqual(await page.js('window.__asked'),[]);
    assert.equal(await page.js('document.querySelector(".inbox-trash").open'),false);
    await clickVisible(page,'.inbox-trash>summary');await clickVisible(page,'button[aria-label="메일 답장 영구 삭제"]');await page.sleep(100);
    assert.equal(await label(page),'결재 처리 영구 삭제');
    await clickVisible(page,'.inbox-trash-foot button','휴지통 비우기');await page.key('Escape');assert.equal(await label(page),null);
    await clickVisible(page,'.inbox-trash-foot button','휴지통 비우기');await clickVisible(page,'.inbox-trash-foot button','정말 비우기');await page.sleep(100);
    assert.equal(await page.js('!!document.querySelector(".inbox-trash")'),false);assert.deepEqual(await page.js('window.__asked'),[]);
  }},
  {name:'at 960px the date dock remains beside the useful canvas',viewport:{width:960,height:640},run:async page=>{
    await open(page);const b=await page.rect('.wb-bench'),d=await page.rect('.wb-dock');assert.ok(d.x>=b.x+b.w);assert.equal(await page.js('document.documentElement.scrollWidth<=innerWidth'),true);
    const before=await positions(page),separator=await page.rect('.wb-work > .panel-separator');
    await page.drag({x:separator.cx,y:separator.y+60},{x:separator.cx+55,y:separator.y+60},{hold:80});
    assert.ok((await page.rect('.wb-bench')).w>b.w,'the inbox divider resizes its pane');
    assert.deepEqual(await positions(page),before,'pane resizing never repacks world positions');
    assert.ok(await page.js('Number(localStorage.getItem("blokky.panel.inbox"))>0'),'the preferred ratio is saved');
    assert.ok((await page.rect('.wb-canvas')).h>=420);await page.shot('inbox-canvas-minimum-window');
  }},
  {name:'at 720px the date dock follows the canvas and controls stay inside the page',viewport:{width:720,height:900},run:async page=>{
    await open(page);const b=await page.rect('.wb-bench'),d=await page.rect('.wb-dock');assert.ok(d.y>=b.y+b.h);assert.equal(await page.js('document.documentElement.scrollWidth<=innerWidth'),true);
    await page.shot('inbox-canvas-narrow');
  }},
];
export default scenarios.map(s=>({...s,run:async page=>{try{await s.run(page);}catch(e){await page.shot(`FAIL-inbox-${s.name}`.replace(/[^\w가-힣-]+/g,'_')).catch(()=>{});await discard(page).catch(()=>{});throw e;}}}));
