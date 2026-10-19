//! Desktop shell: the state commands share, and the setup that wires windows, tray and upkeep around the store.
pub mod commands;
mod maintenance;
pub mod quit;
mod tray;
pub mod windows;

use blokky_core::{audit, db::Store, maintenance::open_store, model::*, quit::QuitCoordinator, settings, unsaved::UnsavedWindows};
use std::{fs, io::Write, path::PathBuf, sync::{Mutex, MutexGuard}};
use tauri::{Emitter, Manager};

pub const DATA_CHANGED: &str = "data-changed";
pub const BACKUP_WARNING: &str = "backup-warning";
const STORE_LOCK: &str = "저장소 잠금을 얻지 못했습니다.";

pub struct State {
    store: Mutex<Result<Store>>,
    busy: Mutex<UnsavedWindows>,
    root: PathBuf,
    warning: Mutex<Option<String>>,
    last_backup: Mutex<Option<String>>,
    shortcut: Mutex<String>,
    exit_on_close: Mutex<bool>,
    quit: Mutex<QuitCoordinator>,
}

/// Commands report a poisoned lock as an internal error; event and thread paths skip their work instead.
fn lock<'a, T>(m: &'a Mutex<T>, message: &str) -> Result<MutexGuard<'a, T>> { m.lock().map_err(|_|error("internal",message)) }
fn with_store<T>(s: &State, f: impl FnOnce(&mut Store) -> Result<T>) -> Result<T> {
    let mut guard = lock(&s.store, STORE_LOCK)?;
    match guard.as_mut() { Ok(store) => f(store), Err(e) => Err(e.clone()) }
}
/// Logs how a store operation ended and passes its result through.
fn audited<T>(s: &State, event: &str, result: Result<T>) -> Result<T> { audit::record(&s.root, event, audit::outcome(&result)); result }
/// The origin already receives the mutation snapshot; other changes refresh every window.
fn changed<T>(app: &tauri::AppHandle, s: &State, event: &str, origin: Option<&str>, result: Result<T>) -> Result<T> {
    let result = audited(s, event, result);
    if result.is_ok() { let _ = app.emit(DATA_CHANGED, origin); }
    result
}
fn set_warning(s: &State, message: String) { if let Ok(mut warning)=s.warning.lock() { *warning=Some(message); } }

pub fn setup(app: &mut tauri::App) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let root=if cfg!(debug_assertions) {std::env::var_os("BLOKKY_TEST_DATA_DIR").map(PathBuf::from).unwrap_or(app.path().app_local_data_dir()?)} else {app.path().app_local_data_dir()?}; fs::create_dir_all(&root)?;
    let db=settings::db_path(&root);
    let store=open_store(&db);
    let shortcut=settings::capture_shortcut(&root);
    let close=settings::exit_on_close_setting(&root,None).unwrap_or(false);
    if let Ok(mut f)=audit::open(&root) {
        let _=writeln!(f,"startup app={} exe={} db={}",env!("CARGO_PKG_VERSION"),std::env::current_exe()?.display(),db.display());
    }
    app.manage(State {store:Mutex::new(store),busy:Mutex::new(UnsavedWindows::default()),root,warning:Mutex::new(None),last_backup:Mutex::new(None),shortcut:Mutex::new(shortcut.clone()),exit_on_close:Mutex::new(close),quit:Mutex::new(QuitCoordinator::default())});
    windows::create(app,&shortcut)?;
    tray::build(app)?;
    windows::hide_on_autostart(app)?;
    maintenance::spawn(app.handle().clone());
    Ok(())
}
