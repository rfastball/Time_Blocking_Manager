// Foundation placeholder for area B: the one-date working-time editor opened by ui.availability.
import {setUi,useApp} from '../store/state.ts';

export function AvailabilityPopover(){
  const {ui}=useApp(),a=ui.availability;
  if(!a)return null;
  return <div role="dialog" aria-label={a.date+' 근무시간 조정'} className="card" style={{position:'fixed',left:a.x,top:a.y,zIndex:50}}>
    <p>{a.date}</p><button type="button" className="btn" onClick={()=>setUi({availability:null})}>닫기</button>
  </div>;
}
