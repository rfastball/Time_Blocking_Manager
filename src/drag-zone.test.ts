import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DAY_GEOMETRY,arrive,listIndex,pace,spaceZone,steadiness,type Passage,type SpaceInput,type Travel} from './drag-zone.ts';
import {noIntent} from './intent.ts';
import {createTimeAxis} from './time-axis.ts';
import type {Task,WorkingDay} from './types.ts';

const date='2026-10-14',rule:WorkingDay={enabled:true,start:540,end:1080,breaks:[]},axis=createTimeAxis(510,1110,1);
const flow=(id:string,order:number):Task=>({id,title:id,body:'',starts_at:null,duration:60,completed:false,revision:1,plan_date:date,flow_order:order});
const fixed=(id:string,at:string):Task=>({...flow(id,0),starts_at:`${date}T${at}`,flow_order:null});
const tasks=[flow('a',1),flow('b',2),flow('c',3),fixed('f','13:00')],c=tasks[2];
// Held by its top-left corner over a 400px day space; `x` is the hand's distance from the space's left edge.
const over=(x:number,minute:number,extra:Partial<SpaceInput>={}):SpaceInput=>({task:c,ids:[c.id],tasks,layouts:[],date,rule,axis,geometry:DAY_GEOMETRY,
  rect:{left:0,top:0,width:400},px:x,py:axis.position(minute),grabY:0,grab:0,prev:{...noIntent(c.id),ids:[c.id]},stretch:1,entered:null,...extra});
const g=DAY_GEOMETRY;

test('in the day order the block goes before the first flow block whose middle is below its own',()=>{
  const z=spaceZone(over(200,520));
  assert.deepEqual([z.intent.zone,z.intent.before,z.entered],['body','a',date]);
  assert.equal(spaceZone(over(200,560)).intent.before,'b');
  assert.deepEqual(z.slot,{start:540,end:600,over:false},'the hollow shows where it would stand');
});

test('a block coming in over the rail passes by; one that came into the order bites when pushed left',()=>{
  assert.equal(spaceZone(over(60,600)).intent.zone,'body','not yet in this day');
  const z=spaceZone(over(60,600,{entered:date}));
  assert.deepEqual([z.intent.zone,z.intent.start,z.intent.ok],['rail',600,true]);
  // Held by its middle, the block's left edge is 149px left of the hand.
  const edge=(x:number)=>x+149,mid={entered:date,grab:.5};
  assert.equal(spaceZone(over(edge(g.flowLeft-g.bite),600,mid)).intent.zone,'rail','its edge pushed bite px left of the flow edge');
  assert.equal(spaceZone(over(edge(g.flowLeft-g.bite+1),600,mid)).intent.zone,'body');
  assert.equal(spaceZone(over(edge(g.flowLeft-g.bite),600,{...mid,stretch:3})).intent.zone,'body','moving up or down makes biting harder');
});

test('latched, it lets go only once pulled past the pull distance, and a rail time snaps to 15 minutes',()=>{
  const prev={...noIntent(c.id),ids:[c.id],zone:'rail' as const,date,start:600};
  // Latched and held by its middle, the edge is measured from the wider fixed shape: 167px left of the hand.
  assert.equal(spaceZone(over(g.fixedLeft+g.pull-1+167,600,{prev,entered:date,grab:.5})).intent.zone,'rail');
  assert.equal(spaceZone(over(g.fixedLeft+g.pull+167,600,{prev,entered:date,grab:.5})).intent.zone,'body');
  assert.equal(spaceZone(over(60,607,{prev,entered:date})).intent.start,600);
  assert.equal(spaceZone(over(60,608,{prev,entered:date})).intent.start,615);
});

test('a taken time is named on the rail, and a selection never latches',()=>{
  const z=spaceZone(over(60,780,{entered:date}));
  assert.deepEqual([z.intent.zone,z.intent.ok],['rail',false]);assert.ok(z.intent.reason);
  assert.equal(spaceZone(over(60,600,{entered:date,ids:['c','a']})).intent.zone,'body');
});

test('a list index counts the cards whose middles are above the held block',()=>{
  const items=[{height:40},{height:40},{height:40}];
  assert.deepEqual([10,19,21,67,500].map(y=>listIndex(items,8,y)),[0,0,1,1,3]);
  assert.equal(listIndex([],8,10),0);
});

test('a place the hand crosses becomes its own only after a short calm stay or a longer one at any pace',()=>{
  const p:Passage={since:0};
  assert.equal(arrive(p,'a',0,10),true,'the first place is where it was lifted');
  assert.equal(arrive(p,'b',100,1),false);assert.equal(arrive(p,'b',169,1),false);assert.equal(arrive(p,'b',170,1),true);
  assert.equal(arrive(p,'c',200,10),false);assert.equal(arrive(p,'c',459,10),false);assert.equal(arrive(p,'c',460,10),true);
  assert.equal(arrive(p,'c',470,10),true,'staying where it was shaped');
});

test('up-and-down travel stretches the latch distances and a pause lets it fade',()=>{
  const m:Travel={x:0,y:0,px:0,py:0,t:0};
  let s=1;for(let t=16;t<=320;t+=16)s=steadiness(m,0,t,t);
  assert.ok(s>2.5,`vertical travel stretches toward 3 (${s})`);
  const h:Travel={x:0,y:0,px:0,py:0,t:0};
  let w=1;for(let t=16;t<=320;t+=16)w=steadiness(h,t,0,t);
  assert.ok(w<1.1,`sideways travel keeps it near 1 (${w})`);
  assert.ok(pace(m,320)>10&&pace(m,420)<pace(m,320)/5,'a stopped hand reads as still within about 90ms');
});
