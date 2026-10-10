export const themes = [
  {id:'default', name:'기본'},
  {id:'g1', name:'종이 플래너'},
  {id:'g3', name:'톤 레이어'},
  {id:'g4', name:'사무 장부'},
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
