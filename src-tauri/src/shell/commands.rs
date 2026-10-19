//! Every command the frontend invokes by name. Signatures are the IPC contract; keep names and arguments stable.
use super::{audited, changed, lock, quit, windows::{hide, show, CAPTURE}, with_store, State, BACKUP_LOCK, STORE_LOCK};
use blokky_core::{db::{managed_backup_path, BackupInspection, ManagedBackup, Store}, maintenance::open_store, model::*, settings};
use std::{fs, sync::MutexGuard};
use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

const UNSAVED_LOCK: &str = "미저장 입력 상태를 확인하지 못했습니다.";

/// Holds the unsaved-input set so no window turns dirty while the caller replaces the database under it.
fn only_caller_unsaved<'a>(s: &'a State, window: &WebviewWindow) -> Result<MutexGuard<'a, blokky_core::unsaved::UnsavedWindows>> {
    let busy=lock(&s.busy,UNSAVED_LOCK)?;
    busy.ensure_only(window.label())?;
    Ok(busy)
}

#[tauri::command]
pub fn load(s: tauri::State<State>) -> Result<Snapshot> {
    let mut guard=lock(&s.store,STORE_LOCK)?;
    if guard.is_err(){*guard=open_store(&settings::db_path(&s.root));}
    match guard.as_ref(){Ok(db)=>db.snapshot(),Err(e)=>Err(e.clone())}
}
#[tauri::command]
pub fn load_draft(s:tauri::State<State>,window:WebviewWindow)->Result<(i64,String)>{with_store(&s,|db|db.draft(window.label()))}
#[tauri::command]
pub fn save_draft(s:tauri::State<State>,window:WebviewWindow,sequence:i64,content:String)->Result<()> {with_store(&s,|db|db.save_draft(window.label(),sequence,&content))}
#[tauri::command]
pub fn acknowledge(s: tauri::State<State>, command: Command) -> Result<Option<Snapshot>> {with_store(&s,|db|db.acknowledge(&command))}
#[tauri::command]
pub fn mutate(s: tauri::State<State>, app: AppHandle, window: WebviewWindow, command: Command) -> Result<Snapshot> {
    changed(&app,&s,"mutation",Some(window.label()),with_store(&s, |db| db.apply(&command)))
}

#[tauri::command]
pub fn create_backup(s: tauri::State<State>) -> Result<ManagedBackup> {
    audited(&s,"manual-backup",with_store(&s, |db| db.create_backup(&s.root)))
}
#[tauri::command]
pub async fn list_backups(s: tauri::State<'_,State>) -> Result<Vec<ManagedBackup>> {
    let root=s.root.clone();
    tauri::async_runtime::spawn_blocking(move || Store::list_backups(&root)).await.map_err(|_|error("internal","백업 목록을 읽지 못했습니다."))?
}
#[tauri::command]
pub async fn inspect_backup(s: tauri::State<'_,State>, id: String) -> Result<BackupInspection> {
    let root=s.root.clone();
    tauri::async_runtime::spawn_blocking(move || Store::inspect_backup(&managed_backup_path(&root,&id)?)).await.map_err(|_|error("internal","백업을 확인하지 못했습니다."))?
}
#[tauri::command]
pub fn restore(s: tauri::State<State>, app: AppHandle, window: WebviewWindow, id: String, epoch: String) -> Result<Snapshot> {
    let result={
        let _busy=only_caller_unsaved(&s,&window)?;
        let _backup=lock(&s.backup,BACKUP_LOCK)?;
        let source=managed_backup_path(&s.root,&id)?;
        let safety = s.root.join("backups").join(format!("before-restore-{}.sqlite", uuid::Uuid::new_v4()));
        fs::create_dir_all(safety.parent().unwrap())?;
        with_store(&s, |db| db.restore(&source,&epoch,&safety))
    };
    changed(&app,&s,"restore",None,result)
}
#[tauri::command]
pub fn recover_backup(s: tauri::State<State>, app: AppHandle, window: WebviewWindow, id: String) -> Result<Snapshot> {
    let result={
        let _busy=only_caller_unsaved(&s,&window)?;
        let _backup=lock(&s.backup,BACKUP_LOCK)?;
        let mut guard=lock(&s.store,STORE_LOCK)?;
        if guard.is_ok() {return Err(error("conflict","정상 저장소는 기록을 다시 불러온 뒤 일반 복원을 사용하세요."));}
        Store::recover_from_backup(&s.root,&id).and_then(|store|{
            let snapshot=store.snapshot()?;*guard=Ok(store);Ok(snapshot)
        })
    };
    changed(&app,&s,"recovery",None,result)
}
#[tauri::command]
pub fn set_dirty(s: tauri::State<State>, window: WebviewWindow, dirty: bool) -> Result<()> {
    lock(&s.busy,UNSAVED_LOCK)?.set(window.label(),dirty); Ok(())
}

#[tauri::command]
pub fn hide_capture(window: WebviewWindow) -> Result<()> {
    if window.label() == CAPTURE { hide(&window.as_ref().window())?; } Ok(())
}
#[tauri::command]
pub fn show_capture(app: AppHandle) { show(&app,CAPTURE); }
#[tauri::command]
pub fn capture_shortcut(s:tauri::State<State>,app:AppHandle,value:Option<String>)->Result<String>{
    let mut current=lock(&s.shortcut,"단축키 설정을 읽지 못했습니다.")?;
    if let Some(value)=value {
        if value==*current{return Ok(current.clone());}
        settings::validate_shortcut(&value)?;
        app.global_shortcut().register(value.as_str()).map_err(|_|error("shortcut","사용 중이거나 지원하지 않는 단축키입니다. 다른 조합을 선택하세요."))?;
        if let Err(e)=settings::save_capture_shortcut(&s.root,&value) {
            let _=app.global_shortcut().unregister(value.as_str());return Err(e.into());
        }
        let _=app.global_shortcut().unregister(current.as_str());*current=value;
    }
    Ok(current.clone())
}
#[tauri::command]
pub fn autostart(app: AppHandle, enabled: Option<bool>) -> Result<bool> {
    let manager=app.autolaunch();
    if let Some(enabled)=enabled {
        (if enabled {manager.enable()} else {manager.disable()}).map_err(|_|error("storage","자동실행 설정을 변경하지 못했습니다."))?;
    }
    manager.is_enabled().map_err(|_|error("storage","자동실행 설정을 읽지 못했습니다."))
}
#[tauri::command]
pub fn exit_on_close(s:tauri::State<State>,enabled:Option<bool>)->Result<bool>{
    let mut current=lock(&s.exit_on_close,"창 닫기 설정을 변경하지 못했습니다.")?;
    let saved=settings::exit_on_close_setting(&s.root,enabled)?;
    *current=saved;
    Ok(saved)
}

#[derive(serde::Serialize)]
pub struct Diagnostics { db_path:String, warning:Option<String>, last_backup:Option<String> }
#[tauri::command]
pub fn diagnostics(s:tauri::State<State>) -> Result<Diagnostics> {
    const READ:&str="진단 정보를 읽지 못했습니다.";
    Ok(Diagnostics {db_path:settings::db_path(&s.root).display().to_string(),warning:lock(&s.warning,READ)?.clone(),last_backup:lock(&s.last_backup,READ)?.clone()})
}
#[tauri::command]
pub fn finish_quit(s:tauri::State<State>,app:AppHandle,window:WebviewWindow,request_id:String,error:Option<String>) -> Result<()> {
    quit::finish(&app,&s,window.label(),&request_id,error)
}
