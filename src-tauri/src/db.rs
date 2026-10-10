use crate::model::*;
use chrono::Datelike;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension, TransactionBehavior};
use sha2::{Digest,Sha256};
use std::{fs, path::{Path, PathBuf}, time::Duration};

pub struct Store { conn: Connection, pub path: PathBuf }

fn sidecar(path: &Path, suffix: &str) -> PathBuf {
    let mut name=path.as_os_str().to_os_string();name.push(suffix);PathBuf::from(name)
}

#[derive(Debug, serde::Serialize)]
pub struct BackupInspection {
    pub created_at: Option<String>, pub tasks: usize, pub completed: usize, pub scheduled: usize,
}

#[derive(Debug, serde::Serialize)]
pub struct ManagedBackup {
    pub id: String, pub kind: &'static str, pub created_at: Option<String>,
    pub tasks: Option<usize>, pub completed: Option<usize>, pub scheduled: Option<usize>, pub error: Option<String>,
}

fn backup_kind(id: &str) -> Option<&'static str> {
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

fn backup_directory(root: &Path) -> Result<PathBuf> {
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

fn managed_backup(root: &Path, id: String) -> ManagedBackup {
    let kind=backup_kind(&id).unwrap();
    let inspection=managed_backup_path(root,&id).and_then(|path|Store::inspect_backup(&path));
    match inspection {
        Ok(info)=>ManagedBackup{id,kind,created_at:info.created_at,tasks:Some(info.tasks),completed:Some(info.completed),scheduled:Some(info.scheduled),error:None},
        Err(e)=>ManagedBackup{id,kind,created_at:None,tasks:None,completed:None,scheduled:None,error:Some(e.message)},
    }
}

const SCHEMA: &str = "
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE tasks (
 id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(trim(title)) > 0),
 body TEXT NOT NULL DEFAULT '', starts_at TEXT, duration INTEGER NOT NULL DEFAULT 30 CHECK(duration >= 15 AND duration % 15 = 0),
 completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)), revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
 plan_date TEXT, flow_order INTEGER, deleted_at TEXT
);
CREATE INDEX task_start ON tasks(starts_at);
CREATE TABLE receipts (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE drafts (slot TEXT PRIMARY KEY, sequence INTEGER NOT NULL, content TEXT NOT NULL);
CREATE TABLE routine_occurrences (routine_id TEXT NOT NULL, date TEXT NOT NULL, PRIMARY KEY(routine_id,date));
CREATE TABLE day_layouts (date TEXT PRIMARY KEY, anchor INTEGER NOT NULL);
PRAGMA user_version = 5;";

const SCHEMA_VERSION: i64 = 5;
const TASK_COLUMNS: &str = "id,title,body,starts_at,duration,completed,revision,plan_date,flow_order";
/// Trashed tasks older than this are removed for good on open and by the hourly pass.
pub const TRASH_RETENTION_DAYS: i64 = 30;

// One fixed-width UTC form, so the purge cutoff can compare stored values as text.
fn trash_stamp(at: chrono::DateTime<chrono::Utc>) -> String { at.to_rfc3339_opts(chrono::SecondsFormat::Secs,true) }

fn insert_task(conn: &Connection, t: &Task, deleted_at: Option<&str>) -> Result<()> {
    conn.execute(&format!("INSERT INTO tasks({TASK_COLUMNS},deleted_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)"),
        params![t.id,t.title,t.body,t.starts_at,t.duration,t.completed,t.revision,t.plan_date,t.flow_order,deleted_at])?;
    Ok(())
}

fn insert_all(conn: &Connection, s: &Snapshot) -> Result<()> {
    for t in &s.tasks {insert_task(conn,t,None)?;}
    for t in &s.trash {insert_task(conn,&t.task,Some(&t.deleted_at))?;}
    Ok(())
}

fn insert_layouts(conn: &Connection, layouts: &[DayLayout]) -> Result<()> {
    for layout in layouts {conn.execute("INSERT INTO day_layouts(date,anchor) VALUES(?1,?2)",params![layout.date,layout.anchor])?;}
    Ok(())
}

// Appending after completed flow tasks lets an undone task return to its own place.
fn next_flow_order(tasks: &[Task], date: &str) -> i64 {
    tasks.iter().filter(|t|t.plan_date.as_deref()==Some(date)&&t.starts_at.is_none()).filter_map(|t|t.flow_order).max().unwrap_or(0)+1
}

fn is_open_flow(t: &Task, date: &str) -> bool {
    t.plan_date.as_deref()==Some(date) && t.starts_at.is_none() && t.flow_order.is_some() && !t.completed
}

fn minute_on(at: &str, date: &str) -> Result<i64> {
    use chrono::Timelike;
    let parsed=parse_start(at)?;
    if parsed.date().format("%Y-%m-%d").to_string()!=date {return Err(error("validation","배치 기준 시각은 같은 날짜여야 합니다."));}
    Ok(i64::from(parsed.hour()*60+parsed.minute()))
}

// The anchor only moves forward so a delayed retry cannot reopen past space.
fn advance_anchor(conn: &Connection, date: &str, minute: i64) -> Result<()> {
    conn.execute("INSERT INTO day_layouts(date,anchor) VALUES(?1,?2) ON CONFLICT(date) DO UPDATE SET anchor=max(anchor,excluded.anchor)",params![date,minute])?;
    Ok(())
}

fn unique_revisions(items: &[TaskRevision], message: &str) -> Result<std::collections::HashMap<String,i64>> {
    let mut expected=std::collections::HashMap::new();
    for task in items {
        if task.id.is_empty() || task.id.len()>100 || task.revision<1 || expected.insert(task.id.clone(),task.revision).is_some() {return Err(error("validation",message));}
    }
    Ok(expected)
}

fn parse_date(value: &str) -> Result<chrono::NaiveDate> {
    Ok(parse_start(&format!("{value}T00:00"))?.date())
}

fn occurrences(conn: &Connection) -> Result<Vec<(String,String)>> {
    let version:i64=conn.query_row("PRAGMA user_version",[],|r|r.get(0))?;
    if version<3 {return Ok(vec![]);}
    let mut stmt=conn.prepare("SELECT routine_id,date FROM routine_occurrences")?;
    let rows=stmt.query_map([],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?)))?.collect::<std::result::Result<Vec<_>,_>>()?;
    let mut seen=std::collections::HashSet::new();
    for (id,date) in &rows {
        if id.is_empty() || id.len()>100 || !seen.insert((id,date)) {return Err(error("schema","정기 업무 생성 기록을 확인할 수 없습니다."));}
        parse_date(date)?;
    }
    Ok(rows)
}

fn read(conn: &Connection) -> Result<Snapshot> {
    let epoch = conn.query_row("SELECT value FROM meta WHERE key='epoch'", [], |r| r.get(0))?;
    let raw: String = conn.query_row("SELECT value FROM meta WHERE key='settings'", [], |r| r.get(0))?;
    let version:i64=conn.query_row("PRAGMA user_version",[],|r|r.get(0))?;
    // Earlier schemas only had exact placements, so their dated tasks are fixed plans.
    let columns=if version>=4 {TASK_COLUMNS} else {"id,title,body,starts_at,duration,completed,revision,substr(starts_at,1,10),NULL"};
    let deleted=if version>=5 {"deleted_at"} else {"NULL"};
    let mut stmt = conn.prepare(&format!("SELECT {columns},{deleted} FROM tasks ORDER BY starts_at,id"))?;
    let rows = stmt.query_map([], |r| Ok((Task { id: r.get(0)?, title: r.get(1)?, body: r.get(2)?, starts_at: r.get(3)?, duration: r.get(4)?, completed: r.get(5)?, revision: r.get(6)?, plan_date: r.get(7)?, flow_order: r.get(8)? },r.get::<_,Option<String>>(9)?)))?.collect::<std::result::Result<Vec<_>, _>>()?;
    // Trashed rows never reach `tasks`, so layouts, overlap checks and routines ignore them.
    let (mut tasks,mut trash)=(Vec::new(),Vec::new());
    for (task,deleted_at) in rows {match deleted_at {None=>tasks.push(task),Some(deleted_at)=>trash.push(Trashed{task,deleted_at})}}
    trash.sort_by(|a,b|b.deleted_at.cmp(&a.deleted_at).then_with(||a.task.id.cmp(&b.task.id)));
    let layouts=if version>=4 {
        let mut stmt=conn.prepare("SELECT date,anchor FROM day_layouts ORDER BY date")?;
        let rows=stmt.query_map([],|r|Ok(DayLayout{date:r.get(0)?,anchor:r.get(1)?}))?.collect::<std::result::Result<Vec<_>,_>>()?;rows
    } else {vec![]};
    Ok(Snapshot { epoch, tasks, settings: serde_json::from_str(&raw)?, layouts, trash })
}

fn validate_snapshot(s: &Snapshot) -> Result<()> {
    validate_settings(&s.settings)?;
    if s.epoch.is_empty() || s.settings.revision < 1 { return Err(error("schema", "저장소 버전 정보가 올바르지 않습니다.")); }
    let mut scheduled:Vec<_>=s.tasks.iter().filter(|t|t.starts_at.is_some()).collect();
    scheduled.sort_by_key(|t|&t.starts_at);
    for pair in scheduled.windows(2){
        let a=parse_start(pair[0].starts_at.as_deref().unwrap())?;
        let b=parse_start(pair[1].starts_at.as_deref().unwrap())?;
        if a+chrono::Duration::minutes(pair[0].duration)>b{return Err(error("overlap","저장소에 겹치는 배치가 있습니다."));}
    }
    for t in &s.tasks {
        if t.revision < 1 { return Err(error("schema", "항목 버전이 올바르지 않습니다.")); }
        validate_task(t, &[], &s.settings)?;
    }
    for t in &s.trash {
        let bad=||error("schema","휴지통 항목 정보가 올바르지 않습니다.");
        let at=chrono::DateTime::parse_from_rfc3339(&t.deleted_at).map_err(|_|bad())?;
        if trash_stamp(at.with_timezone(&chrono::Utc))!=t.deleted_at || t.task.revision<1 {return Err(bad());}
        // Hours may have changed since deletion; only the stored placement shape must still hold.
        match (t.task.starts_at.as_deref(),t.task.plan_date.as_deref(),t.task.flow_order) {
            (Some(start),Some(date),None) if start.get(..10)==Some(date) => {parse_start(start)?;}
            (None,Some(date),Some(_)) => {parse_date(date)?;}
            (None,None,None) => {},
            _ => return Err(bad()),
        }
        validate_task(&Task{starts_at:None,plan_date:None,flow_order:None,..t.task.clone()},&[],&s.settings)?;
    }
    let mut dates=std::collections::HashSet::new();
    for layout in &s.layouts {
        parse_date(&layout.date)?;
        if !(0..=1440).contains(&layout.anchor) || !dates.insert(&layout.date) {return Err(error("schema","날짜별 배치 기준이 올바르지 않습니다."));}
    }
    Ok(())
}

fn check_database(conn: &Connection) -> Result<Snapshot> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if !(1..=SCHEMA_VERSION).contains(&version) { return Err(error("schema", "지원하지 않는 저장소 버전입니다. 원본은 변경하지 않았습니다.")); }
    let mut stmt = conn.prepare("PRAGMA integrity_check")?;
    let results = stmt.query_map([], |r| r.get::<_, String>(0))?.collect::<std::result::Result<Vec<_>, _>>()?;
    if results != ["ok"] { return Err(error("corrupt", "무결성 검사에 실패했습니다. 원본은 변경하지 않았습니다.")); }
    let snapshot = read(conn)?;
    validate_snapshot(&snapshot)?;
    occurrences(conn)?;
    Ok(snapshot)
}

fn check_database_copy(path: &Path) -> Result<Snapshot> {
    let copy=sidecar(path,&format!(".validation-{}.sqlite",uuid::Uuid::new_v4()));
    // Opening SQLite can change or delete sidecars even when validation fails.
    let result=(|| {
        for suffix in ["","-wal","-shm"] {
            let original=sidecar(path,suffix);
            match fs::symlink_metadata(&original) {
                Err(e) if e.kind()==std::io::ErrorKind::NotFound && !suffix.is_empty()=>continue,
                Err(e)=>return Err(e.into()),
                Ok(m) if !m.is_file() || m.file_type().is_symlink()=>return Err(error("storage","기존 저장소 자료를 안전하게 검사할 수 없습니다.")),
                Ok(_)=>{},
            }
            fs::copy(original,sidecar(&copy,suffix))?;
        }
        let conn=Connection::open_with_flags(&copy,OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        check_database(&conn)
    })();
    for suffix in ["","-wal","-shm"] {
        let temporary=sidecar(&copy,suffix);if temporary.exists(){fs::remove_file(temporary)?;}
    }
    result
}

fn backup_connection(source: &Connection, destination: &Path) -> Result<()> {
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
            tx.commit()?;
        }
        check_database(&conn)?;
        // Older executables must not discard routines, flow plans, their generation history or the trash.
        let version:i64=conn.query_row("PRAGMA user_version",[],|r|r.get(0))?;
        if version<SCHEMA_VERSION {
            let root=path.parent().ok_or_else(||error("storage","저장소 폴더를 확인할 수 없습니다."))?;
            let directory=backup_directory(root)?;fs::create_dir_all(&directory)?;
            backup_connection(&conn,&directory.join(format!("before-migration-{}.sqlite",uuid::Uuid::new_v4())))?;
            let tx=conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let columns=tx.prepare("SELECT name FROM pragma_table_info('tasks')")?.query_map([],|r|r.get::<_,String>(0))?.collect::<std::result::Result<Vec<_>,_>>()?;
            let add=|column:&str,kind:&str| -> Result<()> {
                if !columns.iter().any(|c|c==column) {tx.execute_batch(&format!("ALTER TABLE tasks ADD COLUMN {column} {kind};"))?;}
                Ok(())
            };
            if version<4 {
                tx.execute_batch("CREATE TABLE IF NOT EXISTS routine_occurrences (routine_id TEXT NOT NULL, date TEXT NOT NULL, PRIMARY KEY(routine_id,date));")?;
                add("plan_date","TEXT")?;add("flow_order","INTEGER")?;
                // Every existing placement keeps its exact time as a fixed plan.
                tx.execute_batch("UPDATE tasks SET plan_date=substr(starts_at,1,10),flow_order=NULL WHERE starts_at IS NOT NULL;
                    UPDATE tasks SET plan_date=NULL,flow_order=NULL WHERE starts_at IS NULL;
                    CREATE TABLE IF NOT EXISTS day_layouts (date TEXT PRIMARY KEY, anchor INTEGER NOT NULL);")?;
            }
            // Additive: every existing row stays live.
            add("deleted_at","TEXT")?;
            tx.execute_batch(&format!("PRAGMA user_version={SCHEMA_VERSION};"))?;
            tx.commit()?;
            check_database(&conn)?;
        }
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
        if command.request_id.is_empty() || command.request_id.len() > 100 { return Err(error("validation", "요청 식별자가 올바르지 않습니다.")); }
        let payload = format!("{:x}",Sha256::digest(serde_json::to_vec(command)?));
        let tx = self.conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let snapshot = read(&tx)?;
        if command.epoch != snapshot.epoch { return Err(error("epoch", "복원 전 화면의 요청입니다. 초안을 보존하고 최신 데이터를 확인하세요.")); }
        let previous: Option<String> = tx.query_row("SELECT payload FROM receipts WHERE id=?1", [&command.request_id], |r| r.get(0)).optional()?;
        if let Some(previous) = previous {
            if previous != payload { return Err(error("validation", "같은 요청 식별자에 서로 다른 변경이 전달됐습니다.")); }
            return Ok(snapshot);
        }
        match &command.action {
            Action::Create { id, title } => {
                let task = Task { id: id.clone(), title: title.trim().into(), body: String::new(), starts_at: None, duration: 30, completed: false, revision: 1, plan_date: None, flow_order: None };
                validate_task(&task, &snapshot.tasks, &snapshot.settings)?;
                tx.execute("INSERT INTO tasks(id,title) VALUES(?1,?2)", params![task.id, task.title])?;
            }
            Action::SetSettings { expected_revision, days } => {
                if *expected_revision != snapshot.settings.revision { return Err(error("conflict", "다른 창에서 시간 설정이 변경됐습니다. 작성 내용을 보존했습니다.")); }
                let settings = Settings { days: days.clone(), revision: expected_revision + 1, ..snapshot.settings.clone() };
                validate_settings(&settings)?;
                for t in &snapshot.tasks { validate_task(t, &snapshot.tasks, &settings)?; }
                tx.execute("UPDATE meta SET value=?1 WHERE key='settings'", [serde_json::to_string(&settings)?])?;
            }
            Action::CreateScheduled { id,title,starts_at,duration } => {
                let plan_date=starts_at.as_deref().map(|start|start.get(..10).unwrap_or_default().to_string());
                let task=Task{id:id.clone(),title:title.trim().into(),body:String::new(),starts_at:starts_at.clone(),duration:*duration,completed:false,revision:1,plan_date,flow_order:None};
                validate_task(&task,&snapshot.tasks,&snapshot.settings)?;
                insert_task(&tx,&task,None)?;
            }
            Action::CreateFlow { id,title,date,duration } => {
                parse_date(date)?;
                let task=Task{id:id.clone(),title:title.trim().into(),body:String::new(),starts_at:None,duration:*duration,completed:false,revision:1,plan_date:Some(date.clone()),flow_order:Some(next_flow_order(&snapshot.tasks,date))};
                validate_task(&task,&snapshot.tasks,&snapshot.settings)?;
                insert_task(&tx,&task,None)?;
            }
            Action::ReorderFlow { date,expected } => {
                parse_date(date)?;
                let revisions=unique_revisions(expected,"하루 순서 항목 정보를 확인하세요.")?;
                let open:Vec<_>=snapshot.tasks.iter().filter(|t|is_open_flow(t,date)).collect();
                if open.len()!=revisions.len() || open.iter().any(|t|revisions.get(&t.id)!=Some(&t.revision)) {return Err(error("conflict","다른 창에서 하루 순서가 변경됐습니다. 다시 확인하세요."));}
                // Order is a property of the day, so it does not invalidate open task editors.
                for (index,task) in expected.iter().enumerate() {tx.execute("UPDATE tasks SET flow_order=?1 WHERE id=?2",params![index as i64+1,task.id])?;}
            }
            Action::CompleteFlow { date,items,at } => {
                parse_date(date)?;
                let revisions=unique_revisions(items,"완료할 항목 정보를 확인하세요.")?;
                if revisions.is_empty() {return Err(error("validation","완료할 항목을 선택하세요."));}
                let anchor=at.as_deref().map(|at|minute_on(at,date)).transpose()?;
                for (id,revision) in &revisions {
                    if !snapshot.tasks.iter().any(|t|&t.id==id && t.revision==*revision && is_open_flow(t,date)) {return Err(error("conflict","다른 창에서 작업이 변경됐습니다. 다시 확인하세요."));}
                }
                for (id,revision) in &revisions {tx.execute("UPDATE tasks SET completed=1,revision=revision+1 WHERE id=?1 AND revision=?2",params![id,revision])?;}
                if let Some(minute)=anchor {advance_anchor(&tx,date,minute)?;}
            }
            Action::Reflow { date,at } => {
                parse_date(date)?;
                let minute=minute_on(at,date)?;advance_anchor(&tx,date,minute)?;
            }
            Action::SetSchedule {expected_revision,days,exceptions,weekly_target,work_days,move_conflicts} => {
                if *expected_revision!=snapshot.settings.revision {return Err(error("conflict","다른 창에서 시간 설정이 변경됐습니다. 다시 확인하세요."));}
                let settings=Settings{days:days.clone(),exceptions:exceptions.clone(),weekly_target:*weekly_target,work_days:*work_days,revision:expected_revision+1,routines:snapshot.settings.routines.clone()};
                validate_settings(&settings)?;
                let mut tasks=snapshot.tasks.clone();
                for t in &snapshot.tasks {
                    if let Err(e)=validate_task(t,&snapshot.tasks,&settings) {
                        if e.code!="unavailable"||!*move_conflicts{return Err(e);}
                        // A conflicting reservation keeps its date and becomes flow work there.
                        let date=t.plan_date.clone().unwrap_or_default();let order=next_flow_order(&tasks,&date);
                        tx.execute("UPDATE tasks SET starts_at=NULL,flow_order=?1,revision=revision+1 WHERE id=?2",params![order,t.id])?;
                        if let Some(task)=tasks.iter_mut().find(|task|task.id==t.id) {task.starts_at=None;task.flow_order=Some(order);}
                    }
                }
                tx.execute("UPDATE meta SET value=?1 WHERE key='settings'",[serde_json::to_string(&settings)?])?;
            }
            Action::SetRoutines {expected_revision,routines} => {
                if *expected_revision!=snapshot.settings.revision {return Err(error("conflict","다른 창에서 정기 업무 설정이 변경됐습니다. 다시 확인하세요."));}
                let mut settings=Settings{routines:routines.clone(),revision:expected_revision+1,..snapshot.settings.clone()};
                for routine in &mut settings.routines {routine.title=routine.title.trim().into();}
                validate_settings(&settings)?;
                tx.execute("UPDATE meta SET value=?1 WHERE key='settings'",[serde_json::to_string(&settings)?])?;
            }
            Action::EnsureRoutines {from,to} => {
                let from=parse_date(from)?;let to=parse_date(to)?;
                let count=(to-from).num_days()+1;
                if !(1..=62).contains(&count) {return Err(error("validation","정기 업무 생성 기간은 1일부터 62일까지 지정하세요."));}
                let mut tasks=snapshot.tasks.clone();
                for offset in 0..count {
                    let date=from+chrono::Duration::days(offset);let key=date.format("%Y-%m-%d").to_string();
                    for routine in &snapshot.settings.routines {
                        if !routine.weekdays.contains(&(date.weekday().num_days_from_monday() as usize)) {continue;}
                        let generated=tx.execute("INSERT OR IGNORE INTO routine_occurrences(routine_id,date) VALUES(?1,?2)",params![routine.id,key])?;
                        if generated==0 {continue;}
                        let mut task=Task{id:uuid::Uuid::new_v4().to_string(),title:routine.title.clone(),body:routine.body.clone(),starts_at:Some(format!("{key}T{:02}:{:02}",routine.start/60,routine.start%60)),duration:routine.duration,completed:false,revision:1,plan_date:Some(key.clone()),flow_order:None};
                        if let Err(e)=validate_task(&task,&tasks,&snapshot.settings) {
                            if e.code!="unavailable" && e.code!="overlap" {return Err(e);}
                            // The routine still belongs to this date; only its exact time is released.
                            task.starts_at=None;task.flow_order=Some(next_flow_order(&tasks,&key));
                        }
                        insert_task(&tx,&task,None)?;
                        tasks.push(task);
                    }
                }
            }
            Action::ClearDay {date,expected_tasks} => {
                parse_date(date)?;
                let expected=unique_revisions(expected_tasks,"하루 초기화 항목 정보를 확인하세요.")?;
                let scheduled:Vec<_>=snapshot.tasks.iter().filter(|task|task.plan_date.as_deref()==Some(date.as_str())).collect();
                if scheduled.len()!=expected.len() || scheduled.iter().any(|task|expected.get(&task.id)!=Some(&task.revision)) {return Err(error("conflict","다른 창에서 하루 일정이 변경됐습니다. 다시 확인하세요."));}
                for task in scheduled {tx.execute("UPDATE tasks SET starts_at=NULL,plan_date=NULL,flow_order=NULL,revision=revision+1 WHERE id=?1",[&task.id])?;}
                tx.execute("DELETE FROM day_layouts WHERE date=?1",[date])?;
            }
            Action::RestoreTrashed {id} => {
                let Some(item)=snapshot.trash.iter().find(|t|&t.task.id==id) else {return Err(error("conflict","휴지통에서 이미 복원했거나 지운 항목입니다. 다시 확인하세요."));};
                let mut task=Task{revision:item.task.revision+1,..item.task.clone()};
                if task.starts_at.is_some() {
                    if let Err(e)=validate_task(&task,&snapshot.tasks,&snapshot.settings) {
                        if e.code!="unavailable" && e.code!="overlap" {return Err(e);}
                        // As in D8/D9 the task keeps its date as flow work; only the taken time is released.
                        task.starts_at=None;task.flow_order=Some(next_flow_order(&snapshot.tasks,task.plan_date.as_deref().unwrap_or_default()));
                    }
                } else if let (Some(date),Some(order))=(&task.plan_date,task.flow_order) {
                    // Back into its old place in the day's order; later work moves one step down.
                    tx.execute("UPDATE tasks SET flow_order=flow_order+1 WHERE plan_date=?1 AND starts_at IS NULL AND flow_order>=?2 AND deleted_at IS NULL",params![date,order])?;
                }
                validate_task(&task,&snapshot.tasks,&snapshot.settings)?;
                tx.execute("UPDATE tasks SET starts_at=?1,flow_order=?2,revision=?3,deleted_at=NULL WHERE id=?4",params![task.starts_at,task.flow_order,task.revision,id])?;
            }
            Action::PurgeTrashed {ids} => {
                let mut seen=std::collections::HashSet::new();
                if ids.is_empty() || ids.iter().any(|id|!seen.insert(id)) {return Err(error("validation","지울 휴지통 항목을 확인하세요."));}
                if ids.iter().any(|id|!snapshot.trash.iter().any(|t|&t.task.id==id)) {return Err(error("conflict","다른 창에서 휴지통이 바뀌었습니다. 다시 확인하세요."));}
                for id in ids {tx.execute("DELETE FROM tasks WHERE id=?1 AND deleted_at IS NOT NULL",[id])?;}
            }
            action => {
                let (id, revision) = match action {
                    Action::Update { id, expected_revision, .. } | Action::SetCompleted { id, expected_revision, .. } | Action::Delete { id, expected_revision } | Action::Split {id,expected_revision,..} => (id, expected_revision),
                    _ => unreachable!(),
                };
                let Some(current) = snapshot.tasks.iter().find(|t| &t.id == id) else { return Err(error("conflict", "항목이 이미 삭제됐습니다. 작성 내용을 보존했습니다.")); };
                if current.revision != *revision { return Err(error("conflict", "다른 창에서 항목이 변경됐습니다. 작성 내용을 보존했습니다.")); }
                match action {
                    Action::Split {new_id,first_duration,..} => {
                        if current.completed || *first_duration < 15 || *first_duration % 15 != 0 || *first_duration > current.duration-15 {
                            return Err(error("validation","미완료 블록을 각각 15분 이상으로 나눠 주세요."));
                        }
                        if snapshot.tasks.iter().chain(snapshot.trash.iter().map(|t|&t.task)).any(|t| &t.id == new_id) { return Err(error("validation","이미 사용 중인 블록 식별자입니다.")); }
                        let remainder=Task{id:new_id.clone(),starts_at:None,plan_date:None,flow_order:None,duration:current.duration-first_duration,revision:1,..current.clone()};
                        validate_task(&remainder,&snapshot.tasks,&snapshot.settings)?;
                        tx.execute("UPDATE tasks SET duration=?1,revision=revision+1 WHERE id=?2 AND revision=?3",params![first_duration,id,revision])?;
                        tx.execute("INSERT INTO tasks(id,title,body,duration) VALUES(?1,?2,?3,?4)",params![remainder.id,remainder.title,remainder.body,remainder.duration])?;
                    }
                    Action::Update { title, body, starts_at, duration, plan_date, before, .. } => {
                        let derived=starts_at.as_deref().map(|start|start.get(..10).unwrap_or_default().to_string());
                        if derived.is_some() && plan_date.is_some() && derived!=*plan_date {return Err(error("validation","시각을 고정한 날짜와 계획 날짜가 다릅니다."));}
                        let date=derived.or_else(||plan_date.clone());
                        if let Some(date)=&date {parse_date(date)?;}
                        let mut shift=None;
                        let flow_order=match (starts_at,&date,before) {
                            (None,Some(date),Some(before)) => {
                                let target=snapshot.tasks.iter().find(|t|&t.id==before && t.id!=*id && is_open_flow(t,date))
                                    .ok_or_else(||error("validation","순서를 정할 같은 날짜의 작업을 확인하세요."))?;
                                shift=target.flow_order.map(|order|(date.clone(),order));target.flow_order
                            }
                            (_,_,Some(_)) => return Err(error("validation","순서는 날짜만 정한 작업에서 지정할 수 있습니다.")),
                            (None,Some(date),None) if current.plan_date.as_ref()==Some(date) && current.flow_order.is_some() => current.flow_order,
                            (None,Some(date),None) => Some(next_flow_order(&snapshot.tasks,date)),
                            _ => None,
                        };
                        let task = Task { title: title.trim().into(), body: body.clone(), starts_at: starts_at.clone(), duration: *duration, plan_date: date, flow_order, ..current.clone() };
                        validate_task(&task, &snapshot.tasks, &snapshot.settings)?;
                        // Inserting before another task moves only the later order numbers of that day.
                        if let Some((date,order))=shift {tx.execute("UPDATE tasks SET flow_order=flow_order+1 WHERE plan_date=?1 AND starts_at IS NULL AND flow_order>=?2 AND id<>?3 AND deleted_at IS NULL",params![date,order,id])?;}
                        tx.execute("UPDATE tasks SET title=?1,body=?2,starts_at=?3,duration=?4,plan_date=?5,flow_order=?6,revision=revision+1 WHERE id=?7 AND revision=?8", params![task.title,task.body,task.starts_at,task.duration,task.plan_date,task.flow_order,id,revision])?;
                    }
                    Action::SetCompleted { completed, .. } => { tx.execute("UPDATE tasks SET completed=?1,revision=revision+1 WHERE id=?2 AND revision=?3", params![completed,id,revision])?; }
                    Action::Delete { .. } => { tx.execute("UPDATE tasks SET deleted_at=?1 WHERE id=?2 AND revision=?3", params![trash_stamp(chrono::Utc::now()),id,revision])?; }
                    _ => unreachable!(),
                }
            }
        }
        tx.execute("INSERT INTO receipts(id,payload) VALUES(?1,?2)", params![command.request_id,payload])?;
        let result = read(&tx)?;
        tx.commit()?;
        Ok(result)
    }

    pub fn backup(&self, destination: &Path) -> Result<()> { backup_connection(&self.conn,destination) }

    /// Removes trashed tasks deleted more than TRASH_RETENTION_DAYS before `now`; returns how many went.
    pub fn purge_trash(&self, now: chrono::DateTime<chrono::Utc>) -> Result<usize> {
        let cutoff=trash_stamp(now-chrono::Duration::days(TRASH_RETENTION_DAYS));
        Ok(self.conn.execute("DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at<?1",[cutoff])?)
    }

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
        let restored=check_database(&incoming)?;let generated=occurrences(&incoming)?;drop(incoming);
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
            insert_layouts(&tx,&restored.layouts)?;
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
        drop(incoming);
        if self.snapshot()?.epoch != expected_epoch { return Err(error("epoch", "복원 이후 데이터가 변경됐습니다. 화면을 다시 확인하세요.")); }
        self.backup(safety_path)?;
        // Keep the live connection; replace data atomically, never the open database file.
        let tx = self.conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        tx.execute("DELETE FROM tasks", [])?;
        tx.execute("DELETE FROM receipts", [])?;
        tx.execute("DELETE FROM routine_occurrences", [])?;
        tx.execute("DELETE FROM day_layouts", [])?;
        insert_all(&tx,&restored)?;
        insert_layouts(&tx,&restored.layouts)?;
        tx.execute("UPDATE meta SET value=?1 WHERE key='settings'", [serde_json::to_string(&restored.settings)?])?;
        for (id,date) in &generated {tx.execute("INSERT INTO routine_occurrences VALUES(?1,?2)",params![id,date])?;}
        tx.execute("UPDATE meta SET value=?1 WHERE key='epoch'", [uuid::Uuid::new_v4().to_string()])?;
        let result = read(&tx)?;
        tx.commit()?;
        Ok(result)
    }
}
