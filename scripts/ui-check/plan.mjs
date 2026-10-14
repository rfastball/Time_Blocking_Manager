import assert from 'node:assert/strict';
import {dockState,setDock,toFocus,toPlan} from './support/nav.mjs';

// Preview data puts every block on today. Each scenario starts fresh; "other" is a neighbouring day of the same week.
// toPlan opens the work screen with the 준비 dock narrow, as 계획 opened with its drawer.
const sp=date=>`.wk-col[data-date="${date}"] .space`;
const titles=async(page,scope)=>(await page.blocks(scope)).map(b=>b.split(',')[0]);
async function days(page){
  const dates=await page.js(`[...document.querySelectorAll('.wk-col')].map(c=>c.dataset.date)`),today=await page.js(`document.querySelector('.wk-head.today')?.dataset.date`);
  const i=dates.indexOf(today);return {dates,today,other:dates[i===0?1:i-1]};
}
const hourY=async(page,h,scope='.wk-hours')=>(await page.rect(scope+' span',String(h).padStart(2,'0'))).cy;
const block=(page,date,text)=>page.rect(`${sp(date)} .blk`,text);
const readable=page=>page.js(`(()=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
  const rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v);};
  const blend=(top,bottom)=>top.slice(0,3).map((v,i)=>v*top[3]+bottom[i]*(1-top[3]));
  const lum=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  const selectors='.wk-day small,.wk-day strong,.wk-alloc>span,.cal-date strong,.cal-sum>span,.cal-more,.mini button,.mini small,.cal .tag-chip';
  return [...document.querySelectorAll(selectors)].filter(el=>el.textContent.trim()).map(el=>{
    let opacity=1;const backgrounds=[];
    for(let node=el;node;node=node.parentElement){const css=getComputedStyle(node);opacity*=Number(css.opacity);backgrounds.push(rgba(css.backgroundColor));}
    const bg=backgrounds.reverse().reduce((base,color)=>blend(color,base),[255,255,255]);
    const fg=rgba(getComputedStyle(el).color);fg[3]*=opacity;
    const a=lum(blend(fg,bg)),b=lum(bg);
    return {text:el.textContent.trim(),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  });
})()`);
async function assertReadable(page,theme){
  const results=await readable(page);assert.ok(results.length,'date content is present');
  for(const result of results)assert.ok(result.ratio>=4.5,`${theme}: ${result.text} contrast ${result.ratio.toFixed(2)}`);
}
async function press(page,x,y,moves=[]){
  await page.mouse('mouseMoved',x,y,0);await page.mouse('mousePressed',x,y);
  for(const m of moves){await page.mouse('mouseMoved',m.x,m.y);await page.sleep(16);}
  const end=moves.at(-1)??{x,y};await page.mouse('mouseReleased',end.x,end.y,0);await page.sleep(250);
}

export default [
  // The drawer's remembered splitter became the dock's three widths (docs/one-screen-plan.md, 일부러 바꾸는 것); the calendar splitters stay.
  {name:'each plan view keeps its calendar panel preference while the dock keeps its three widths beside it',run:async page=>{
    const keys=['two','month'].map(p=>'blokky.panel.plan-'+p+'-calendar');
    const saved=await page.js(`Object.fromEntries(${JSON.stringify(keys)}.map(k=>[k,localStorage.getItem(k)]))`);
    try{
      await page.js(`${JSON.stringify(keys)}.forEach(k=>localStorage.removeItem(k))`);
      await toPlan(page);
      const widths={};
      for(const [index,label] of ['일','주','2주','월'].entries()){
        await page.click('.segmented [role=radio]',label);
        assert.equal(await page.text('.segmented [aria-checked=true]'),label,'the intended view is active before resizing');
        assert.equal(await page.js(`document.querySelector('.plan-desk>.panel-separator')`),null,'no drawer splitter in '+label+': the dock sets its own width');
        const main=await page.rect('.plan-main'),dock=await page.rect('#dock');
        assert.ok(dock.x+dock.w<=main.x,'the dock sits left of the calendar in '+label);
        widths[label]=main.w;assert.ok(main.w>=280&&dock.w>=280,'both outer panels retain their minimum in '+label);
        if(index>=2){
          await page.js(`document.querySelector('.cal-layout>.panel-separator').focus({preventScroll:true})`);
          for(let i=1;i<index;i++)await page.key('ArrowLeft');
          widths[label+' calendar']=(await page.rect('.cal')).w;
          assert.ok((await page.rect('.cal')).w>=280&&(await page.rect('.plan-day')).w>=280,'the calendar and chosen date retain their minimum');
        }
      }
      assert.equal(await page.js(`${JSON.stringify(keys)}.every(k=>Number(localStorage.getItem(k))>0)`),true,'each view writes its own preference');
      await page.click('.segmented [role=radio]','2주');
      assert.ok(Math.abs((await page.rect('.cal')).w-widths['2주 calendar'])<=1,'returning to 2주 restores its calendar width');
      await page.click('.segmented [role=radio]','주');
      assert.ok(Math.abs((await page.rect('.plan-main')).w-widths['주'])<=1,'returning to the week keeps its width');
      await setDock(page,'hidden');
      assert.equal(await page.js(`!!document.querySelector('#dock .dock-tools')`),false,'a folded dock keeps only its unfold button');
      assert.ok((await page.rect('.plan-main')).w>widths['주']+200,'folding gives the calendar the room');
      await setDock(page,'narrow');
      assert.ok(Math.abs((await page.rect('.plan-main')).w-widths['주'])<=1,'unfolding returns to the same narrow width');
    }finally{await page.js(`(()=>{const saved=${JSON.stringify(saved)};for(const [key,value] of Object.entries(saved)){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}})()`);}
  }},
  {name:'latching a reshaped block keeps its left edge on the rail in every frame',run:async page=>{
    await toPlan(page);await page.click('.segmented [role=radio]','일');await page.sleep(400);
    const source=await page.rect('#dock .tblk','SQLite'),space=await page.rect('.dv-day .space');
    const y=(await page.rect('.dv-day .ruler span','16')).cy+8,x=space.x+space.w*.7;
    await page.mouse('mouseMoved',source.cx,source.cy,0);await page.mouse('mousePressed',source.cx,source.cy);
    await page.mouse('mouseMoved',source.cx+8,source.cy);await page.sleep(50);
    await page.mouse('mouseMoved',x,y);await page.sleep(450);
    assert.ok((await page.rect('.held')).w>source.w,'the day widens the lifted card before latching');
    await page.js(`window.railFrames=[];window.trackRail=true;requestAnimationFrame(function sample(){const h=document.querySelector('.held.fixed');if(h)window.railFrames.push(h.getBoundingClientRect().left);if(window.trackRail)requestAnimationFrame(sample);})`);
    const rail=await page.rect('.dv-day .rail');
    await page.mouse('mouseMoved',rail.cx,y);await page.sleep(300);
    const frames=await page.js(`window.trackRail=false;window.railFrames`);
    assert.ok(frames.length>=3,'sample the latch transition, not just its final position');
    assert.ok(Math.min(...frames)>=space.x+55,'the held block never protrudes left of its fixed position: '+JSON.stringify(frames));
    await page.mouse('mouseReleased',rail.cx,y,0);await page.sleep(700);
    assert.match((await page.blocks('.dv-day .space')).find(b=>b.startsWith('SQLite')),/시각 고정/);
  }},
  {name:'working lips yield to deliberate rail drags and only unavailable slices are hatched',run:async page=>{
    await toPlan(page);
    const {today}=await days(page),scope=sp(today),workshop=await block(page,today,'설계 워크숍');
    const y11=await hourY(page,11),y12=await hourY(page,12),minute=(y12-y11)/60;
    const x=workshop.x+60,grab=22;
    await page.drag({x,y:workshop.y+grab},{x,y:y11+grab});
    const moved=await block(page,today,'설계 워크숍');
    await page.mouse('mouseMoved',x,moved.y+grab,0);await page.mouse('mousePressed',x,moved.y+grab);
    await page.mouse('mouseMoved',x,moved.y+grab+8);
    await page.js(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    await page.mouse('mouseMoved',x,y11+grab+15*minute);await page.sleep(100);
    const heldTime=await page.text('.held .meta');
    assert.match(heldTime??'',/11:00–12:00/,`a light push rests against lunch: ${heldTime}`);
    assert.equal(await page.text('.held-why.boundary'),'근무시간 경계');
    await page.mouse('mouseMoved',x,y11+grab+30*minute);await page.sleep(250);
    assert.match(await page.text('.held .meta'),/11:30–12:30/,'an extra push clears the boundary');
    const mask=await page.js(`(()=>{const p=document.querySelector('.held .off-part');return {top:p?.style.top,height:p?.style.height};})()`);
    assert.deepEqual(mask,{top:'50%',height:'50%'});
    await page.shot('plan-partial-lunch-held');
    await page.mouse('mouseReleased',x,y11+grab+30*minute,0);await page.sleep(600);
    const label=await page.js(`[...document.querySelectorAll('${scope} .main')].find(e=>e.textContent.includes('설계 워크숍')).getAttribute('aria-label')`);
    assert.match(label,/시각 고정 11:30–12:30.*근무 외 30분/);
    for(const theme of ['default','g1','g3','g4']){
      await page.js(`document.documentElement.dataset.theme='${theme}'`);
      assert.ok(await page.js(`(()=>{const s=document.querySelector('${scope}');return getComputedStyle(s.querySelector('.off')).backgroundImage!==getComputedStyle(s.querySelector('.brk')).backgroundImage;})()`),'break and off-hours retain different textures');
      await page.shot('plan-partial-'+theme);
    }
  }},
  {name:'week shows seven day spaces on one shared axis with date heads',run:async page=>{
    await toPlan(page);
    assert.equal(await page.js(`document.querySelectorAll('.wk .dayspace').length`),7);
    const boxes=await page.js(`[...document.querySelectorAll('.wk .space')].map(s=>Math.round(s.getBoundingClientRect().top)+':'+s.offsetHeight)`);
    assert.equal(new Set(boxes).size,1,'every column starts at the same top with the same height');
    const {today}=await days(page),first=await block(page,today,'설계 문서 자료 조사');
    assert.ok(Math.abs(first.y-1-await hourY(page,9))<=2,'the shared ruler lines up with the blocks');
    assert.ok(await page.js(`(()=>{const s=document.querySelector('${sp(today)}'),after=[...s.querySelectorAll('.off')].at(-1),last=[...s.querySelectorAll('.blk .main')].at(-1);
      return after.getAttribute('aria-label').includes('이후')&&!!(last.compareDocumentPosition(after)&Node.DOCUMENT_POSITION_FOLLOWING);})()`),'the keyboard reaches the evening after the day’s blocks');
    assert.match(await page.text('.wk-head.today'),/오늘.*[\d.]+ \/ [\d.]+h/);
    assert.match(await page.text('.plan-bar .week-summary'),/선택한 주 근무 .+ \/ .+ · \d \/ \d일/);
    // The drawer and its toggle became the narrow dock beside the week.
    assert.equal(await dockState(page),'narrow');
    assert.ok(await page.js(`!!document.querySelector('#dock .tray #tray-capture')`),'the narrow dock is the 준비 list');
    await page.shot('plan-week');
    await page.js(`document.querySelector('#dock button[aria-label="준비 접기"]').focus()`);await page.key('Enter',{text:'\r'});await page.sleep(300);
    assert.equal(await dockState(page),'hidden');
    const focused=await page.js(`(()=>{const a=document.activeElement;return a?.classList.contains('dock-unfold')?'dock-unfold':a?.tagName+(a?.className?'.'+a.className:'');})()`);
    assert.equal(focused,'dock-unfold','folding the dock returns focus to its unfold button, as the drawer close returned it to its toggle');
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
  {name:'a block swept across the week keeps its shape; it takes a column\'s shape only where it comes to rest',run:async page=>{
    await toPlan(page);
    const c=await page.rect('#dock .tblk'),{dates}=await days(page),last=await page.rect(sp(dates[6])),mid=await page.rect(sp(dates[3]));
    const held=()=>page.js(`(()=>{const h=document.querySelector('.held');return h?{w:Math.round(h.getBoundingClientRect().width),column:h.classList.contains('column')}:null})()`);
    await page.mouse('mouseMoved',c.x+40,c.y+8,0);await page.mouse('mousePressed',c.x+40,c.y+8);await page.mouse('mouseMoved',c.x+50,c.y+8);await page.sleep(40);
    const lifted=await held(),y=mid.y+400,seen=[];
    for(let x=c.x+50;x<=last.cx;x+=30){await page.mouse('mouseMoved',x,y);await page.sleep(16);seen.push(await held());}
    assert.ok(seen.every(h=>h&&h.w===lifted.w&&!h.column),'crossing the columns at speed leaves the lifted shape as it was');
    await page.sleep(400);
    const rested=await held();
    assert.equal(rested.column,true,'resting on a column takes its shape');
    assert.ok(rested.w<lifted.w);
    await page.mouse('mouseMoved',c.x+50,c.y+40);await page.sleep(40);
    assert.deepEqual(await held(),rested,'leaving at once keeps the column shape while passing');
    await page.mouse('mouseReleased',c.x+50,c.y+40,0);await page.sleep(700);
  }},
  {name:'a fast date round trip keeps the block draggable after release and cancellation',run:async page=>{
    await setDock(page,'hidden');
    const {today,other}=await days(page),source=await page.rect(sp(today)),target=await page.rect(sp(other));
    const selector=`${sp(today)} [data-task="sample-a"]`,copies='[data-task="sample-a"]';
    for(const cancel of [false,true]){
      const b=await page.rect(selector),x=b.cx,y=b.cy,away=x+target.x-source.x;
      await page.mouse('mouseMoved',x,y,0);await page.mouse('mousePressed',x,y);
      await page.mouse('mouseMoved',x+7,y);await page.sleep(30);
      assert.ok(await page.rect('.blk.held'),'the next drag starts without changing tabs');
      await page.mouse('mouseMoved',away,y);await page.sleep(40);
      // Both copies must still exist: returning after the source exit cannot reproduce the bug.
      assert.equal(await page.js(`document.querySelectorAll('.wk-col ${copies}').length`),2,'return while the source is exiting');
      await page.mouse('mouseMoved',x,y);await page.sleep(250);
      if(cancel)await page.key('Escape');
      await page.mouse('mouseReleased',x,y,0);await page.sleep(700);
      assert.ok(await page.rect(selector),'the block stays on its original date');
      assert.equal(await page.js(`document.querySelectorAll('.wk-col ${copies}').length`),1,'the other copy has finished exiting');
    }
    const b=await page.rect(selector);
    await page.drag({x:b.cx,y:b.cy},{x:b.cx+target.x-source.x,y:b.cy},{before:async()=>{
      assert.ok(await page.rect('.blk.held'),'dragging still starts after cancellation');
    }});
    assert.ok(await page.rect(`${sp(other)} ${copies}`),'the same block can be moved to another day');
    assert.equal(await page.rect(selector),null,'the saved move leaves no source copy');
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
  {name:'held over a body follows the pointer through a reversal while its hollow shows the eventual slot',run:async page=>{
    await toPlan(page);
    const {today}=await days(page),y16=await hourY(page,16),c=await block(page,today,'회의록 정리');
    assert.ok(await page.js(`(()=>{const s=document.querySelector('${sp(today)}'),shoe=s.querySelector('.blk.flow .runner .shoe').getBoundingClientRect(),rail=s.querySelector('.rail').getBoundingClientRect();return Math.abs((shoe.left+shoe.right)/2-(rail.left+rail.right)/2)<=1.5;})()`),'flow blocks ride the rail groove on a runner');
    const from={x:c.x+40,y:c.y+6},moves=[{x:c.x+40,y:y16+6},{x:c.x+48,y:y16-36},{x:c.x+40,y:y16+6}];
    await page.mouse('mouseMoved',from.x,from.y,0);await page.mouse('mousePressed',from.x,from.y);
    await page.mouse('mouseMoved',from.x,from.y+6);
    assert.ok(await page.js(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(!!document.querySelector('.held')))))`),'the held copy is ready before measuring motion');
    for(const move of moves){
      await page.mouse('mouseMoved',move.x,move.y);
      const held=await page.js(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const r=document.querySelector('.held')?.getBoundingClientRect();resolve({left:r?.left,top:r?.top});})))`);
      assert.ok(Math.abs(held.top-(move.y-6))<=3,`the held copy follows the pointer vertically within two frames (${held.top}px for ${move.y}px)`);
      assert.ok(Math.abs(held.left-(c.x+move.x-from.x))<=3,`the held copy follows the pointer horizontally within two frames (${held.left}px for ${move.x}px)`);
    }
    const during=await page.js(`(()=>{
      const hollow=document.querySelector('${sp(today)} .blk.hollow'),held=document.querySelector('.held');
      return {fixed:held.classList.contains('fixed'),range:hollow.querySelector('.main').getAttribute('aria-label').match(/\\d\\d:\\d\\d–\\d\\d:\\d\\d/)[0],held:held.textContent};})()`);
    await page.shot('plan-held-slot');
    assert.ok(during.held.includes(during.range),'the held copy shows the hollow’s eventual time');
    assert.equal(during.fixed,false,'the body only orders');
    await page.mouse('mouseReleased',moves.at(-1).x,moves.at(-1).y,0);await page.sleep(700);
    assert.ok((await page.blocks(sp(today))).includes(`회의록 정리, 예상 ${during.range}`),'drop keeps the intended hollow position');
  }},
  {name:'pushed into the rail a block latches to that time; a fixed block slides along and lets go when pulled away',run:async page=>{
    await toPlan(page);
    const {today}=await days(page),y16=await hourY(page,16),y17=await hourY(page,17),c=await block(page,today,'회의록 정리');
    // A nudge toward the rail only gives; the block keeps its order.
    await page.drag({x:c.x+40,y:c.y+6},{x:c.x+32,y:y16+6});
    assert.match((await page.blocks(sp(today))).find(b=>b.startsWith('회의록 정리')),/예상/,'an 8px push does not latch');
    // Drifting 16px sideways while travelling down to 16:00 is reordering, not latching.
    const n=await block(page,today,'회의록 정리');
    await page.drag({x:n.x+40,y:n.y+6},{x:n.x+24,y:y16+6});
    assert.match((await page.blocks(sp(today))).find(b=>b.startsWith('회의록 정리')),/예상/,'drift during vertical travel does not latch');
    // Arrive, pause, then push sideways: that bites. The pointer stays over the body.
    const m=await block(page,today,'회의록 정리'),from={x:m.x+40,y:m.y+6};
    await page.mouse('mouseMoved',from.x,from.y,0);await page.mouse('mousePressed',from.x,from.y);
    for(let i=1;i<=14;i++){await page.mouse('mouseMoved',from.x,from.y+(y16+6-from.y)*i/14);await page.sleep(16);}
    await page.sleep(250);
    for(let i=1;i<=6;i++){await page.mouse('mouseMoved',from.x-16*i/6,y16+6);await page.sleep(16);}
    await page.sleep(250);await page.shot('plan-held-bite');
    await page.mouse('mouseReleased',from.x-16,y16+6,0);await page.sleep(700);
    assert.ok((await page.blocks(sp(today))).includes('회의록 정리, 시각 고정 16:00–16:30'),'latched at 16:00');
    const f=await block(page,today,'회의록 정리');
    await page.drag({x:f.x+40,y:f.y+6},{x:f.x+40,y:y17+6});
    assert.ok((await page.blocks(sp(today))).includes('회의록 정리, 시각 고정 17:00–17:30'),'still latched, now at 17:00');
    const g=await block(page,today,'회의록 정리');
    await page.drag({x:g.x+40,y:g.y+6},{x:g.x+72,y:g.y+6});
    assert.match((await page.blocks(sp(today))).find(b=>b.startsWith('회의록 정리')),/예상/,'pulled clear, it joins the order again');
  }},
  {name:'a fixed block passing over the order moves nothing until it rests; work it pushes past working time is counted',run:async page=>{
    await toPlan(page);
    const {today}=await days(page),y16=await hourY(page,16),w=await block(page,today,'설계 워크숍');
    const range=async title=>(await page.blocks(sp(today))).find(b=>b.startsWith(title));
    // Sliding the workshop from 14:00 to 16:00 crosses 신규 입사자 교육 자료's ticks without a pause.
    const from={x:w.x+40,y:w.y+6};
    await page.mouse('mouseMoved',from.x,from.y,0);await page.mouse('mousePressed',from.x,from.y);
    for(let i=1;i<=14;i++){await page.mouse('mouseMoved',from.x,from.y+(y16+6-from.y)*i/14);await page.sleep(16);}
    assert.equal(await range('신규 입사자 교육 자료'),'신규 입사자 교육 자료, 예상 15:00–16:30','neighbours hold still while the block is moving');
    await page.sleep(300);
    assert.equal(await range('신규 입사자 교육 자료'),'신규 입사자 교육 자료, 예상 14:00–15:30','resting at 16:00, they make way');
    await page.mouse('mouseReleased',from.x,y16+6,0);await page.sleep(700);
    assert.ok((await page.blocks(sp(today))).includes('설계 워크숍, 시각 고정 16:00–17:00'));
    // With the workshop at 16:00, latching 회의록 정리 at 14:15 leaves 신규 입사자 교육 자료 no 90-minute gap before 18:00.
    const c=await block(page,today,'회의록 정리'),rail=await page.rect(`${sp(today)} .rail`),y14=await hourY(page,14),y1415=y14+(y16-y14)/8;
    const during=await page.drag({x:c.x+40,y:c.y+6},{x:rail.cx,y:y1415+6},{hold:400,before:async()=>{await page.shot('plan-held-pushed');
      return page.js(`({held:document.querySelector('.held').textContent,pushed:[...document.querySelectorAll('${sp(today)} .blk.over.pushed')].map(b=>b.textContent)})`);}});
    assert.match(during.held,/근무 외 1개/,'the held copy counts the work it would push past working time');
    assert.equal(during.pushed.length,1);assert.match(during.pushed[0],/신규 입사자 교육 자료/);
    assert.ok((await page.blocks(sp(today))).includes('신규 입사자 교육 자료, 예상 18:00–19:30'),'the drop is still allowed');
  }},
  {name:'the rail of a column fixes the time it is dropped at',run:async page=>{
    await toPlan(page);
    const {today,other}=await days(page),rail=await page.rect(`${sp(other)} .rail`),y16=await hourY(page,16);
    const c=await block(page,today,'회의록 정리');
    await page.drag({x:c.x+40,y:c.y+6},{x:rail.cx,y:y16+6},{before:()=>page.shot('plan-held-rail')});
    assert.deepEqual(await page.blocks(sp(other)),['회의록 정리, 시각 고정 16:00–16:30']);
  }},
  {name:'beside the wide dock the calendar and date panel fill the row and nothing leaves a narrow cell',viewport:{width:1300,height:900},run:async page=>{
    // A ratio kept from a wider window must not leave the pair short of the row.
    await page.js(`localStorage.setItem('blokky.panel.plan-two-calendar','0.85');localStorage.setItem('blokky.panel.plan-month-calendar','0.85')`);
    await setDock(page,'wide');
    await page.js(`(async()=>{const [{getState},{drop}]=await Promise.all([import('/src/app/store/state.ts'),import('/src/app/store/tasks.ts')]);
      const s=getState(),{today}=s,next=[1,2,3].map(n=>{const d=new Date(today+'T00:00');d.setDate(d.getDate()+n);return d.toLocaleDateString('sv');});
      for(const [n,t] of s.snapshot.tasks.filter(t=>t.plan_date===today&&!t.completed).slice(0,5).entries())
        await drop({id:t.id,ids:[t.id],zone:'date',date:next[n%3],before:null,start:null,ok:true,reason:null});})()`);
    for(const period of ['2주','월']){
      await page.click('.segmented button',period);await page.sleep(500);
      const r=await page.js(`(()=>{const main=document.querySelector('.plan-main').getBoundingClientRect(),day=document.querySelector('#calendar-day').getBoundingClientRect();
        const over=[...document.querySelectorAll('.cal-cell')].flatMap(c=>{const b=c.getBoundingClientRect();return [...c.querySelectorAll('*')].filter(e=>{const x=e.getBoundingClientRect();return x.width&&(x.right>b.right+.5||x.left<b.left-.5);}).map(e=>c.dataset.date+' '+e.className);});
        return {gap:Math.round(main.right-day.right),cell:document.querySelector('.cal-cell').getBoundingClientRect().width,over};})()`);
      assert.ok(r.cell<40,`${period}: the cells are squeezed (${r.cell}px)`);
      assert.equal(r.gap,0,`${period}: the date panel reaches the end of the row`);
      assert.deepEqual(r.over,[],`${period}: everything stays inside its cell`);
    }
    await page.js(`localStorage.removeItem('blokky.panel.plan-two-calendar');localStorage.removeItem('blokky.panel.plan-month-calendar')`);
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
  // The drawer that moved under the calendar is now the narrow dock, which stays left of it.
  {name:'at 1024px 2주 keeps 준비 beside the calendar and the date panel takes a new block',viewport:{width:1024,height:900},run:async page=>{
    await toPlan(page);
    await page.click('.segmented [role=radio]','2주');
    const cal=await page.rect('.cal'),dock=await page.rect('#dock'),day=await page.rect('.plan-day');
    assert.ok(dock.x+dock.w<=cal.x&&dock.x+dock.w<=day.x,'the narrow dock stays left of the calendar and the date panel');
    assert.ok(await page.js(`document.documentElement.scrollWidth<=innerWidth`),'the page does not scroll sideways');
    const splitter='.cal-layout>.panel-separator',saved=await page.js(`localStorage.getItem('blokky.panel.plan-two-calendar')`);
    assert.ok((await page.rect(splitter)).w>0,'the calendar/date separator remains usable through display:contents');
    await page.js(`document.querySelector('${splitter}').focus()`);await page.key('ArrowLeft');
    assert.ok((await page.rect('.cal')).w<cal.w-14,'keyboard resizing changes the intermediate calendar width');
    assert.ok((await page.rect('.plan-day')).w>=280,'the date panel retains its minimum');
    await page.js(`(()=>{const saved=${JSON.stringify(saved)};if(saved===null)localStorage.removeItem('blokky.panel.plan-two-calendar');else localStorage.setItem('blokky.panel.plan-two-calendar',saved);document.querySelector('${splitter}').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));if(saved!==null)localStorage.setItem('blokky.panel.plan-two-calendar',saved);})()`);
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
    for(const theme of ['default','g1','g3','g4']){
      await page.js(`document.documentElement.dataset.theme='${theme}'`);await page.sleep(200);await page.shot('plan-week-'+theme);
      await page.js(`document.querySelector('.wk-head.sel').classList.add('past')`);
      await assertReadable(page,theme+' selected past week');
    }
    await page.click('.segmented [role=radio]','2주');
    // Exercise the color states on the populated date so the task titles and fixed-time labels are included.
    await page.js(`document.querySelector('.cal-cell.today').classList.add('past','outside')`);
    for(const theme of ['default','g1','g3','g4']){
      await page.js(`document.documentElement.dataset.theme='${theme}';document.querySelector('.cal-cell.today').classList.add('sel')`);
      await assertReadable(page,theme+' selected past outside calendar');
      await page.js(`document.querySelector('.cal-cell.today').classList.remove('sel')`);
      await assertReadable(page,theme+' past outside calendar');
      assert.equal(await page.js(`getComputedStyle(document.querySelector('.cal-cell.outside')).borderTopStyle`),'dashed','outside dates keep a boundary cue');
    }
    await page.click('.segmented [role=radio]','월');
    await page.js(`document.querySelector('.cal-cell.today').classList.add('past','outside')`);
    for(const theme of ['default','g1','g3','g4']){
      await page.js(`document.documentElement.dataset.theme='${theme}'`);
      await assertReadable(page,theme+' selected past outside monthly load');
    }
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
  {name:'a range over lunch can be explicitly placed with a partial unavailable mask',run:async page=>{
    await toPlan(page);
    const {other}=await days(page),col=await page.rect(sp(other)),y11=await hourY(page,11),y13=await hourY(page,13);
    await page.mouse('mouseMoved',col.x+70,y11+2,0);await page.mouse('mousePressed',col.x+70,y11+2);
    for(let i=1;i<=10;i++){await page.mouse('mouseMoved',col.x+70,y11+2+(y13-y11-4)*i/10);await page.sleep(16);}
    assert.equal(await page.js(`document.querySelector('${sp(other)} .range').classList.contains('bad')`),false);
    await page.mouse('mouseReleased',col.x+70,y13-2,0);await page.sleep(250);
    assert.equal(await page.js(`!!document.querySelector('.composer')`),true);
    await page.type('점심을 걸친 작업');await page.key('Enter',{text:'\r'});await page.sleep(400);
    assert.ok((await page.blocks(sp(other))).includes('점심을 걸친 작업, 시각 고정 11:00–13:00'));
    assert.equal(await page.js(`document.querySelector('${sp(other)} .blk .off-part')?.style.height`),'50%');
  }},
  {name:'a week date head opens its 일 view, where empty time takes a new block that runs past the end of work',run:async page=>{
    await toPlan(page);
    const {today}=await days(page);
    await page.click(`.wk-head[data-date="${today}"] .wk-date`);await page.sleep(500);
    assert.equal(await page.js(`document.querySelector('.segmented [aria-checked=true]').textContent`),'일');
    assert.equal(await page.js(`document.querySelectorAll('.dv-strip .wk-head').length`),7,'the week stays as a strip of date heads');
    const box=await page.rect('.dv-day .space'),last=await page.rect('.dv-day .blk','신규 입사자 교육');
    await press(page,box.x+box.w-60,last.y+last.h+20);
    assert.match(await page.text('.composer .cm-head'),/순서 끝 · \d\d:\d\d–\d\d:\d\d/);
    await page.shot('day-composer');
    await page.type('오늘 추가');await page.key('Enter',{text:'\r'});await page.sleep(700);
    assert.ok((await page.blocks('.dv-day .space')).includes('오늘 추가, 예상 20:00–20:30'));
  }},
  {name:'2주 date panel title opens the 일 view; 오늘 has no composer and no 하루 비우기',run:async page=>{
    await toFocus(page);
    const box=await page.rect('.today-day .space');
    await press(page,box.x+box.w-30,box.y+box.h-30);
    assert.equal(await page.js(`!!document.querySelector('.composer')`),false,'empty time on 오늘 does not compose');
    assert.equal(await page.js(`[...document.querySelectorAll('.today-bar button')].some(b=>b.textContent.includes('비우기'))`),false);
    assert.match(await page.text('.today-bar'),/재배치/);
    await toPlan(page);
    await page.click('.segmented [role=radio]','2주');await page.sleep(400);
    await page.click('.plan-day-link');await page.sleep(400);
    assert.equal(await page.js(`document.querySelector('.segmented [aria-checked=true]').textContent`),'일');
  }},
  {name:'a held block takes the shape of where it is headed: a week column, a 2주 title line, a 월 load segment',run:async page=>{
    await toPlan(page);
    const held=()=>page.js(`(()=>{const h=document.querySelector('.held');if(!h)return null;const r=h.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),cls:h.className};})()`);
    const carry=async(target,read)=>{
      const from=await page.rect('#dock .tblk','SQLite');
      await page.mouse('mouseMoved',from.cx,from.y+8,0);await page.mouse('mousePressed',from.cx,from.y+8);
      for(let i=1;i<=12;i++){await page.mouse('mouseMoved',from.cx+(target.x-from.cx)*i/12,from.y+8+(target.y-from.y-8)*i/12);await page.sleep(16);}
      await page.sleep(320);const seen=await read();
      // Back over the dock and let go: nothing is stored.
      await page.mouse('mouseMoved',from.cx,from.y+8);await page.sleep(250);await page.mouse('mouseReleased',from.cx,from.y+8,0);await page.sleep(500);
      return seen;
    };
    const head=await page.rect('.wk-head.today');
    const week=await carry({x:head.cx,y:head.cy},async()=>({held:await held(),col:await page.js(`Math.round(document.querySelector('.wk-head.today').clientWidth)`)}));
    assert.equal(week.held.h,43,'45 minutes on the week scale');assert.match(week.held.cls,/narrow/);assert.equal(week.held.w,week.col-21);
    await page.click('.segmented [role=radio]','2주');await page.sleep(400);
    const cell=await page.rect('.cal-cell.today');
    const two=await carry({x:cell.cx,y:cell.cy},held);
    assert.equal(two.h,20);assert.match(two.cls,/line/);
    await page.click('.segmented [role=radio]','월');await page.sleep(400);
    const day=await page.rect('.cal-cell.today');
    const month=await carry({x:day.cx,y:day.cy},async()=>{await page.shot('plan-month-morph');return held();});
    assert.equal(month.h,6);assert.match(month.cls,/bar/);assert.ok(month.w<40,'45 minutes is a short share of the day bar');
    assert.deepEqual(await page.js(`[...document.querySelectorAll('#dock .tblk .ttl')].map(e=>e.textContent).includes('SQLite 백업 방식 조사')`),true,'nothing was stored');
  }},
];
