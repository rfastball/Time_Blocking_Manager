use super::*;

pub(super) const SCHEMA: &str = "
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE tasks (
 id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(trim(title)) > 0),
 body TEXT NOT NULL DEFAULT '', starts_at TEXT, duration INTEGER NOT NULL DEFAULT 30 CHECK(duration >= 15 AND duration % 15 = 0),
 completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)), revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
 plan_date TEXT, flow_order INTEGER, deleted_at TEXT,
 proto INTEGER NOT NULL DEFAULT 0 CHECK(proto IN (0,1)), pile_id TEXT, pile_order INTEGER, board_x INTEGER, board_y INTEGER,
 wait_for TEXT, wait_until TEXT, wait_since TEXT
);
CREATE INDEX task_start ON tasks(starts_at);
CREATE TABLE receipts (id TEXT PRIMARY KEY, payload TEXT NOT NULL, accepted_at INTEGER NOT NULL CHECK(accepted_at>=0));
CREATE INDEX receipt_accepted ON receipts(accepted_at);
CREATE TABLE drafts (slot TEXT PRIMARY KEY, sequence INTEGER NOT NULL, content TEXT NOT NULL);
CREATE TABLE routine_occurrences (routine_id TEXT NOT NULL, date TEXT NOT NULL, PRIMARY KEY(routine_id,date));
CREATE TABLE day_layouts (date TEXT PRIMARY KEY, anchor INTEGER NOT NULL);
CREATE TABLE piles (id TEXT PRIMARY KEY, position INTEGER NOT NULL);
PRAGMA user_version = 10;";

pub(super) const SCHEMA_VERSION: i64 = 10;

// Older executables must not discard routines, flow plans, their generation history or the trash.
pub(super) fn migrate(conn: &mut Connection, path: &Path, version: i64) -> Result<()> {
    let root=path.parent().ok_or_else(||error("storage","저장소 폴더를 확인할 수 없습니다."))?;
    let directory=backup_directory(root)?;fs::create_dir_all(&directory)?;
    backup_connection(conn,&directory.join(format!("before-migration-{}.sqlite",uuid::Uuid::new_v4())))?;
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
    add("proto","INTEGER NOT NULL DEFAULT 0 CHECK(proto IN (0,1))")?;add("pile_id","TEXT")?;add("pile_order","INTEGER")?;
    add("board_x","INTEGER")?;add("board_y","INTEGER")?;
    add("wait_for","TEXT")?;add("wait_until","TEXT")?;add("wait_since","TEXT")?;
    if version<6 {
        // Only older list-based stores need the inbox backfill; v6 piles keep their own order.
        tx.execute_batch(&format!("CREATE TABLE IF NOT EXISTS piles (id TEXT PRIMARY KEY, position INTEGER NOT NULL);
            UPDATE tasks SET pile_order=(SELECT count(*) FROM tasks b WHERE b.deleted_at IS NULL AND b.plan_date IS NULL AND b.completed=0 AND b.id<=tasks.id) WHERE {BENCH};"))?;
    }
    let receipt_columns=tx.prepare("SELECT name FROM pragma_table_info('receipts')")?.query_map([],|r|r.get::<_,String>(0))?.collect::<std::result::Result<Vec<_>,_>>()?;
    if !receipt_columns.iter().any(|c|c=="accepted_at") {
        let at=chrono::Utc::now().timestamp_millis();
        tx.execute_batch(&format!("ALTER TABLE receipts ADD COLUMN accepted_at INTEGER NOT NULL DEFAULT {at} CHECK(accepted_at>=0);"))?;
    }
    tx.execute_batch(&format!("CREATE INDEX IF NOT EXISTS receipt_accepted ON receipts(accepted_at);
        INSERT OR IGNORE INTO meta VALUES('receipt_cutoff','0'); PRAGMA user_version={SCHEMA_VERSION};"))?;
    if version<9 {shelve_legacy(&tx)?;}
    tx.commit()?;
    check_database(conn)?;
    Ok(())
}
