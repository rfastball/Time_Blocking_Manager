// Explicit UI check: drives headless Edge over CDP with real mouse/keyboard input against a running dev server.
// Not part of `npm test`. Usage: node scripts/ui-check.mjs [--base http://127.0.0.1:1420] [--only today,plan] [--out dir] [--port 9333]
// Scenarios live in scripts/ui-check/*.mjs and export an array of {name, path, run(page)}.
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,readdirSync,writeFileSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';

const arg=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:fallback;};
const base=arg('base','http://127.0.0.1:1420'),only=arg('only',''),port=Number(arg('port','9333'));
const out=arg('out',join(tmpdir(),'blokky-ui-check'));
const edge=[process.env.EDGE_PATH,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>p&&existsSync(p));
if(!edge){console.error('Microsoft Edge not found. Set EDGE_PATH.');process.exit(2);}
mkdirSync(out,{recursive:true});
const profile=join(out,'profile-'+port);rmSync(profile,{recursive:true,force:true});
const proc=spawn(edge,['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','--disable-extensions','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

let target;for(let i=0;i<60&&!target;i++){try{target=(await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t=>t.type==='page');}catch{}await sleep(200);}
if(!target){console.error('Edge did not open a debugging target.');proc.kill();process.exit(2);}
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const waiting=new Map();let consoleLog=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&waiting.has(m.id)){waiting.get(m.id)(m);waiting.delete(m.id);}
  if(m.method==='Runtime.exceptionThrown')consoleLog.push('exception: '+(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text).slice(0,400));
  if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')consoleLog.push('error: '+m.params.args.map(a=>a.value??a.description).join(' ').slice(0,400));};
const send=(method,params={})=>new Promise(r=>{const i=++id;waiting.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});

class Page{
  async js(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.result?.exceptionDetails)throw Error('page: '+(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text));return r.result?.result?.value;}
  async goto(path,{width=1440,height=1000}={}){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:base+path});await sleep(1800);}
  sleep(ms){return sleep(ms);}
  mouse(type,x,y,buttons=1,modifiers=0){return send('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'&&!buttons?'none':'left',buttons,clickCount:type==='mouseMoved'?0:1,modifiers});}
  async key(key,{code=key,modifiers=0,text}={}){await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,text,windowsVirtualKeyCode:{Enter:13,Escape:27,ArrowUp:38,ArrowDown:40,ArrowLeft:37,ArrowRight:39,Tab:9,F10:121,' ':32}[key]??0});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers,windowsVirtualKeyCode:{Enter:13,Escape:27,ArrowUp:38,ArrowDown:40,ArrowLeft:37,ArrowRight:39,Tab:9,F10:121,' ':32}[key]??0});}
  async type(text){await send('Input.insertText',{text});}
  // Rect of the first element matching a CSS selector, optionally containing text.
  async rect(selector,text){return this.js(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text?`e.textContent.includes(${JSON.stringify(text)})`:'true'});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height,cx:r.left+r.width/2,cy:r.top+r.height/2};})()`);}
  async click(selector,text,{modifiers=0}={}){const r=await this.rect(selector,text);if(!r)throw Error(`no element ${selector} ${text??''}`);await this.mouse('mouseMoved',r.cx,r.cy,0);await this.mouse('mousePressed',r.cx,r.cy,1,modifiers);await this.mouse('mouseReleased',r.cx,r.cy,0,modifiers);await sleep(150);return r;}
  async drag(from,to,{steps=14,hold=250,before}={}){
    await this.mouse('mouseMoved',from.x,from.y,0);await this.mouse('mousePressed',from.x,from.y);
    for(let i=1;i<=steps;i++){await this.mouse('mouseMoved',from.x+(to.x-from.x)*i/steps,from.y+(to.y-from.y)*i/steps);await sleep(16);}
    await sleep(hold);const during=before?await before():null;
    await this.mouse('mouseReleased',to.x,to.y,0);await sleep(700);return during;
  }
  async shot(name){const r=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,name+'.png'),Buffer.from(r.result.data,'base64'));}
  // "title, 예상 09:00–10:00" for every block in the first matching space.
  blocks(scope='.space'){return this.js(`[...(document.querySelector(${JSON.stringify(scope)})?.querySelectorAll('.blk .main')??[])].map(b=>b.getAttribute('aria-label').split(', ').slice(0,2).join(', '))`);}
  text(selector){return this.js(`document.querySelector(${JSON.stringify(selector)})?.textContent??null`);}
}

const dir=join(dirname(fileURLToPath(import.meta.url)),'ui-check');
const files=readdirSync(dir).filter(f=>f.endsWith('.mjs')&&(!only||only.split(',').includes(f.replace(/\.mjs$/,'')))).sort();
await send('Page.enable');await send('Runtime.enable');
const page=new Page(),results=[];
for(const file of files){
  const scenarios=(await import(pathToFileURL(join(dir,file)).href)).default;
  for(const s of scenarios){
    consoleLog=[];const started=Date.now();
    try{await page.goto(s.path??'/?now=10:20',s.viewport);await s.run(page);if(consoleLog.length)throw Error('console: '+consoleLog.join(' | '));results.push({area:file,name:s.name,ok:true,ms:Date.now()-started});}
    catch(e){await page.shot(`FAIL-${file}-${s.name}`.replace(/[^\w가-힣-]+/g,'_')).catch(()=>{});results.push({area:file,name:s.name,ok:false,error:String(e.message||e)});}
  }
}
ws.close();proc.kill();
for(const r of results)console.log(`${r.ok?'PASS':'FAIL'} ${r.area} › ${r.name}${r.ok?` (${r.ms}ms)`:'\n     '+r.error}`);
writeFileSync(join(out,'results.json'),JSON.stringify(results,null,2));
console.log(`${results.filter(r=>r.ok).length}/${results.length} passed · screenshots: ${out}`);
process.exit(results.every(r=>r.ok)?0:1);
