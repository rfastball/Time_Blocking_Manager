import {motion} from 'motion/react';

const paths:Record<string,string>={
  today:'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4M8 13h4v3H8z',
  plan:'M3 5h18v15H3zM3 10h18M9 10v10M15 10v10',
  inbox:'M4 13l2.5-7h11L20 13v6H4zM4 13h5l1 2h4l1-2h5',
  settings:'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1',
  left:'M15 6l-6 6 6 6',right:'M9 6l6 6-6 6',close:'M6 6l12 12M18 6L6 18',plus:'M12 5v14M5 12h14',
  delete:'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5',
  check:'M5 12.5l4.5 4.5L19 7.5',undo:'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  reflow:'M4 12a8 8 0 0 1 13.7-5.7L20 8.6M20 4v4.6h-4.6M20 12a8 8 0 0 1-13.7 5.7L4 15.4M4 20v-4.6h4.6',
  up:'M12 19V5M6 11l6-6 6 6',search:'M16 16l4.5 4.5M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z',down:'M12 5v14M6 13l6 6 6-6',more:'M5 12h.01M12 12h.01M19 12h.01',
  focus:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  fold:'M11 6l-6 6 6 6M18 6l-6 6 6 6',
};
export function Icon({name,size=18,stroke=1.8}:{name:keyof typeof paths|string;size?:number;stroke?:number}){
  return <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[name]}/>{name==='settings'&&<circle cx="12" cy="12" r="3"/>}
  </svg>;
}
// The latch's shackle lifts when open; it drops shut with a small bounce.
export function Lock({open=false,size=15}:{open?:boolean;size?:number}){
  return <svg className="ic lock" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true" style={{overflow:'visible'}}>
    <rect x="5" y="11" width="14" height="9" rx="2"/>
    <motion.path d="M8 11V8a4 4 0 0 1 8 0v3" style={{transformBox:'fill-box',transformOrigin:'100% 100%'}} animate={open?{x:1,y:-3,rotate:28}:{x:0,y:0,rotate:0}} transition={{type:'spring',visualDuration:.2,bounce:.5}}/>
  </svg>;
}
export const Dots=()=><svg className="dots" viewBox="0 0 12 20" fill="currentColor" aria-hidden="true"><path d="M3 4h2v2H3zm4 0h2v2H7zM3 9h2v2H3zm4 0h2v2H7zM3 14h2v2H3zm4 0h2v2H7z"/></svg>;
export function Logo(){
  return <svg className="logo" viewBox="0 0 64 64" aria-hidden="true"><rect x="14" y="14" width="12" height="36" rx="3"/><rect x="32" y="14" width="18" height="14" rx="3"/><rect x="32" y="34" width="12" height="16" rx="3"/></svg>;
}
