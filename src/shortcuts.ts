// Single-key shortcuts of the main window. Pure: the shell reads the key and the screen, this decides what the key means.
export type Screen='today'|'plan'|'settings';
export type Range='day'|'week'|'two'|'month';
export type Shortcut=
  |{type:'today'}
  |{type:'period';period:Range}
  |{type:'fold'}|{type:'widen'}
  |{type:'focus'}|{type:'work'}
  |{type:'keys'}|{type:'capture'};
export type KeyLike={code:string;key:string;ctrlKey:boolean;metaKey:boolean;altKey:boolean;shiftKey:boolean;isComposing:boolean;keyCode:number;defaultPrevented:boolean;repeat:boolean};
export type KeyContext={
  screen:Screen;
  // Focus is in a text field, a select or the shortcut recorder: every key is the field's.
  typing:boolean;
  // A dialog, menu, popover, search, drag or the dialog editor owns the keyboard.
  blocked:boolean;
  // The focus screen's side editor is open; Esc belongs to it.
  editing:boolean;
  // Single-character keys are on (a device preference, WCAG 2.1.4). Off, only Esc still answers.
  single:boolean;
};

// The key's place on the keyboard, so a Korean layout (ㅅ for T) or Caps Lock means the same key.
const periods:Record<string,Range>={KeyD:'day',KeyW:'week',Digit2:'two',KeyM:'month'};

export function shortcut(e:KeyLike,c:KeyContext):Shortcut|null{
  // Something nearer the focus already answered, or the key is part of a chord or of an unfinished Hangul syllable.
  if(e.defaultPrevented||e.isComposing||e.keyCode===229||e.ctrlKey||e.metaKey||e.altKey||e.repeat||c.blocked)return null;
  if(e.code==='Escape')return !c.typing&&(c.screen==='today'&&!c.editing||c.screen==='settings')?{type:'work'}:null;
  if(c.typing||!c.single)return null;
  if(e.shiftKey)return e.code==='Slash'||e.key==='?'?{type:'keys'}:null;
  if(e.code==='KeyF')return c.screen==='today'?{type:'work'}:{type:'focus'};
  if(c.screen==='settings')return null;
  if(e.code==='KeyT')return {type:'today'};
  if(c.screen==='today')return e.code==='KeyA'?{type:'capture'}:null;
  if(periods[e.code])return {type:'period',period:periods[e.code]};
  if(e.code==='BracketLeft')return {type:'fold'};
  if(e.code==='BracketRight')return {type:'widen'};
  return null;
}

// The list the ? key opens, in the order a person meets them.
export const shortcutList:{keys:string;label:string;where:string}[]=[
  {keys:'Ctrl K',label:'검색',where:'어디서나'},
  {keys:'F',label:'몰입 ↔ 작업 화면',where:'작업 화면 · 몰입 · 설정'},
  {keys:'T',label:'오늘로',where:'작업 화면 · 몰입'},
  {keys:'D · W · 2 · M',label:'일 · 주 · 2주 · 월',where:'작업 화면'},
  {keys:'[',label:'준비 접기 · 펴기',where:'작업 화면'},
  {keys:']',label:'준비 넓히기 · 좁히기',where:'작업 화면'},
  {keys:'A',label:'담기 칸으로',where:'몰입'},
  {keys:'Esc',label:'작업 화면으로',where:'몰입 · 설정'},
  {keys:'?',label:'이 목록',where:'어디서나'},
];
