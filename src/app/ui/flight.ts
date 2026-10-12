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

export async function fly(ids:string[],move:()=>Promise<boolean>):Promise<boolean>{
  if(reduced())return move();
  const from=ids.flatMap(id=>{const el=boxOf(id);return el?[{id,box:el.getBoundingClientRect(),face:face(el)}]:[];});
  const ok=await move();
  if(!ok||!from.length)return ok;
  await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));
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
    animation.finished.then(done,done);
  }
  return ok;
}
