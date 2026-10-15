use super::*;

// Only open unplanned work has a pile place and only it (or waiting work) can be a proto; every pile holds some of it.
// Waiting work is open, dateless and in no pile.
pub(super) fn validate_bench(s: &Snapshot) -> Result<()> {
    use std::collections::HashSet;
    let bad=||error("schema","준비 작업의 위치 정보가 올바르지 않습니다.");
    let (mut piles,mut positions,mut used,mut slots)=(HashSet::new(),HashSet::new(),HashSet::new(),HashSet::new());
    for pile in &s.piles {
        if pile.id.is_empty() || pile.id.len()>100 || pile.position<1 || !piles.insert(pile.id.as_str()) || !positions.insert(pile.position) {return Err(bad());}
    }
    for t in &s.tasks {
        if t.wait_since.is_some() {
            if t.plan_date.is_some()||t.starts_at.is_some()||t.flow_order.is_some()||t.completed||t.pile_id.is_some()||t.pile_order.is_some() {return Err(bad());}
            continue;
        }
        let bench=t.plan_date.is_none()&&!t.completed;
        if t.proto&&!bench {return Err(bad());}
        if !bench {
            if t.pile_id.is_some()||t.pile_order.is_some() {return Err(bad());}
            continue;
        }
        let Some(order)=t.pile_order else {return Err(bad());};
        if let Some(pile)=t.pile_id.as_deref() {if !piles.contains(pile) {return Err(bad());}used.insert(pile);}
        if order<1 || !slots.insert((t.pile_id.as_deref(),order)) {return Err(bad());}
    }
    if used.len()!=piles.len() {return Err(bad());}
    for t in &s.trash {
        if t.task.proto&&t.task.plan_date.is_some() || t.task.pile_id.as_ref().is_some_and(|p|p.is_empty()||p.len()>100)
            || t.task.wait_since.is_some()&&(t.task.plan_date.is_some()||t.task.completed||t.task.pile_id.is_some()) {return Err(bad());}
    }
    Ok(())
}

pub(super) fn validate_snapshot(s: &Snapshot) -> Result<()> {
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
        validate_task(t, &[])?;
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
        validate_task(&Task{starts_at:None,plan_date:None,flow_order:None,..t.task.clone()},&[])?;
    }
    let mut dates=std::collections::HashSet::new();
    for layout in &s.layouts {
        parse_date(&layout.date)?;
        if !(0..=1440).contains(&layout.anchor) || !dates.insert(&layout.date) {return Err(error("schema","날짜별 배치 기준이 올바르지 않습니다."));}
    }
    validate_bench(s)
}

pub(super) fn check_database(conn: &Connection) -> Result<Snapshot> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if !(1..=SCHEMA_VERSION).contains(&version) { return Err(error("schema", "지원하지 않는 저장소 버전입니다. 원본은 변경하지 않았습니다.")); }
    let mut stmt = conn.prepare("PRAGMA integrity_check")?;
    let results = stmt.query_map([], |r| r.get::<_, String>(0))?.collect::<std::result::Result<Vec<_>, _>>()?;
    if results != ["ok"] { return Err(error("corrupt", "무결성 검사에 실패했습니다. 원본은 변경하지 않았습니다.")); }
    let snapshot = read(conn)?;
    validate_snapshot(&snapshot)?;
    occurrences(conn)?;
    if version>=7 {receipt_cutoff(conn)?;conn.prepare("SELECT accepted_at FROM receipts LIMIT 1")?;}
    Ok(snapshot)
}

pub(super) fn check_database_copy(path: &Path) -> Result<Snapshot> {
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
