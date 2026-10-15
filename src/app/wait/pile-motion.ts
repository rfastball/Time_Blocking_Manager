// The moving parts of a 기다림 pile: how it rests, parts under a resting mouse and opens, as plain numbers for the springs.
export type Mode='rest'|'peek'|'open';
export type CardPose={y:number;scale:number;opacity:number;shadow:number;shade:number;handle:number;slice:number};

// A pile rests as its front block with up to two slivers under it, smaller and deeper in tone. A resting mouse parts the slivers;
// a press drops the blocks into a list on a tray that grows out of the pile's outline. All of it is the same blocks moving
// on springs, so hovering, pressing and leaving can cut into one another. A lifted pile is drawn in a layer over the page.
export const SHOW=2,SLIVER=6,ROW=38,HEAD=30,CARD=32,SLICE=30;
export const SPRING:Record<Mode,{stiffness:number;damping:number}>={open:{stiffness:182,damping:22.7},peek:{stiffness:324,damping:32.4},rest:{stiffness:289,damping:32.3}};
export const RANK:Record<Mode,number>={rest:0,peek:1,open:2};
export const restHeight=(n:number,ready:boolean)=>HEAD+(ready?3:1)+CARD+Math.ceil(4.4*Math.min(n-1,SHOW));
// Shadow grows with height above the page, in the theme's ink. The springs need a plain rgba, so the ink is read once per theme.
let inkTheme:string|null=null,ink='27,30,35';
function themeInk(){
  const theme=document.documentElement.dataset.theme??'';
  if(theme!==inkTheme){
    inkTheme=theme;
    const m=getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    const hex=m?(m[1].length===3?[...m[1]].map(c=>c+c).join(''):m[1]):'1b1e23';
    ink=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)).join(',');
  }
  return ink;
}
export function lift(L:number){const e=Math.sqrt(Math.max(0,Math.min(1,L))),f=(v:number)=>(v*e).toFixed(2),c=themeInk();return `0 ${f(12)}px ${f(24)}px rgba(${c},${f(.2)}), 0 ${f(3)}px ${f(7)}px rgba(${c},${f(.13)})`;}
export function pose(n:number,mode:Mode,ready:boolean,width:number,top:number){
  const base=HEAD+(ready?3:1),step=mode==='peek'?10:SLIVER,sk=mode==='peek'?.04:.05;
  const cards=Array.from({length:n},(_,i)=>{const k=Math.min(i,SHOW);return {y:base+step*k,scale:1-sk*k,opacity:i>SHOW?0:1,shadow:mode==='peek'&&i===0?.3:0,shade:k===0?0:k===1?.55:1,handle:0,slice:0};});
  const head={y:0,shadow:mode==='peek'?.3:0};
  let tray={x:-6,y:-6,width:width+12,height:base+CARD+21,opacity:0,shadow:0},fold={y:base+42,opacity:0};
  if(mode==='open'){
    cards.forEach((c,i)=>Object.assign(c,{y:base+i*ROW,scale:1,opacity:1,shadow:0,shade:0,handle:1,slice:SLICE}));
    const end=base+n*ROW-6;
    fold={y:end+8,opacity:1};tray={x:-8,y:-8,width:width+16,height:end+38,opacity:1,shadow:1};
    // A pile low on the screen lifts as a whole until its tray fits.
    const over=top+tray.y+tray.height-(innerHeight-12);
    if(over>0){head.y-=over;tray.y-=over;fold.y-=over;cards.forEach(c=>{c.y-=over;});}
  }
  return {head,cards,tray,fold};
}
