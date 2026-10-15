use super::*;

pub(super) const BASE_TASK_COLUMNS: &str = "id,title,body,starts_at,duration,completed,revision,plan_date,flow_order,proto,pile_id,pile_order";
pub(super) const BOARD_TASK_COLUMNS: &str = "id,title,body,starts_at,duration,completed,revision,plan_date,flow_order,proto,pile_id,pile_order,board_x,board_y";
pub(super) const TASK_COLUMNS: &str = "id,title,body,starts_at,duration,completed,revision,plan_date,flow_order,proto,pile_id,pile_order,board_x,board_y,wait_for,wait_until,wait_since";


// One fixed-width UTC form, so the purge cutoff can compare stored values as text.
pub(super) fn trash_stamp(at: chrono::DateTime<chrono::Utc>) -> String { at.to_rfc3339_opts(chrono::SecondsFormat::Secs,true) }

pub(super) fn insert_task(conn: &Connection, t: &Task, deleted_at: Option<&str>) -> Result<()> {
    conn.execute(&format!("INSERT INTO tasks({TASK_COLUMNS},deleted_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)"),
        params![t.id,t.title,t.body,t.starts_at,t.duration,t.completed,t.revision,t.plan_date,t.flow_order,t.proto,t.pile_id,t.pile_order,t.board_x,t.board_y,t.wait_for,t.wait_until,t.wait_since,deleted_at])?;
    Ok(())
}

pub(super) fn insert_piles(conn: &Connection, piles: &[Pile]) -> Result<()> {
    for pile in piles {conn.execute("INSERT INTO piles(id,position) VALUES(?1,?2)",params![pile.id,pile.position])?;}
    Ok(())
}

pub(super) fn insert_all(conn: &Connection, s: &Snapshot) -> Result<()> {
    for t in &s.tasks {insert_task(conn,t,None)?;}
    for t in &s.trash {insert_task(conn,&t.task,Some(&t.deleted_at))?;}
    Ok(())
}

pub(super) fn insert_layouts(conn: &Connection, layouts: &[DayLayout]) -> Result<()> {
    for layout in layouts {conn.execute("INSERT INTO day_layouts(date,anchor) VALUES(?1,?2)",params![layout.date,layout.anchor])?;}
    Ok(())
}

pub(super) fn parse_date(value: &str) -> Result<chrono::NaiveDate> {
    Ok(parse_start(&format!("{value}T00:00"))?.date())
}

pub(super) fn receipt_cutoff(conn: &Connection) -> Result<i64> {
    let value:String=conn.query_row("SELECT value FROM meta WHERE key='receipt_cutoff'",[],|r|r.get(0))?;
    value.parse::<i64>().ok().filter(|v|*v>=0).ok_or_else(||error("schema","처리 기록 정리 시각이 올바르지 않습니다."))
}

pub(super) fn recorded_request(conn: &Connection, command: &Command, payload: &str) -> Result<bool> {
    if command.request_id.is_empty() || command.request_id.len()>100 {return Err(error("validation","요청 식별자가 올바르지 않습니다."));}
    let previous:Option<String>=conn.query_row("SELECT payload FROM receipts WHERE id=?1",[&command.request_id],|r|r.get(0)).optional()?;
    match previous {
        Some(previous) if previous!=payload=>Err(error("validation","같은 요청 식별자에 서로 다른 변경이 전달됐습니다.")),
        Some(_)=>Ok(true),None=>Ok(false)
    }
}

pub(super) fn occurrences(conn: &Connection) -> Result<Vec<(String,String)>> {
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

pub(super) fn read(conn: &Connection) -> Result<Snapshot> {
    let epoch = conn.query_row("SELECT value FROM meta WHERE key='epoch'", [], |r| r.get(0))?;
    let raw: String = conn.query_row("SELECT value FROM meta WHERE key='settings'", [], |r| r.get(0))?;
    let version:i64=conn.query_row("PRAGMA user_version",[],|r|r.get(0))?;
    // Earlier schemas only had exact placements, so their dated tasks are fixed plans.
    let columns=if version>=10 {TASK_COLUMNS.to_string()} else if version>=8 {format!("{BOARD_TASK_COLUMNS},NULL,NULL,NULL")} else if version>=6 {format!("{BASE_TASK_COLUMNS},NULL,NULL,NULL,NULL,NULL")}
        else if version>=4 {"id,title,body,starts_at,duration,completed,revision,plan_date,flow_order,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL".into()}
        else {"id,title,body,starts_at,duration,completed,revision,substr(starts_at,1,10),NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL".into()};
    let deleted=if version>=5 {"deleted_at"} else {"NULL"};
    let mut stmt = conn.prepare(&format!("SELECT {columns},{deleted} FROM tasks ORDER BY starts_at,id"))?;
    let mut rows = stmt.query_map([], |r| Ok((Task { id: r.get(0)?, title: r.get(1)?, body: r.get(2)?, starts_at: r.get(3)?, duration: r.get(4)?, completed: r.get(5)?, revision: r.get(6)?,
        plan_date: r.get(7)?, flow_order: r.get(8)?, proto: r.get(9)?, pile_id: r.get(10)?, pile_order: r.get(11)?, board_x:r.get(12)?,board_y:r.get(13)?,
        wait_for:r.get(14)?,wait_until:r.get(15)?,wait_since:r.get(16)? },r.get::<_,Option<String>>(17)?)))?.collect::<std::result::Result<Vec<_>, _>>()?;
    // Before piles, open unplanned work was one list in id order; it stays that list, as the 투입구.
    if version<6 {
        let mut n=0;
        for (task,deleted_at) in &mut rows {if deleted_at.is_none()&&task.plan_date.is_none()&&!task.completed {n+=1;task.pile_order=Some(n);}}
    }
    // Trashed rows never reach `tasks`, so layouts, overlap checks and routines ignore them.
    let (mut tasks,mut trash)=(Vec::new(),Vec::new());
    for (task,deleted_at) in rows {match deleted_at {None=>tasks.push(task),Some(deleted_at)=>trash.push(Trashed{task,deleted_at})}}
    trash.sort_by(|a,b|b.deleted_at.cmp(&a.deleted_at).then_with(||a.task.id.cmp(&b.task.id)));
    let layouts=if version>=4 {
        let mut stmt=conn.prepare("SELECT date,anchor FROM day_layouts ORDER BY date")?;
        let rows=stmt.query_map([],|r|Ok(DayLayout{date:r.get(0)?,anchor:r.get(1)?}))?.collect::<std::result::Result<Vec<_>,_>>()?;rows
    } else {vec![]};
    let piles=if version>=6 {
        let mut stmt=conn.prepare("SELECT id,position FROM piles ORDER BY position,id")?;
        let rows=stmt.query_map([],|r|Ok(Pile{id:r.get(0)?,position:r.get(1)?}))?.collect::<std::result::Result<Vec<_>,_>>()?;rows
    } else {vec![]};
    Ok(Snapshot { epoch, tasks, settings: serde_json::from_str(&raw)?, layouts, trash, piles })
}
