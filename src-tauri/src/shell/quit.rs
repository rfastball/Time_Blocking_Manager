//! The quit flow: ask every window to save, exit when all confirm, give up after a deadline.
use super::{lock, windows::{show, MAIN}, State};
use blokky_core::{model::*, quit::QuitProgress};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const QUIT_CANCELLED: &str = "quit-cancelled";
const DEADLINE: Duration = Duration::from_secs(30);

pub fn request(app: &AppHandle) {
    let s=app.state::<State>();
    let Ok(mut quit)=s.quit.lock() else {return};
    let request_id=uuid::Uuid::new_v4().to_string();
    if !quit.begin(request_id.clone(),app.webview_windows().into_keys()) { return; }
    if !quit.is_waiting() { app.exit(0); return; }
    if app.emit("quit-request",&request_id).is_err() {
        quit.abandon();
        show(app,MAIN);
        let _=app.emit(QUIT_CANCELLED,"자동 저장을 시작하지 못했습니다. 다시 종료해 주세요.");
        return;
    }
    let handle=app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(DEADLINE);
        let s=handle.state::<State>();
        let Ok(mut quit)=s.quit.lock() else {return};
        if let Some(label)=quit.expire(&request_id) {
            show(&handle,&label);
            let _=handle.emit(QUIT_CANCELLED,"자동 저장 응답을 확인하지 못했습니다. 잠시 후 다시 종료해 주세요.");
        }
    });
}
/// A window's answer to `quit-request`; `error` set means it could not save and the quit is called off.
pub fn finish(app: &AppHandle, s: &State, window: &str, request_id: &str, error: Option<String>) -> Result<()> {
    let mut quit=lock(&s.quit,"종료 요청 상태를 확인하지 못했습니다.")?;
    match quit.finish(request_id,window,error.is_none()) {
        QuitProgress::Exit=>app.exit(0),
        QuitProgress::Cancel=>{
            show(app,window);
            let _=app.emit(QUIT_CANCELLED,error.unwrap_or_default());
        },
        QuitProgress::Ignore|QuitProgress::Waiting=>{},
    }
    Ok(())
}
