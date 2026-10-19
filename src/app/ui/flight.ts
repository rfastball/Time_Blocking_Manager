// Moves made without a drag (keys, menus, the selection bar) travel the way a drop lands: a flat copy leaves the block's
// old box and takes the new box's place and shape. Where either end is off screen, the move simply happens.
import {reduced} from './motion.ts';

const FLY_MS=220;
const selector=(id:string)=>{const v=CSS.escape(id);return `[data-card="${v}"],[data-flight="${v}"],[data-task="${v}"]`;};
function boxOf(id:string){
  for(const hit of document.querySelectorAll<HTMLElement>(selector(id))){
    const el=hit.closest<HTMLElement>('[data-card],[data-flight],[data-block]')??hit;
    if(el.closest('[hidden],.held,.flight'))continue;
    const r=el.getBoundingClientRect();
    if(r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth)return el;
  }
  return null;
}
// The face of a block as it stands: its fill, edge, corner and title, without its controls.
function face(el:HTMLElement){
  const tile=el.querySelector<HTMLElement>('.tile')??el,css=getComputedStyle(tile);
  return {background:css.backgroundColor,border:css.border,radius:css.borderRadius,color:css.color,
    title:el.querySelector('.ttl')?.textContent??el.textContent?.trim()??''};
}

// A release into the folded dock moves one complete face, including a group, without detaching its tag first.
async function unifiedFlight(ids:string[],move:()=>Promise<boolean>){
  const sources=ids.map(boxOf).filter((el):el is HTMLElement=>!!el),source=sources[0];
  if(!source)return move();
  const start=source.getBoundingClientRect(),look=face(source.querySelector<HTMLElement>('.wbody')??source);
  const ghost=document.createElement('div');
  ghost.className='flight unified';ghost.setAttribute('aria-hidden','true');
  ghost.textContent=look.title+(ids.length>1?` 외 ${ids.length-1}개`:'');
  Object.assign(ghost.style,{left:start.left+'px',top:start.top+'px',width:start.width+'px',height:start.height+'px',background:look.background,border:look.border,borderRadius:look.radius,color:look.color});
  const visibility=sources.map(el=>el.style.visibility);
  document.body.append(ghost);sources.forEach(el=>{el.style.visibility='hidden';});
  try{
    const ok=await move();if(!ok)return false;
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    const target=document.querySelector<HTMLElement>(`.rail-panel.left [data-flight="${CSS.escape(ids[0])}"]`);if(!target)return true;
    const end=target.getBoundingClientRect();
    // Move the face as a unit; only its outer bounds change, with enough travel time to follow across the screen.
    const animation=ghost.animate([
      {left:start.left+'px',top:start.top+'px',width:start.width+'px',height:start.height+'px'},
      {left:end.left+'px',top:end.top+'px',width:end.width+'px',height:end.height+'px'}
    ],{duration:420,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});
    await animation.finished.catch(()=>{});
    return true;
  }finally{ghost.remove();sources.forEach((el,i)=>{el.style.visibility=visibility[i];});}
}

export async function fly(ids:string[],move:()=>Promise<boolean>,{unified=false}:{unified?:boolean}={}):Promise<boolean>{
  if(reduced())return move();
  if(unified)return unifiedFlight(ids,move);
  const from=ids.flatMap(id=>{const el=boxOf(id);return el?[{id,box:el.getBoundingClientRect(),face:face(el)}]:[];});
  const ok=await move();
  if(!ok||!from.length)return ok;
  await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));
  const flights:Promise<unknown>[]=[];
  for(const f of from){
    const to=boxOf(f.id);if(!to)continue;
    const box=to.getBoundingClientRect(),end=face(to);
    if(Math.abs(box.left-f.box.left)<1&&Math.abs(box.top-f.box.top)<1)continue;
    const ghost=document.createElement('div');
    ghost.className='flight';ghost.setAttribute('aria-hidden','true');ghost.textContent=f.face.title;
    Object.assign(ghost.style,{left:f.box.left+'px',top:f.box.top+'px',width:f.box.width+'px',height:f.box.height+'px',background:f.face.background,border:f.face.border,borderRadius:f.face.radius,color:f.face.color});
    document.body.append(ghost);to.style.visibility='hidden';
    const done=()=>{ghost.remove();to.style.visibility='';};
    const animation=ghost.animate([
      {left:f.box.left+'px',top:f.box.top+'px',width:f.box.width+'px',height:f.box.height+'px',background:f.face.background,borderRadius:f.face.radius},
      {left:box.left+'px',top:box.top+'px',width:box.width+'px',height:box.height+'px',background:end.background,borderRadius:end.radius},
    ],{duration:FLY_MS,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
    flights.push(animation.finished.then(done,done));
  }
  await Promise.all(flights);
  return ok;
}
