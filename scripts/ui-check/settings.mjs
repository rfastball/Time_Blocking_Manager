import assert from 'node:assert/strict';

// Preview data: every weekday 09:00–18:00 with lunch 12:00–13:00; today has the fixed workshop at 14:00.
// Confirmations answer yes, and a draft left by a scenario must not hold the next navigation at the leave-page prompt.
const guard=page=>page.js(`window.confirm=()=>true;if(!window.__leaveFree){window.__leaveFree=true;const pd=Event.prototype.preventDefault;Event.prototype.preventDefault=function(){if(this.type!=='beforeunload')return pd.call(this);};}`);
const open=async page=>{await guard(page);await page.click('.nav-button','설정');await page.sleep(400);};
// Rect of an element found by a page expression (the first column is Monday).
const at=(page,expr)=>page.js(`(()=>{const e=${expr};if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height,cx:r.left+r.width/2,cy:r.top+r.height/2};})()`);
const col=i=>`document.querySelectorAll('.rh-col')[${i}]`;
const label=(page,expr)=>page.js(`${expr}?.getAttribute('aria-label')`);
const todayIndex=()=>(new Date().getDay()+6)%7;
// A real click on an element brought into view first.
const tap=async(page,expr)=>{const r=await at(page,expr);if(!r)throw Error('missing '+expr);await page.mouse('mouseMoved',r.cx,r.cy,0);await page.mouse('mousePressed',r.cx,r.cy);await page.mouse('mouseReleased',r.cx,r.cy,0);await page.sleep(400);};

// Work past the end of the day covers the middle of the evening band; press its uncovered left edge.
async function offHours(page,from){
  const sel=`.today-day .off[aria-label^="${from}"]`;await page.js(`document.querySelector('${sel}').scrollIntoView({block:'center'})`);await page.sleep(100);
  const r=await page.rect(sel),x=r.x+4,y=r.y+10;await page.mouse('mouseMoved',x,y,0);await page.mouse('mousePressed',x,y);await page.mouse('mouseReleased',x,y,0);await page.sleep(150);
}

export default [
  {name:'the weekly rhythm draws seven columns of parallel bands',run:async page=>{
    await open(page);
    assert.equal(await page.js(`document.querySelectorAll('.rh-head [data-toggle]').length`),7);
    assert.equal(await page.js(`document.querySelectorAll('.rh-band.rh-work').length`),7);
    assert.equal(await page.js(`document.querySelectorAll('.rh-band.rh-rest').length`),7);
    // Work and break bands sit side by side, never on top of each other.
    const overlap=await page.js(`(()=>{const w=${col(0)}.querySelector('.rh-band.rh-work').getBoundingClientRect(),b=${col(0)}.querySelector('.rh-band.rh-rest').getBoundingClientRect();return w.right>b.left;})()`);
    assert.equal(overlap,false);
    await page.shot('settings-initial');
  }},
  {name:'dragging a band edge and saving stores the new end',run:async page=>{
    await open(page);
    const edge=await at(page,`${col(0)}.querySelector('[data-band=work] .rh-edge.end')`);
    await page.drag({x:edge.cx,y:edge.cy},{x:edge.cx,y:edge.cy+34},{before:()=>page.shot('settings-edge-drag')});
    assert.match(await label(page,`${col(0)}.querySelector('[data-select="0:work"]')`),/09:00–18:30/);
    assert.match(await page.text('.st-savebar'),/저장하지 않은 변경/);
    await page.click('.st-savebar .btn.primary');await page.sleep(400);
    assert.equal(await page.js(`!!document.querySelector('.st-savebar.st-dirty')`),false);
    assert.match(await label(page,`${col(0)}.querySelector('[data-select="0:work"]')`),/09:00–18:30/);
  }},
  {name:'a press without travel only selects; edges move by 15 minutes with the arrow keys',run:async page=>{
    await open(page);
    const band=await at(page,`${col(1)}.querySelector('[data-band=work] button')`);
    await page.mouse('mouseMoved',band.cx,band.y+60,0);await page.mouse('mousePressed',band.cx,band.y+60);await page.mouse('mouseMoved',band.cx,band.y+64);await page.mouse('mouseReleased',band.cx,band.y+64,0);await page.sleep(200);
    assert.equal(await page.js(`!!document.querySelector('.st-savebar.st-dirty')`),false,'no change from a short press');
    assert.match(await page.text('.rh-detail-head'),/화요일 · 근무/);
    await page.js(`${col(1)}.querySelector('[data-band=work] .rh-edge.start').focus()`);
    await page.key('ArrowUp');await page.key('ArrowUp');await page.sleep(200);
    assert.equal(await page.js(`document.activeElement.getAttribute('aria-valuetext')`),'08:30');
    await page.key('ArrowDown');await page.sleep(200);
    assert.match(await label(page,`${col(1)}.querySelector('[data-select="1:work"]')`),/08:45–18:00/);
  }},
  {name:'the band menu opens with Shift+F10 and adds and deletes a break',run:async page=>{
    await open(page);
    await page.js(`${col(1)}.querySelector('[data-select="1:work"]').focus()`);
    await page.key('F10',{modifiers:8});await page.sleep(250);
    assert.ok(await page.js(`document.activeElement.closest('.rh-menu')!==null`),'menu takes focus');
    await page.key('Escape');await page.sleep(150);
    assert.equal(await page.js(`!!document.querySelector('.rh-menu')`),false);
    assert.equal(await page.js(`document.activeElement.dataset.select`),'1:work','focus returns to the band');
    await page.key('F10',{modifiers:8});await page.sleep(250);
    for(let i=0;i<3;i++)await page.key('ArrowDown');
    assert.equal(await page.js(`document.activeElement.textContent`),'휴식 추가');
    await page.key('Enter',{text:'\r'});await page.sleep(300);
    assert.equal(await page.js(`${col(1)}.querySelectorAll('.rh-band.rh-rest').length`),2);
    assert.ok(await page.js(`document.activeElement.hasAttribute('data-name')`),'name field of the new break');
    await page.shot('settings-break-added');
    await page.js(`${col(1)}.querySelector('[data-select="1:1"]').focus()`);
    await page.key('F10',{modifiers:8});await page.sleep(250);
    await page.key('End');await page.key('ArrowUp');
    assert.equal(await page.js(`document.activeElement.textContent`),'휴식 삭제');
    await page.key('Enter',{text:'\r'});await page.sleep(300);
    assert.equal(await page.js(`${col(1)}.querySelectorAll('.rh-band.rh-rest').length`),1);
  }},
  {name:'a break over the fixed workshop saves and preserves its explicit time',run:async page=>{
    await open(page);
    const day=todayIndex();
    await page.click('.rh-tools .btn','휴식 그리기');
    const lunch=await at(page,`${col(day)}.querySelector('[data-band="0"]')`),perMinute=lunch.h/60;
    const x=lunch.x-20,y=lunch.y+120*perMinute+5*perMinute;
    await page.drag({x,y},{x,y:y+45*perMinute});
    assert.match(await label(page,`${col(day)}.querySelector('[data-select="${day}:1"]')`),/14:00–15:00/);
    assert.equal(await page.js(`!!document.querySelector('.st-conflicts')`),false,'fixed times need no move consent');
    await page.click('.st-savebar .btn.primary');await page.sleep(500);
    assert.equal(await page.js(`!!document.querySelector('.st-savebar.st-dirty')`),false);
    await page.click('.nav-button','오늘');await page.sleep(500);
    const workshop=await page.js(`[...document.querySelectorAll('.today-day .main')].map(b=>b.getAttribute('aria-label')).find(l=>l.startsWith('설계 워크숍'))`);
    assert.match(workshop,/시각 고정 14:00–15:00/,'the workshop keeps its fixed time');
    await page.shot('settings-preserved-fixed-time');
  }},
  {name:'the date popover opens from off-hours, applies an early leave and restores the rhythm',run:async page=>{
    await guard(page);
    await offHours(page,'18:00');await page.sleep(300);
    assert.ok(await page.js(`!!document.querySelector('.ap[role=dialog]')`));
    assert.equal(await page.js(`document.activeElement.dataset.time`),'start','focus on the work start');
    await page.key('Escape');await page.sleep(200);
    assert.equal(await page.js(`!!document.querySelector('.ap')`),false);
    assert.match(await page.js(`document.activeElement.getAttribute('aria-label')`),/18:00 이후/,'focus returns to the band');
    await offHours(page,'18:00');await page.sleep(300);
    await page.js(`(()=>{const s=document.querySelector('.ap select');s.value='early';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await page.sleep(150);
    await page.js(`(()=>{const i=document.querySelector('.ap [data-time=end]');i.focus();i.value='16:00';i.blur();})()`);await page.sleep(200);
    assert.match(await page.text('.ap .rh-detail-head output'),/09:00–16:00/);
    await page.shot('settings-popover');
    await page.click('.ap .btn.primary');await page.sleep(500);
    assert.equal(await page.js(`!!document.querySelector('.ap')`),false);
    assert.ok(await page.rect('.today-day .off[aria-label^="16:00"]'),'today ends at 16:00');
    await offHours(page,'16:00');await page.sleep(300);
    assert.equal(await page.js(`document.querySelector('.ap select').value`),'early');
    await page.click('.ap .btn','반복 일정으로 복원');await page.sleep(500);
    assert.equal(await page.js(`!!document.querySelector('.ap')`),false);
    assert.ok(await page.rect('.today-day .off[aria-label^="18:00"]'),'back to 18:00');
  }},
  {name:'the popover opened from a break focuses that break',run:async page=>{
    await guard(page);
    await page.click('.today-day .brk');await page.sleep(300);
    assert.equal(await page.js(`document.querySelector('.ap [aria-pressed=true]').textContent`),'점심');
    assert.ok(await page.js(`!!document.querySelector('.ap [data-name]')`));
    await page.click('.ap-head .ibtn');await page.sleep(200);
    assert.equal(await page.js(`!!document.querySelector('.ap')`),false);
  }},
  {name:'routines are added, edited and deleted',run:async page=>{
    await open(page);
    const save=`document.querySelector('#routine-form .btn.primary')`;
    await tap(page,save);
    assert.match(await page.text('#routine-form [role=alert]'),/정기 업무 제목을 입력하세요/,'empty Add explains the required input');
    assert.equal(await page.js(`!!document.querySelector('.st-routine-list')`),false,'empty Add does not create a routine');
    await page.js(`document.querySelector('#routine-title').focus()`);await page.type('주간 보고');
    assert.equal(await page.js(`!!document.querySelector('#routine-form [role=alert]')`),false,'typing clears validation');
    await tap(page,save);
    assert.match(await page.text('.st-routine-list'),/주간 보고.*월·화·수·목·금 · 09:00–09:30/);
    await tap(page,`document.querySelector('.st-routine')`);
    assert.equal(await page.js(`document.activeElement.id`),'routine-title');
    assert.match(await page.text('#routine-form'),/정기 업무 수정/);
    await page.js(`document.querySelector('#routine-title').select()`);await page.type('주간 보고서');
    await tap(page,`document.querySelector('[name=routine-weekday][value="5"]')??[...document.querySelectorAll('.st-weekdays input')][5]`);
    assert.equal(await page.js(`document.querySelector(${JSON.stringify('#routine-form .btn.primary')}).textContent`),'저장');
    await tap(page,save);
    assert.match(await page.text('.st-routine-list'),/주간 보고서월·화·수·목·금·토 · 09:00–09:30/);
    await tap(page,`document.querySelector('[aria-label="주간 보고서 정기 업무 삭제"]')`);
    assert.equal(await page.js(`!!document.querySelector('.st-routine-list')`),false);
  }},
  {name:'the theme applies at once, follows arrow keys and survives a reload',run:async page=>{
    await open(page);
    await page.click('.st-theme','사무 장부');await page.sleep(200);
    assert.equal(await page.js('document.documentElement.dataset.theme'),'g4');
    await page.goto('/?now=10:20');await guard(page);
    assert.equal(await page.js('document.documentElement.dataset.theme'),'g4');
    await open(page);
    for(const theme of ['default','g1','g3','g4']){await page.js(`document.querySelector('.st-theme input[value=${theme}]').click()`);await page.sleep(250);await page.shot('settings-theme-'+theme);}
    await page.js(`document.querySelector('.st-theme input[value=g4]').focus()`);
    await page.key('ArrowLeft');await page.sleep(150);
    assert.equal(await page.js('document.documentElement.dataset.theme'),'g3');
    await page.js(`document.querySelector('.st-theme input[value=default]').click()`);
  }},
  {name:'one column at phone width',viewport:{width:640,height:900},run:async page=>{
    await open(page);
    const cols=await page.js(`getComputedStyle(document.querySelector('.st-page')).gridTemplateColumns.split(' ').length`);
    assert.equal(cols,1);
    assert.equal(await page.js('document.documentElement.scrollWidth<=innerWidth'),true,'no page scroll sideways');
    await page.shot('settings-narrow');
  }},
];
