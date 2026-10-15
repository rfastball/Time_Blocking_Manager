// Focus moves after the change it follows has rendered: on the next frame, to the first target that is on the page.
// A target is an element, a selector (looked up in `root`, the document by default) or a function that finds one.
// `scroll`: let the browser bring it into view; by default the page stays where it is.
type Target=string|HTMLElement|null|undefined|(()=>HTMLElement|null|undefined);
export function focusLater(targets:Target|Target[],{scroll=false,root}:{scroll?:boolean;root?:ParentNode|null}={}){
  return requestAnimationFrame(()=>{
    for(const t of [targets].flat()){
      const el=typeof t==='string'?(root??document).querySelector<HTMLElement>(t):typeof t==='function'?t():t;
      if(el?.isConnected){el.focus({preventScroll:!scroll});return;}
    }
  });
}
// The element that carries a task: its block button, card or row.
export const taskSelector=(id:string)=>`[data-task="${CSS.escape(id)}"]`;
