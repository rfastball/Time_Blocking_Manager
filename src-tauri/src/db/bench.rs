use super::*;

// The 준비 shelf: the one pile left once the free board went away (v9).
pub(super) const SHELF: &str = "shelf";

// Open unplanned work that is not waiting: the only tasks that sit in a pile.
pub(super) const BENCH: &str = "deleted_at IS NULL AND plan_date IS NULL AND completed=0 AND wait_since IS NULL";
pub(super) fn on_bench(t: &Task) -> bool { t.plan_date.is_none() && !t.completed && t.wait_since.is_none() }

// Puts `ids`, in that order, into `pile` (None: the 투입구) before the card now at `index` among the others.
pub(super) fn place(conn: &Connection, ids: &[String], pile: Option<&str>, index: usize) -> Result<()> {
    let mut members={
        let mut stmt=conn.prepare(&format!("SELECT id FROM tasks WHERE {BENCH} AND pile_id IS ?1 ORDER BY pile_order IS NOT NULL,pile_order,id"))?;
        let rows=stmt.query_map([pile],|r|r.get::<_,String>(0))?.collect::<std::result::Result<Vec<_>,_>>()?;rows
    };
    members.retain(|id|!ids.contains(id));
    let at=index.min(members.len());
    members.splice(at..at,ids.iter().cloned());
    for (n,id) in members.iter().enumerate() {conn.execute("UPDATE tasks SET pile_id=?1,pile_order=?2 WHERE id=?3",params![pile,n as i64+1,id])?;}
    Ok(())
}

// The 준비 shelf is one reserved pile; it exists only while it holds work, like any pile.
pub(super) fn ensure_shelf(conn: &Connection) -> Result<()> {
    conn.execute("INSERT OR IGNORE INTO piles(id,position) VALUES(?1,(SELECT COALESCE(MAX(position),0)+1 FROM piles))",[SHELF])?;
    Ok(())
}
// Sized work coming back from a date goes on top of the shelf, in the order given.
pub(super) fn shelve(conn: &Connection, ids: &[String]) -> Result<()> {
    if ids.is_empty() {return Ok(());}
    ensure_shelf(conn)?;place(conn,ids,Some(SHELF),0)
}

// Before the 준비 tab, unplanned work sat on a free board: read it once top to bottom, left to right.
// Sized work becomes the shelf in that order, protos the 들어옴; every older pile goes.
pub(super) fn shelve_legacy(conn: &Connection) -> Result<()> {
    normalize_board(conn)?;
    let snapshot=read(conn)?;
    let mut open:Vec<&Task>=snapshot.tasks.iter().filter(|t|t.plan_date.is_none()&&!t.completed).collect();
    open.sort_by(|a,b|a.board_y.cmp(&b.board_y).then(a.board_x.cmp(&b.board_x)).then(a.id.cmp(&b.id)));
    let (sized,protos):(Vec<&Task>,Vec<&Task>)=open.into_iter().partition(|t|!t.proto);
    conn.execute("DELETE FROM piles",[])?;
    if !sized.is_empty() {conn.execute("INSERT INTO piles(id,position) VALUES(?1,1)",[SHELF])?;}
    for (n,t) in sized.iter().enumerate() {conn.execute("UPDATE tasks SET pile_id=?1,pile_order=?2 WHERE id=?3",params![SHELF,n as i64+1,t.id])?;}
    for (n,t) in protos.iter().enumerate() {conn.execute("UPDATE tasks SET pile_id=NULL,pile_order=?1 WHERE id=?2",params![n as i64+1,t.id])?;}
    // Trashed work restores by the same rule: a pile that no longer exists means the shelf or the 들어옴.
    conn.execute("UPDATE tasks SET pile_id=CASE WHEN proto=1 THEN NULL ELSE ?1 END,pile_order=NULL WHERE deleted_at IS NOT NULL AND pile_id IS NOT NULL AND pile_id<>?1",[SHELF])?;
    Ok(())
}

// After every write: piles hold only open unplanned work, empty piles go, and orders and positions count from 1.
pub(super) fn normalize_piles(conn: &Connection) -> Result<()> {
    // A date or a completion ends the wait: dating waiting work revives it.
    conn.execute("UPDATE tasks SET wait_for=NULL,wait_until=NULL,wait_since=NULL WHERE deleted_at IS NULL AND wait_since IS NOT NULL AND (plan_date IS NOT NULL OR completed=1)",[])?;
    // Sized work that lost its date without a chosen place goes on top of the shelf; a proto stays in the 들어옴.
    let orphans:i64=conn.query_row(&format!("SELECT count(*) FROM tasks WHERE {BENCH} AND proto=0 AND pile_id IS NULL AND pile_order IS NULL"),[],|r|r.get(0))?;
    if orphans>0 {
        ensure_shelf(conn)?;
        conn.execute(&format!("UPDATE tasks SET pile_id=?1 WHERE {BENCH} AND proto=0 AND pile_id IS NULL AND pile_order IS NULL"),[SHELF])?;
    }
    // The shelf holds sized work only: a proto put there takes its default length for good.
    conn.execute(&format!("UPDATE tasks SET proto=0 WHERE {BENCH} AND proto=1 AND pile_id=?1"),[SHELF])?;
    conn.execute_batch(&format!("
        UPDATE tasks SET pile_id=NULL,pile_order=NULL WHERE deleted_at IS NULL AND NOT ({BENCH}) AND (wait_since IS NULL OR pile_id IS NOT NULL) AND (pile_id IS NOT NULL OR pile_order IS NOT NULL);
        UPDATE tasks SET proto=0 WHERE deleted_at IS NULL AND proto=1 AND NOT ({BENCH}) AND wait_since IS NULL;
        UPDATE tasks SET pile_id=NULL WHERE {BENCH} AND pile_id IS NOT NULL AND pile_id NOT IN (SELECT id FROM piles);
        DELETE FROM piles WHERE id NOT IN (SELECT pile_id FROM tasks WHERE {BENCH} AND pile_id IS NOT NULL);"))?;
    let rows={
        let mut stmt=conn.prepare(&format!("SELECT id,pile_id,pile_order FROM tasks WHERE {BENCH} ORDER BY pile_id,pile_order IS NOT NULL,pile_order,id"))?;
        let rows=stmt.query_map([],|r|Ok((r.get::<_,String>(0)?,r.get::<_,Option<String>>(1)?,r.get::<_,Option<i64>>(2)?)))?.collect::<std::result::Result<Vec<_>,_>>()?;rows
    };
    let (mut current,mut count)=(None::<Option<String>>,0);
    for (id,pile,order) in rows {
        if current.as_ref()!=Some(&pile) {current=Some(pile);count=0;}
        count+=1;
        if order!=Some(count) {conn.execute("UPDATE tasks SET pile_order=?1 WHERE id=?2",params![count,id])?;}
    }
    let piles={
        let mut stmt=conn.prepare("SELECT id FROM piles ORDER BY position,id")?;
        let rows=stmt.query_map([],|r|r.get::<_,String>(0))?.collect::<std::result::Result<Vec<_>,_>>()?;rows
    };
    for (n,id) in piles.iter().enumerate() {conn.execute("UPDATE piles SET position=?1 WHERE id=?2",params![n as i64+1,id])?;}
    Ok(())
}

// The retired free board, kept only so the v9 migration can read it in its reading order.
const BOARD_WIDTH:i64=300;
const BOARD_HEIGHT:i64=96;
const BOARD_GAP:i64=24;
const BOARD_COLUMNS:i64=2;
const BOARD_LIMIT:i64=100_000;
// The first free cell, filling two columns top to bottom as the old board did.
fn free_board_position(tasks:&[Task]) -> Result<(i64,i64)> {
    let occupied:Vec<_>=tasks.iter().filter(|t|t.plan_date.is_none()&&!t.completed).filter_map(|t|t.board_x.zip(t.board_y)).collect();
    let free=|(x,y):(i64,i64)|(-BOARD_LIMIT..=BOARD_LIMIT).contains(&x)&&(-BOARD_LIMIT..=BOARD_LIMIT).contains(&y)&&!occupied.iter().any(|&(qx,qy)|x<qx+BOARD_WIDTH+BOARD_GAP&&x+BOARD_WIDTH+BOARD_GAP>qx&&y<qy+BOARD_HEIGHT+BOARD_GAP&&y+BOARD_HEIGHT+BOARD_GAP>qy);
    let rows=(BOARD_LIMIT-BOARD_GAP)/(BOARD_HEIGHT+BOARD_GAP)+1;
    for n in 0..=occupied.len() as i64*4 {
        let strip=n/(rows*BOARD_COLUMNS);let cell=n%(rows*BOARD_COLUMNS);
        let p=(BOARD_GAP+(strip*BOARD_COLUMNS+cell%BOARD_COLUMNS)*(BOARD_WIDTH+BOARD_GAP),BOARD_GAP+cell/BOARD_COLUMNS*(BOARD_HEIGHT+BOARD_GAP));
        if free(p) {return Ok(p);}
    }
    Err(error("validation","작업대에 새 작업을 놓을 자리가 없습니다."))
}

// Work the board never placed gets a cell in old bench reading order; saved coordinates stay.
fn normalize_board(conn:&Connection) -> Result<()> {
    let snapshot=read(conn)?;let mut tasks=snapshot.tasks;
    let mut missing:Vec<_>=tasks.iter().filter(|t|t.plan_date.is_none()&&!t.completed&&t.board_x.is_none()).collect();
    missing.sort_by(|a,b|{
        let position=|t:&Task|t.pile_id.as_deref().and_then(|id|snapshot.piles.iter().find(|p|p.id==id)).map_or(0,|p|p.position);
        position(a).cmp(&position(b)).then(a.pile_order.is_some().cmp(&b.pile_order.is_some())).then(a.pile_order.cmp(&b.pile_order)).then(a.id.cmp(&b.id))
    });
    let ids:Vec<_>=missing.iter().map(|t|t.id.clone()).collect();
    for id in ids {
        let (x,y)=free_board_position(&tasks)?;
        conn.execute("UPDATE tasks SET board_x=?1,board_y=?2 WHERE id=?3",params![x,y,id])?;
        let task=tasks.iter_mut().find(|t|t.id==id).unwrap();task.board_x=Some(x);task.board_y=Some(y);
    }
    Ok(())
}
