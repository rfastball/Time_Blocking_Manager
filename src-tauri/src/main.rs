#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use blokky_core::{db::{managed_backup_path, BackupInspection, ManagedBackup, Store}, model::*};
use std::{collections::HashSet, fs::{self, OpenOptions}, io::Write, path::{Path,PathBuf}, sync::Mutex};
use tauri::{Emitter, Manager};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, ShortcutState};

struct State {
    store: Mutex<Result<Store>>,
    busy: Mutex<HashSet<String>>,
    root: PathBuf,
    warning: Mutex<Option<String>>,
    last_backup: Mutex<Option<String>>,
    shortcut: Mutex<String>,
    exit_on_close: Mutex<bool>,
    quit: Mutex<QuitCoordinator>,
}

#[derive(Default)]
struct QuitCoordinator {
    request_id: Option<String>,
    pending: HashSet<String>,
}
#[derive(Debug, PartialEq)]
enum QuitProgress { Ignore, Waiting, Exit, Cancel }
impl QuitCoordinator {
    fn begin(&mut self, request_id: String, windows: impl Iterator<Item=String>) -> bool {
        if self.request_id.is_some() { return false; }
        self.request_id=Some(request_id);
        self.pending=windows.collect();
        true
    }
    fn finish(&mut self, request_id: &str, window: &str, success: bool) -> QuitProgress {
        if self.request_id.as_deref()!=Some(request_id) || !self.pending.remove(window) {
            return QuitProgress::Ignore;
        }
        if !success {
            self.request_id=None;
            self.pending.clear();
            QuitProgress::Cancel
        } else if self.pending.is_empty() {
            // Keep the token until exit so another close cannot start a second request.
            QuitProgress::Exit
        } else { QuitProgress::Waiting }
    }
}
fn audit(s: &State, event: &str, code: &str) {
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(s.root.join("blokky.log")) {
        let _ = writeln!(f, "{} app={} schema=7 event={} code={}", chrono::Local::now().to_rfc3339(), env!("CARGO_PKG_VERSION"), event, code);
    }
}
// Trash and receipts expire on open and the existing hourly pass; failed cleanup waits for the next pass.
fn open_store(path: &Path) -> Result<Store> {
    let mut store=Store::open(path)?;let now=chrono::Utc::now();
    let _=store.purge_trash(now);let _=store.purge_receipts(now.timestamp_millis());Ok(store)
}
fn with_store<T>(s: &State, f: impl FnOnce(&mut Store) -> Result<T>) -> Result<T> {
    let mut guard = s.store.lock().map_err(|_| error("internal", "저장소 잠금을 얻지 못했습니다."))?;
    match guard.as_mut() { Ok(store) => f(store), Err(e) => Err(e.clone()) }
}
#[tauri::command]
fn load(s: tauri::State<State>) -> Result<Snapshot> {
    let mut guard=s.store.lock().map_err(|_|error("internal","저장소 잠금을 얻지 못했습니다."))?;
    if guard.is_err(){*guard=open_store(&s.root.join("blokky.sqlite"));}
    match guard.as_ref(){Ok(db)=>db.snapshot(),Err(e)=>Err(e.clone())}
}
#[tauri::command]
fn load_draft(s:tauri::State<State>,window:tauri::WebviewWindow)->Result<(i64,String)>{with_store(&s,|db|db.draft(window.label()))}
#[tauri::command]
fn save_draft(s:tauri::State<State>,window:tauri::WebviewWindow,sequence:i64,content:String)->Result<()> {with_store(&s,|db|db.save_draft(window.label(),sequence,&content))}

#[tauri::command]
fn mutate(s: tauri::State<State>, app: tauri::AppHandle, command: Command) -> Result<Snapshot> {
    let result = with_store(&s, |db| db.apply(&command));
    audit(&s, "mutation", result.as_ref().err().map_or("ok", |e| e.code.as_str()));
    if result.is_ok() { let _ = app.emit("data-changed", ()); }
    result
}

#[tauri::command]
fn create_backup(s: tauri::State<State>) -> Result<ManagedBackup> {
    let result=with_store(&s, |db| db.create_backup(&s.root));
    audit(&s,"manual-backup",result.as_ref().err().map_or("ok",|e|e.code.as_str())); result
}
#[tauri::command]
async fn list_backups(s: tauri::State<'_,State>) -> Result<Vec<ManagedBackup>> {
    let root=s.root.clone();
    tauri::async_runtime::spawn_blocking(move || Store::list_backups(&root)).await.map_err(|_|error("internal","백업 목록을 읽지 못했습니다."))?
}
#[tauri::command]
async fn inspect_backup(s: tauri::State<'_,State>, id: String) -> Result<BackupInspection> {
    let root=s.root.clone();
    tauri::async_runtime::spawn_blocking(move || Store::inspect_backup(&managed_backup_path(&root,&id)?)).await.map_err(|_|error("internal","백업을 확인하지 못했습니다."))?
}
#[tauri::command]
fn restore(s: tauri::State<State>, app: tauri::AppHandle, window: tauri::WebviewWindow, id: String, epoch: String) -> Result<Snapshot> {
    let busy=s.busy.lock().map_err(|_|error("internal","미저장 입력 상태를 확인하지 못했습니다."))?;
    // The caller's restore queue marks it busy; persisted drafts remain guarded by Store::restore.
    if busy.iter().any(|label|label!=window.label()) { return Err(error("pending", "다른 창의 미저장 입력을 먼저 저장하세요.")); }
    let source=managed_backup_path(&s.root,&id)?;
    let safety = s.root.join("backups").join(format!("before-restore-{}.sqlite", uuid::Uuid::new_v4()));
    fs::create_dir_all(safety.parent().unwrap())?;
    let result=with_store(&s, |db| db.restore(&source,&epoch,&safety));
    drop(busy);
    audit(&s,"restore",result.as_ref().err().map_or("ok",|e|e.code.as_str()));
    if result.is_ok(){ let _=app.emit("data-changed",()); } result
}
#[tauri::command]
fn recover_backup(s: tauri::State<State>, app: tauri::AppHandle, window: tauri::WebviewWindow, id: String) -> Result<Snapshot> {
    let busy=s.busy.lock().map_err(|_|error("internal","미저장 입력 상태를 확인하지 못했습니다."))?;
    if busy.iter().any(|label|label!=window.label()) {return Err(error("pending","다른 창의 미저장 입력을 먼저 저장하세요."));}
    let mut guard=s.store.lock().map_err(|_|error("internal","저장소 잠금을 얻지 못했습니다."))?;
    if guard.is_ok() {return Err(error("conflict","정상 저장소는 기록을 다시 불러온 뒤 일반 복원을 사용하세요."));}
    let result=Store::recover_from_backup(&s.root,&id).and_then(|store|{
        let snapshot=store.snapshot()?;*guard=Ok(store);Ok(snapshot)
    });
    drop(guard);drop(busy);
    audit(&s,"recovery",result.as_ref().err().map_or("ok",|e|e.code.as_str()));
    if result.is_ok(){let _=app.emit("data-changed",());}result
}
#[tauri::command]
fn set_dirty(s: tauri::State<State>, window: tauri::WebviewWindow, dirty: bool) {
    let mut busy=s.busy.lock().unwrap();
    if dirty { busy.insert(window.label().into()); } else { busy.remove(window.label()); }
}
#[tauri::command]
fn hide_capture(window: tauri::WebviewWindow) -> Result<()> {
    if window.label() == "capture" { hide(&window.as_ref().window())?; } Ok(())
}
fn hide(window: &tauri::Window) -> Result<()> {
    if window.label()=="capture" && window.app_handle().global_shortcut().is_registered("Escape") {
        window.app_handle().global_shortcut().unregister("Escape").map_err(|_|error("shortcut","캡처 닫기 단축키를 해제하지 못했습니다. 다시 닫아 주세요."))?;
    }
    window.hide().map_err(|_|error("window","창을 숨길 수 없습니다."))
}
fn show(app: &tauri::AppHandle, label: &str) {
    if let Some(w)=app.get_webview_window(label){
        if w.show().is_err(){return;}
        if label=="capture" && !app.global_shortcut().is_registered("Escape") && app.global_shortcut().register("Escape").is_err() {
            *app.state::<State>().warning.lock().unwrap()=Some("캡처 Esc 단축키를 등록하지 못했습니다. 캡처 창 안에서 Esc를 누르거나 닫기 버튼을 이용하세요.".into());
            let _=app.emit("backup-warning",());
        }
        let _=w.unminimize();let _=w.set_focus();let _=w.emit("window-shown",());
    }
}
#[tauri::command]
fn show_capture(app: tauri::AppHandle) { show(&app,"capture"); }
#[tauri::command]
fn capture_shortcut(s:tauri::State<State>,app:tauri::AppHandle,value:Option<String>)->Result<String>{
    let mut current=s.shortcut.lock().map_err(|_|error("internal","단축키 설정을 읽지 못했습니다."))?;
    if let Some(value)=value {
        if value==*current{return Ok(current.clone());}
        if value.len()>100||!value.split('+').any(|v|matches!(v,"Ctrl"|"Alt"|"Control")) {
            return Err(error("validation","Ctrl 또는 Alt를 포함한 단축키를 지정하세요."));
        }
        app.global_shortcut().register(value.as_str()).map_err(|_|error("shortcut","사용 중이거나 지원하지 않는 단축키입니다. 다른 조합을 선택하세요."))?;
        if let Err(e)=fs::write(s.root.join("capture-shortcut.txt"),&value) {
            let _=app.global_shortcut().unregister(value.as_str());return Err(e.into());
        }
        let _=app.global_shortcut().unregister(current.as_str());*current=value;
    }
    Ok(current.clone())
}
#[tauri::command]
fn autostart(app: tauri::AppHandle, enabled: Option<bool>) -> Result<bool> {
    let manager=app.autolaunch();
    if let Some(enabled)=enabled {
        (if enabled {manager.enable()} else {manager.disable()}).map_err(|_|error("storage","자동실행 설정을 변경하지 못했습니다."))?;
    }
    manager.is_enabled().map_err(|_|error("storage","자동실행 설정을 읽지 못했습니다."))
}
fn exit_on_close_setting(root:&Path,enabled:Option<bool>)->Result<bool>{
    let path=root.join("exit-on-close.txt");
    if let Some(enabled)=enabled {
        fs::write(path,if enabled {"true"} else {"false"})?;
        return Ok(enabled);
    }
    match fs::read_to_string(path) {
        Ok(value)=>value.trim().parse().map_err(|_|error("storage","창 닫기 설정을 읽지 못했습니다. 설정을 다시 선택하세요.")),
        Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Ok(false),
        Err(e)=>Err(e.into()),
    }
}
#[tauri::command]
fn exit_on_close(s:tauri::State<State>,enabled:Option<bool>)->Result<bool>{
    let mut current=s.exit_on_close.lock().map_err(|_|error("internal","창 닫기 설정을 변경하지 못했습니다."))?;
    let saved=exit_on_close_setting(&s.root,enabled)?;
    *current=saved;
    Ok(saved)
}
#[derive(serde::Serialize)]
struct Diagnostics { db_path:String, warning:Option<String>, last_backup:Option<String> }
#[tauri::command]
fn diagnostics(s:tauri::State<State>) -> Diagnostics {
    Diagnostics {db_path:s.root.join("blokky.sqlite").display().to_string(),warning:s.warning.lock().unwrap().clone(),last_backup:s.last_backup.lock().unwrap().clone()}
}
fn quit(app: &tauri::AppHandle) {
    let s=app.state::<State>();
    let mut quit=s.quit.lock().unwrap();
    let request_id=uuid::Uuid::new_v4().to_string();
    if !quit.begin(request_id.clone(),app.webview_windows().into_keys()) { return; }
    if quit.pending.is_empty() { app.exit(0); return; }
    if app.emit("quit-request",&request_id).is_err() {
        quit.request_id=None;
        quit.pending.clear();
        show(app,"main");
        let _=app.emit("quit-cancelled","자동 저장을 시작하지 못했습니다. 다시 종료해 주세요.");
        return;
    }
    let handle=app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(30));
        let s=handle.state::<State>();
        let mut quit=s.quit.lock().unwrap();
        if quit.request_id.as_deref()==Some(&request_id) {
            if let Some(label)=quit.pending.iter().next().cloned() {
                quit.finish(&request_id,&label,false);
                show(&handle,&label);
                let _=handle.emit("quit-cancelled","자동 저장 응답을 확인하지 못했습니다. 잠시 후 다시 종료해 주세요.");
            }
        }
    });
}
#[tauri::command]
fn finish_quit(s:tauri::State<State>,app:tauri::AppHandle,window:tauri::WebviewWindow,request_id:String,error:Option<String>) {
    let mut quit=s.quit.lock().unwrap();
    match quit.finish(&request_id,window.label(),error.is_none()) {
        QuitProgress::Exit=>app.exit(0),
        QuitProgress::Cancel=>{
            show(&app,window.label());
            let _=app.emit("quit-cancelled",error.unwrap());
        },
        QuitProgress::Ignore|QuitProgress::Waiting=>{},
    }
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app,_,_| show(app,"main")))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::Builder::new().args(["--autostart"]).build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app,shortcut,event| {
            if event.state()!=ShortcutState::Pressed {return;}
            if shortcut.key==Code::Escape && shortcut.mods.is_empty() {
                if let Some(w)=app.get_webview_window("capture") {
                    if w.is_visible().unwrap_or(false) {let _=w.emit("capture-hide-request",());}
                }
            } else {
                // The plugin holds its shortcut lock while calling us; queue registration after returning.
                let handle=app.clone();
                std::thread::spawn(move || {let app=handle.clone();let _=handle.run_on_main_thread(move || show(&app,"capture"));});
            }
        }).build())
        .invoke_handler(tauri::generate_handler![load,load_draft,save_draft,mutate,create_backup,list_backups,inspect_backup,restore,recover_backup,set_dirty,hide_capture,show_capture,capture_shortcut,autostart,exit_on_close,diagnostics,finish_quit])
        .setup(|app| {
            let root=if cfg!(debug_assertions) {std::env::var_os("BLOKKY_TEST_DATA_DIR").map(PathBuf::from).unwrap_or(app.path().app_local_data_dir()?)} else {app.path().app_local_data_dir()?}; fs::create_dir_all(&root)?;
            let store=open_store(&root.join("blokky.sqlite"));
            let shortcut=fs::read_to_string(root.join("capture-shortcut.txt")).unwrap_or_else(|_|"Ctrl+Shift+Space".into());
            let close=exit_on_close_setting(&root,None).unwrap_or(false);
            let state=State {store:Mutex::new(store),busy:Mutex::new(HashSet::new()),root,warning:Mutex::new(None),last_backup:Mutex::new(None),shortcut:Mutex::new(shortcut.clone()),exit_on_close:Mutex::new(close),quit:Mutex::new(QuitCoordinator::default())};
            if let Ok(mut f)=OpenOptions::new().create(true).append(true).open(state.root.join("blokky.log")) {
                let _=writeln!(f,"startup app={} exe={} db={}",env!("CARGO_PKG_VERSION"),std::env::current_exe()?.display(),state.root.join("blokky.sqlite").display());
            }
            app.manage(state);
            for config in app.config().app.windows.clone() {
                tauri::WebviewWindowBuilder::from_config(app,&config)?.build()?;
            }
            if app.global_shortcut().register(shortcut.as_str()).is_err() {
                *app.state::<State>().warning.lock().unwrap()=Some(format!("빠른 캡처 단축키 {shortcut}를 등록하지 못했습니다. 설정에서 다른 단축키로 바꿔 주세요."));
            }
            let menu=tauri::menu::Menu::with_items(app,&[
                &tauri::menu::MenuItem::with_id(app,"open","BLOKKY 열기",true,None::<&str>)?,
                &tauri::menu::MenuItem::with_id(app,"quit","종료",true,None::<&str>)?,
            ])?;
            let pixels:Vec<u8>=(0..32*32).flat_map(|i| {
                let x=i%32;let y=i/32;
                if ((7..13).contains(&x)&&(7..25).contains(&y))||((16..25).contains(&x)&&(7..14).contains(&y))||((16..22).contains(&x)&&(17..25).contains(&y)) {[255,255,255,255]}else{[43,85,214,255]}
            }).collect();
            tauri::tray::TrayIconBuilder::new().icon(tauri::image::Image::new_owned(pixels,32,32)).tooltip("BLOKKY")
                .menu(&menu).on_menu_event(|app,event| match event.id.as_ref(){"open"=>show(app,"main"),"quit"=>quit(app),_=>{}}).build(app)?;
            if std::env::args().any(|a|a=="--autostart") { if let Some(w)=app.get_webview_window("main"){w.hide()?;} }
            let handle=app.handle().clone();
            std::thread::spawn(move || {let mut checked_hour=String::new();loop {
                let s=handle.state::<State>();
                let now=chrono::Local::now();let hour=now.format("%Y%m%d%H").to_string();
                if checked_hour!=hour {
                match with_store(&s,|db|db.purge_trash(now.with_timezone(&chrono::Utc))) {
                    Ok(0)=>{},Ok(_)=>{audit(&s,"trash-purge","ok");let _=handle.emit("data-changed",());},Err(e)=>audit(&s,"trash-purge",&e.code),
                }
                if let Err(e)=with_store(&s,|db|db.purge_receipts(now.timestamp_millis())) {audit(&s,"receipt-purge",&e.code);}
                let result=with_store(&s,|db|db.automatic_backup(&s.root.join("backups"),now));
                match result {Err(e)=>{ audit(&s,"automatic-backup",&e.code);*s.warning.lock().unwrap()=Some(format!("자동 백업 실패: {}",e.message));},Ok(timestamp)=>{checked_hour=hour;*s.last_backup.lock().unwrap()=Some(timestamp);audit(&s,"automatic-backup","ok");let mut warning=s.warning.lock().unwrap();if warning.as_ref().is_some_and(|w|w.starts_with("자동 백업 실패")){*warning=None;}}}
                let _=handle.emit("backup-warning",());
                }
                std::thread::sleep(std::time::Duration::from_secs(60));
            }});
            Ok(())
        })
        .on_window_event(|window,event| {
            if let tauri::WindowEvent::CloseRequested {api,..}=event {
                api.prevent_close();
                let exit=window.label()=="main"&&*window.state::<State>().exit_on_close.lock().unwrap();
                if exit {quit(window.app_handle());} else {let _=hide(window);}
            }
        })
        .run(tauri::generate_context!()).expect("BLOKKY desktop startup failed");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quit_requires_every_window_and_ignores_duplicate_or_obsolete_replies() {
        let mut quit=QuitCoordinator::default();
        let windows=||["main".to_string(),"capture".to_string()].into_iter();
        assert!(quit.begin("first".into(),windows()));
        assert!(!quit.begin("concurrent".into(),windows()));
        assert_eq!(quit.finish("first","unknown",true),QuitProgress::Ignore);
        assert_eq!(quit.finish("first","main",true),QuitProgress::Waiting);
        assert_eq!(quit.finish("first","main",false),QuitProgress::Ignore);
        assert_eq!(quit.finish("first","capture",false),QuitProgress::Cancel);
        assert!(quit.begin("retry".into(),windows()));
        assert_eq!(quit.finish("first","capture",true),QuitProgress::Ignore);
        assert_eq!(quit.finish("retry","capture",true),QuitProgress::Waiting);
        assert_eq!(quit.finish("retry","main",true),QuitProgress::Exit);
        assert_eq!(quit.finish("retry","main",false),QuitProgress::Ignore);
        assert!(!quit.begin("after-success".into(),windows()));
    }

    #[test]
    fn close_preference_persists_and_reports_invalid_or_failed_storage(){
        let dir=tempfile::tempdir().unwrap();let root=dir.path();
        assert!(!exit_on_close_setting(root,None).unwrap());
        for value in [true,false] {
            assert_eq!(exit_on_close_setting(root,Some(value)).unwrap(),value);
            assert_eq!(exit_on_close_setting(root,None).unwrap(),value);
        }
        fs::write(root.join("exit-on-close.txt"),"invalid").unwrap();
        assert!(exit_on_close_setting(root,None).is_err());
        assert!(exit_on_close_setting(root,Some(true)).unwrap());
        let missing=root.join("missing");
        assert!(exit_on_close_setting(&missing,Some(true)).is_err());
        fs::remove_file(root.join("exit-on-close.txt")).unwrap();
        fs::create_dir(root.join("exit-on-close.txt")).unwrap();
        assert!(exit_on_close_setting(root,None).is_err());
        assert!(exit_on_close_setting(root,Some(false)).is_err());
    }
}
