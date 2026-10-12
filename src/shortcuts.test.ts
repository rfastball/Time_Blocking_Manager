import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shortcut,type KeyContext,type KeyLike} from './shortcuts.ts';

const key=(code:string,extra:Partial<KeyLike>={}):KeyLike=>({code,key:code.replace(/^Key/,'').toLowerCase(),ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,isComposing:false,keyCode:65,defaultPrevented:false,repeat:false,...extra});
const work:KeyContext={screen:'plan',typing:false,blocked:false,editing:false};
const focus:KeyContext={...work,screen:'today'};

test('on the work screen single keys move the range, the dock and the screen',()=>{
  assert.deepEqual(shortcut(key('KeyD'),work),{type:'period',period:'day'});
  assert.deepEqual(shortcut(key('KeyW'),work),{type:'period',period:'week'});
  assert.deepEqual(shortcut(key('Digit2'),work),{type:'period',period:'two'});
  assert.deepEqual(shortcut(key('KeyM'),work),{type:'period',period:'month'});
  assert.deepEqual(shortcut(key('KeyT'),work),{type:'today'});
  assert.deepEqual(shortcut(key('BracketLeft'),work),{type:'fold'});
  assert.deepEqual(shortcut(key('BracketRight'),work),{type:'widen'});
  assert.deepEqual(shortcut(key('KeyF'),work),{type:'focus'});
  assert.equal(shortcut(key('Escape'),work),null,'Esc on the work screen is left to whatever is focused');
  assert.equal(shortcut(key('KeyA'),work),null);
});

test('on the focus screen only its own keys answer, and Esc returns unless the side editor has it',()=>{
  assert.deepEqual(shortcut(key('KeyF'),focus),{type:'work'});
  assert.deepEqual(shortcut(key('Escape'),focus),{type:'work'});
  assert.equal(shortcut(key('Escape'),{...focus,editing:true}),null);
  assert.deepEqual(shortcut(key('KeyA'),focus),{type:'capture'});
  assert.deepEqual(shortcut(key('KeyT'),focus),{type:'today'});
  for(const code of ['KeyD','KeyW','Digit2','KeyM','BracketLeft','BracketRight'])assert.equal(shortcut(key(code),focus),null,code+' has no dock or range here');
});

test('settings take only the screen keys',()=>{
  const settings:KeyContext={...work,screen:'settings'};
  assert.deepEqual(shortcut(key('KeyF'),settings),{type:'focus'});
  assert.deepEqual(shortcut(key('Slash',{shiftKey:true,key:'?'}),settings),{type:'keys'});
  for(const code of ['KeyT','KeyD','BracketLeft','Escape'])assert.equal(shortcut(key(code),settings),null,code);
});

test('the physical key decides, so a Korean layout or Caps Lock means the same',()=>{
  assert.deepEqual(shortcut(key('KeyT',{key:'ㅅ'}),work),{type:'today'});
  assert.deepEqual(shortcut(key('KeyW',{key:'W'}),work),{type:'period',period:'week'});
  assert.deepEqual(shortcut(key('Slash',{shiftKey:true,key:'?'}),work),{type:'keys'});
  assert.equal(shortcut(key('KeyT',{shiftKey:true,key:'T'}),work),null,'Shift with a letter is not the letter');
});

test('a key someone nearer has, a chord, a held key or an unfinished syllable is never taken',()=>{
  for(const extra of [{defaultPrevented:true},{ctrlKey:true},{metaKey:true},{altKey:true},{repeat:true},{isComposing:true},{keyCode:229}])
    assert.equal(shortcut(key('KeyT',extra),work),null,JSON.stringify(extra));
  assert.equal(shortcut(key('KeyT'),{...work,typing:true}),null,'typing in a field');
  assert.equal(shortcut(key('Escape'),{...focus,typing:true}),null,'Esc in the capture field is the field’s');
  assert.equal(shortcut(key('KeyF'),{...work,blocked:true}),null,'a dialog, menu or search owns the keyboard');
  assert.equal(shortcut(key('Escape'),{...focus,blocked:true}),null);
});
