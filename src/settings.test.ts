import {test} from 'node:test';
import assert from 'node:assert/strict';
import {effectiveDay,weekCapacity,shortcutFromKey} from './settings.ts';
import type {Settings} from './types.ts';
import {readTheme,saveTheme,resolveTheme,themeStorageKey} from './theme.ts';
import {changeAvailabilityBand,addAvailabilityBreak} from './availability-band.ts';

test('appearance survives reload, rejects unknown themes and exposes storage failure',()=>{
  const values=new Map<string,string>();
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  assert.equal(readTheme(storage),'default');
  for(const theme of ['g1','g3','g4','default']){
    assert.equal(saveTheme(storage,theme),theme);
    assert.equal(readTheme({...storage}),theme);
  }
  values.set(themeStorageKey,'g2');
  assert.equal(readTheme(storage),'default');
  assert.equal(resolveTheme(null),'default');
  assert.equal(readTheme({getItem:()=>{throw Error('denied');}}),'default');
  assert.throws(()=>saveTheme({setItem:()=>{throw Error('full');}},'g1'),/full/);
});

const settings:Settings={revision:1,weekly_target:2400,work_days:5,days:Array.from({length:7},(_,i)=>({enabled:i<5,start:540,end:1080,breaks:[{start:720,end:780,label:'점심'}]}))};
test('shortcut recording includes the key even when native events omit code',()=>{
  const modifiers={ctrlKey:true,altKey:true,shiftKey:false};
  assert.equal(shortcutFromKey({...modifiers,key:'k',code:''}),'Ctrl+Alt+K');
  assert.equal(shortcutFromKey({...modifiers,key:'ㅏ',code:'KeyK'}),'Ctrl+Alt+K');
  assert.equal(shortcutFromKey({...modifiers,key:'Alt',code:'AltLeft'}),null);
  assert.equal(shortcutFromKey({...modifiers,ctrlKey:false,altKey:false,key:'k',code:'KeyK'}),null);
});
test('a lunch exception changes only its date and reset restores the weekly rule',()=>{
  const modified:Settings={...settings,exceptions:[{date:'2026-10-08',kind:'custom',day:{...settings.days[3],breaks:[]}}]};
  assert.equal(effectiveDay(modified,'2026-10-08').breaks.length,0);
  assert.equal(effectiveDay(modified,'2026-10-15').breaks.length,1);
  assert.equal(effectiveDay({...modified,exceptions:[]},'2026-10-08').breaks.length,1);
});

test('weekly capacity subtracts breaks and supports leave, early finish and year boundaries',()=>{
  assert.deepEqual(weekCapacity(settings,'2027-01-01'),{minutes:2400,days:5});
  const modified:Settings={...settings,exceptions:[{date:'2026-12-31',kind:'leave',day:{...settings.days[3],enabled:false}},{date:'2027-01-01',kind:'early',day:{...settings.days[4],end:900}}]};
  assert.deepEqual(weekCapacity(modified,'2027-01-01'),{minutes:1740,days:4});
  assert.deepEqual(weekCapacity(modified,'2027-01-04'),{minutes:2400,days:5});
});

test('availability work bands snap, move their breaks, and retain them at shrinking boundaries',()=>{
  const day=settings.days[0],moved=changeAvailabilityBand(day,'work','move',596);
  assert.deepEqual([moved.start,moved.end,moved.breaks[0].start,moved.breaks[0].end],[600,1140,780,840]);
  assert.deepEqual(changeAvailabilityBand(day,'work','move',1430),{...day,start:900,end:1440,breaks:[{start:1080,end:1140,label:'점심'}]});
  assert.equal(changeAvailabilityBand(day,'work','start',800).start,720);
  assert.equal(changeAvailabilityBand(day,'work','end',700).end,780);
  assert.deepEqual(day,settings.days[1]);
});

test('availability break gestures grow actual work and refuse overlapping breaks without mutation',()=>{
  const day=settings.days[0],earlier=changeAvailabilityBand(day,0,'move',480);
  assert.deepEqual([earlier.start,earlier.end,earlier.breaks[0].start,earlier.breaks[0].end],[480,1080,480,540]);
  const later=addAvailabilityBreak(day,1100,1160);
  assert.deepEqual([later.end,later.breaks[1].start,later.breaks[1].end],[1155,1095,1155]);
  assert.throws(()=>addAvailabilityBreak(day,735,765),/겹칩니다/);
  assert.throws(()=>changeAvailabilityBand(later,1,'move',750),/겹칩니다/);
  assert.equal(day.breaks.length,1);
  assert.equal(changeAvailabilityBand({...day,enabled:false},'work','draw',600,900).enabled,true);
});
