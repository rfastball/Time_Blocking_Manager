use crate::model::*;
use chrono::Datelike;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension, TransactionBehavior};
use sha2::{Digest,Sha256};
use std::{fs, path::{Path, PathBuf}, time::Duration};

mod apply;
mod backup;
mod bench;
mod check;
mod rows;
mod schema;
pub use backup::{managed_backup_path, BackupInspection, ManagedBackup};
use bench::*;
use check::*;
use rows::*;
use schema::*;
use backup::*;

pub struct Store { conn: Connection, pub path: PathBuf }

fn sidecar(path: &Path, suffix: &str) -> PathBuf {
    let mut name=path.as_os_str().to_os_string();name.push(suffix);PathBuf::from(name)
}

/// Trashed tasks older than this are removed for good on open and by the hourly pass.
pub const TRASH_RETENTION_DAYS: i64 = 30;

impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        if sidecar(path,".recovering").exists() {
            return Err(error("recovery_pending","중단된 복구 자료가 보존되어 있습니다. 백업을 선택해 복구를 완료하세요."));
        }
        let exists = path.exists();
        if exists {check_database_copy(path)?;}
        // An existing empty/foreign file is never silently initialized.
        let mut conn = Connection::open(path)?;
        conn.busy_timeout(Duration::from_millis(750))?;
        if !exists {
            let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
            tx.execute_batch(SCHEMA)?;
            tx.execute("INSERT INTO meta VALUES ('epoch',?1)", [uuid::Uuid::new_v4().to_string()])?;
            tx.execute("INSERT INTO meta VALUES ('settings',?1)", [serde_json::to_string(&Settings::default())?])?;
            tx.execute("INSERT INTO meta VALUES ('receipt_cutoff','0')", [])?;
            tx.commit()?;
        }
        check_database(&conn)?;
        let version:i64=conn.query_row("PRAGMA user_version",[],|r|r.get(0))?;
        if version<SCHEMA_VERSION {migrate(&mut conn,path,version)?;}
        let tx=conn.transaction_with_behavior(TransactionBehavior::Immediate)?;normalize_board(&tx)?;tx.commit()?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;")?;
        Ok(Self { conn, path: path.into() })
    }

    pub fn snapshot(&self) -> Result<Snapshot> { read(&self.conn) }

    pub fn draft(&self, slot: &str) -> Result<(i64, String)> {
        Ok(self.conn.query_row("SELECT sequence,content FROM drafts WHERE slot=?1",[slot],|r|Ok((r.get(0)?,r.get(1)?))).optional()?.unwrap_or((0,String::new())))
    }
    pub fn save_draft(&self, slot: &str, sequence: i64, content: &str) -> Result<()> {
        if content.len()>1_000_000 {return Err(error("validation","초안이 너무 큽니다."));}
        self.conn.execute("INSERT INTO drafts VALUES(?1,?2,?3) ON CONFLICT(slot) DO UPDATE SET sequence=excluded.sequence,content=excluded.content WHERE excluded.sequence>drafts.sequence",params![slot,sequence,content])?;
        Ok(())
    }

    pub fn apply(&mut self, command: &Command) -> Result<Snapshot> {
        self.apply_at(command,chrono::Utc::now().timestamp_millis())
    }

    /// Acknowledges only a matching receipt; never executes an unresolved draft.
    pub fn acknowledge(&self, command: &Command) -> Result<Option<Snapshot>> {
        let snapshot=read(&self.conn)?;
        if command.epoch!=snapshot.epoch {return Err(error("epoch","복원 전 화면의 요청입니다. 초안을 보존하고 최신 데이터를 확인하세요."));}
        let payload=format!("{:x}",Sha256::digest(serde_json::to_vec(command)?));
        Ok(if recorded_request(&self.conn,command,&payload)? {Some(snapshot)} else {None})
    }

    /// Removes trashed tasks deleted more than TRASH_RETENTION_DAYS before `now`; returns how many went.
    pub fn purge_trash(&self, now: chrono::DateTime<chrono::Utc>) -> Result<usize> {
        let cutoff=trash_stamp(now-chrono::Duration::days(TRASH_RETENTION_DAYS));
        Ok(self.conn.execute("DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at<?1",[cutoff])?)
    }

    /// The cutoff never retreats: a clock correction cannot replay a receipt already removed.
    pub fn purge_receipts(&mut self, now: i64) -> Result<usize> {
        let tx=self.conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let cutoff=receipt_cutoff(&tx)?.max(now.saturating_sub(REQUEST_LIFETIME_MS).max(0));
        let removed=tx.execute("DELETE FROM receipts WHERE accepted_at<=?1",[cutoff])?;
        tx.execute("UPDATE meta SET value=?1 WHERE key='receipt_cutoff'",[cutoff.to_string()])?;
        tx.commit()?;Ok(removed)
    }
}
