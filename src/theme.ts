export const themes = [
  {id:'default', name:'기본'},
  {id:'g1', name:'G1 · 종이 플래너'},
  {id:'g3', name:'G3 · 톤 레이어'},
  {id:'g4', name:'G4 · 사무 장부'},
] as const;
export type Theme = typeof themes[number]['id'];
export const themeStorageKey = 'blokky.appearance.theme';

export function resolveTheme(value:unknown):Theme {
  return themes.find(theme=>theme.id===value)?.id??'default';
}

// Appearance is a device preference, independent of work-data backups and drafts.
export function readTheme(storage:Pick<Storage,'getItem'>):Theme {
  try{return resolveTheme(storage.getItem(themeStorageKey));}
  catch{return 'default';}
}

export function saveTheme(storage:Pick<Storage,'setItem'>,value:unknown):Theme {
  const theme=resolveTheme(value);
  storage.setItem(themeStorageKey,theme);
  return theme;
}

export function themePickerHTML(theme:Theme){
  return `<fieldset class="theme-picker"><legend>화면 테마</legend><div class="theme-options">${themes.map(t=>`<label class="theme-option" title="${t.name}"><input type="radio" name="theme" aria-label="${t.name}" value="${t.id}" ${theme===t.id?'checked':''}><span class="theme-preview" data-theme="${t.id}" aria-hidden="true"><span class="theme-preview-rail"></span><span class="theme-preview-page"><strong>오늘</strong><span class="theme-preview-block">할 일</span><span class="theme-preview-line"></span></span></span></label>`).join('')}</div><p id="theme-result" role="status"></p></fieldset>`;
}
