import assert from 'node:assert/strict';

// Shared navigation for the scenarios (a folder, so the runner does not load it as scenarios).
// The app opens on the work screen; 몰입 opens the focus screen (the former 오늘) and 작업 화면 returns; the gear opens 설정.
// The 준비 dock width is a device preference kept in localStorage, and every scenario shares one browser profile,
// so a scenario sets the dock it needs instead of trusting what the previous one left.
export const view=page=>page.js(`document.querySelector('.content')?.dataset.view??null`);
export const dockState=page=>page.js(`(()=>{const d=document.querySelector('#dock');return d?['narrow','wide','hidden'].find(c=>d.classList.contains(c))??null:null;})()`);

// A cold dev server may still be compiling on the first load.
export async function ready(page){
  for(let i=0;i<60;i++){
    if(await page.js(`!!document.querySelector('header.topbar')&&!!document.querySelector('.content')?.firstElementChild&&!document.querySelector('.content .load-state')`))return;
    await page.sleep(250);
  }
  throw Error('the app did not finish loading');
}
// The top bar scrolls with the page (the rail it replaced was sticky), so bring it into view before pressing it.
const reveal=page=>page.js(`document.querySelector('header.topbar')?.scrollIntoView({block:'nearest'})`);
const topbar=async(page,text)=>{await reveal(page);await page.click('header.topbar button',text);};

export async function toWork(page){
  await ready(page);
  if(await view(page)!=='plan'){await topbar(page,'작업 화면');await page.sleep(400);}
  assert.equal(await view(page),'plan','the work screen');
}
export async function toFocus(page){
  await ready(page);
  if(await view(page)==='today')return;
  if(await view(page)!=='plan'){await topbar(page,'작업 화면');await page.sleep(300);}
  await topbar(page,'몰입');await page.sleep(500);
  assert.equal(await view(page),'today','the focus screen');
  assert.ok(await page.js(`!!document.querySelector('.today-day')`),'the focus screen shows the day');
}
export async function toSettings(page){
  await ready(page);
  if(await view(page)!=='settings'){await reveal(page);await page.click('header.topbar button[aria-label="설정"]');await page.sleep(400);}
  assert.equal(await view(page),'settings','the settings screen');
}
// Goes to the work screen and brings the dock to narrow, wide or hidden with its own controls.
export async function setDock(page,want){
  await toWork(page);
  for(let i=0;i<3;i++){
    const now=await dockState(page);if(now===want)break;
    if(want==='hidden')await page.click('#dock button[aria-label="준비 접기"]');
    else if(now==='hidden')await page.click('#dock .dock-unfold');
    else await page.click(`#dock button[aria-label="${want==='wide'?'준비 넓히기':'준비 좁히기'}"]`);
    await page.sleep(350);
  }
  assert.equal(await dockState(page),want,'the dock is '+want);
}
// The work screen as 계획 used to open: the week with 준비 beside it as a list.
export const toPlan=page=>setDock(page,'narrow');
// The former 준비 tab: the work screen with the dock wide.
export async function toBench(page){
  await setDock(page,'wide');
  assert.ok(await page.js('!!document.querySelector("#dock .jb-shelf")'),'the bench is in the dock');
}
