import assert from 'node:assert/strict';
import {toFocus} from './support/nav.mjs';

// Preview data: §10 example (A 60, B 45, C 30, D 60 flow; workshop 14:00 fixed; E 90, F 120) at 10:20.
const space='.today-day .space';
// The app opens on the work screen; these scenarios run on the focus screen (the former 오늘).
const go=async(page,viewport)=>{await page.goto('/?now=10:20',viewport);await toFocus(page);};
const find=async(page,text)=>{
  await page.js(`(()=>{const el=[...document.querySelectorAll('.today-day .blk, .tray .tblk')].find(e=>e.textContent.includes(${JSON.stringify(text)}));el?.scrollIntoView({block:'nearest'});})()`);
  return page.rect('.today-day .blk, .tray .tblk',text);
};
const scenarios=[
  {name:'panel splitter captures pointer input, clamps widths, persists, resets and stacks narrowly',viewport:{width:1440,height:900},run:async page=>{
    const storage='blokky.panel.today',saved=await page.js(`localStorage.getItem('${storage}')`);
    const separator='.today-cols>.panel-separator',width=()=>page.js(`document.querySelector('.today-day').getBoundingClientRect().width`);
    try{
      await page.js(`localStorage.removeItem('${storage}')`);await go(page,{width:1440,height:900});
      const initial=await width(),blocks=await page.blocks(space);
      await page.js(`document.querySelector('${separator}').focus()`);await page.key('ArrowRight');
      assert.ok(await width()>initial+14,'keyboard resizing changes the panel by a visible step');
      assert.equal(await page.js(`document.activeElement.getAttribute('role')`),'separator');
      await page.js(`document.querySelector('${separator}').addEventListener('pointerdown',e=>e.currentTarget.dataset.testPointer=e.pointerId,{once:true})`);
      const grip=await page.rect(separator),row=await page.rect('.today-cols');
      await page.drag({x:grip.cx,y:grip.cy},{x:row.x-80,y:grip.cy},{hold:0,before:async()=>{
        assert.equal(await page.js(`(()=>{const el=document.querySelector('${separator}');return el.hasPointerCapture(Number(el.dataset.testPointer));})()`),true,'capture retains the drag outside the separator');
        assert.equal(await page.js(`!!document.querySelector('.held')`),false,'panel input never lifts a task');
      }});
      assert.ok(Math.abs(await width()-280)<=1,'the first panel clamps at 280px');
      assert.ok((await page.rect('.today-flow')).w>=280,'the other panel keeps its minimum');
      assert.deepEqual(await page.blocks(space),blocks,'resizing preserves timetable contents');
      assert.equal(await page.js(`document.querySelector('.today-cols').hasAttribute('data-panel-dragging')`),false,'release removes the resizing state');
      const stored=await page.js(`localStorage.getItem('${storage}')`);
      await go(page,{width:1440,height:900});
      assert.ok(Math.abs(await width()-280)<=1,'a reload restores the device preference');
      await go(page,{width:720,height:900});
      assert.equal(await page.js(`getComputedStyle(document.querySelector('${separator}')).display`),'none');
      const day=await page.rect('.today-day'),flow=await page.rect('.today-flow');
      assert.ok(flow.y>=day.y+day.h,'the narrow view stacks the content');
      assert.equal(await page.js(`localStorage.getItem('${storage}')`),stored,'stacking does not overwrite the desktop ratio');
      await go(page,{width:1440,height:900});
      await page.js(`document.querySelector('${separator}').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
      assert.ok(Math.abs(await width()-initial)<=1,'double click restores the default width');
      assert.equal(await page.js(`localStorage.getItem('${storage}')`),null);
      await page.js(`localStorage.setItem('${storage}','invalid')`);await go(page,{width:1440,height:900});
      assert.ok(Math.abs(await width()-initial)<=1,'invalid saved values fall back to the default');
      await page.shot('today-panel-splitter');
    }finally{await page.js(`(()=>{const stored=${JSON.stringify(saved)};if(stored===null)localStorage.removeItem('${storage}');else localStorage.setItem('${storage}',stored);})()`);}
  }},
  {name:'many completed blocks keep a bounded intake and the last edit and undo accessible',viewport:{width:1440,height:900},run:async page=>{
    const sizes=[];
    for(const viewport of [{width:1440,height:900},{width:960,height:640},{width:760,height:640},{width:720,height:900}]){
      await go(page,viewport);
      await page.js(`(async()=>{const {getState,setState}=await __mod('/src/app/store/state.ts');const s=getState(),done=Array.from({length:40},(_,i)=>({id:'completed-'+i,title:'완료 '+(i+1)+' · '+('긴 제목 검토 내용 ').repeat(i%3===0?12:2),body:'완료 메모 '+(i+1),starts_at:null,duration:15,completed:true,revision:1,plan_date:s.today,flow_order:100+i}));setState({snapshot:{...s.snapshot,tasks:[...s.snapshot.tasks,...done]}});})()`);
      await page.sleep(450);
      const size=await page.js(`(()=>{const day=document.querySelector('.today-day'),bin=day.querySelector('.bin'),wrap=day.querySelector('.space-wrap'),r=day.getBoundingClientRect();return {day:day.clientHeight,bottom:r.bottom,bin:bin.clientHeight,binScroll:bin.scrollHeight,timetable:wrap.clientHeight,width:document.documentElement.scrollWidth,viewport:innerWidth};})()`);
      sizes.push(size);
      await page.shot('today-many-completed-'+viewport.width);
      assert.equal(await page.js(`document.querySelectorAll('.today-day .chip').length`),40);
      assert.ok(size.binScroll>size.bin,'completed items scroll inside their own intake');
      assert.ok(size.width<=size.viewport,'long titles keep the document within the viewport');
      if(viewport.width>760)assert.ok(size.bottom<=viewport.height,'the completed list never expands the dashboard row');
      const last='.today-day [data-task="completed-39"]';
      const timelineScroll=await page.js(`document.querySelector('.today-day .space-wrap').scrollTop`);
      await page.js(`document.querySelector('${last}').focus()`);
      const title=await page.rect(last),bin=await page.rect('.today-day .bin');
      assert.ok(title.y>=bin.y&&title.y+title.h<=bin.y+bin.h,'keyboard focus reveals the last completed title');
      assert.equal(await page.js(`document.querySelector('.today-day .space-wrap').scrollTop`),timelineScroll,'completed focus does not scroll the timetable');
      await page.key('Enter',{text:'\r'});await page.sleep(180);
      assert.equal(await page.js(`document.querySelector('.ed-title')?.value.startsWith('완료 40')`),true,'last completed task opens for editing');
      await page.key('Escape');await page.sleep(120);
      await page.js(`document.querySelector('${last}').focus()`);
      await page.key('Tab');
      assert.match(await page.js(`document.activeElement?.getAttribute('aria-label')`),/^완료 40.*완료 취소$/);
      await page.key('Enter',{text:'\r'});await page.sleep(350);
      assert.ok(await page.js(`!!document.querySelector('.queue [data-task="completed-39"]')`),'keyboard undo restores the last item to the remaining queue');
    }
    for(const size of sizes){
      assert.ok(size.bin<=110,'completed intake stays compact: '+JSON.stringify(size));
      assert.ok(size.timetable>=size.day-122,'the timetable retains the rest of its panel');
    }
  }},
  {name:'initial layout follows the stored order in two independently scrolling columns',viewport:{width:1440,height:900},run:async page=>{
    assert.deepEqual(await page.blocks(space),['설계 문서 자료 조사, 예상 09:00–10:00','설계 문서 초안 작성, 예상 10:00–10:45','회의록 정리, 예상 10:45–11:15','분리망 배포 의존성 검토, 예상 13:00–14:00','설계 워크숍, 시각 고정 14:00–15:00','신규 입사자 교육 자료, 예상 15:00–16:30','경쟁사 자료 조사, 예상 18:00–20:00']);
    assert.match(await page.text('.today-day .blk.over'),/경쟁사 자료 조사/,'work that no longer fits runs past the end of work instead of leaving the timetable');
    const day=await page.rect('.today-day'),flow=await page.rect('.today-flow');
    assert.ok(flow.x>day.x+day.w,'the execution flow sits beside the timetable');
    assert.ok(Math.abs(flow.y-day.y)<=1&&Math.abs(flow.h-day.h)<=1,'both columns share the available viewport height');
    assert.ok(day.y+day.h<=900&&flow.y+flow.h<=900,'the complete day is bounded by the viewport');
    assert.equal(await page.js(`getComputedStyle(document.querySelector('.today-cols')).gridTemplateColumns.split(' ').length`),3,'two panels share one separator track');
    assert.deepEqual(await page.js(`[...document.querySelectorAll('.today-flow .card')].map(e=>e.getAttribute('aria-label'))`),['다음 블록','남은 블록','준비'],'DOM order follows the execution flow');
    assert.ok(await page.js(`document.querySelector('.today-day .space-wrap').scrollHeight>document.querySelector('.today-day .space-wrap').clientHeight`),'the day retains its complete scrollable axis');
    assert.ok(await page.js(`document.documentElement.scrollHeight<=innerHeight`),'the dashboard itself does not scroll');
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
    const block=await find(page,'경쟁사 자료 조사'),bar=await page.rect('.today-bar'),day=await page.rect('.today-day');
    const unchanged=await page.blocks(space);
    await page.drag({x:block.x+60,y:block.y+10},{x:day.x+170,y:bar.cy},{before:async()=>{
      assert.equal(await page.js(`document.querySelectorAll('${space} .hollow').length`),1,'the source stays hollow');
      assert.equal(await page.js(`document.querySelectorAll('${space} .latched, ${space}.latched').length`),0,'a clipped rail does not accept the pointer above its scroller');
      assert.equal(await page.js(`document.querySelector('.held .meta').textContent`),'2시간','the hidden timeline is not a drop destination');
    }});
    assert.deepEqual(await page.blocks(space),unchanged,'dropping over the toolbar preserves the stored order');
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
    const flow=await page.rect('.today-flow'),side=await page.rect('.today-side');
    assert.ok(Math.abs(flow.y-side.y)<=1,'an empty main group leaves the capture at the start of the execution flow');
    const capture=await page.rect('#tray-capture');
    assert.ok(capture.y>=0&&capture.y+capture.h<=1000,'the last completion reveals the capture input');
  }},
  {name:'a 준비 block held over the body opens a gap and drops into that order',run:async page=>{
    const tray=await find(page,'회의록 템플릿'),c=await find(page,'회의록 정리');
    const during=await page.drag({x:tray.x+30,y:tray.y+10},{x:c.x+200,y:c.y+6},{before:async()=>{await page.shot('today-held-body');return {hollow:await page.js('document.querySelectorAll(".today-day .blk.hollow").length'),held:await page.js('!!document.querySelector(".held")')};}});
    assert.deepEqual(during,{hollow:1,held:true});
    const order=(await page.blocks(space)).map(b=>b.split(',')[0]);
    assert.equal(order.indexOf('회의록 템플릿 업데이트'),order.indexOf('회의록 정리')-1);
  }},
  {name:'held on the rail it snaps to a slot and permits explicit lunch placement',run:async page=>{
    const work=await find(page,'설계 워크숍');
    const c=await find(page,'회의록 정리'),rail=await page.rect(space+' .rail'),lunch=await page.rect(space+' .brk');
    await page.drag({x:c.x+80,y:c.y+6},{x:rail.cx,y:work.y+work.h+40},{before:()=>page.shot('today-held-rail')});
    assert.ok((await page.blocks(space)).includes('회의록 정리, 시각 고정 15:30–16:00'),'fixed at 15:30');
    const d=await find(page,'분리망 배포');
    await page.drag({x:d.x+80,y:d.y+6},{x:rail.cx,y:lunch.y+10},{before:async()=>{await page.shot('today-held-lunch');assert.equal(await page.js(`document.querySelector('.held .off-part')?.style.height`),'100%');}});
    assert.ok((await page.blocks(space)).includes('분리망 배포 의존성 검토, 시각 고정 12:00–13:00'));
    const fixed=await find(page,'회의록 정리'),scroller=await page.rect('.today-day .space-wrap'),left=await page.rect(space+' .rail');
    const shown=await page.drag({x:fixed.x+60,y:fixed.y+6},{x:left.cx,y:scroller.y+scroller.h/2},{before:async()=>{
      const before=await page.text('.held .meta');
      await page.js(`document.querySelector('.today-day .space-wrap').scrollTop+=36`);
      await page.js(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
      assert.notEqual(await page.text('.held .meta'),before,'scrolling under a stationary held block updates its rail time');
      return await page.text('.held .meta');
    }});
    assert.ok((await page.blocks(space)).includes('회의록 정리, 시각 고정 '+shown),'release commits the time shown after scrolling');
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
  {name:'at 960px the execution flow scrolls independently and reveals capture',viewport:{width:960,height:640},run:async page=>{
    const main=await page.rect('.today-main'),side=await page.rect('.today-side'),day=await page.rect('.today-day'),flow=await page.rect('.today-flow');
    assert.ok(Math.abs(side.y-main.y-main.h-16)<=2,'the side starts directly below the main cards');
    assert.ok(side.x===main.x&&side.w===main.w,'Next, Queue, and Inbox use one right column');
    assert.ok(day.y+day.h<=640&&Math.abs(flow.h-day.h)<=1,'the minimum native height bounds both scroll flows');
    assert.ok(await page.js(`document.documentElement.scrollWidth<=innerWidth`),'the page fits the viewport');
    await page.js(`document.querySelector('.today-side #tray-capture').focus()`);
    const capture=await page.rect('.today-side #tray-capture');
    assert.equal(await page.js(`document.activeElement?.id`),'tray-capture');
    assert.ok(capture.y>=0&&capture.y+capture.h<=640,'focusing capture scrolls it into view');
    assert.ok(await page.js(`document.querySelector('.today-flow').scrollTop>0`),'capture scrolls the execution flow');
    assert.equal(await page.js(`document.querySelector('.today-day .space-wrap').scrollTop`),0,'the timeline keeps its own scroll position');
    await page.type('긴 제목 '.repeat(45));await page.key('Enter',{text:'\r'});await page.sleep(200);
    assert.ok(await page.js(`document.documentElement.scrollWidth<=innerWidth`),'long capture content remains within the viewport');
    await page.shot('today-960');
    await find(page,'신규 입사자 교육');
    await page.js(`document.querySelector('${space} [data-task="sample-e"]').focus()`);
    await page.key('ArrowDown',{modifiers:1});await page.sleep(300);
    assert.match(await page.js(`document.activeElement?.getAttribute('aria-label')`),/신규 입사자 교육 자료, 예상 18:00–19:30/,'Alt+Down keeps focus on the reordered block');
    const focused=await page.rect(space+' [data-task="sample-e"]'),scrollport=await page.rect('.today-day .space-wrap');
    assert.ok(focused.y>=scrollport.y&&focused.y+focused.h<=scrollport.y+scrollport.h,'the focused block stays visible after its reorder motion');
    await go(page,{width:760,height:640});
    const narrowDay=await page.rect('.today-day'),narrowFlow=await page.rect('.today-flow');
    assert.ok(narrowFlow.y>=narrowDay.y+narrowDay.h,'the fallback keeps the same DOM order in one column');
    await page.js(`document.querySelector('.ed-next-open').focus()`);await page.key('Enter',{text:'\r'});await page.sleep(200);
    assert.equal(await page.js(`document.querySelector('dialog.ed-dialog')?.open`),true,'Next detail uses the dialog in the one-column fallback');
    await page.key('Escape');
  }},
];
export default scenarios.map(s=>({...s,run:async page=>{await toFocus(page);await s.run(page);}}));
