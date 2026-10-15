import type {DayLayout,Task,WorkingDay} from './types.ts';
import type {TimeAxis} from './time-axis.ts';
import {applyIntent,noIntent,type Intent} from './intent.ts';
import {dayPlan} from './today.ts';
import {insertionBefore} from './flow.ts';
import {placementIssue,resistWorkingBoundary} from './placement.ts';

// Horizontal geometry of a day space. `bodyLeft` is where the rail ends and order space begins.
// A held block bites into the rail once its left edge is pushed `bite` px left of where flow blocks stand, and lets go
// once pulled `pull` px right of where fixed blocks stand: a little easier than biting, and still clear of the bite point
// (fixedLeft+pull > flowLeft-bite), so it never chatters at the edge. Until then the copy gives up to `give` px toward the hand.
// Both distances grow while the hand is moving up or down (see `steadiness`), so reordering never latches by drift.
export type Geometry={ruler:number;railLeft:number;railWidth:number;bodyLeft:number;flowLeft:number;fixedLeft:number;right:number;bite:number;pull:number;give:number};
export const DAY_GEOMETRY:Geometry={ruler:50,railLeft:52,railWidth:30,bodyLeft:86,flowLeft:92,fixedLeft:56,right:10,bite:24,pull:20,give:6};
export const COLUMN_GEOMETRY:Geometry={ruler:0,railLeft:0,railWidth:13,bodyLeft:14,flowLeft:17,fixedLeft:1,right:4,bite:12,pull:10,give:3};
// How far a flow block's runner reaches left from the block to sit in the middle of the rail's groove.
export const runnerReach=(g:Geometry)=>g.flowLeft-(g.railLeft+g.railWidth/2);

// The hollow marks the body slot; the held copy follows the hand until it latches onto a rail tick.
export type Slot={start:number;end:number;over:boolean};
// `near`: how far the block has been pushed toward biting (or, latched, pulled toward letting go), 0–1.
// `entered`: the day whose order the block has come into since it last left a day; only that day's rail can take it.
export type SpaceZone={intent:Intent;entered:string|null;near:number;boundary:boolean;slot?:Slot};
// `grabY`/`grab`: where along its height and width the block was taken (0–1). `prev`: the last intent, for the latch's
// hysteresis. `stretch`: scales both distances, 1 when the hand is still or moving sideways (see `steadiness`).
export type SpaceInput={task:Task;ids:string[];tasks:Task[];layouts:DayLayout[];date:string;rule:WorkingDay;axis:TimeAxis;geometry:Geometry;
  rect:{left:number;top:number;width:number};px:number;py:number;grabY:number;grab:number;prev:Intent;stretch:number;entered:string|null};

const unit=(n:number)=>Math.max(0,Math.min(1,n));

// Where a block held over a day space would land: fixed on the rail, or into the day's order.
export function spaceZone(a:SpaceInput):SpaceZone{
  const {task,ids,tasks,layouts,date,rule,axis,geometry:g,rect:r,px,py,grabY,grab,prev}=a;
  const intent:Intent={...noIntent(task.id),ids};
  const duration=ids.reduce((n,id)=>n+(tasks.find(t=>t.id===id)?.duration??0),0);
  const topIn=py-r.top-grabY*Math.max(10,duration*axis.scale-2);
  // A fixed block starts latched on its own day; anything latched keeps the wider fixed shape while it is measured.
  const was=prev.zone==='rail'?prev.date===date:prev.zone==='none'&&task.starts_at?.slice(0,10)===date;
  const edge=px-r.left-grab*(r.width-(was?g.fixedLeft:g.flowLeft)-g.right);
  // The teeth face the rail: a block coming in over it passes by. Only one that has come into this day's order, or
  // sits latched here, can be pushed back into it — so a fixed block carried to another day lets go until pushed again.
  const entered=was||edge>=g.flowLeft?date:a.entered,ready=entered===date;
  const bite=g.bite*a.stretch,pull=g.pull*a.stretch;
  if(ids.length===1&&ready&&(px-r.left<g.bodyLeft||(was?edge<g.fixedLeft+pull:edge<=g.flowLeft-bite))){
    const raw=Math.max(0,Math.min(1440-task.duration,axis.minute(py-r.top)-grabY*task.duration));
    const from=prev.date===date&&prev.zone==='rail'?prev.start!:dayPlan(date,tasks,rule,layouts).items.find(i=>i.task.id===task.id)?.start??rule.start;
    const resisted=resistWorkingBoundary(from,raw,task.duration,rule,axis.position);
    const minute=Math.round(resisted/15)*15;
    const reason=placementIssue(task.id,date,minute,task.duration,rule,tasks)?.label??null;
    return {intent:{...intent,zone:'rail',date,start:minute,ok:!reason,reason},entered,boundary:resisted!==raw,near:was?unit((edge-g.fixedLeft)/pull):0};
  }
  const rest=dayPlan(date,tasks.filter(t=>!ids.includes(t.id)),rule,layouts);
  const centre=axis.minute(topIn+duration*axis.scale/2),flows=rest.items.filter(i=>!i.fixed);
  const body:Intent={...intent,zone:'body',date,before:insertionBefore(flows,centre),ok:true,reason:null};
  const items=dayPlan(date,applyIntent(tasks,body),rule,layouts).items.filter(i=>ids.includes(i.task.id));
  return {intent:body,entered,boundary:false,near:ready?unit((g.flowLeft-edge)/bite):0,
    slot:items.length?{start:items[0].start,end:items[items.length-1].end,over:items.some(i=>i.over)}:undefined};
}

// Before the first remaining card whose middle is below `centre`, as a list draws its cards top to bottom.
export function listIndex(items:{height:number}[],gap:number,centre:number){
  let top=0;
  for(const [n,item] of items.entries()){if(centre<top+item.height/2)return n;top+=item.height+gap;}
  return items.length;
}

// Recent motion per axis, px per frame, fading over about 120ms (FADE_MS), and where and when the hand last was.
export type Travel={x:number;y:number;px:number;py:number;t:number};
// How much harder biting and letting go are right now. Like a scroll view's directional lock, but soft: the vertical share of
// recent motion (y/(x+y+REST)) takes up to STRETCH× the distance; a pause lets it fade, so a deliberate sideways push still bites.
const STRETCH=3,REST=.6,FADE_MS=120;
export function steadiness(m:Travel,px:number,py:number,t:number){
  const dt=Math.max(1,t-m.t),k=1-Math.exp(-dt/FADE_MS),frame=16/dt;
  m.x+=k*(Math.abs(px-m.px)*frame-m.x);m.y+=k*(Math.abs(py-m.py)*frame-m.y);m.px=px;m.py=py;m.t=t;
  return 1+(STRETCH-1)*m.y/(m.x+m.y+REST);
}
// The hand's recent speed, px per frame, fading out quickly once it stops sending moves: a fast sweep that stops reads
// as still within about 90ms.
export const pace=(m:Travel,t:number)=>(m.x+m.y)*Math.exp(-Math.max(0,t-m.t)/STOP_MS);

// The place the copy is shaped by (`at`, a region key or 'none'), and the one the hand has been crossing toward since `since`.
export type Passage={at?:string;to?:string;since:number};
// A place the hand crosses does not reshape the copy. It takes the place's shape once the hand has stayed SETTLE_MS there
// slower than CALM px per frame (about 190px/s), or SETTLE_MAX_MS at any pace.
const SETTLE_MS=70,SETTLE_MAX_MS=260,CALM=3,STOP_MS=40;
// True once the hand has come to `key`'s place: the place it was shaped by, or one it has stayed in a little while moving
// slowly, or a while longer at any pace. Until then it is passing through, and the caller asks again a frame later.
export function arrive(p:Passage,key:string,t:number,speed:number){
  if(p.at===undefined||p.at===key){p.at=key;p.to=undefined;return true;}
  if(p.to!==key){p.to=key;p.since=t;}
  const stay=t-p.since;
  if(stay>=SETTLE_MAX_MS||stay>=SETTLE_MS&&speed<CALM){p.at=key;p.to=undefined;return true;}
  return false;
}
