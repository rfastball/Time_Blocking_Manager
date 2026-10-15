import assert from 'node:assert/strict';
import {dockState,ready,toPlan,view} from './support/nav.mjs';

// One screen: the work screen (준비 dock beside the calendar) and the focus screen; 설정 opens from the gear.
const stored=page=>page.js(`localStorage.getItem('blokky.dock')`);
const has=(page,selector)=>page.js(`!!document.querySelector(${JSON.stringify(selector)})`);
const reload=async page=>{await page.goto('/?now=10:20');await ready(page);await page.sleep(300);};
const pressDock=async(page,label)=>{await page.click(`#dock button[aria-label="${label}"]`);await page.sleep(350);};

export default [
  {name:'the app starts on the work screen with the narrow 준비 dock beside the week and no rail',run:async page=>{
    await page.js(`localStorage.removeItem('blokky.dock')`);await reload(page);
    assert.equal(await view(page),'plan','the work screen comes first');
    assert.equal(await page.text('.segmented [aria-checked=true]'),'주');
    assert.equal(await dockState(page),'narrow','a device without a preference gets the narrow dock');
    const dock=await page.rect('#dock'),main=await page.rect('.plan-main');
    assert.ok(dock.x+dock.w<=main.x,'the dock sits left of the calendar');
    assert.ok(await has(page,'#dock .tray #tray-capture'),'the narrow dock is the 준비 list');
    assert.equal(await page.js(`document.querySelectorAll('.plan-main .wk-col').length`),7);
    assert.equal(await has(page,'.rail-nav'),false,'no rail');
    assert.ok(await has(page,'header.topbar button[aria-label="BLOKKY 오늘로 이동"]'));
    await page.shot('shell-start');
  }},
  {name:'the dock goes narrow, wide, narrow, folded and unfolded by its controls and keeps its width over a reload',run:async page=>{
    await toPlan(page);
    const narrowMain=(await page.rect('.plan-main')).w;
    await pressDock(page,'준비 넓히기');
    assert.equal(await dockState(page),'wide');
    assert.ok(await has(page,'#dock .inbox-page #inbox-capture')&&await has(page,'#dock .jb-inbox')&&await has(page,'#dock .jb-shelf'),'wide, the dock is the bench');
    assert.equal(await has(page,'#dock .tray'),false,'the list gives way to the bench');
    // The label says the next width; a pressed state on top would read the state twice.
    assert.equal(await page.js(`document.querySelector('#dock button[aria-label="준비 좁히기"]').hasAttribute('aria-pressed')`),false);
    assert.ok((await page.rect('.plan-main')).w<narrowMain,'the calendar gives the bench its room');
    assert.equal(await stored(page),'wide');
    await page.shot('shell-dock-wide');
    await reload(page);
    assert.equal(await dockState(page),'wide','a reload keeps the wide dock');
    assert.ok(await has(page,'#dock .jb-shelf'));
    await pressDock(page,'준비 좁히기');
    assert.equal(await dockState(page),'narrow');
    assert.ok(await has(page,'#dock .tray #tray-capture'),'narrow, the dock is the list again');
    assert.equal(await has(page,'#dock .jb-shelf'),false);
    assert.ok(Math.abs((await page.rect('.plan-main')).w-narrowMain)<=1,'the calendar returns to its narrow-dock width');
    assert.equal(await stored(page),'narrow');
    await pressDock(page,'준비 접기');
    assert.equal(await dockState(page),'hidden');
    assert.equal(await has(page,'#dock .tray')||await has(page,'#dock .jb-shelf')||await has(page,'#dock .dock-tools'),false,'folded, only the unfold button stays');
    assert.match(await page.js(`document.querySelector('#dock .dock-unfold').getAttribute('aria-label')`),/^준비 펴기/);
    assert.ok((await page.rect('.plan-main')).w>narrowMain+200,'folding gives the calendar the room');
    assert.equal(await stored(page),'hidden');
    await page.shot('shell-dock-hidden');
    await reload(page);
    assert.equal(await dockState(page),'hidden','a reload keeps the folded dock');
    await page.click('#dock .dock-unfold');await page.sleep(350);
    assert.equal(await dockState(page),'narrow','unfolding opens the list');
    assert.ok(await has(page,'#dock .tray #tray-capture'));
    assert.equal(await stored(page),'narrow');
  }},
  {name:'switching the period slides one thumb and keeps the tabs in place while the title changes length',run:async page=>{
    await toPlan(page);
    // Every frame after a press: where the tabs sit, whether any tab fills its own background, and where the thumb is.
    const frames=label=>page.js(`new Promise(resolve=>{
      const tabs=()=>[...document.querySelectorAll('.segmented button')],out=[];
      const snap=()=>out.push({left:Math.round(document.querySelector('.segmented').getBoundingClientRect().left),
        filled:tabs().filter(b=>getComputedStyle(b).backgroundColor!=='rgba(0, 0, 0, 0)').length,thumb:document.querySelector('.seg-thumb')?.getBoundingClientRect().left??null});
      tabs().find(b=>b.textContent===${JSON.stringify(label)})?.click();
      let n=0;const tick=()=>{snap();if(++n<24)requestAnimationFrame(tick);else resolve(out);};requestAnimationFrame(tick);
    })`);
    const start=await page.js(`Math.round(document.querySelector('.segmented').getBoundingClientRect().left)`);
    for(const label of ['일','월','2주','주']){
      const f=await frames(label);
      assert.ok(f.every(x=>x.left===start),`${label}: the tabs stay at ${start}px (${[...new Set(f.map(x=>x.left))]})`);
      assert.ok(f.every(x=>x.filled===0),`${label}: no tab fades its own fill`);
      const target=await page.js(`(()=>{const b=document.querySelector('.segmented [aria-checked=true]');return b.textContent+':'+Math.round(b.getBoundingClientRect().left);})()`);
      assert.equal(target.split(':')[0],label);
      assert.ok(Math.abs(f[f.length-1].thumb-Number(target.split(':')[1]))<=1,`${label}: the thumb lands on the chosen tab`);
    }
  }},
  {name:'몰입 opens the focus screen and 작업 화면 returns to the work screen as it was left',run:async page=>{
    await toPlan(page);
    await page.click('.segmented [role=radio]','2주');await page.sleep(300);
    await page.click('header.topbar button','몰입');await page.sleep(500);
    assert.equal(await view(page),'today');
    assert.ok(await has(page,'.today-day')&&await has(page,'.today-flow'),'the focus screen is the former 오늘');
    assert.equal(await has(page,'#dock'),false,'no dock while focusing');
    assert.equal(await has(page,'.segmented'),false,'no period choice while focusing');
    assert.match(await page.text('header.topbar h1'),/\d+월 \d+일/);
    assert.equal(await page.js(`[...document.querySelectorAll('header.topbar button')].some(b=>b.textContent.includes('몰입'))`),false);
    await page.shot('shell-focus');
    await page.click('header.topbar button','작업 화면');await page.sleep(400);
    assert.equal(await view(page),'plan');
    assert.equal(await page.text('.segmented [aria-checked=true]'),'2주','the period survives the round trip');
    assert.equal(await dockState(page),'narrow','so does the dock');
  }},
  {name:'the gear opens 설정 and leads back to the work screen',run:async page=>{
    await toPlan(page);
    const gear='header.topbar button[aria-label="설정"]';
    await page.click(gear);await page.sleep(400);
    assert.equal(await view(page),'settings');
    assert.equal(await page.js(`document.querySelector('${gear}').getAttribute('aria-pressed')`),'true');
    assert.ok(await has(page,'.st-page'));
    assert.equal(await has(page,'#dock'),false);
    await page.click(gear);await page.sleep(400);
    assert.equal(await view(page),'plan','the gear again closes 설정');
    assert.equal(await page.js(`document.querySelector('${gear}').getAttribute('aria-pressed')`),'false');
    // From the focus screen too, 설정 returns to the work screen.
    await page.click('header.topbar button','몰입');await page.sleep(400);
    await page.click(gear);await page.sleep(400);
    assert.equal(await view(page),'settings');
    await page.click('header.topbar button','작업 화면');await page.sleep(400);
    assert.equal(await view(page),'plan');
    assert.ok(await has(page,'#dock'));
  }},
  {name:'the bar is the banner beside main, and the status line sits outside main',run:async page=>{
    await toPlan(page);
    assert.equal(await page.js(`document.querySelectorAll('main').length`),1);
    assert.ok(await has(page,'main.content'),'the screen itself is main');
    assert.equal(await page.js(`!!document.querySelector('main header.topbar')`),false,'the bar is not inside main, so it is the banner');
    assert.equal(await page.js(`!!document.querySelector('main footer, main .status')`),false);
  }},
  ...[905,1440].map(width=>({name:`at ${width}px the sticky bar stays on one row in every theme and scrolling stops below it`,viewport:{width,height:800},run:async page=>{
    await toPlan(page);
    for(const theme of ['','g1','g3','g4']){
      await page.js(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);await page.sleep(100);
      const mids=await page.js(`[...document.querySelectorAll('header.topbar > *, header.topbar .bar-end > *')].filter(e=>e.offsetParent).map(e=>{const r=e.getBoundingClientRect();return Math.round(r.top+r.height/2);})`);
      assert.ok(Math.max(...mids)-Math.min(...mids)<=4,`${theme||'default'}: one row (${mids})`);
      const bar=(await page.rect('header.topbar')).h,pad=parseFloat(await page.js(`getComputedStyle(document.documentElement).scrollPaddingTop`));
      assert.ok(pad>=bar,`${theme||'default'}: scroll padding ${pad} covers the ${bar}px bar`);
    }
    await page.js(`document.documentElement.dataset.theme=''`);
  }})),
  {name:'at 390px the screen controls wrap together, right-aligned and touch-sized',viewport:{width:390,height:800},run:async page=>{
    await toPlan(page);
    const group=await page.js(`[...document.querySelectorAll('header.topbar .bar-end > *')].filter(e=>e.offsetParent).map(e=>{const r=e.getBoundingClientRect();return {top:Math.round(r.top),right:Math.round(r.right),h:r.height};})`);
    assert.ok(group.every(g=>g.top===group[0].top),'one row for the group');
    const bar=await page.rect('header.topbar');
    assert.ok(Math.abs(group.at(-1).right-(bar.x+bar.w-12))<=1,'the gear stays at the right edge');
    assert.ok(group.every(g=>g.h>=40),'touch-sized');
    assert.ok((await page.rect('.segmented [role=radio]')).h>=36,'the range radios grow with them');
  }},
];
