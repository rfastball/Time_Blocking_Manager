//! Showing and hiding windows, and the global shortcuts that summon or dismiss the capture window.
use super::{quit, set_warning, State, BACKUP_WARNING};
use blokky_core::model::*;
use tauri::{plugin::TauriPlugin, AppHandle, Emitter, Manager, Window, WindowEvent, Wry};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, ShortcutState};

pub const MAIN: &str = "main";
pub const CAPTURE: &str = "capture";

pub fn hide(window: &Window) -> Result<()> {
    if window.label()==CAPTURE && window.app_handle().global_shortcut().is_registered("Escape") {
        window.app_handle().global_shortcut().unregister("Escape").map_err(|_|error("shortcut","캡처 닫기 단축키를 해제하지 못했습니다. 다시 닫아 주세요."))?;
    }
    window.hide().map_err(|_|error("window","창을 숨길 수 없습니다."))
}
pub fn show(app: &AppHandle, label: &str) {
    if let Some(w)=app.get_webview_window(label){
        if w.show().is_err(){return;}
        if label==CAPTURE && !app.global_shortcut().is_registered("Escape") && app.global_shortcut().register("Escape").is_err() {
            set_warning(&app.state::<State>(),"캡처 Esc 단축키를 등록하지 못했습니다. 캡처 창 안에서 Esc를 누르거나 닫기 버튼을 이용하세요.".into());
            let _=app.emit(BACKUP_WARNING,());
        }
        let _=w.unminimize();let _=w.set_focus();let _=w.emit("window-shown",());
    }
}

/// Escape asks a visible capture window to close itself; any other registered shortcut is the capture shortcut.
pub fn shortcut_plugin() -> TauriPlugin<Wry> {
    tauri_plugin_global_shortcut::Builder::new().with_handler(|app,shortcut,event| {
        if event.state()!=ShortcutState::Pressed {return;}
        if shortcut.key==Code::Escape && shortcut.mods.is_empty() {
            if let Some(w)=app.get_webview_window(CAPTURE) {
                if w.is_visible().unwrap_or(false) {let _=w.emit("capture-hide-request",());}
            }
        } else {
            // The plugin holds its shortcut lock while calling us; queue registration after returning.
            let handle=app.clone();
            std::thread::spawn(move || {let app=handle.clone();let _=handle.run_on_main_thread(move || show(&app,CAPTURE));});
        }
    }).build()
}

pub fn create(app: &tauri::App, shortcut: &str) -> tauri::Result<()> {
    for config in app.config().app.windows.clone() {
        tauri::WebviewWindowBuilder::from_config(app,&config)?.build()?;
    }
    if app.global_shortcut().register(shortcut).is_err() {
        set_warning(&app.state::<State>(),format!("빠른 캡처 단축키 {shortcut}를 등록하지 못했습니다. 설정에서 다른 단축키로 바꿔 주세요."));
    }
    Ok(())
}
pub fn hide_on_autostart(app: &tauri::App) -> tauri::Result<()> {
    if std::env::args().any(|a|a=="--autostart") { if let Some(w)=app.get_webview_window(MAIN){w.hide()?;} }
    Ok(())
}

/// Closing hides a window; only the main window quits, and only when the user chose that.
pub fn on_event(window: &Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested {api,..}=event {
        api.prevent_close();
        let exit=window.label()==MAIN&&window.state::<State>().exit_on_close.lock().is_ok_and(|exit|*exit);
        if exit {quit::request(window.app_handle());} else {let _=hide(window);}
    }
}
