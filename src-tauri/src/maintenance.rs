//! Storage upkeep shared by startup and the hourly pass: expiry, automatic backup and its warning.
use crate::{db::Store, model::*};
use chrono::{DateTime, Local};
use std::path::Path;

// Trash and receipts expire on open and the existing hourly pass; failed cleanup waits for the next pass.
pub fn open_store(path: &Path) -> Result<Store> {
    let mut store=Store::open(path)?;let now=chrono::Utc::now();
    let _=store.purge_trash(now);let _=store.purge_receipts(now.timestamp_millis());Ok(store)
}

/// Remembers the last hour whose automatic backup succeeded; until then every tick of that hour is due again.
#[derive(Default)]
pub struct HourlyPass { checked: String }
impl HourlyPass {
    pub fn due(&self, now: &DateTime<Local>) -> Option<String> {
        let hour=now.format("%Y%m%d%H").to_string();
        (hour!=self.checked).then_some(hour)
    }
    pub fn done(&mut self, hour: String) { self.checked=hour; }
}

const BACKUP_FAILURE: &str = "자동 백업 실패";
pub fn backup_failure(e: &AppError) -> String { format!("{BACKUP_FAILURE}: {}",e.message) }
/// A successful backup clears only its own earlier failure, never another warning.
pub fn clear_backup_failure(warning: &mut Option<String>) {
    if warning.as_ref().is_some_and(|w|w.starts_with(BACKUP_FAILURE)) { *warning=None; }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn hourly_pass_runs_once_per_hour_and_retries_until_backed_up() {
        let at=|h,m|Local.with_ymd_and_hms(2026,10,15,h,m,0).unwrap();
        let mut pass=HourlyPass::default();
        let hour=pass.due(&at(9,0)).unwrap();
        assert_eq!(pass.due(&at(9,1)).as_deref(),Some(hour.as_str()));
        pass.done(hour);
        assert_eq!(pass.due(&at(9,59)),None);
        assert!(pass.due(&at(10,0)).is_some());
    }

    #[test]
    fn backup_success_clears_only_its_own_failure() {
        let mut warning=Some(backup_failure(&error("storage","디스크가 가득 찼습니다.")));
        assert_eq!(warning.as_deref(),Some("자동 백업 실패: 디스크가 가득 찼습니다."));
        clear_backup_failure(&mut warning);
        assert_eq!(warning,None);
        let mut shortcut=Some("캡처 Esc 단축키를 등록하지 못했습니다.".to_string());
        clear_backup_failure(&mut shortcut);
        assert!(shortcut.is_some());
    }

    #[test]
    fn opening_creates_a_readable_store() {
        let dir=tempfile::tempdir().unwrap();
        assert!(open_store(&dir.path().join("blokky.sqlite")).unwrap().snapshot().is_ok());
    }
}
