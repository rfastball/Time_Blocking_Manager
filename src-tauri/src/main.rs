#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod shell;
use shell::{commands::*, windows};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app,_,_| windows::show(app,windows::MAIN)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::Builder::new().args(["--autostart"]).build())
        .plugin(windows::shortcut_plugin())
        .invoke_handler(tauri::generate_handler![load,load_draft,save_draft,acknowledge,mutate,create_backup,list_backups,inspect_backup,restore,recover_backup,set_dirty,hide_capture,show_capture,capture_shortcut,autostart,exit_on_close,diagnostics,finish_quit])
        .setup(shell::setup)
        .on_window_event(windows::on_event)
        .run(tauri::generate_context!()).expect("BLOKKY desktop startup failed");
}
