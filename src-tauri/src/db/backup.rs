use super::*;

#[derive(Debug, serde::Serialize)]
pub struct BackupInspection {
    pub created_at: Option<String>, pub tasks: usize, pub completed: usize, pub scheduled: usize,
}

#[derive(Debug, serde::Serialize)]
pub struct ManagedBackup {
    pub id: String, pub kind: &'static str, pub created_at: Option<String>,
    pub tasks: Option<usize>, pub completed: Option<usize>, pub scheduled: Option<usize>, pub error: Option<String>,
}

pub(super) fn backup_kind(id: &str) -> Option<&'static str> {
    let stem=id.strip_suffix(".sqlite")?;
    for (prefix,kind,length) in [("hour-","hour",10),("day-","day",8)] {
        if let Some(stamp)=stem.strip_prefix(prefix) {
            if stamp.len()!=length || !stamp.bytes().all(|c|c.is_ascii_digit()) {return None;}
            let date=chrono::NaiveDate::parse_from_str(&stamp[..8],"%Y%m%d").ok()?;
            if date.format("%Y%m%d").to_string()!=stamp[..8] || kind=="hour" && stamp[8..].parse::<u32>().ok()? > 23 {return None;}
            return Some(kind);
        }
    }
    for (prefix,kind) in [("manual-","manual"),("before-restore-","safety"),("before-migration-","migration")] {
        if let Some(value)=stem.strip_prefix(prefix) {
            let id=uuid::Uuid::parse_str(value).ok()?;
            return (id.to_string()==value).then_some(kind);
        }
    }
    None
}

pub(super) fn backup_directory(root: &Path) -> Result<PathBuf> {
    let directory=root.join("backups");
    if directory.exists() {
        let metadata=fs::symlink_metadata(&directory)?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() || !directory.canonicalize()?.starts_with(root.canonicalize()?) {
            return Err(error("validation","백업 폴더 위치를 확인하세요."));
        }
    }
    Ok(directory)
}

pub fn managed_backup_path(root: &Path, id: &str) -> Result<PathBuf> {
    if backup_kind(id).is_none() {return Err(error("validation","관리되는 백업을 선택하세요."));}
    let directory=backup_directory(root)?;
    let path=directory.join(id);
    let metadata=fs::symlink_metadata(&path)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || path.canonicalize()?.parent()!=Some(directory.canonicalize()?.as_path()) {
        return Err(error("validation","백업 파일 위치를 확인하세요."));
    }
    Ok(path)
}

pub(super) fn managed_backup(root: &Path, id: String) -> ManagedBackup {
    let kind=backup_kind(&id).unwrap();
    let inspection=managed_backup_path(root,&id).and_then(|path|Store::inspect_backup(&path));
    match inspection {
        Ok(info)=>ManagedBackup{id,kind,created_at:info.created_at,tasks:Some(info.tasks),completed:Some(info.completed),scheduled:Some(info.scheduled),error:None},
        Err(e)=>ManagedBackup{id,kind,created_at:None,tasks:None,completed:None,scheduled:None,error:Some(e.message)},
    }
}

pub(super) fn backup_connection(source: &Connection, destination: &Path) -> Result<()> {
    if destination.exists(){return Err(error("destination_exists","기존 파일은 덮어쓰지 않습니다. 새 백업 파일명을 선택하세요."));}
    // create_new protects the active database and existing user backups from overwrite.
    let reservation = fs::OpenOptions::new().write(true).create_new(true).open(destination)?;
    drop(reservation);
    let mut dest = Connection::open(destination)?;
    let backup = rusqlite::backup::Backup::new(source, &mut dest)?;
    backup.run_to_completion(128, Duration::from_millis(5), None)?;
    drop(backup);
    dest.execute_batch("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;")?;
    check_database(&dest)?;
    dest.execute("INSERT OR REPLACE INTO meta VALUES('backup_created_at',?1)",[chrono::Utc::now().to_rfc3339()])?;
    Ok(())
}

impl Store {
    pub fn backup(&self, destination: &Path) -> Result<()> { backup_connection(&self.conn,destination) }

    pub fn create_backup(&self, root: &Path) -> Result<ManagedBackup> {
        let directory=backup_directory(root)?;
        fs::create_dir_all(&directory)?;
        let id=format!("manual-{}.sqlite",uuid::Uuid::new_v4());
        self.backup(&directory.join(&id))?;
        let backup=managed_backup(root,id);
        if let Some(message)=&backup.error {return Err(error("storage",message));}
        Ok(backup)
    }

    pub fn list_backups(root: &Path) -> Result<Vec<ManagedBackup>> {
        let directory=backup_directory(root)?;
        if !directory.exists() {return Ok(vec![]);}
        let mut backups=Vec::new();
        for entry in fs::read_dir(&directory)? {
            let entry=entry?;
            let Some(id)=entry.file_name().to_str().map(str::to_owned) else {continue;};
            if backup_kind(&id).is_none() {continue;}
            let backup=managed_backup(root,id);
            let timestamp=backup.created_at.as_deref().and_then(|value|chrono::DateTime::parse_from_rfc3339(value).ok()).map(|time|time.with_timezone(&chrono::Utc))
                .or_else(||entry.metadata().ok()?.modified().ok().map(chrono::DateTime::<chrono::Utc>::from));
            backups.push((timestamp,backup));
        }
        backups.sort_by(|a,b|b.0.cmp(&a.0).then_with(||b.1.id.cmp(&a.1.id)));
        Ok(backups.into_iter().map(|(_,backup)|backup).collect())
    }

    pub fn automatic_backup(&self, directory: &Path, now: chrono::DateTime<chrono::Local>) -> Result<String> {
        fs::create_dir_all(directory)?;
        let mut latest=String::new();
        for (prefix, stamp, keep) in [("hour", now.format("%Y%m%d%H").to_string(), 24), ("day", now.format("%Y%m%d").to_string(), 30)] {
            let destination = directory.join(format!("{prefix}-{stamp}.sqlite"));
            if !destination.exists() { self.backup(&destination)?; }
            else {
                let existing=Connection::open_with_flags(&destination,OpenFlags::SQLITE_OPEN_READ_ONLY)?;
                check_database(&existing)?;
            }
            // Only files with our exact generated name are eligible for retention.
            let paths: Vec<_> = fs::read_dir(directory)?.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| {
                let name = p.file_name().unwrap_or_default().to_string_lossy();
                name.starts_with(&format!("{prefix}-")) && name.ends_with(".sqlite")
                    && name.len() == prefix.len() + 1 + stamp.len() + 7
                    && name[prefix.len()+1..name.len()-7].chars().all(|c| c.is_ascii_digit())
            }).collect();
            let mut verified=Vec::new();
            for path in paths {
                let conn=Connection::open_with_flags(&path,OpenFlags::SQLITE_OPEN_READ_ONLY)?;
                check_database(&conn)?;
                let timestamp:String=conn.query_row("SELECT value FROM meta WHERE key='backup_created_at'",[],|r|r.get(0))?;
                let parsed=chrono::DateTime::parse_from_rfc3339(&timestamp).map_err(|_|error("schema","백업 생성 정보를 확인하지 못했습니다. 보존 파일은 삭제하지 않습니다."))?;
                if timestamp>latest {latest=timestamp;}
                verified.push((parsed,path));
            }
            verified.sort_by_key(|(timestamp,_)|*timestamp);
            let remove = verified.len().saturating_sub(keep);
            for (_,path) in verified.into_iter().take(remove) { fs::remove_file(path)?; }
        }
        Ok(latest)
    }

    pub fn inspect_backup(source: &Path) -> Result<BackupInspection> {
        let incoming = Connection::open_with_flags(source, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let snapshot = check_database(&incoming)?;
        let created_at = incoming.query_row("SELECT value FROM meta WHERE key='backup_created_at'", [], |r| r.get(0)).optional()?;
        Ok(BackupInspection {
            created_at, tasks: snapshot.tasks.len(),
            completed: snapshot.tasks.iter().filter(|t| t.completed).count(),
            scheduled: snapshot.tasks.iter().filter(|t| t.plan_date.is_some()).count(),
        })
    }

    pub fn recover_from_backup(root: &Path, id: &str) -> Result<Self> {
        let source=managed_backup_path(root,id)?;
        let incoming=Connection::open_with_flags(&source,OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let restored=check_database(&incoming)?;let generated=occurrences(&incoming)?;
        let legacy=incoming.query_row("PRAGMA user_version",[],|r|r.get::<_,i64>(0))?<9;drop(incoming);
        let path=root.join("blokky.sqlite");let marker=sidecar(&path,".recovering");
        let stage=root.join(format!("recovery-stage-{}.sqlite",uuid::Uuid::new_v4()));
        if !marker.exists() && path.exists() {
            match check_database_copy(&path) {
                Ok(_)=>return Err(error("conflict","저장소를 다시 읽을 수 있습니다. 기록을 다시 불러온 뒤 일반 복원을 사용하세요.")),
                Err(e) if e.code=="busy" || e.code=="storage"=>return Err(e),
                Err(_)=>{},
            }
        }
        let archive=backup_directory(root)?.join(format!("recovery-{}",uuid::Uuid::new_v4()));
        let mut moved=Vec::new();let mut installed=false;let mut marker_created=false;
        let result=(|| {
            let mut staged=Self::open(&stage)?;
            let tx=staged.conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
            insert_all(&tx,&restored)?;
            insert_layouts(&tx,&restored.layouts)?;insert_piles(&tx,&restored.piles)?;normalize_board(&tx)?;
            if legacy {shelve_legacy(&tx)?;}
            tx.execute("UPDATE meta SET value=?1 WHERE key='settings'",[serde_json::to_string(&restored.settings)?])?;
            for (id,date) in &generated {tx.execute("INSERT INTO routine_occurrences VALUES(?1,?2)",params![id,date])?;}
            tx.commit()?;
            staged.conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;")?;
            check_database(&staged.conn)?;drop(staged);
            fs::OpenOptions::new().write(true).open(&stage)?.sync_all()?;
            fs::create_dir(&archive)?;
            if marker.exists() {
                let metadata=fs::symlink_metadata(&marker)?;
                if !metadata.is_file() || metadata.file_type().is_symlink() {return Err(error("storage","중단된 복구 표시 파일을 확인하세요."));}
            } else {
                let flag=fs::OpenOptions::new().write(true).create_new(true).open(&marker)?;marker_created=true;flag.sync_all()?;
            }
            // The marker prevents a restart in this rename window from creating an empty database.
            for suffix in ["","-wal","-shm"] {
                let original=sidecar(&path,suffix);
                match fs::symlink_metadata(&original) {
                    Err(e) if e.kind()==std::io::ErrorKind::NotFound=>continue,
                    Err(e)=>return Err(e.into()),
                    Ok(m) if !m.is_file() || m.file_type().is_symlink()=>return Err(error("storage","기존 저장소 자료를 보존할 수 없습니다. 파일 위치와 권한을 확인하세요.")),
                    Ok(_)=>{},
                }
                let saved=archive.join(original.file_name().unwrap());
                fs::rename(&original,&saved)?;moved.push((original,saved));
            }
            fs::rename(&stage,&path)?;installed=true;
            // Opening only the replacement verifies normal app operation before accepting recovery.
            let store=Self::open_recovered(&path)?;
            fs::remove_file(&marker)?;
            Ok(store)
        })();
        if result.is_err() {
            let rollback=(|| -> Result<()> {
                if installed {
                    for suffix in ["","-wal","-shm"] {
                        let replacement=sidecar(&path,suffix);
                        if replacement.exists() {fs::rename(&replacement,archive.join(format!("failed-blokky.sqlite{suffix}")))?;}
                    }
                }
                for (original,saved) in moved.iter().rev() {
                    if original.exists() {return Err(error("storage","복구 전 자료가 보존되어 있지만 원래 위치로 되돌리지 못했습니다."));}
                    fs::rename(saved,original)?;
                }
                if marker_created && marker.exists() {fs::remove_file(&marker)?;}
                Ok(())
            })();
            if rollback.is_err() {
                return Err(error("recovery_pending","복구를 완료하지 못했습니다. 원본 자료는 backups의 recovery 폴더에 보존되어 있습니다. 파일 접근 문제를 해결한 뒤 다시 복구하세요."));
            }
        }
        for suffix in ["","-wal","-shm"] {let _=fs::remove_file(sidecar(&stage,suffix));}
        result
    }

    fn open_recovered(path: &Path) -> Result<Self> {
        let conn=Connection::open(path)?;
        conn.busy_timeout(Duration::from_millis(750))?;check_database(&conn)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;")?;
        Ok(Self{conn,path:path.into()})
    }

    pub fn restore(&mut self, source: &Path, expected_epoch: &str, safety_path: &Path) -> Result<Snapshot> {
        let drafts: i64=self.conn.query_row("SELECT count(*) FROM drafts WHERE content<>''",[],|r|r.get(0))?;
        if drafts>0 {return Err(error("pending","남아 있는 편집 초안을 먼저 저장하거나 명시적으로 버려주세요."));}
        let incoming = Connection::open_with_flags(source, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let restored = check_database(&incoming)?;
        let generated=occurrences(&incoming)?;
        let legacy=incoming.query_row("PRAGMA user_version",[],|r|r.get::<_,i64>(0))?<9;
        drop(incoming);
        if self.snapshot()?.epoch != expected_epoch { return Err(error("epoch", "복원 이후 데이터가 변경됐습니다. 화면을 다시 확인하세요.")); }
        self.backup(safety_path)?;
        // Keep the live connection; replace data atomically, never the open database file.
        let tx = self.conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        tx.execute("DELETE FROM tasks", [])?;
        tx.execute("DELETE FROM receipts", [])?;
        // The new epoch rejects every old request, so a mistaken future cutoff can safely reset.
        tx.execute("UPDATE meta SET value='0' WHERE key='receipt_cutoff'", [])?;
        tx.execute("DELETE FROM routine_occurrences", [])?;
        tx.execute("DELETE FROM day_layouts", [])?;
        tx.execute("DELETE FROM piles", [])?;
        insert_all(&tx,&restored)?;
        insert_layouts(&tx,&restored.layouts)?;insert_piles(&tx,&restored.piles)?;normalize_board(&tx)?;
        if legacy {shelve_legacy(&tx)?;}
        tx.execute("UPDATE meta SET value=?1 WHERE key='settings'", [serde_json::to_string(&restored.settings)?])?;
        for (id,date) in &generated {tx.execute("INSERT INTO routine_occurrences VALUES(?1,?2)",params![id,date])?;}
        tx.execute("UPDATE meta SET value=?1 WHERE key='epoch'", [uuid::Uuid::new_v4().to_string()])?;
        let result = read(&tx)?;
        tx.commit()?;
        Ok(result)
    }
}
