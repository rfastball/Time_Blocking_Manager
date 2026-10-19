//! The background upkeep thread: once an hour, expire trash and receipts and take an automatic backup.
use super::{audited, changed, lock, set_warning, with_store, State, BACKUP_LOCK, BACKUP_WARNING};
use blokky_core::{audit, db::Store, maintenance::{backup_failure, clear_backup_failure, HourlyPass}};
use tauri::{AppHandle, Emitter, Manager};

pub fn spawn(handle: AppHandle) {
    std::thread::spawn(move || {let mut pass=HourlyPass::default();loop {
        let s=handle.state::<State>();
        let now=chrono::Local::now();
        if let Some(hour)=pass.due(&now) {
            let trash=with_store(&s,|db|db.purge_trash(now.with_timezone(&chrono::Utc)));
            if !matches!(trash,Ok(0)) { let _=changed(&handle,&s,"trash-purge",None,trash); }
            if let Err(e)=with_store(&s,|db|db.purge_receipts(now.timestamp_millis())) {audit::record(&s.root,"receipt-purge",&e.code);}
            let backup=(|| {
                let _backup=lock(&s.backup,BACKUP_LOCK)?;
                // An unreadable live store must still fail when this hour's files already exist.
                with_store(&s,|_|Ok(()))?;
                Store::automatic_backup(&s.root.join("backups"),now,|path|with_store(&s,|db|db.backup(path)))
            })();
            match audited(&s,"automatic-backup",backup) {
                Err(e)=>set_warning(&s,backup_failure(&e)),
                Ok(timestamp)=>{
                    pass.done(hour);
                    if let Ok(mut last)=s.last_backup.lock() {*last=Some(timestamp);}
                    if let Ok(mut warning)=s.warning.lock() {clear_backup_failure(&mut warning);}
                },
            }
            let _=handle.emit(BACKUP_WARNING,());
        }
        std::thread::sleep(std::time::Duration::from_secs(60));
    }});
}
