use blokky_core::{db::{managed_backup_path, Store}, model::*};
use tempfile::tempdir;

fn command(s: &Store, action: Action) -> Command {
    Command { request_id: uuid::Uuid::new_v4().to_string(), epoch: s.snapshot().unwrap().epoch, issued_at:Some(chrono::Utc::now().timestamp_millis()), action }
}
fn create(s: &mut Store, id: &str) -> Task {
    let c = command(s, Action::Create { id: id.into(), title: "한글 업무".into() });
    s.apply(&c).unwrap().tasks.into_iter().find(|t| t.id == id).unwrap()
}
fn update(t: &Task, start: &str, duration: i64) -> Action {
    Action::Update { id: t.id.clone(), expected_revision: t.revision, title: t.title.clone(), body: "[x] 확인\n메모 보존".into(), starts_at: Some(start.into()), duration, plan_date: None, before: None, sized: None,wait:None }
}
fn place(t: &Task, date: Option<&str>, before: Option<&str>) -> Action {
    Action::Update { id: t.id.clone(), expected_revision: t.revision, title: t.title.clone(), body: t.body.clone(), starts_at: None, duration: t.duration, plan_date: date.map(Into::into), before: before.map(Into::into), sized: None,wait:None }
}
fn find(s: &Snapshot, id: &str) -> Task { s.tasks.iter().find(|t| t.id == id).unwrap().clone() }
fn flow(s: &mut Store, id: &str, date: &str, duration: i64) -> Task {
    let c=command(s,Action::CreateFlow{id:id.into(),title:"유동 업무".into(),date:date.into(),duration});find(&s.apply(&c).unwrap(),id)
}
fn revision(t: &Task) -> TaskRevision { TaskRevision{id:t.id.clone(),revision:t.revision} }
fn ordered(s: &Snapshot, date: &str) -> Vec<String> {
    let mut tasks:Vec<_>=s.tasks.iter().filter(|t|t.plan_date.as_deref()==Some(date)&&t.starts_at.is_none()&&!t.completed).collect();
    tasks.sort_by(|a,b|a.flow_order.cmp(&b.flow_order).then_with(||a.id.cmp(&b.id)));tasks.into_iter().map(|t|t.id.clone()).collect()
}
fn routine(id:&str,start:i64) -> Routine {
    Routine{id:id.into(),title:"정기 확인".into(),body:"보존할 정기 메모".into(),weekdays:vec![0,1],start,duration:30}
}
fn ensure(s:&mut Store,from:&str,to:&str) -> Snapshot {
    let c=command(s,Action::EnsureRoutines{from:from.into(),to:to.into()});s.apply(&c).unwrap()
}

#[test]
fn clearing_a_day_checks_the_complete_revision_set_atomically() {
    let dir=tempdir().unwrap();let mut s=Store::open(&dir.path().join("app.db")).unwrap();
    for (id,start) in [("a","2026-10-08T10:00"),("b","2026-10-08T11:00"),("other","2026-10-09T10:00")] {
        let task=create(&mut s,id);let c=command(&s,update(&task,start,30));s.apply(&c).unwrap();
    }
    flow(&mut s,"f","2026-10-08",600);
    for (date,at) in [("2026-10-08","2026-10-08T10:20"),("2026-10-09","2026-10-09T09:40")] {
        let c=command(&s,Action::Reflow{date:date.into(),at:at.into()});s.apply(&c).unwrap();
    }
    let a=s.snapshot().unwrap().tasks.into_iter().find(|task|task.id=="a").unwrap();
    let c=command(&s,Action::SetCompleted{id:a.id,expected_revision:a.revision,completed:true,date:None});s.apply(&c).unwrap();
    let before=s.snapshot().unwrap();
    let expected:Vec<_>=before.tasks.iter().filter(|t|t.id!="other").map(|t|TaskRevision{id:t.id.clone(),revision:t.revision}).collect();
    for bad in [vec![],vec![expected[0].clone()],vec![TaskRevision{revision:1,..expected[0].clone()},expected[1].clone()]] {
        let c=command(&s,Action::ClearDay{date:"2026-10-08".into(),expected_tasks:bad});
        assert_eq!(s.apply(&c).unwrap_err().code,"conflict");assert_eq!(s.snapshot().unwrap().tasks,before.tasks);
    }
    let invalid=command(&s,Action::ClearDay{date:"2026-10-08".into(),expected_tasks:vec![expected[0].clone(),expected[0].clone()]});
    assert_eq!(s.apply(&invalid).unwrap_err().code,"validation");assert_eq!(s.snapshot().unwrap().tasks,before.tasks);
    let c=command(&s,Action::ClearDay{date:"2026-10-08".into(),expected_tasks:expected});
    let result=s.apply(&c).unwrap();assert_eq!(s.apply(&c).unwrap().tasks,result.tasks);
    // Completed work stays on the cleared date as its record; open work goes back to 미계획.
    for old in before.tasks {
        let task=result.tasks.iter().find(|t|t.id==old.id).unwrap();let kept=old.id=="other"||old.completed;
        assert_eq!((task.title.clone(),task.body.clone(),task.completed),(old.title,old.body,old.completed));
        assert_eq!(task.starts_at,if kept {old.starts_at}else {None});
        assert_eq!((task.plan_date.clone(),task.flow_order),if kept {(old.plan_date,old.flow_order)}else {(None,None)});
        assert_eq!(task.revision,old.revision+i64::from(!kept));
    }
    // Only the cleared date loses its layout anchor.
    assert_eq!(result.layouts,vec![DayLayout{date:"2026-10-09".into(),anchor:580}]);
    for date in ["2026-02-30","2026-1-01"] {
        let c=command(&s,Action::ClearDay{date:date.into(),expected_tasks:vec![]});assert_eq!(s.apply(&c).unwrap_err().code,"validation");
    }
}

#[test]
fn routine_occurrences_survive_moves_deletion_settings_restart_and_restore() {
    let dir=tempdir().unwrap();let path=dir.path().join("app.db");let mut s=Store::open(&path).unwrap();
    let occupied=create(&mut s,"occupied");let c=command(&s,update(&occupied,"2026-10-05T10:00",30));s.apply(&c).unwrap();
    let c=command(&s,Action::SetRoutines{expected_revision:1,routines:vec![routine("morning",600),routine("lunch",720)]});
    s.apply(&c).unwrap();assert_eq!(s.apply(&c).unwrap().settings.revision,2);
    let stale=command(&s,Action::SetRoutines{expected_revision:1,routines:vec![]});assert_eq!(s.apply(&stale).unwrap_err().code,"conflict");
    for (from,to) in [("2026-02-30","2026-10-05"),("2026-10-06","2026-10-05"),("2026-10-01","2026-12-02")] {
        let c=command(&s,Action::EnsureRoutines{from:from.into(),to:to.into()});assert_eq!(s.apply(&c).unwrap_err().code,"validation");
    }
    let snapshot=ensure(&mut s,"2026-10-05","2026-10-07");assert_eq!(snapshot.tasks.len(),5);
    // Overlap and lunch keep the work on its date as flow plans; Wednesday is not a selected weekday.
    let released:Vec<_>=snapshot.tasks.iter().filter(|t|t.starts_at.is_none()).collect();assert_eq!(released.len(),3);
    let mut released_dates:Vec<_>=released.iter().map(|t|(t.plan_date.clone().unwrap(),t.flow_order.is_some())).collect();released_dates.sort();
    assert_eq!(released_dates,[("2026-10-05".to_string(),true),("2026-10-05".to_string(),true),("2026-10-06".to_string(),true)]);
    assert_eq!(ordered(&snapshot,"2026-10-05").len(),2);
    let t=snapshot.tasks.iter().find(|t|t.starts_at.as_deref()==Some("2026-10-06T10:00")).unwrap();
    let c=command(&s,update(t,"2026-10-07T10:00",30));let moved=s.apply(&c).unwrap();
    let t=moved.tasks.iter().find(|task|task.id==t.id).unwrap();
    let c=command(&s,Action::ClearDay{date:"2026-10-07".into(),expected_tasks:vec![TaskRevision{id:t.id.clone(),revision:t.revision}]});s.apply(&c).unwrap();
    let deleted=snapshot.tasks.iter().find(|t|t.starts_at.is_none()).unwrap();
    let c=command(&s,Action::Delete{id:deleted.id.clone(),expected_revision:deleted.revision});s.apply(&c).unwrap();
    let mut settings=s.snapshot().unwrap().settings;settings.routines[0].title="변경된 정기 업무".into();settings.routines.pop();
    let c=command(&s,Action::SetRoutines{expected_revision:settings.revision,routines:settings.routines.clone()});settings=s.apply(&c).unwrap().settings;
    let c=command(&s,Action::SetSchedule{expected_revision:settings.revision,days:settings.days.clone(),exceptions:settings.exceptions.clone(),weekly_target:settings.weekly_target,work_days:settings.work_days,move_conflicts:false});
    assert_eq!(s.apply(&c).unwrap().settings.routines,settings.routines);
    let saved=ensure(&mut s,"2026-10-05","2026-10-06");assert_eq!(saved.tasks.len(),4);assert!(saved.tasks.iter().all(|t|t.title!="변경된 정기 업무"));
    let backup=dir.path().join("backup.db");s.backup(&backup).unwrap();drop(s);
    let mut s=Store::open(&path).unwrap();assert_eq!(ensure(&mut s,"2026-10-05","2026-10-06").tasks,saved.tasks);
    assert_eq!(ensure(&mut s,"2026-10-12","2026-10-12").tasks.len(),5);
    let epoch=s.snapshot().unwrap().epoch;s.restore(&backup,&epoch,&dir.path().join("safety.db")).unwrap();
    assert_eq!(ensure(&mut s,"2026-10-05","2026-10-06").tasks,saved.tasks);
}

#[test]
fn legacy_databases_and_backups_migrate_without_losing_work() {
    let dir=tempdir().unwrap();
    for (n,version) in [1,2,3,4,5].into_iter().enumerate() {
        let path=dir.path().join(format!("legacy-{version}.db"));let mut s=Store::open(&path).unwrap();let task=create(&mut s,"legacy");
        let c=command(&s,update(&task,"2026-10-05T10:00",30));let mut task=find(&s.apply(&c).unwrap(),"legacy");task.board_x=None;task.board_y=None;drop(s);
        assert_eq!((task.plan_date.as_deref(),task.flow_order),(Some("2026-10-05"),None));
        let conn=rusqlite::Connection::open(&path).unwrap();
        if version<3 {
            let mut settings=serde_json::to_value(Settings::default()).unwrap();settings.as_object_mut().unwrap().remove("routines");
            conn.execute("UPDATE meta SET value=?1 WHERE key='settings'",[settings.to_string()]).unwrap();
            conn.execute_batch("DROP TABLE routine_occurrences;").unwrap();
        }
        // Rebuild the exact older table shape: no wait or bench columns or piles, before v5 no trash column, and before v4 no flow columns or layout anchors.
        conn.execute_batch("ALTER TABLE tasks DROP COLUMN wait_for; ALTER TABLE tasks DROP COLUMN wait_until; ALTER TABLE tasks DROP COLUMN wait_since; ALTER TABLE tasks DROP COLUMN proto; ALTER TABLE tasks DROP COLUMN pile_id; ALTER TABLE tasks DROP COLUMN pile_order; ALTER TABLE tasks DROP COLUMN board_x; ALTER TABLE tasks DROP COLUMN board_y; DROP TABLE piles;").unwrap();
        if version<4 {conn.execute_batch("ALTER TABLE tasks DROP COLUMN plan_date; ALTER TABLE tasks DROP COLUMN flow_order; DROP TABLE day_layouts;").unwrap();}
        if version<5 {conn.execute_batch("ALTER TABLE tasks DROP COLUMN deleted_at;").unwrap();}
        conn.execute_batch("DROP INDEX receipt_accepted; ALTER TABLE receipts DROP COLUMN accepted_at; DELETE FROM meta WHERE key='receipt_cutoff';").unwrap();
        conn.execute_batch(&format!("PRAGMA user_version={version};")).unwrap();drop(conn);
        let inspection=Store::inspect_backup(&path).unwrap();assert_eq!((inspection.tasks,inspection.scheduled),(1,1));
        let mut target=Store::open(&dir.path().join(format!("restored-{version}.db"))).unwrap();let epoch=target.snapshot().unwrap().epoch;
        assert_eq!(target.restore(&path,&epoch,&dir.path().join(format!("safety-{version}.db"))).unwrap().tasks,vec![task.clone()]);
        let mut s=Store::open(&path).unwrap();assert_eq!(s.snapshot().unwrap().tasks,vec![task.clone()]);assert!(s.snapshot().unwrap().settings.routines.is_empty());
        let migrations:Vec<_>=Store::list_backups(dir.path()).unwrap().into_iter().filter(|b|b.kind=="migration").collect();
        assert_eq!(migrations.len(),n+1);assert!(migrations.iter().all(|b|b.error.is_none()&&b.tasks==Some(1)&&b.scheduled==Some(1)));
        let c=command(&s,Action::SetRoutines{expected_revision:s.snapshot().unwrap().settings.revision,routines:vec![routine("new",600)]});s.apply(&c).unwrap();
        // The migrated fixed task occupies 10:00, so the routine stays on its date as flow work.
        let generated=ensure(&mut s,"2026-10-05","2026-10-05");assert_eq!(generated.tasks.len(),2);
        assert!(generated.tasks.iter().any(|t|t.id!="legacy"&&t.plan_date.as_deref()==Some("2026-10-05")&&t.flow_order==Some(1)));
        assert_eq!(rusqlite::Connection::open(&path).unwrap().query_row::<i64,_,_>("PRAGMA user_version",[],|r|r.get(0)).unwrap(),10);
        // The added trash column works on the migrated file: delete sets aside, restore returns it unchanged.
        let c=command(&s,Action::Delete{id:"legacy".into(),expected_revision:task.revision});let trashed=s.apply(&c).unwrap();
        assert!(trashed.tasks.iter().all(|t|t.id!="legacy"));assert_eq!(trashed.trash[0].task,task);
        let c=command(&s,Action::RestoreTrashed{id:"legacy".into()});
        assert_eq!(find(&s.apply(&c).unwrap(),"legacy"),Task{revision:task.revision+1,..task.clone()});
        drop(s);assert_eq!(Store::list_backups(dir.path()).unwrap().iter().filter(|b|b.kind=="migration").count(),n+1);
    }
}

#[test]
fn persistence_revisions_and_retry_receipts() {
    let dir = tempdir().unwrap(); let path = dir.path().join("app.db");
    let mut store = Store::open(&path).unwrap();
    let create_cmd = command(&store, Action::Create { id: "a".into(), title: "  메모  ".into() });
    let a = store.apply(&create_cmd).unwrap().tasks[0].clone();
    assert_eq!(a.title,"메모");
    assert_eq!(store.apply(&create_cmd).unwrap().tasks.len(), 1);
    let mut edit = command(&store, update(&a, "2026-10-08T10:00", 45));
    if let Action::Update{title,..}=&mut edit.action {*title="  최신  ".into();}
    assert_eq!(find(&store.apply(&edit).unwrap(),"a").title,"최신");
    let days=store.snapshot().unwrap().settings.days;
    let c=command(&store,Action::SetSettings{expected_revision:1,days:days.clone()});store.apply(&c).unwrap();
    let before=serde_json::to_value(store.snapshot().unwrap()).unwrap();
    for action in [update(&a,"2026-10-08T11:00",30),Action::Delete{id:a.id.clone(),expected_revision:a.revision},
        Action::SetCompleted{id:a.id.clone(),expected_revision:a.revision,completed:true,date:None},
        Action::SetSettings{expected_revision:1,days:days.clone()},
        Action::SetSchedule{expected_revision:1,days,exceptions:vec![],weekly_target:2400,work_days:5,move_conflicts:false},
        Action::SetRoutines{expected_revision:1,routines:vec![]}] {
        let stale=command(&store,action);assert_eq!(store.apply(&stale).unwrap_err().code,"conflict");
        assert_eq!(serde_json::to_value(store.snapshot().unwrap()).unwrap(),before);
    }
    drop(store);
    let store = Store::open(&path).unwrap(); let a = &store.snapshot().unwrap().tasks[0];
    assert_eq!(a.revision, 2); assert_eq!(a.body, "[x] 확인\n메모 보존"); assert_eq!(a.duration, 45);
}

#[test]
fn requests_expire_and_receipts_purge_without_replay_or_pile_order_loss() {
    let dir=tempdir().unwrap();let path=dir.path().join("requests.db");let mut s=Store::open(&path).unwrap();
    let now=1_800_000_000_000;
    let c=Command{request_id:"first".into(),epoch:s.snapshot().unwrap().epoch,issued_at:Some(now),action:Action::Create{id:"a".into(),title:"private title".into()}};
    let once=s.apply_at(&c,now).unwrap();
    assert_eq!(s.apply_at(&c,now+REQUEST_LIFETIME_MS-1).unwrap().tasks,once.tasks);
    let mut renewed=c.clone();renewed.issued_at=Some(now+1);
    assert_eq!(s.apply_at(&renewed,now+1).unwrap_err().code,"validation","the timestamp is part of the immutable payload");
    let before=serde_json::to_value(s.snapshot().unwrap()).unwrap();
    for issued_at in [None,Some(now-REQUEST_LIFETIME_MS),Some(-1)] {
        let invalid=Command{request_id:"invalid".into(),issued_at,..c.clone()};
        assert_eq!(s.apply_at(&invalid,now).unwrap_err().code,"expired");
        assert_eq!(serde_json::to_value(s.snapshot().unwrap()).unwrap(),before);
    }
    let legacy:Command=serde_json::from_value(serde_json::json!({"request_id":"legacy","epoch":c.epoch,"action":{"type":"create","id":"old","title":"kept"}})).unwrap();
    assert_eq!(s.apply_at(&legacy,now).unwrap_err().code,"expired","missing timestamps expire instead of failing draft decoding or renewing");
    assert_eq!(s.apply_at(&c,now+REQUEST_LIFETIME_MS).unwrap().tasks,once.tasks,"a recorded retry acknowledges completion even after its execution lifetime");
    assert_eq!(s.apply_at(&c,now-1).unwrap().tasks,once.tasks,"receipt lookup precedes clock validation");
    assert_eq!(s.acknowledge(&c).unwrap().unwrap().tasks,once.tasks);
    assert!(s.acknowledge(&legacy).unwrap().is_none(),"an unknown legacy draft is only inspected, never executed");
    assert_eq!(s.acknowledge(&renewed).unwrap_err().code,"validation");
    let ahead=Command{request_id:"ahead".into(),issued_at:Some(now+REQUEST_CLOCK_TOLERANCE_MS),action:Action::Create{id:"ahead".into(),title:"clock tolerance".into()},..c.clone()};
    let too_far=Command{request_id:"too-far".into(),issued_at:Some(now+REQUEST_CLOCK_TOLERANCE_MS+1),..ahead.clone()};
    assert_eq!(s.apply_at(&too_far,now).unwrap_err().code,"clock");
    s.apply_at(&ahead,now).unwrap();
    let conn=rusqlite::Connection::open(&path).unwrap();
    let (payload,accepted):(String,i64)=conn.query_row("SELECT payload,accepted_at FROM receipts WHERE id='first'",[],|r|Ok((r.get(0)?,r.get(1)?))).unwrap();
    assert_eq!(accepted,now);assert_eq!(payload.len(),64);assert!(payload.bytes().all(|c|c.is_ascii_hexdigit()));
    assert_eq!(conn.prepare("SELECT name FROM pragma_table_info('receipts')").unwrap().query_map([],|r|r.get::<_,String>(0)).unwrap().collect::<std::result::Result<Vec<_>,_>>().unwrap(),["id","payload","accepted_at"]);
    assert_eq!(s.purge_receipts(now+REQUEST_LIFETIME_MS).unwrap(),1);
    assert!(s.acknowledge(&c).unwrap().is_none());
    assert_eq!(conn.query_row::<i64,_,_>("SELECT accepted_at FROM receipts WHERE id='ahead'",[],|r|r.get(0)).unwrap(),now+REQUEST_CLOCK_TOLERANCE_MS);
    assert!(s.apply_at(&ahead,now+REQUEST_LIFETIME_MS).is_ok(),"a tolerated future timestamp retains its receipt through its retry horizon");
    assert_eq!(s.apply_at(&c,now+REQUEST_LIFETIME_MS-1).unwrap_err().code,"expired","the watermark blocks a purged retry after clock rollback");
    let fresh=Command{request_id:"fresh".into(),issued_at:Some(now+REQUEST_LIFETIME_MS-1),action:Action::Create{id:"b".into(),title:"fresh".into()},..c.clone()};
    s.apply_at(&fresh,now+REQUEST_LIFETIME_MS-1).unwrap();
    assert_eq!(s.purge_receipts(now+REQUEST_LIFETIME_MS-1).unwrap(),0);
    assert_eq!(conn.query_row::<String,_,_>("SELECT value FROM meta WHERE key='receipt_cutoff'",[],|r|r.get(0)).unwrap(),now.to_string());
    assert!(s.apply_at(&fresh,now-1).is_ok(),"a recorded request still acknowledges after a larger clock correction");
    let unseen=Command{request_id:"unseen".into(),..fresh.clone()};
    assert_eq!(s.apply_at(&unseen,now-1).unwrap_err().code,"clock","an unresolved request cannot execute after a larger clock correction");
    // The existing restore changes epoch and safely resets a mistaken future watermark.
    let backup=dir.path().join("backup.db");s.backup(&backup).unwrap();
    let epoch=s.snapshot().unwrap().epoch;s.restore(&backup,&epoch,&dir.path().join("safety.db")).unwrap();
    assert_eq!(s.apply_at(&c,now+REQUEST_LIFETIME_MS-1).unwrap_err().code,"epoch");
    assert_eq!(s.acknowledge(&c).unwrap_err().code,"epoch");
    let fresh=command(&s,Action::Create{id:"after-restore".into(),title:"current clock".into()});s.apply(&fresh).unwrap();
    assert_eq!(conn.query_row::<String,_,_>("SELECT value FROM meta WHERE key='receipt_cutoff'",[],|r|r.get(0)).unwrap(),"0");
    // A real v6 receipt shape upgrades once, without the older list-to-inbox backfill.
    let path=dir.path().join("v6.db");let mut s=Store::open(&path).unwrap();
    for id in ["z","a","m","b"] {create(&mut s,id);}
    put(&mut s,&["a","z"],Some("p1"),Some(1),0).unwrap();put(&mut s,&["m","b"],Some("p2"),Some(1),0).unwrap();
    let mut move_pile=command(&s,Action::MovePile{pile:"p2".into(),position:1});s.apply(&move_pile).unwrap();
    let kept=s.snapshot().unwrap();drop(s);
    let conn=rusqlite::Connection::open(&path).unwrap();
    // The historical serializer had no issued_at field, including no null placeholder.
    use sha2::{Digest,Sha256};
    let historical=format!(r#"{{"request_id":"{}","epoch":"{}","action":{{"type":"move_pile","pile":"p2","position":1}}}}"#,move_pile.request_id,move_pile.epoch);
    conn.execute("UPDATE receipts SET payload=?1 WHERE id=?2",rusqlite::params![format!("{:x}",Sha256::digest(historical.as_bytes())),move_pile.request_id]).unwrap();
    move_pile.issued_at=None;
    conn.execute_batch("DROP INDEX receipt_accepted; ALTER TABLE receipts DROP COLUMN accepted_at; DELETE FROM meta WHERE key='receipt_cutoff'; PRAGMA user_version=6;").unwrap();drop(conn);
    assert_eq!(Store::inspect_backup(&path).unwrap().tasks,4);
    let start=chrono::Utc::now().timestamp_millis();let mut s=Store::open(&path).unwrap();let end=chrono::Utc::now().timestamp_millis();
    // v9 reads the free board once: the protos stay in the 들어옴 top to bottom, left to right, and the old piles go.
    // Like a real v6 store this one has no board positions, so the board is first laid out in pile order (p2 was moved first).
    let migrated=s.snapshot().unwrap();
    assert_eq!(bench(&migrated),vec![(None,ids(&["m","b","a","z"]))]);assert!(migrated.piles.is_empty()&&kept.piles.len()==2);
    assert_eq!(s.acknowledge(&move_pile).unwrap().unwrap().piles,migrated.piles);
    assert_eq!(s.apply_at(&move_pile,0).unwrap().piles,migrated.piles,"migrated legacy receipts acknowledge without renewing or reapplying");
    let conn=rusqlite::Connection::open(&path).unwrap();
    let (count,min,max):(i64,i64,i64)=conn.query_row("SELECT count(*),min(accepted_at),max(accepted_at) FROM receipts",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).unwrap();
    assert_eq!(count,7);assert_eq!(min,max);assert!((start..=end).contains(&min));
    assert_eq!(conn.query_row::<i64,_,_>("SELECT count(*) FROM pragma_index_list('receipts') WHERE name='receipt_accepted'",[],|r|r.get(0)).unwrap(),1);
    drop(s);drop(conn);let mut s=Store::open(&path).unwrap();
    assert_eq!(s.purge_receipts(max+REQUEST_LIFETIME_MS-1).unwrap(),0);
    assert_eq!(s.purge_receipts(max+REQUEST_LIFETIME_MS).unwrap(),7);
    assert_eq!(bench(&s.snapshot().unwrap()),bench(&migrated));
}

#[test]
fn scheduling_rejects_overlap_and_preserves_identity_on_move() {
    let dir = tempdir().unwrap(); let mut s = Store::open(&dir.path().join("app.db")).unwrap();
    let a = create(&mut s, "a"); let b = create(&mut s, "b");
    let c = command(&s, update(&a, "2026-10-08T10:00", 45)); s.apply(&c).unwrap();
    for (date, duration, code) in [
        ("2026-10-08T10:30",30,"overlap"), ("2026-10-08T23:45",30,"validation"),
        ("2026-10-08T10:01",30,"validation"), ("2026-02-30T10:00",30,"validation"),
        ("2026-10-08T11:00",5,"validation")
    ] {
        let c = command(&s, update(&b,date,duration)); assert_eq!(s.apply(&c).unwrap_err().code,code);
    }
    let c = command(&s, update(&b,"2026-10-08T10:45",30)); s.apply(&c).unwrap();
    // Explicit placement can cross either work boundary, a break, or a day off.
    for (start,duration) in [("2026-10-08T12:00",30),("2026-10-08T08:45",30),("2026-10-08T17:45",30),("2026-10-10T10:00",30),("2026-10-08T23:45",15)] {
        let b=find(&s.snapshot().unwrap(),"b");
        let c=command(&s,update(&b,start,duration));let moved=s.apply(&c).unwrap();
        assert_eq!(find(&moved,"b").starts_at.as_deref(),Some(start));
    }
    let a = s.snapshot().unwrap().tasks.into_iter().find(|t| t.id=="a").unwrap();
    let c = command(&s, update(&a,"2026-10-09T10:00",45)); let after = s.apply(&c).unwrap();
    assert_eq!(after.tasks.len(),2); assert_eq!(after.tasks.iter().filter(|t| t.starts_at.as_deref()==Some("2026-10-08T10:00")).count(),0);
    let mut days = after.settings.days.clone(); days[4].enabled=false;
    let c = command(&s, Action::SetSettings { expected_revision: after.settings.revision, days });
    assert_eq!(s.apply(&c).unwrap().tasks,after.tasks);
}

#[test]
fn date_exceptions_are_atomic_persistent_and_restorable() {
    let dir=tempdir().unwrap();let path=dir.path().join("app.db");let mut s=Store::open(&path).unwrap();
    let mut settings=s.snapshot().unwrap().settings;
    let mut lunch_day=settings.days[3].clone();lunch_day.breaks.clear();
    settings.exceptions.push(DayException{date:"2026-10-08".into(),kind:"custom".into(),day:lunch_day});
    let set=|settings:&Settings,move_conflicts|Action::SetSchedule{expected_revision:settings.revision,days:settings.days.clone(),exceptions:settings.exceptions.clone(),weekly_target:settings.weekly_target,work_days:settings.work_days,move_conflicts};
    let c=command(&s,set(&settings,false));settings=s.apply(&c).unwrap().settings;
    let c=command(&s,Action::CreateScheduled{id:"lunch".into(),title:"급한 일".into(),starts_at:Some("2026-10-08T12:00".into()),duration:30});
    assert_eq!(s.apply(&c).unwrap().tasks.len(),1);assert_eq!(s.apply(&c).unwrap().tasks.len(),1);
    let c=command(&s,Action::CreateScheduled{id:"next".into(),title:"다음 주".into(),starts_at:Some("2026-10-15T12:00".into()),duration:30});
    let placed=s.apply(&c).unwrap();
    assert_eq!(placed.settings.day(chrono::NaiveDate::from_ymd_opt(2026,10,15).unwrap()).breaks.len(),1);
    settings.exceptions[0].kind="leave".into();settings.exceptions[0].day.enabled=false;
    let c=command(&s,set(&settings,false));let snapshot=s.apply(&c).unwrap();
    assert_eq!(snapshot.tasks,placed.tasks);settings=snapshot.settings;
    let c=command(&s,set(&settings,true));let snapshot=s.apply(&c).unwrap();
    // Both legacy move_conflicts values preserve explicit times, identity and revisions.
    assert_eq!(snapshot.tasks,placed.tasks);assert_eq!(s.apply(&c).unwrap().tasks,placed.tasks);
    let backup=dir.path().join("backup.db");s.backup(&backup).unwrap();drop(s);
    let mut s=Store::open(&path).unwrap();let restored=s.snapshot().unwrap();assert_eq!(restored.settings.exceptions[0].kind,"leave");
    assert_eq!(restored.settings.weekly_target,2400);assert_eq!(restored.settings.work_days,5);
    assert_eq!(restored.tasks,placed.tasks);
    s.restore(&backup,&restored.epoch,&dir.path().join("safety.db")).unwrap();
    assert_eq!(s.snapshot().unwrap().settings,restored.settings);
    assert_eq!(s.snapshot().unwrap().tasks,placed.tasks);
}

#[test]
fn settings_reject_invalid_exceptions_and_accept_legacy_json() {
    let mut settings=Settings::default();let mut value=serde_json::to_value(&settings).unwrap();
    for key in ["exceptions","weekly_target","work_days","routines"] {value.as_object_mut().unwrap().remove(key);}
    let legacy:Settings=serde_json::from_value(value).unwrap();assert_eq!(legacy.weekly_target,2400);assert!(legacy.exceptions.is_empty());
    let day=settings.days[0].clone();
    for date in ["2026-02-30","2026-1-01"] {settings.exceptions=vec![DayException{date:date.into(),kind:"custom".into(),day:day.clone()}];assert!(validate_settings(&settings).is_err());}
    let exception=DayException{date:"2026-10-09".into(),kind:"early".into(),day:WorkingDay{end:900,..day}};
    settings.exceptions=vec![exception.clone()];assert!(validate_settings(&settings).is_ok());
    settings.exceptions.push(exception);assert!(validate_settings(&settings).is_err());
    settings.exceptions.clear();settings.weekly_target=-15;assert!(validate_settings(&settings).is_err());
    settings.weekly_target=2400;
    for (field,value) in [("id",serde_json::json!("")),("title",serde_json::json!(" ")),("title",serde_json::json!("a".repeat(2001))),("body",serde_json::json!("a".repeat(200001))),("weekdays",serde_json::json!([])),("weekdays",serde_json::json!([7])),("weekdays",serde_json::json!([0,0])),("start",serde_json::json!(601)),("start",serde_json::json!(-15)),("start",serde_json::json!(1440)),("duration",serde_json::json!(20)),("duration",serde_json::json!(0))] {
        let mut value_routine=serde_json::to_value(routine("routine",600)).unwrap();value_routine[field]=value;
        settings.routines=vec![serde_json::from_value(value_routine).unwrap()];assert_eq!(validate_settings(&settings).unwrap_err().code,"validation","accepted {field}");
    }
    settings.routines=vec![routine("same",600),routine("same",630)];assert!(validate_settings(&settings).is_err());
}

#[test]
fn verified_restore_preserves_original_and_rejects_old_queue() {
    let dir = tempdir().unwrap(); let mut s = Store::open(&dir.path().join("app.db")).unwrap();
    let a=create(&mut s,"a");let managed=s.create_backup(dir.path()).unwrap();
    let backup=managed_backup_path(dir.path(),&managed.id).unwrap();
    let old = command(&s, Action::SetCompleted { id:a.id.clone(), expected_revision:a.revision, completed:true,date:Some("2026-10-11".into()) });
    s.apply(&old).unwrap();
    let safety=backup.parent().unwrap().join(format!("before-restore-{}.sqlite",uuid::Uuid::new_v4()));
    let epoch=s.snapshot().unwrap().epoch;
    s.restore(&backup,&epoch,&safety).unwrap();
    assert!(!s.snapshot().unwrap().tasks[0].completed);
    assert!(Store::open(&safety).unwrap().snapshot().unwrap().tasks[0].completed);
    let listed=Store::list_backups(dir.path()).unwrap();
    assert_eq!(listed.len(),2);assert!(listed.iter().any(|b|b.kind=="manual"));assert!(listed.iter().any(|b|b.kind=="safety"&&b.completed==Some(1)));
    assert_eq!(s.apply(&old).unwrap_err().code,"epoch");
    let before=s.snapshot().unwrap().epoch;
    assert!(s.restore(&backup,&before,&safety).is_err());
    assert_eq!(s.snapshot().unwrap().epoch,before);
    assert!(s.backup(&dir.path().join("app.db")).is_err());
}

#[test]
fn managed_backups_bound_paths_list_damage_and_sort_verified_records() {
    let dir=tempdir().unwrap();let s=Store::open(&dir.path().join("app.db")).unwrap();
    assert!(Store::list_backups(dir.path()).unwrap().is_empty());assert!(!dir.path().join("backups").exists());
    let manual=s.create_backup(dir.path()).unwrap();
    assert_eq!(manual.kind,"manual");assert!(manual.id.starts_with("manual-"));assert_eq!(manual.tasks,Some(0));assert!(manual.error.is_none());
    let backups=dir.path().join("backups");
    let mut ids=vec![(manual.id.clone(),"manual")];
    for (id,kind) in [("hour-2026100909.sqlite","hour"),("day-20261009.sqlite","day"),("before-restore-00000000-0000-0000-0000-000000000001.sqlite","safety")] {
        s.backup(&backups.join(id)).unwrap();ids.push((id.into(),kind));
    }
    for (n,(id,_)) in ids.iter().enumerate() {
        let conn=rusqlite::Connection::open(backups.join(id)).unwrap();
        conn.execute("UPDATE meta SET value=?1 WHERE key='backup_created_at'",[format!("2026-10-09T{:02}:00:00Z",n)]).unwrap();
    }
    let broken="day-20261008.sqlite";std::fs::write(backups.join(broken),b"broken").unwrap();
    std::fs::write(backups.join("unknown.sqlite"),b"preserve unknown").unwrap();
    let nonfile="manual-00000000-0000-0000-0000-000000000002.sqlite";std::fs::create_dir(backups.join(nonfile)).unwrap();
    let before=std::fs::read(backups.join(&manual.id)).unwrap();
    let listed=Store::list_backups(dir.path()).unwrap();
    let valid:Vec<_>=listed.iter().filter(|b|b.error.is_none()).collect();
    assert_eq!(valid.iter().map(|b|(b.id.as_str(),b.kind)).collect::<Vec<_>>(),ids.iter().rev().map(|(id,kind)|(id.as_str(),*kind)).collect::<Vec<_>>());
    let damaged=listed.iter().find(|b|b.id==broken).unwrap();assert!(damaged.error.is_some());assert_eq!(damaged.tasks,None);assert_eq!(damaged.created_at,None);
    assert!(listed.iter().find(|b|b.id==nonfile).unwrap().error.is_some());assert_eq!(listed.len(),6);
    assert_eq!(std::fs::read(backups.join(&manual.id)).unwrap(),before);assert_eq!(std::fs::read(backups.join(broken)).unwrap(),b"broken");
    for id in ["../app.db","C:\\outside.sqlite","manual-../app.sqlite","hour-2026130109.sqlite","hour-2026100924.sqlite","manual-not-a-uuid.sqlite","unknown.sqlite",nonfile] {
        assert!(managed_backup_path(dir.path(),id).is_err(),"accepted {id}");
    }
    assert_eq!(managed_backup_path(dir.path(),&manual.id).unwrap(),backups.join(&manual.id));
}

#[test]
fn backup_inspection_reports_validated_contents_without_changing_files() {
    let dir=tempdir().unwrap();let mut s=Store::open(&dir.path().join("app.db")).unwrap();
    let a=create(&mut s,"a");let c=command(&s,update(&a,"2026-10-08T10:00",30));
    let a=s.apply(&c).unwrap().tasks[0].clone();
    let c=command(&s,Action::SetCompleted{id:a.id,expected_revision:a.revision,completed:true,date:None});s.apply(&c).unwrap();
    create(&mut s,"b");
    let source=dir.path().join("backup.db");s.backup(&source).unwrap();
    create(&mut s,"live-only");s.save_draft("main",1,"보존할 초안").unwrap();
    let live=serde_json::to_value(s.snapshot().unwrap()).unwrap();
    let bytes=std::fs::read(&source).unwrap();
    let files=|| {let mut files:Vec<_>=std::fs::read_dir(dir.path()).unwrap().map(|e|e.unwrap().file_name()).collect();files.sort();files};
    let before_files=files();
    let inspection=Store::inspect_backup(&source).unwrap();
    assert_eq!((inspection.tasks,inspection.completed,inspection.scheduled),(2,1,1));
    chrono::DateTime::parse_from_rfc3339(inspection.created_at.as_deref().unwrap()).unwrap();
    assert_eq!(std::fs::read(&source).unwrap(),bytes);assert_eq!(files(),before_files);
    assert_eq!(serde_json::to_value(s.snapshot().unwrap()).unwrap(),live);
    assert_eq!(s.draft("main").unwrap(),(1,"보존할 초안".into()));
    s.save_draft("main",2,"").unwrap();
    {
        let conn=rusqlite::Connection::open(&source).unwrap();
        conn.execute("DELETE FROM meta WHERE key='backup_created_at'",[]).unwrap();
        conn.pragma_update(None,"user_version",1).unwrap();
    }
    let legacy=std::fs::read(&source).unwrap();
    assert!(Store::inspect_backup(&source).unwrap().created_at.is_none());
    assert_eq!(std::fs::read(&source).unwrap(),legacy);
    let safety=dir.path().join("safety.db");let epoch=s.snapshot().unwrap().epoch;
    for (sql,code) in [("UPDATE tasks SET id='' WHERE id='a'","validation"),("PRAGMA user_version=11","schema")] {
        {rusqlite::Connection::open(&source).unwrap().execute_batch(sql).unwrap();}
        let original=std::fs::read(&source).unwrap();
        assert_eq!(Store::inspect_backup(&source).unwrap_err().code,code);
        assert_eq!(s.restore(&source,&epoch,&safety).unwrap_err().code,code);
        assert_eq!(std::fs::read(&source).unwrap(),original);assert!(!safety.exists());
        assert_eq!(serde_json::to_value(s.snapshot().unwrap()).unwrap(),live);
    }
}

#[test]
fn invalid_existing_database_is_not_reinitialized() {
    let dir=tempdir().unwrap(); let path=dir.path().join("app.db");
    let bytes=b"important original evidence"; std::fs::write(&path,bytes).unwrap();
    assert!(Store::open(&path).is_err());assert!(Store::inspect_backup(&path).is_err()); assert_eq!(std::fs::read(&path).unwrap(),bytes);
    let empty=dir.path().join("empty.db"); std::fs::write(&empty,[]).unwrap();
    assert!(Store::open(&empty).is_err());assert!(Store::inspect_backup(&empty).is_err()); assert_eq!(std::fs::metadata(empty).unwrap().len(),0);
    let missing=dir.path().join("missing.db");assert!(Store::inspect_backup(&missing).is_err());assert!(!missing.exists());
    let damaged=dir.path().join("damaged.db");
    for (suffix,bytes) in [("",b"damaged primary".as_slice()),("-wal",b"original wal".as_slice()),("-shm",b"original shm".as_slice())] {
        std::fs::write(dir.path().join(format!("damaged.db{suffix}")),bytes).unwrap();
    }
    assert!(Store::open(&damaged).is_err());
    for (suffix,bytes) in [("",b"damaged primary".as_slice()),("-wal",b"original wal".as_slice()),("-shm",b"original shm".as_slice())] {
        assert_eq!(std::fs::read(dir.path().join(format!("damaged.db{suffix}"))).unwrap(),bytes);
    }
    let wal_path=dir.path().join("wal.db");let mut writer=Store::open(&wal_path).unwrap();let primary=std::fs::read(&wal_path).unwrap();
    create(&mut writer,"wal-only");assert_eq!(std::fs::read(&wal_path).unwrap(),primary);
    assert!(dir.path().join("wal.db-wal").exists());
    let reader=Store::open(&wal_path).unwrap();assert_eq!(reader.snapshot().unwrap().tasks[0].id,"wal-only");drop(reader);drop(writer);
    assert!(!std::fs::read_dir(dir.path()).unwrap().any(|e|e.unwrap().file_name().to_string_lossy().contains(".validation-")));
}

#[test]
fn unavailable_store_recovery_preserves_evidence_and_invalidates_old_requests() {
    let dir=tempdir().unwrap();let path=dir.path().join("blokky.sqlite");let mut s=Store::open(&path).unwrap();
    let a=create(&mut s,"a");let c=command(&s,update(&a,"2026-10-08T10:00",45));s.apply(&c).unwrap();
    s.save_draft("main",1,"백업에 남은 오래된 초안").unwrap();
    let c=command(&s,Action::SetRoutines{expected_revision:1,routines:vec![routine("recovered",600)]});s.apply(&c).unwrap();
    let generated=ensure(&mut s,"2026-10-05","2026-10-05");let t=generated.tasks.iter().find(|t|t.starts_at.as_deref()==Some("2026-10-05T10:00")).unwrap();
    let c=command(&s,Action::ClearDay{date:"2026-10-05".into(),expected_tasks:vec![TaskRevision{id:t.id.clone(),revision:t.revision}]});s.apply(&c).unwrap();
    let expected=s.snapshot().unwrap();let backup=s.create_backup(dir.path()).unwrap();
    let stale=command(&s,Action::Create{id:"old-request".into(),title:"복원 전 요청".into()});drop(s);
    let originals=[("blokky.sqlite",b"damaged database".as_slice()),("blokky.sqlite-wal",b"damaged wal".as_slice()),("blokky.sqlite-shm",b"damaged shm".as_slice())];
    for (name,bytes) in originals {std::fs::write(dir.path().join(name),bytes).unwrap();}
    let mut recovered=Store::recover_from_backup(dir.path(),&backup.id).unwrap();let snapshot=recovered.snapshot().unwrap();
    assert_eq!(snapshot.tasks,expected.tasks);assert_eq!(snapshot.settings,expected.settings);assert_ne!(snapshot.epoch,expected.epoch);
    assert_eq!(recovered.draft("main").unwrap(),(0,String::new()));assert_eq!(recovered.apply(&stale).unwrap_err().code,"epoch");
    assert_eq!(ensure(&mut recovered,"2026-10-05","2026-10-05").tasks,expected.tasks);
    let archives:Vec<_>=std::fs::read_dir(dir.path().join("backups")).unwrap().map(|e|e.unwrap().path()).filter(|p|p.is_dir()).collect();
    assert_eq!(archives.len(),1);for (name,bytes) in originals {assert_eq!(std::fs::read(archives[0].join(name)).unwrap(),bytes);}
    drop(recovered);assert_eq!(Store::open(&path).unwrap().snapshot().unwrap().tasks,expected.tasks);
    assert!(!dir.path().join("blokky.sqlite.recovering").exists());

    // An interrupted rename must not become a new empty database on restart.
    std::fs::remove_file(&path).unwrap();std::fs::write(dir.path().join("blokky.sqlite.recovering"),[]).unwrap();
    assert_eq!(Store::open(&path).err().unwrap().code,"recovery_pending");assert!(!path.exists());
    let retried=Store::recover_from_backup(dir.path(),&backup.id).unwrap();assert_eq!(retried.snapshot().unwrap().tasks,expected.tasks);drop(retried);
    for (name,bytes) in originals {assert_eq!(std::fs::read(archives[0].join(name)).unwrap(),bytes);}
}

#[test]
fn unavailable_store_recovery_rejects_unsafe_changes_and_rolls_back_archive_failure() {
    let dir=tempdir().unwrap();let path=dir.path().join("blokky.sqlite");let mut s=Store::open(&path).unwrap();create(&mut s,"a");
    let backup=s.create_backup(dir.path()).unwrap();s.save_draft("main",1,"현재 초안").unwrap();
    assert_eq!(Store::recover_from_backup(dir.path(),&backup.id).err().unwrap().code,"conflict");
    assert_eq!(s.draft("main").unwrap().1,"현재 초안");drop(s);
    let originals=[("blokky.sqlite",b"original damaged database".as_slice()),("blokky.sqlite-wal",b"original damaged wal".as_slice())];
    for (name,bytes) in originals {std::fs::write(dir.path().join(name),bytes).unwrap();}
    let broken="day-20261008.sqlite";std::fs::write(dir.path().join("backups").join(broken),b"invalid backup").unwrap();
    for id in [broken,"../blokky.sqlite"] {
        assert!(Store::recover_from_backup(dir.path(),id).is_err());
        for (name,bytes) in originals {assert_eq!(std::fs::read(dir.path().join(name)).unwrap(),bytes);}
    }
    let shm=dir.path().join("blokky.sqlite-shm");std::fs::write(&shm,b"original damaged shm").unwrap();
    // Windows permits reading the third file but denies its archival rename.
    #[cfg(windows)]
    let locked={use std::os::windows::fs::OpenOptionsExt;std::fs::OpenOptions::new().read(true).share_mode(3).open(&shm).unwrap()};
    #[cfg(not(windows))]
    {std::fs::remove_file(&shm).unwrap();std::fs::create_dir(&shm).unwrap();}
    assert!(Store::recover_from_backup(dir.path(),&backup.id).is_err());
    for (name,bytes) in originals {assert_eq!(std::fs::read(dir.path().join(name)).unwrap(),bytes);}
    #[cfg(windows)]
    {assert_eq!(std::fs::read(&shm).unwrap(),b"original damaged shm");drop(locked);}
    #[cfg(not(windows))]
    assert!(shm.is_dir());
    assert!(!dir.path().join("blokky.sqlite.recovering").exists());
    assert!(Store::inspect_backup(&managed_backup_path(dir.path(),&backup.id).unwrap()).is_ok());
    assert!(!std::fs::read_dir(dir.path()).unwrap().any(|e|e.unwrap().file_name().to_string_lossy().starts_with("recovery-stage-")));
}

#[test]
fn drafts_keep_latest_sequence_and_block_restore_until_resolved() {
    let dir=tempdir().unwrap();let path=dir.path().join("app.db");let s=Store::open(&path).unwrap();
    let backup=dir.path().join("backup.db");s.backup(&backup).unwrap();
    s.save_draft("main",2,"새 한글 메모").unwrap();s.save_draft("main",1,"").unwrap();
    assert_eq!(s.draft("main").unwrap(),(2,"새 한글 메모".into()));
    drop(s);let mut s=Store::open(&path).unwrap();
    assert_eq!(s.draft("main").unwrap().1,"새 한글 메모");
    let epoch=s.snapshot().unwrap().epoch;
    assert_eq!(s.restore(&backup,&epoch,&dir.path().join("before.db")).unwrap_err().code,"pending");
    s.save_draft("main",3,"").unwrap();s.restore(&backup,&epoch,&dir.path().join("before.db")).unwrap();
}

#[test]
fn automatic_backups_keep_distinct_hours_and_days_and_verify_metadata() {
    use chrono::{Local,TimeZone,Duration};
    let dir=tempdir().unwrap();let s=Store::open(&dir.path().join("app.db")).unwrap();let backups=dir.path().join("backups");
    let start=Local.with_ymd_and_hms(2026,9,1,9,0,0).unwrap();
    for n in 0..32 {s.automatic_backup(&backups,start+Duration::days(n)).unwrap();}
    s.automatic_backup(&backups,start+Duration::days(31)).unwrap();
    let names:Vec<_>=std::fs::read_dir(&backups).unwrap().map(|e|e.unwrap().file_name().to_string_lossy().to_string()).collect();
    assert_eq!(names.iter().filter(|n|n.starts_with("hour-")).count(),24);
    assert_eq!(names.iter().filter(|n|n.starts_with("day-")).count(),30);
    let broken=backups.join("hour-2026100409.sqlite");std::fs::write(&broken,b"broken").unwrap();
    assert!(s.automatic_backup(&backups,start+Duration::days(33)).is_err());
    assert_eq!(std::fs::read(&broken).unwrap(),b"broken");
}

#[test]
fn flow_plans_keep_order_without_minutes_and_switch_with_fixed_reservations() {
    let dir=tempdir().unwrap();let path=dir.path().join("app.db");let mut s=Store::open(&path).unwrap();let day="2026-10-08";
    assert_eq!(flow(&mut s,"e",day,600).flow_order,Some(1));
    let (a,b,c,d)=(create(&mut s,"a"),create(&mut s,"b"),create(&mut s,"c"),create(&mut s,"d"));
    for t in [&a,&b] {let cmd=command(&s,place(t,Some(day),None));s.apply(&cmd).unwrap();}
    let snap=s.snapshot().unwrap();assert_eq!(ordered(&snap,day),["e","a","b"]);let (a,b)=(find(&snap,"a"),find(&snap,"b"));
    // Inserting shifts only later order numbers and leaves their editors valid.
    let cmd=command(&s,place(&c,Some(day),Some("a")));let snap=s.apply(&cmd).unwrap();
    assert_eq!(ordered(&snap,day),["e","c","a","b"]);assert_eq!((find(&snap,"a").revision,find(&snap,"b").revision),(a.revision,b.revision));
    // Flow work is never refused for overlapping work, lunch or a day off.
    let cmd=command(&s,place(&d,Some("2026-10-10"),None));assert_eq!(find(&s.apply(&cmd).unwrap(),"d").flow_order,Some(1));
    let before=s.snapshot().unwrap();let c=find(&before,"c");
    for (date,target) in [(Some(day),Some("d")),(Some(day),Some("missing")),(Some(day),Some("c")),(None,Some("e")),(Some("2026-02-30"),None)] {
        let cmd=command(&s,place(&c,date,target));assert_eq!(s.apply(&cmd).unwrap_err().code,"validation","{date:?} {target:?}");
        assert_eq!(s.snapshot().unwrap().tasks,before.tasks);
    }
    let mismatch=command(&s,Action::Update{id:c.id.clone(),expected_revision:c.revision,title:c.title.clone(),body:String::new(),starts_at:Some("2026-10-08T10:00".into()),duration:30,plan_date:Some("2026-10-09".into()),before:None,sized:None,wait:None});
    assert_eq!(s.apply(&mismatch).unwrap_err().code,"validation");
    // Fixing reserves exact minutes against other fixed tasks only.
    let cmd=command(&s,update(&find(&before,"a"),"2026-10-08T10:00",60));let snap=s.apply(&cmd).unwrap();
    let fixed=find(&snap,"a");assert_eq!((fixed.plan_date.as_deref(),fixed.flow_order),(Some(day),None));assert_eq!(ordered(&snap,day),["e","c","b"]);
    let cmd=command(&s,update(&find(&snap,"b"),"2026-10-08T10:30",30));assert_eq!(s.apply(&cmd).unwrap_err().code,"overlap");
    // Releasing the time appends the task to the end of that day's order.
    let cmd=command(&s,place(&fixed,Some(day),None));let snap=s.apply(&cmd).unwrap();
    assert_eq!(ordered(&snap,day),["e","c","b","a"]);assert_eq!(find(&snap,"a").starts_at,None);
    let open:Vec<_>=["e","c","b","a"].iter().map(|id|revision(&find(&snap,id))).collect();
    let stale=vec![TaskRevision{revision:open[0].revision+1,..open[0].clone()},open[1].clone(),open[2].clone(),open[3].clone()];
    for (expected,code) in [(open[..3].to_vec(),"conflict"),(stale,"conflict"),([open.clone(),vec![revision(&find(&snap,"d"))]].concat(),"conflict"),(vec![open[0].clone(),open[0].clone(),open[1].clone(),open[2].clone()],"validation")] {
        let cmd=command(&s,Action::ReorderFlow{date:day.into(),expected});assert_eq!(s.apply(&cmd).unwrap_err().code,code);
        assert_eq!(s.snapshot().unwrap().tasks,snap.tasks);
    }
    let reorder=command(&s,Action::ReorderFlow{date:day.into(),expected:vec![open[3].clone(),open[2].clone(),open[1].clone(),open[0].clone()]});
    let reordered=s.apply(&reorder).unwrap();assert_eq!(ordered(&reordered,day),["a","b","c","e"]);
    assert!(open.iter().all(|r|find(&reordered,&r.id).revision==r.revision));assert_eq!(s.apply(&reorder).unwrap().tasks,reordered.tasks);
    // Returning to the unplanned list clears both date and order.
    let cmd=command(&s,place(&find(&reordered,"e"),None,None));let snap=s.apply(&cmd).unwrap();
    assert_eq!((find(&snap,"e").plan_date,find(&snap,"e").flow_order),(None,None));
    // Older clients that omit placement fields still fix by time with an unchanged fingerprint.
    let b=find(&snap,"b");
    let legacy:Action=serde_json::from_value(serde_json::json!({"type":"update","id":"b","expected_revision":b.revision,"title":b.title,"body":"","starts_at":"2026-10-09T10:00","duration":30})).unwrap();
    assert!(!serde_json::to_string(&legacy).unwrap().contains("plan_date"));
    let cmd=command(&s,legacy);let snap=s.apply(&cmd).unwrap();assert_eq!(find(&snap,"b").plan_date.as_deref(),Some("2026-10-09"));
    // Moving to an empty date starts at one, regardless of the previous day's order.
    let c=find(&snap,"c");assert!(c.flow_order.unwrap()>1);
    let cmd=command(&s,place(&c,Some("2026-10-15"),None));let snap=s.apply(&cmd).unwrap();
    assert_eq!(find(&snap,"c").flow_order,Some(1));
    drop(s);let s=Store::open(&path).unwrap();assert_eq!(s.snapshot().unwrap().tasks,snap.tasks);
}

#[test]
fn completing_flow_moves_the_anchor_forward_atomically_and_survives_restore() {
    let dir=tempdir().unwrap();let path=dir.path().join("app.db");let mut s=Store::open(&path).unwrap();let day="2026-10-08";
    let (x,y,z,other)=(flow(&mut s,"x",day,60),flow(&mut s,"y",day,45),flow(&mut s,"z",day,30),flow(&mut s,"other","2026-10-09",30));
    let cmd=command(&s,Action::CreateScheduled{id:"w".into(),title:"워크숍".into(),starts_at:Some("2026-10-08T14:00".into()),duration:60});s.apply(&cmd).unwrap();
    let before=s.snapshot().unwrap();
    let complete=|s:&Store,items:Vec<TaskRevision>,at:Option<&str>|command(s,Action::CompleteFlow{date:day.into(),items,at:at.map(Into::into)});
    for (items,at,code) in [
        (vec![revision(&x),TaskRevision{revision:y.revision+1,..revision(&y)}],Some("2026-10-08T09:40"),"conflict"),
        (vec![],None,"validation"),(vec![revision(&x),revision(&x)],None,"validation"),
        (vec![revision(&find(&before,"w"))],None,"conflict"),(vec![revision(&other)],None,"conflict"),
        (vec![revision(&x)],Some("2026-10-09T09:40"),"validation"),(vec![revision(&x)],Some("2026-10-08T9:40"),"validation"),
    ] {
        let cmd=complete(&s,items,at);assert_eq!(s.apply(&cmd).unwrap_err().code,code);
        let now=s.snapshot().unwrap();assert_eq!((now.tasks,now.layouts),(before.tasks.clone(),vec![]));
    }
    let done=complete(&s,vec![revision(&x)],Some("2026-10-08T09:40"));let after=s.apply(&done).unwrap();
    let completed=find(&after,"x");assert!(completed.completed);
    assert_eq!((completed.plan_date.as_deref(),completed.flow_order,completed.revision),(Some(day),x.flow_order,x.revision+1));
    assert_eq!(after.layouts,vec![DayLayout{date:day.into(),anchor:580}]);assert_eq!(ordered(&after,day),["y","z"]);
    assert_eq!(s.apply(&done).unwrap().tasks,after.tasks);
    // Later confirmations never move the anchor backwards; no time leaves it untouched.
    let cmd=complete(&s,vec![revision(&y)],Some("2026-10-08T09:10"));assert_eq!(s.apply(&cmd).unwrap().layouts[0].anchor,580);
    let reflow=|s:&Store,date:&str,at:&str|command(s,Action::Reflow{date:date.into(),at:at.into()});
    let cmd=reflow(&s,day,"2026-10-08T10:20");assert_eq!(s.apply(&cmd).unwrap().layouts[0].anchor,620);
    for (date,at) in [(day,"2026-10-09T10:20"),("2026-02-30","2026-02-30T10:20")] {let cmd=reflow(&s,date,at);assert_eq!(s.apply(&cmd).unwrap_err().code,"validation");}
    let cmd=complete(&s,vec![revision(&z)],None);let snap=s.apply(&cmd).unwrap();assert_eq!(snap.layouts[0].anchor,620);assert!(ordered(&snap,day).is_empty());
    // Completing twice conflicts; undo returns the same task to its preserved order.
    let cmd=complete(&s,vec![revision(&find(&snap,"x"))],None);assert_eq!(s.apply(&cmd).unwrap_err().code,"conflict");
    let x=find(&snap,"x");let cmd=command(&s,Action::SetCompleted{id:x.id.clone(),expected_revision:x.revision,completed:false,date:None});
    let undone=s.apply(&cmd).unwrap();assert_eq!(ordered(&undone,day),["x"]);assert_eq!(find(&undone,"x").flow_order,Some(1));
    let backup=dir.path().join("backup.db");s.backup(&backup).unwrap();
    assert_eq!(Store::inspect_backup(&backup).unwrap().scheduled,5);
    for (date,at) in [(day,"2026-10-08T15:00"),("2026-10-09","2026-10-09T11:00")] {let cmd=reflow(&s,date,at);s.apply(&cmd).unwrap();}
    drop(s);let mut s=Store::open(&path).unwrap();
    assert_eq!(s.snapshot().unwrap().layouts,vec![DayLayout{date:day.into(),anchor:900},DayLayout{date:"2026-10-09".into(),anchor:660}]);
    let epoch=s.snapshot().unwrap().epoch;let restored=s.restore(&backup,&epoch,&dir.path().join("safety.db")).unwrap();
    assert_eq!(restored.layouts,vec![DayLayout{date:day.into(),anchor:620}]);assert_eq!(restored.tasks,undone.tasks);
}

#[test]
fn trash_sets_work_aside_restores_it_in_place_and_purges_after_retention() {
    let dir=tempdir().unwrap();let path=dir.path().join("app.db");let mut s=Store::open(&path).unwrap();let day="2026-10-05";
    let (_,b,_)=(flow(&mut s,"a",day,60),flow(&mut s,"b",day,30),flow(&mut s,"c",day,30));
    let delete=|s:&Store,t:&Task|command(s,Action::Delete{id:t.id.clone(),expected_revision:t.revision});
    let restore=|s:&Store,id:&str|command(s,Action::RestoreTrashed{id:id.into()});
    let purge=|s:&Store,ids:&[&str]|command(s,Action::PurgeTrashed{ids:ids.iter().map(|id|id.to_string()).collect()});
    // Deleting sets the task aside whole; it leaves every schedule and its retry is a no-op.
    let cmd=delete(&s,&b);let trashed=s.apply(&cmd).unwrap();
    assert_eq!(ordered(&trashed,day),["a","c"]);assert!(trashed.tasks.iter().all(|t|t.id!="b"));
    assert_eq!(trashed.trash.len(),1);assert_eq!(trashed.trash[0].task,b);
    let at=chrono::DateTime::parse_from_rfc3339(&trashed.trash[0].deleted_at).unwrap();assert!((chrono::Utc::now()-at.with_timezone(&chrono::Utc)).num_seconds().abs()<60);
    assert_eq!(s.apply(&cmd).unwrap().trash,trashed.trash);
    for action in [Action::Delete{id:"b".into(),expected_revision:b.revision},Action::SetCompleted{id:"b".into(),expected_revision:b.revision,completed:true,date:None}] {
        let cmd=command(&s,action);assert_eq!(s.apply(&cmd).unwrap_err().code,"conflict");
    }
    // Restoring puts it back at its old place in the day's order without duplicating order numbers.
    let snap=s.snapshot().unwrap();
    let cmd=command(&s,Action::ReorderFlow{date:day.into(),expected:vec![revision(&find(&snap,"c")),revision(&find(&snap,"a"))]});s.apply(&cmd).unwrap();
    let cmd=restore(&s,"b");let back=s.apply(&cmd).unwrap();
    assert_eq!(ordered(&back,day),["c","b","a"]);assert!(back.trash.is_empty());
    assert_eq!(find(&back,"b"),Task{revision:b.revision+1,..b.clone()});
    let mut orders:Vec<_>=back.tasks.iter().filter_map(|t|t.flow_order).collect();orders.sort();orders.dedup();assert_eq!(orders.len(),3);
    assert_eq!(s.apply(&cmd).unwrap().tasks,back.tasks);
    let again=restore(&s,"b");assert_eq!(s.apply(&again).unwrap_err().code,"conflict");
    // A fixed task whose time was taken meanwhile comes back as flow work on its date (D8/D9); completion is kept.
    let cmd=command(&s,Action::CreateScheduled{id:"fixed".into(),title:"고정".into(),starts_at:Some("2026-10-05T10:00".into()),duration:60});let fixed=find(&s.apply(&cmd).unwrap(),"fixed");
    let cmd=command(&s,Action::SetCompleted{id:"fixed".into(),expected_revision:fixed.revision,completed:true,date:None});let fixed=find(&s.apply(&cmd).unwrap(),"fixed");
    let cmd=delete(&s,&fixed);s.apply(&cmd).unwrap();
    let cmd=command(&s,Action::CreateScheduled{id:"taker".into(),title:"새 예약".into(),starts_at:Some("2026-10-05T10:30".into()),duration:30});s.apply(&cmd).unwrap();
    let cmd=restore(&s,"fixed");let snap=s.apply(&cmd).unwrap();let back=find(&snap,"fixed");
    assert_eq!((back.starts_at.as_deref(),back.plan_date.as_deref(),back.flow_order,back.completed),(None,Some(day),Some(4),true));
    // Without a task conflict the exact time returns, including off-hours placements.
    let cmd=command(&s,Action::CreateScheduled{id:"free".into(),title:"저녁".into(),starts_at:Some("2026-10-05T20:00".into()),duration:30});let free=find(&s.apply(&cmd).unwrap(),"free");
    let cmd=delete(&s,&free);s.apply(&cmd).unwrap();let cmd=restore(&s,"free");assert_eq!(find(&s.apply(&cmd).unwrap(),"free").starts_at,free.starts_at);
    // Permanent removal names the items seen; anything else conflicts or is invalid.
    let (x,y)=(create(&mut s,"x"),create(&mut s,"y"));
    for t in [&x,&y] {let cmd=delete(&s,t);s.apply(&cmd).unwrap();}
    let before=s.snapshot().unwrap();
    for (ids,code) in [(vec![],"validation"),(vec!["x","x"],"validation"),(vec!["x","a"],"conflict"),(vec!["missing"],"conflict")] {
        let cmd=purge(&s,&ids);assert_eq!(s.apply(&cmd).unwrap_err().code,code);assert_eq!(s.snapshot().unwrap().trash,before.trash);
    }
    let cmd=purge(&s,&["x"]);let snap=s.apply(&cmd).unwrap();
    assert_eq!(snap.trash.iter().map(|t|t.task.id.as_str()).collect::<Vec<_>>(),["y"]);assert_eq!(snap.tasks,before.tasks);
    // The trash survives restart, backup and restore; inspection counts live work only.
    let backup=dir.path().join("backup.db");s.backup(&backup).unwrap();assert_eq!(Store::inspect_backup(&backup).unwrap().tasks,snap.tasks.len());
    let cmd=purge(&s,&["y"]);assert!(s.apply(&cmd).unwrap().trash.is_empty());
    drop(s);let mut s=Store::open(&path).unwrap();assert!(s.snapshot().unwrap().trash.is_empty());
    let epoch=s.snapshot().unwrap().epoch;let restored=s.restore(&backup,&epoch,&dir.path().join("safety.db")).unwrap();
    assert_eq!((restored.tasks,restored.trash.clone()),(snap.tasks.clone(),snap.trash.clone()));
    // Retention: kept through day 29, removed after day 30, and live work is never touched.
    let now=chrono::Utc::now();
    assert_eq!(s.purge_trash(now+chrono::Duration::days(29)).unwrap(),0);assert_eq!(s.snapshot().unwrap().trash,snap.trash);
    assert_eq!(s.purge_trash(now+chrono::Duration::days(31)).unwrap(),1);
    let after=s.snapshot().unwrap();assert!(after.trash.is_empty());assert_eq!(after.tasks,snap.tasks);
    // A stored deletion time in any other form is rejected rather than compared loosely.
    {rusqlite::Connection::open(&backup).unwrap().execute("UPDATE tasks SET deleted_at='2026-10-05 10:00' WHERE id='y'",[]).unwrap();}
    assert_eq!(Store::inspect_backup(&backup).unwrap_err().code,"schema");
}

// The bench: (pile, order) per open unplanned task not waiting, piles left to right, the 투입구 first as None.
fn bench(s: &Snapshot) -> Vec<(Option<String>,Vec<String>)> {
    let mut piles:Vec<Option<String>>=vec![None];piles.extend(s.piles.iter().map(|p|Some(p.id.clone())));
    piles.into_iter().map(|pile|{
        let mut cards:Vec<_>=s.tasks.iter().filter(|t|t.plan_date.is_none()&&!t.completed&&t.wait_since.is_none()&&t.pile_id==pile).collect();
        cards.sort_by_key(|t|t.pile_order);(pile,cards.into_iter().map(|t|t.id.clone()).collect())
    }).collect()
}
fn ids(list:&[&str]) -> Vec<String> {list.iter().map(|s|s.to_string()).collect()}
fn revs(s: &Snapshot, list: &[&str]) -> Vec<TaskRevision> {list.iter().map(|id|revision(&find(s,id))).collect()}
fn put(s: &mut Store, list: &[&str], pile: Option<&str>, create_at: Option<i64>, index: i64) -> Result<Snapshot> {
    let items=revs(&s.snapshot().unwrap(),list);
    let c=command(s,Action::PlaceUnplanned{items,pile:pile.map(Into::into),create_at,index});s.apply(&c)
}

#[test]
fn retired_board_positions_stay_as_stored_and_new_work_gets_none() {
    let dir=tempdir().unwrap();let path=dir.path().join("app.db");let mut s=Store::open(&path).unwrap();
    create(&mut s,"a");drop(s);
    {rusqlite::Connection::open(&path).unwrap().execute_batch("UPDATE tasks SET board_x=-350,board_y=-100 WHERE id='a'").unwrap();}
    let mut s=Store::open(&path).unwrap();create(&mut s,"fresh");
    let t=find(&s.snapshot().unwrap(),"a");let c=command(&s,place(&t,Some("2026-10-14"),None));let moved=s.apply(&c).unwrap();
    let point=|snapshot:&Snapshot,id:&str|{let t=find(snapshot,id);(t.board_x,t.board_y)};
    assert_eq!(point(&moved,"a"),(Some(-350),Some(-100)));assert_eq!(point(&moved,"fresh"),(None,None));
    let backup=dir.path().join("backup.db");s.backup(&backup).unwrap();
    for sql in ["UPDATE tasks SET board_x=100001,board_y=0 WHERE id='a'","UPDATE tasks SET board_x=0,board_y=NULL WHERE id='a'"] {
        let conn=rusqlite::Connection::open(&backup).unwrap();conn.execute_batch(sql).unwrap();drop(conn);
        assert_eq!(Store::inspect_backup(&backup).unwrap_err().code,"validation");
    }
}

#[test]
fn v7_board_positions_seed_once_in_reading_order_and_old_backups_restore_into_both_paths() {
    let dir=tempdir().unwrap();let path=dir.path().join("blokky.sqlite");let mut s=Store::open(&path).unwrap();
    for id in ["a","b","c"] {create(&mut s,id);}put(&mut s,&["a","b"],Some("p"),Some(1),0).unwrap();
    let before=s.snapshot().unwrap();drop(s);
    {rusqlite::Connection::open(&path).unwrap().execute_batch("ALTER TABLE tasks DROP COLUMN board_x; ALTER TABLE tasks DROP COLUMN board_y; PRAGMA user_version=7;").unwrap();}
    let backup_id=format!("manual-{}.sqlite",uuid::Uuid::new_v4());let backups=dir.path().join("backups");std::fs::create_dir(&backups).unwrap();let backup=backups.join(&backup_id);std::fs::copy(&path,&backup).unwrap();
    let mut s=Store::open(&path).unwrap();let seeded=s.snapshot().unwrap();
    let points=|snapshot:&Snapshot|["c","a","b"].map(|id|{let t=find(snapshot,id);(t.board_x,t.board_y)});
    assert_eq!(points(&seeded),[(Some(24),Some(24)),(Some(348),Some(24)),(Some(24),Some(144))]);
    assert!(seeded.tasks.iter().all(|t|t.revision==find(&before,&t.id).revision));
    assert_eq!(Store::list_backups(dir.path()).unwrap().iter().filter(|b|b.kind=="migration").count(),1);
    let c=command(&s,Action::Delete{id:"a".into(),expected_revision:1});s.apply(&c).unwrap();create(&mut s,"fresh");
    assert_eq!(find(&s.snapshot().unwrap(),"b").board_y,Some(144));assert_eq!(find(&s.snapshot().unwrap(),"fresh").board_x,None,"new work gets no board position");
    let epoch=s.snapshot().unwrap().epoch;let restored=s.restore(&backup,&epoch,&dir.path().join("safety.db")).unwrap();assert_eq!(restored.tasks,seeded.tasks);drop(s);
    std::fs::write(&path,b"damaged original").unwrap();let recovered=Store::recover_from_backup(dir.path(),&backup_id).unwrap();assert_eq!(recovered.snapshot().unwrap().tasks,seeded.tasks);drop(recovered);
    assert_eq!(Store::open(&path).unwrap().snapshot().unwrap().tasks,seeded.tasks);
}

#[test]
fn merging_replaces_selected_work_at_the_first_place_and_preserves_whole_originals() {
    let dir=tempdir().unwrap();let path=dir.path().join("app.db");let mut s=Store::open(&path).unwrap();
    for id in ["a","b","c","d"] {create(&mut s,id);}
    for (id,title,body,duration) in [("b","첫 작업","메모\r\n- [x] 기존 확인",45),("d","다음\n작업","[ ] 남은 일",15)] {
        let t=find(&s.snapshot().unwrap(),id);let c=command(&s,Action::Update{id:id.into(),expected_revision:t.revision,title:title.into(),body:body.into(),duration,starts_at:None,plan_date:None,before:None,sized:None,wait:None});s.apply(&c).unwrap();
    }
    let before=put(&mut s,&["a","b","c"],Some("p"),Some(1),0).unwrap();
    let c=command(&s,Action::MergeUnplanned{id:"merged".into(),items:revs(&before,&["b","d"])});
    let result=s.apply(&c).unwrap();let merged=find(&result,"merged");
    assert_eq!(bench(&result),vec![(None,vec![]),(Some("p".into()),ids(&["a","merged","c"]))]);
    assert_eq!((&merged.title,merged.duration,merged.proto,merged.revision,merged.plan_date,merged.starts_at),(&"첫 작업".to_string(),60,false,1,None,None));
    assert_eq!(merged.body,"- [ ] 첫 작업\n\n메모\r\n- [x] 기존 확인\n\n- [ ] 다음 작업\n\n[ ] 남은 일");
    for id in ["b","d"] {assert_eq!(result.trash.iter().find(|t|t.task.id==id).unwrap().task,find(&before,id));}
    assert_eq!(s.apply(&c).unwrap().tasks,result.tasks);assert_eq!(s.apply(&c).unwrap().trash,result.trash);
    let backup=dir.path().join("backup.db");s.backup(&backup).unwrap();drop(s);let mut s=Store::open(&path).unwrap();
    let reopened=s.snapshot().unwrap();assert_eq!(reopened.tasks,result.tasks);assert_eq!(reopened.trash,result.trash);
    let c=command(&s,Action::RestoreTrashed{id:"b".into()});let restored=s.apply(&c).unwrap();assert_eq!(find(&restored,"b").body,find(&before,"b").body);
    let epoch=restored.epoch;let restored=s.restore(&backup,&epoch,&dir.path().join("safety.db")).unwrap();
    assert_eq!(restored.tasks,result.tasks);assert_eq!(restored.trash,result.trash);
}

#[test]
fn merging_rejects_all_invalid_sources_and_aggregate_limits_atomically() {
    let dir=tempdir().unwrap();let path=dir.path().join("app.db");let mut s=Store::open(&path).unwrap();
    for id in ["a","b","trash","done"] {create(&mut s,id);}
    let snapshot=s.snapshot().unwrap();let c=command(&s,Action::Delete{id:"trash".into(),expected_revision:find(&snapshot,"trash").revision});s.apply(&c).unwrap();
    let c=command(&s,Action::SetCompleted{id:"done".into(),expected_revision:1,completed:true,date:Some("2026-10-14".into())});s.apply(&c).unwrap();
    flow(&mut s,"dated","2026-10-14",30);put(&mut s,&["a","b"],Some("p"),Some(1),0).unwrap();
    let before=s.snapshot().unwrap();let item=|id:&str,revision|TaskRevision{id:id.into(),revision};
    let mut cases=vec![("new".to_string(),vec![item("a",1)],"validation"),("new".into(),vec![item("a",1),item("a",1)],"validation"),("new".into(),vec![item("a",1),item("b",2)],"conflict")];
    for id in ["done","dated","missing"] {cases.push(("new".into(),vec![item("a",1),item(id,1)],"conflict"));}
    for id in ["a".to_string(),"trash".into(),String::new(),"가".repeat(34)] {cases.push((id,revs(&before,&["a","b"]),"validation"));}
    for (id,items,code) in cases {
        let c=command(&s,Action::MergeUnplanned{id,items});assert_eq!(s.apply(&c).unwrap_err().code,code);
        let after=s.snapshot().unwrap();assert_eq!(after.tasks,before.tasks);assert_eq!(after.trash,before.trash);assert_eq!(after.piles,before.piles);assert_eq!(after.layouts,before.layouts);
    }
    let conn=rusqlite::Connection::open(&path).unwrap();
    conn.execute_batch("CREATE TRIGGER reject_merge BEFORE INSERT ON tasks WHEN NEW.id='storage-failure' BEGIN SELECT RAISE(ABORT,'rejected'); END;").unwrap();
    let c=command(&s,Action::MergeUnplanned{id:"storage-failure".into(),items:revs(&before,&["a","b"])});assert_eq!(s.apply(&c).unwrap_err().code,"validation");
    let after=s.snapshot().unwrap();assert_eq!(after.tasks,before.tasks);assert_eq!(after.trash,before.trash);assert_eq!(after.piles,before.piles);
    conn.execute_batch("DROP TRIGGER reject_merge;").unwrap();drop(conn);
    for (duration_a,duration_b,body) in [(720,735,String::new()),(30,30,"가".repeat(66666))] {
        for (id,duration,body) in [("a",duration_a,body),("b",duration_b,String::new())] {
            let t=find(&s.snapshot().unwrap(),id);let c=command(&s,Action::Update{id:id.into(),expected_revision:t.revision,title:t.title,body,duration,starts_at:None,plan_date:None,before:None,sized:None,wait:None});s.apply(&c).unwrap();
        }
        let before=s.snapshot().unwrap();let c=command(&s,Action::MergeUnplanned{id:"new".into(),items:revs(&before,&["a","b"])});
        assert_eq!(s.apply(&c).unwrap_err().code,"validation");let after=s.snapshot().unwrap();assert_eq!(after.tasks,before.tasks);assert_eq!(after.trash,before.trash);assert_eq!(after.piles,before.piles);
    }
    for id in ["a","b"] {let t=find(&s.snapshot().unwrap(),id);let c=command(&s,Action::Update{id:id.into(),expected_revision:t.revision,title:t.title,body:String::new(),duration:720,starts_at:None,plan_date:None,before:None,sized:None,wait:None});s.apply(&c).unwrap();}
    let items=revs(&s.snapshot().unwrap(),&["b","a"]);let c=command(&s,Action::MergeUnplanned{id:"new".into(),items});assert_eq!(find(&s.apply(&c).unwrap(),"new").duration,1440);
}

#[test]
fn shipping_selected_work_inserts_before_an_open_flow_target_or_rejects_atomically() {
    let dir=tempdir().unwrap();let mut s=Store::open(&dir.path().join("app.db")).unwrap();let day="2026-10-14";
    for id in ["a","b"] {create(&mut s,id);}
    for id in ["first","target","last"] {flow(&mut s,id,day,30);}
    let before=s.snapshot().unwrap();
    for (items,target,code) in [(revs(&before,&["a","b"]),"missing","validation"),(revs(&before,&["a","target"]),"target","validation"),(vec![revision(&find(&before,"a")),TaskRevision{id:"b".into(),revision:99}],"target","conflict")] {
        let c=command(&s,Action::ShipFlow{date:day.into(),items,before:Some(target.into())});assert_eq!(s.apply(&c).unwrap_err().code,code);assert_eq!(s.snapshot().unwrap().tasks,before.tasks);
    }
    let c=command(&s,Action::ShipFlow{date:day.into(),items:revs(&before,&["b","a"]),before:Some("target".into())});let result=s.apply(&c).unwrap();
    assert_eq!(ordered(&result,day),["first","b","a","target","last"]);assert_eq!(find(&result,"target").revision,find(&before,"target").revision);
    let c=command(&s,Action::ShipFlow{date:day.into(),items:revs(&result,&["last","b"]),before:Some("target".into())});
    assert_eq!(ordered(&s.apply(&c).unwrap(),day),["first","a","last","b","target"]);
}

#[test]
fn piles_keep_relations_protos_size_once_and_everything_survives_restore() {
    let dir=tempdir().unwrap();let path=dir.path().join("app.db");let mut s=Store::open(&path).unwrap();let day="2026-10-14";
    // Captured work is a proto on top of the 투입구.
    for id in ["a","b","c","d"] {create(&mut s,id);}
    let snap=s.snapshot().unwrap();
    assert_eq!(bench(&snap),vec![(None,ids(&["d","c","b","a"]))]);assert!(snap.tasks.iter().all(|t|t.proto&&t.duration==30));
    // Editing the title keeps it a proto; choosing a length, even the same one, sizes it for good.
    let a=find(&snap,"a");let c=command(&s,place(&a,None,None));let a=find(&s.apply(&c).unwrap(),"a");assert!(a.proto);
    let c=command(&s,Action::Update{id:"a".into(),expected_revision:a.revision,title:a.title.clone(),body:String::new(),starts_at:None,duration:30,plan_date:None,before:None,sized:Some(true),wait:None});
    let a=find(&s.apply(&c).unwrap(),"a");assert!(!a.proto);
    let b=find(&s.snapshot().unwrap(),"b");let c=command(&s,Action::Update{id:"b".into(),expected_revision:b.revision,title:b.title.clone(),body:String::new(),starts_at:None,duration:45,plan_date:None,before:None,sized:None,wait:None});
    assert!(!find(&s.apply(&c).unwrap(),"b").proto);
    // A new pile at a position, a card into it, another pile before it; moving within the bench keeps revisions.
    let before=find(&s.snapshot().unwrap(),"a").revision;
    let snap=put(&mut s,&["a"],Some("p1"),Some(1),0).unwrap();assert_eq!(find(&snap,"a").revision,before);
    let snap=put(&mut s,&["b"],Some("p1"),None,0).unwrap();
    assert_eq!(bench(&snap),vec![(None,ids(&["d","c"])),(Some("p1".into()),ids(&["b","a"]))]);
    let snap=put(&mut s,&["c"],Some("p2"),Some(1),0).unwrap();
    assert_eq!(snap.piles.iter().map(|p|(p.id.as_str(),p.position)).collect::<Vec<_>>(),[("p2",1),("p1",2)]);
    let c=command(&s,Action::MovePile{pile:"p2".into(),position:5});let snap=s.apply(&c).unwrap();
    assert_eq!(snap.piles.iter().map(|p|p.id.as_str()).collect::<Vec<_>>(),["p1","p2"]);
    // Onto another pile: below its cards; the emptied pile goes. The 투입구 stays even when empty.
    let snap=put(&mut s,&["c"],Some("p1"),None,99).unwrap();
    assert_eq!(bench(&snap),vec![(None,ids(&["d"])),(Some("p1".into()),ids(&["b","a","c"]))]);
    let snap=put(&mut s,&["d"],Some("p1"),None,1).unwrap();
    assert_eq!(bench(&snap),vec![(None,vec![]),(Some("p1".into()),ids(&["b","d","a","c"]))]);
    // Wrong targets change nothing.
    let kept=s.snapshot().unwrap();
    for (pile,create_at,code) in [(None,Some(1),"validation"),(Some("gone"),None,"conflict"),(Some("p1"),Some(1),"validation")] {
        assert_eq!(put(&mut s,&["d"],pile,create_at,0).unwrap_err().code,code);
    }
    let c=command(&s,Action::PlaceUnplanned{items:vec![TaskRevision{id:"d".into(),revision:99}],pile:None,create_at:None,index:0});
    assert_eq!(s.apply(&c).unwrap_err().code,"conflict");assert_eq!(s.snapshot().unwrap().tasks,kept.tasks);
    // A whole pile ships in order to the end of a day; protos get their default length; the pile goes.
    flow(&mut s,"early",day,60);
    let items=revs(&s.snapshot().unwrap(),&["b","d","a","c"]);let c=command(&s,Action::ShipFlow{date:day.into(),items,before:None});let snap=s.apply(&c).unwrap();
    assert_eq!(ordered(&snap,day),["early","b","d","a","c"]);assert!(snap.piles.is_empty());
    assert!(snap.tasks.iter().all(|t|!t.proto&&t.pile_id.is_none()&&t.pile_order.is_none()));assert_eq!(find(&snap,"d").duration,30);
    // Sent back by a button: top of the 준비 shelf. Dragged back: where it was dropped, as a date change.
    let shelf=||Some("shelf".to_string());
    let d=find(&snap,"d");let c=command(&s,place(&d,None,None));let snap=s.apply(&c).unwrap();assert_eq!(bench(&snap),vec![(None,vec![]),(shelf(),ids(&["d"]))]);
    let a=find(&snap,"a");let snap=put(&mut s,&["a","c"],Some("p3"),Some(1),0).unwrap();
    assert_eq!(bench(&snap),vec![(None,vec![]),(Some("p3".into()),ids(&["a","c"])),(shelf(),ids(&["d"]))]);
    assert_eq!(find(&snap,"a").revision,a.revision+1);assert_eq!(ordered(&snap,day),["early","b"]);
    // Trash keeps the place: back into its pile at its index, or on top of the shelf once the pile is gone.
    let c=command(&s,Action::Delete{id:"c".into(),expected_revision:find(&snap,"c").revision});s.apply(&c).unwrap();
    let c=command(&s,Action::RestoreTrashed{id:"c".into()});
    assert_eq!(bench(&s.apply(&c).unwrap()),vec![(None,vec![]),(Some("p3".into()),ids(&["a","c"])),(shelf(),ids(&["d"]))]);
    for id in ["a","c"] {let t=find(&s.snapshot().unwrap(),id);let c=command(&s,Action::Delete{id:id.into(),expected_revision:t.revision});s.apply(&c).unwrap();}
    assert_eq!(s.snapshot().unwrap().piles.iter().map(|p|p.id.as_str()).collect::<Vec<_>>(),["shelf"]);
    let c=command(&s,Action::RestoreTrashed{id:"a".into()});assert_eq!(bench(&s.apply(&c).unwrap()),vec![(None,vec![]),(shelf(),ids(&["a","d"]))]);
    // Clearing a day puts its open work on top of the shelf in the day's order.
    let expected_tasks=revs(&s.snapshot().unwrap(),&["early","b"]);
    let c=command(&s,Action::ClearDay{date:day.into(),expected_tasks});let snap=s.apply(&c).unwrap();
    assert_eq!(bench(&snap),vec![(None,vec![]),(shelf(),ids(&["early","b","a","d"]))]);
    // Piles and protos survive restart, backup and restore.
    put(&mut s,&["b","a"],Some("p4"),Some(1),0).unwrap();create(&mut s,"fresh");let kept=s.snapshot().unwrap();
    let backup=dir.path().join("backup.db");s.backup(&backup).unwrap();drop(s);
    let mut s=Store::open(&path).unwrap();let reopened=s.snapshot().unwrap();assert_eq!((reopened.tasks,reopened.piles),(kept.tasks.clone(),kept.piles.clone()));
    let changed=put(&mut s,&["b"],None,None,0).unwrap();assert_ne!(bench(&changed),bench(&kept));
    let epoch=s.snapshot().unwrap().epoch;let restored=s.restore(&backup,&epoch,&dir.path().join("safety.db")).unwrap();
    assert_eq!(bench(&restored),bench(&kept));assert!(find(&restored,"fresh").proto);
    // A broken pile relation in a file is rejected rather than repaired silently.
    {rusqlite::Connection::open(&backup).unwrap().execute("UPDATE tasks SET pile_id='nowhere' WHERE id='a'",[]).unwrap();}
    assert_eq!(Store::inspect_backup(&backup).unwrap_err().code,"schema");
}

#[test]
fn v5_unplanned_work_becomes_the_inbox_pile_in_list_order() {
    let dir=tempdir().unwrap();let path=dir.path().join("v5.db");let mut s=Store::open(&path).unwrap();
    for id in ["m","k","z"] {create(&mut s,id);}
    flow(&mut s,"dated","2026-10-14",30);drop(s);
    {rusqlite::Connection::open(&path).unwrap().execute_batch("ALTER TABLE tasks DROP COLUMN proto; ALTER TABLE tasks DROP COLUMN pile_id; ALTER TABLE tasks DROP COLUMN pile_order; ALTER TABLE tasks DROP COLUMN board_x; ALTER TABLE tasks DROP COLUMN board_y; DROP TABLE piles; PRAGMA user_version=5;").unwrap();}
    // An older backup reads the same way the migration writes it.
    assert_eq!(Store::inspect_backup(&path).unwrap().tasks,4);
    let s=Store::open(&path).unwrap();let snap=s.snapshot().unwrap();
    // Sized list work becomes the 준비 shelf in the same order (v9).
    assert_eq!(bench(&snap),vec![(None,vec![]),(Some("shelf".into()),ids(&["k","m","z"]))]);assert!(snap.tasks.iter().all(|t|!t.proto));
    assert_eq!(Store::list_backups(dir.path()).unwrap().iter().filter(|b|b.kind=="migration").count(),1);
}

#[test]
fn completion_always_has_a_date_and_old_dateless_completions_can_return() {
    let dir=tempdir().unwrap();let path=dir.path().join("app.db");let mut s=Store::open(&path).unwrap();let today="2026-10-11";
    flow(&mut s,"before",today,60);
    let c=command(&s,Action::Reflow{date:today.into(),at:"2026-10-11T10:00".into()});s.apply(&c).unwrap();
    let a=create(&mut s,"a");create(&mut s,"b");
    // 미계획 work is completed onto a day: the day's completion, after its order, with nothing laid out again.
    let done=|s:&Store,t:&Task,date:Option<&str>|command(s,Action::SetCompleted{id:t.id.clone(),expected_revision:t.revision,completed:true,date:date.map(Into::into)});
    for date in [None,Some("2026-13-01")] {let c=done(&s,&a,date);assert_eq!(s.apply(&c).unwrap_err().code,"validation");}
    let c=done(&s,&a,Some(today));let snap=s.apply(&c).unwrap();let a=find(&snap,"a");
    assert_eq!((a.completed,a.plan_date.as_deref(),a.flow_order,a.proto,a.pile_id.clone(),a.pile_order),(true,Some(today),Some(2),false,None,None));
    assert_eq!(snap.layouts,vec![DayLayout{date:today.into(),anchor:600}]);
    assert_eq!(bench(&snap),vec![(None,ids(&["b"]))]);
    // Dated work keeps its own date whatever the request says.
    let before=find(&snap,"before");let c=done(&s,&before,Some("2026-10-20"));assert_eq!(find(&s.apply(&c).unwrap(),"before").plan_date.as_deref(),Some(today));
    // Undone, it is that day's open work; done work cannot be sent back to 미계획 without undoing it.
    let c=command(&s,place(&a,None,None));assert_eq!(s.apply(&c).unwrap_err().code,"validation");
    let c=command(&s,Action::SetCompleted{id:"a".into(),expected_revision:a.revision,completed:false,date:None});let snap=s.apply(&c).unwrap();
    assert_eq!(ordered(&snap,today),["a"]);
    // A completion stored before this rule has no date; it stays valid and, undone, goes on top of the shelf.
    {rusqlite::Connection::open(&path).unwrap().execute("UPDATE tasks SET completed=1,proto=0,pile_order=NULL WHERE id='b'",[]).unwrap();}
    drop(s);let mut s=Store::open(&path).unwrap();let b=find(&s.snapshot().unwrap(),"b");assert!(b.completed&&b.plan_date.is_none());
    let c=command(&s,Action::SetCompleted{id:"b".into(),expected_revision:b.revision,completed:false,date:None});
    assert_eq!(bench(&s.apply(&c).unwrap()),vec![(None,vec![]),(Some("shelf".into()),ids(&["b"]))]);
}

fn piece(id:&str,title:&str,duration:i64) -> Piece {Piece{id:id.into(),title:title.into(),body:String::new(),duration,proto:false,completed:false}}
fn cut(s:&mut Store,t:&Task,pieces:Vec<Piece>,date:Option<&str>) -> Result<Snapshot> {
    let c=command(s,Action::SplitPieces{id:t.id.clone(),expected_revision:t.revision,pieces,date:date.map(Into::into)});s.apply(&c)
}

#[test]
fn cutting_board_pieces_take_the_original_place_on_the_bench_a_day_or_a_fixed_time() {
    let dir=tempdir().unwrap();let path=dir.path().join("app.db");let mut s=Store::open(&path).unwrap();let day="2026-10-14";let today="2026-10-11";
    // On the bench: in the same pile, right where the original was; a done piece is today's completion.
    for id in ["y","t","x"] {create(&mut s,id);}
    let t=find(&s.snapshot().unwrap(),"t");
    let mut done=piece("n3","끝난 부분",15);done.completed=true;
    let mut open=piece("n2","",30);open.proto=true;open.title="한글 업무".into();
    let mut first=piece("t","설계",45);first.body="메모".into();
    let pieces=vec![first,piece("n1","초안",30),open,done];
    assert_eq!(cut(&mut s,&t,pieces.clone(),None).unwrap_err().code,"validation","a done piece of 미계획 work needs its day");
    let snap=cut(&mut s,&t,pieces.clone(),Some(today)).unwrap();
    assert_eq!(bench(&snap),vec![(None,ids(&["x","t","n1","n2","y"]))]);
    let (t2,n2,n3)=(find(&snap,"t"),find(&snap,"n2"),find(&snap,"n3"));
    assert_eq!((t2.title.as_str(),t2.body.as_str(),t2.duration,t2.proto,t2.revision),("설계","메모",45,false,t.revision+1));
    assert!(n2.proto);assert_eq!((n3.completed,n3.plan_date.as_deref()),(true,Some(today)));
    // A retry is a no-op; a stale or reused request changes nothing.
    let retry=command(&s,Action::SplitPieces{id:"x".into(),expected_revision:find(&snap,"x").revision,pieces:vec![piece("x","가",15),piece("k","나",15)],date:None});
    let once=s.apply(&retry).unwrap();assert_eq!(s.apply(&retry).unwrap().tasks,once.tasks);
    let before=s.snapshot().unwrap();
    for (pieces,code) in [(vec![piece("t","가",15),piece("n1","나",15)],"validation"),(vec![piece("other","가",15)],"validation"),(vec![piece("t","가",15),piece("z","나",15),piece("z","다",15)],"validation"),(vec![piece("t","가",10)],"validation")] {
        assert_eq!(cut(&mut s,&find(&before,"t"),pieces,None).unwrap_err().code,code);
    }
    assert_eq!(cut(&mut s,&t,vec![piece("t","가",15)],None).unwrap_err().code,"conflict");
    assert_eq!(s.snapshot().unwrap().tasks,before.tasks);
    // On a day: consecutive in its order, later work moves down; a proto length is not kept there.
    let (a,f,b)=(flow(&mut s,"a",day,30),flow(&mut s,"f",day,90),flow(&mut s,"b",day,30));let _=(a,b);
    let snap=cut(&mut s,&f,vec![piece("f","앞",45),piece("f2","뒤",45)],None).unwrap();
    assert_eq!(ordered(&snap,day),["a","f","f2","b"]);assert!(snap.tasks.iter().all(|t|t.plan_date.as_deref()!=Some(day)||!t.proto));
    // Fixed: the pieces stay fixed one after another from the original time; growing into another reservation is refused.
    let c=command(&s,Action::CreateScheduled{id:"w".into(),title:"워크숍".into(),starts_at:Some(format!("{day}T10:00")),duration:60});let w=find(&s.apply(&c).unwrap(),"w");
    let c=command(&s,Action::CreateScheduled{id:"m".into(),title:"회의".into(),starts_at:Some(format!("{day}T11:00")),duration:30});s.apply(&c).unwrap();
    let kept=s.snapshot().unwrap();
    assert_eq!(cut(&mut s,&w,vec![piece("w","준비",60),piece("w2","정리",30)],None).unwrap_err().code,"overlap");assert_eq!(s.snapshot().unwrap().tasks,kept.tasks);
    let mut w2=piece("w2","정리",30);w2.completed=true;
    let snap=cut(&mut s,&w,vec![piece("w","준비",30),w2],None).unwrap();
    assert_eq!((find(&snap,"w").starts_at.as_deref(),find(&snap,"w2").starts_at.as_deref(),find(&snap,"w2").completed),(Some("2026-10-14T10:00"),Some("2026-10-14T10:30"),true));
    // Completed work is not cut, and everything survives a restart.
    let done=find(&snap,"w2");assert_eq!(cut(&mut s,&done,vec![piece("w2","가",15)],None).unwrap_err().code,"validation");
    let last=s.snapshot().unwrap();drop(s);assert_eq!(Store::open(&path).unwrap().snapshot().unwrap().tasks,last.tasks);
}

#[test]
fn v8_free_board_becomes_the_shelf_and_the_inbox_in_reading_order() {
    let dir=tempdir().unwrap();let path=dir.path().join("v8.db");let mut s=Store::open(&path).unwrap();
    for id in ["p","q","r","s"] {create(&mut s,id);}
    // q and s were sized on the board; p and r are still protos. Sizing keeps a card where it is.
    for id in ["q","s"] {
        let t=find(&s.snapshot().unwrap(),id);
        let c=command(&s,Action::Update{id:id.into(),expected_revision:t.revision,title:t.title.clone(),body:String::new(),starts_at:None,duration:45,plan_date:None,before:None,sized:Some(true),wait:None});
        assert_eq!(s.apply(&c).unwrap().piles.len(),0);
    }
    drop(s);
    {rusqlite::Connection::open(&path).unwrap().execute_batch("
        UPDATE tasks SET board_x=CASE id WHEN 'r' THEN 24 WHEN 'p' THEN 400 WHEN 's' THEN 400 ELSE 24 END,
                         board_y=CASE id WHEN 'r' THEN 24 WHEN 'p' THEN 24 WHEN 's' THEN 200 ELSE 300 END;
        INSERT INTO piles VALUES('old',1); UPDATE tasks SET pile_id='old',pile_order=1 WHERE id='s'; PRAGMA user_version=8;").unwrap();}
    let backup=dir.path().join("v8-backup.db");std::fs::copy(&path,&backup).unwrap();
    let mut s=Store::open(&path).unwrap();let snap=s.snapshot().unwrap();
    assert_eq!(bench(&snap),vec![(None,ids(&["r","p"])),(Some("shelf".into()),ids(&["s","q"]))]);
    assert_eq!(snap.piles.iter().map(|p|p.id.as_str()).collect::<Vec<_>>(),["shelf"]);
    // An older backup restores by the same reading.
    let changed=put(&mut s,&["q"],None,None,0).unwrap();assert_ne!(bench(&changed),bench(&snap));
    let epoch=s.snapshot().unwrap().epoch;let restored=s.restore(&backup,&epoch,&dir.path().join("safety.db")).unwrap();
    assert_eq!(bench(&restored),bench(&snap));    // A proto put on the shelf is sized at its default length; the 들어옴 keeps it a proto.
    let snap=put(&mut s,&["r"],Some("shelf"),None,0).unwrap();let r=find(&snap,"r");
    assert_eq!((r.proto,r.duration,r.pile_id.as_deref()),(false,30,Some("shelf")));
    assert!(find(&put(&mut s,&["p"],None,None,1).unwrap(),"p").proto);
}

fn wait(s:&mut Store,list:&[&str],trigger:&str,until:Option<&str>,since:&str) -> Result<Snapshot> {
    let items=revs(&s.snapshot().unwrap(),list);
    let c=command(s,Action::Wait{items,trigger:trigger.into(),until:until.map(Into::into),since:since.into()});s.apply(&c)
}
fn revive(s:&mut Store,list:&[&str]) -> Result<Snapshot> {
    let items=revs(&s.snapshot().unwrap(),list);let c=command(s,Action::Revive{items});s.apply(&c)
}
fn waiting(s:&Snapshot) -> Vec<(String,Option<String>,Option<String>,Option<String>)> {
    let mut list:Vec<_>=s.tasks.iter().filter(|t|t.wait_since.is_some()).map(|t|(t.id.clone(),t.wait_for.clone(),t.wait_until.clone(),t.wait_since.clone())).collect();list.sort();list
}
fn some(v:&str) -> Option<String> {Some(v.into())}

#[test]
fn waiting_work_keeps_its_trigger_until_revived_onto_the_shelf_or_the_inbox() {
    let dir=tempdir().unwrap();let path=dir.path().join("app.db");let mut s=Store::open(&path).unwrap();let (day,today)=("2026-10-14","2026-10-11");
    // A proto from the 들어옴, sized work from the shelf, a flow block and a fixed block all go out to 기다림, in no pile and with no date.
    for id in ["p","a","b","keep"] {create(&mut s,id);}
    put(&mut s,&["a","b","keep"],Some("shelf"),Some(1),0).unwrap();
    flow(&mut s,"f",day,30);let g=flow(&mut s,"g",day,30);
    let c=command(&s,Action::CreateScheduled{id:"x".into(),title:"고정".into(),starts_at:Some(format!("{day}T10:00")),duration:60});s.apply(&c).unwrap();
    let before=s.snapshot().unwrap();
    let snap=wait(&mut s,&["p","a","f","x"],"  김부장 결재  ",None,today).unwrap();
    assert_eq!(waiting(&snap),["a","f","p","x"].iter().map(|id|(id.to_string(),some("김부장 결재"),None,some(today))).collect::<Vec<_>>());
    for id in ["p","a","f","x"] {
        let t=find(&snap,id);assert_eq!(t.revision,find(&before,id).revision+1);
        assert_eq!((t.plan_date,t.starts_at,t.flow_order,t.pile_id,t.pile_order,t.completed),(None,None,None,None,None,false));
    }
    assert!(find(&snap,"p").proto,"a waiting proto stays one");assert!(!find(&snap,"a").proto);
    assert_eq!(bench(&snap),vec![(None,vec![]),(some("shelf"),ids(&["b","keep"]))]);assert_eq!(ordered(&snap,day),["g"]);assert_eq!(find(&snap,"g"),g);
    // The editor saves text and a single trigger atomically, preserving age and unchanged group order.
    let c=command(&s,Action::ReorderWait{expected:revs(&snap,&["x","f","a","p"])});let snap=s.apply(&c).unwrap();
    let old=find(&snap,"a");let mut edit=place(&old,None,None);
    if let Action::Update{title,body,wait,..}=&mut edit {*title="제목 수정".into();*body="메모 수정".into();*wait=Some(WaitEdit{trigger:"  김부장 결재  ".into(),until:None});}
    let c=command(&s,edit);let snap=s.apply(&c).unwrap();let a=find(&snap,"a");
    assert_eq!((a.title.as_str(),a.body.as_str(),a.wait_since.as_deref(),a.pile_order,a.revision),("제목 수정","메모 수정",Some(today),old.pile_order,old.revision+1));
    let mut edit=place(&a,None,None);
    if let Action::Update{wait,..}=&mut edit {*wait=Some(WaitEdit{trigger:"회신".into(),until:Some("2026-10-21".into())});}
    let c=command(&s,edit);let snap=s.apply(&c).unwrap();let a=find(&snap,"a");
    assert_eq!((a.wait_for.as_deref(),a.wait_until.as_deref(),a.wait_since.as_deref(),a.pile_order),(Some("회신"),Some("2026-10-21"),Some(today),None));
    assert_eq!(find(&snap,"f").wait_for.as_deref(),Some("김부장 결재"));
    // A new trigger keeps the day it was first pushed; an unnamed one is ''.
    let snap=wait(&mut s,&["a"],"",Some("2026-10-20"),"2026-10-13").unwrap();
    assert_eq!((find(&snap,"a").wait_for,find(&snap,"a").wait_until,find(&snap,"a").wait_since),(some(""),some("2026-10-20"),some(today)));
    // Time passing changes nothing: a restart reads the same.
    let kept=s.snapshot().unwrap();drop(s);let mut s=Store::open(&path).unwrap();assert_eq!(s.snapshot().unwrap().tasks,kept.tasks);
    // Reviving puts sized work on top of the shelf and protos on top of the 들어옴, each in the given order.
    create(&mut s,"q");
    let snap=revive(&mut s,&["x","p","a"]).unwrap();
    assert_eq!(bench(&snap),vec![(None,ids(&["p","q"])),(some("shelf"),ids(&["x","a","b","keep"]))]);
    assert!(find(&snap,"p").proto);assert_eq!(waiting(&snap).len(),1);
    assert!(["x","p","a"].iter().all(|id|{let t=find(&snap,id);t.wait_for.is_none()&&t.wait_until.is_none()&&t.wait_since.is_none()&&t.revision==find(&kept,id).revision+1}));
    // Only waiting work revives; a stale revision is a conflict; nothing changes either way.
    let kept=s.snapshot().unwrap();
    assert_eq!(revive(&mut s,&["a"]).unwrap_err().code,"validation");
    let c=command(&s,Action::Revive{items:vec![TaskRevision{id:"f".into(),revision:1}]});assert_eq!(s.apply(&c).unwrap_err().code,"conflict");
    assert_eq!(s.snapshot().unwrap().tasks,kept.tasks);
}

#[test]
fn a_date_a_completion_or_a_placement_ends_the_wait_and_trash_keeps_it() {
    let dir=tempdir().unwrap();let path=dir.path().join("app.db");let mut s=Store::open(&path).unwrap();let (day,today)=("2026-10-14","2026-10-11");
    for id in ["a","b","c","d","e"] {create(&mut s,id);}
    wait(&mut s,&["a","b","c","d","e"],"회신",Some("2026-10-20"),today).unwrap();
    // A date by the editor or by shipping revives it on that day.
    let a=find(&s.snapshot().unwrap(),"a");let c=command(&s,place(&a,Some(day),None));let a=find(&s.apply(&c).unwrap(),"a");
    assert_eq!((a.plan_date.as_deref(),a.flow_order,a.wait_since.clone(),a.wait_for.clone(),a.wait_until.clone(),a.proto),(Some(day),Some(1),None,None,None,false));
    let items=revs(&s.snapshot().unwrap(),&["b"]);let c=command(&s,Action::ShipFlow{date:day.into(),items,before:None});let snap=s.apply(&c).unwrap();
    assert_eq!(ordered(&snap,day),["a","b"]);assert!(find(&snap,"b").wait_since.is_none());
    // Editing it without a date keeps it waiting.
    let c_=find(&snap,"c");let c=command(&s,Action::Update{id:"c".into(),expected_revision:c_.revision,title:"새 제목".into(),body:"메모".into(),starts_at:None,duration:30,plan_date:None,before:None,sized:None,wait:None});
    let snap=s.apply(&c).unwrap();assert_eq!((find(&snap,"c").wait_since,find(&snap,"c").pile_id),(some(today),None));
    // Dragged to a chosen place: there, no longer waiting.
    let snap=put(&mut s,&["c"],None,None,0).unwrap();assert_eq!(bench(&snap),vec![(None,ids(&["c"]))]);assert!(find(&snap,"c").wait_for.is_none());
    assert_eq!(find(&snap,"c").revision,c_.revision+2);
    // Done from 기다림: that day's completion.
    let d=find(&snap,"d");let c=command(&s,Action::SetCompleted{id:"d".into(),expected_revision:d.revision,completed:true,date:Some(today.into())});
    let d=find(&s.apply(&c).unwrap(),"d");assert_eq!((d.completed,d.plan_date.as_deref(),d.wait_since),(true,Some(today),None));
    // Trash keeps the trigger and restores into 기다림, not onto the shelf; completed work cannot wait.
    let e=find(&s.snapshot().unwrap(),"e");let c=command(&s,Action::Delete{id:"e".into(),expected_revision:e.revision});let snap=s.apply(&c).unwrap();
    assert_eq!(snap.trash[0].task.wait_since,some(today));
    let c=command(&s,Action::RestoreTrashed{id:"e".into()});let snap=s.apply(&c).unwrap();
    assert_eq!(find(&snap,"e"),Task{revision:e.revision+1,..e.clone()});assert!(snap.piles.is_empty());
    assert_eq!(wait(&mut s,&["d"],"",None,today).unwrap_err().code,"conflict");
    // Merging takes 준비 work only; a waiting piece stays waiting with its trigger, a done one is that day's.
    create(&mut s,"z");let items=revs(&s.snapshot().unwrap(),&["z","e"]);
    let c=command(&s,Action::MergeUnplanned{id:"m".into(),items});assert_eq!(s.apply(&c).unwrap_err().code,"conflict");
    let e=find(&s.snapshot().unwrap(),"e");let mut done=piece("e3","끝",15);done.completed=true;
    let snap=cut(&mut s,&e,vec![piece("e","앞",15),piece("e2","뒤",15),done],Some(today)).unwrap();
    assert_eq!(waiting(&snap),["e","e2"].iter().map(|id|(id.to_string(),some("회신"),some("2026-10-20"),some(today))).collect::<Vec<_>>());
    assert!(find(&snap,"e3").completed&&find(&snap,"e3").wait_since.is_none());assert_eq!(bench(&snap),vec![(None,ids(&["z","c"]))]);
    // Everything survives a backup and restore.
    let kept=s.snapshot().unwrap();let backup=dir.path().join("backup.db");s.backup(&backup).unwrap();
    revive(&mut s,&["e"]).unwrap();let epoch=s.snapshot().unwrap().epoch;
    assert_eq!(s.restore(&backup,&epoch,&dir.path().join("safety.db")).unwrap().tasks,kept.tasks);
}

#[test]
fn waiting_rejects_bad_triggers_and_broken_files() {
    let dir=tempdir().unwrap();let path=dir.path().join("app.db");let mut s=Store::open(&path).unwrap();let today="2026-10-11";
    create(&mut s,"a");create(&mut s,"b");let kept=s.snapshot().unwrap();
    for (list,until,since) in [(vec!["a"],None,"2026-02-30"),(vec!["a"],Some("2026-10-32"),today),(vec!["a"],None,"10/11"),(vec![],None,today),(vec!["a","a"],None,today)] {
        assert_eq!(wait(&mut s,&list,"",until,since).unwrap_err().code,"validation");
    }
    assert_eq!(wait(&mut s,&["a"],&"가".repeat(67),None,today).unwrap_err().code,"validation");
    assert_eq!(s.snapshot().unwrap().tasks,kept.tasks);
    let snap=wait(&mut s,&["a"],&format!("  {}  ","가".repeat(66)),None,today).unwrap();assert_eq!(find(&snap,"a").wait_for.unwrap().len(),198,"counted once trimmed");
    let c=command(&s,Action::Wait{items:vec![TaskRevision{id:"b".into(),revision:9}],trigger:String::new(),until:None,since:today.into()});
    assert_eq!(s.apply(&c).unwrap_err().code,"conflict");
    // A file whose waiting work sits in a pile, has a date or a bad day, or whose trigger has no wait, is refused.
    let backup=dir.path().join("backup.db");s.backup(&backup).unwrap();assert!(Store::inspect_backup(&backup).is_ok());
    for sql in ["UPDATE tasks SET pile_order=0 WHERE id='a'","UPDATE tasks SET pile_id='shelf' WHERE id='a'","UPDATE tasks SET plan_date='2026-10-14',flow_order=1 WHERE id='a'","UPDATE tasks SET wait_since='2026-13-01' WHERE id='a'",
        "UPDATE tasks SET wait_until='내일' WHERE id='a'","UPDATE tasks SET wait_for='회신' WHERE id='b'","UPDATE tasks SET completed=1 WHERE id='a'"] {
        let broken=dir.path().join(format!("broken-{}.db",uuid::Uuid::new_v4()));std::fs::copy(&backup,&broken).unwrap();
        {rusqlite::Connection::open(&broken).unwrap().execute_batch(sql).unwrap();}
        assert!(matches!(Store::inspect_backup(&broken).unwrap_err().code.as_str(),"schema"|"validation"),"{sql}");
    }
}

#[test]
fn v9_files_and_backups_open_as_v10_with_nothing_waiting() {
    let dir=tempdir().unwrap();let path=dir.path().join("v9.db");let mut s=Store::open(&path).unwrap();
    create(&mut s,"p");create(&mut s,"a");put(&mut s,&["a"],Some("shelf"),Some(1),0).unwrap();flow(&mut s,"f","2026-10-14",30);
    let c=command(&s,Action::Delete{id:"p".into(),expected_revision:find(&s.snapshot().unwrap(),"p").revision});s.apply(&c).unwrap();
    let kept=s.snapshot().unwrap();drop(s);
    {rusqlite::Connection::open(&path).unwrap().execute_batch("ALTER TABLE tasks DROP COLUMN wait_for; ALTER TABLE tasks DROP COLUMN wait_until; ALTER TABLE tasks DROP COLUMN wait_since; PRAGMA user_version=9;").unwrap();}
    let backup=dir.path().join("v9-backup.db");std::fs::copy(&path,&backup).unwrap();
    assert_eq!(Store::inspect_backup(&backup).unwrap().tasks,2);
    let mut s=Store::open(&path).unwrap();let snap=s.snapshot().unwrap();
    assert_eq!((snap.tasks.clone(),snap.trash.clone(),snap.piles.clone()),(kept.tasks.clone(),kept.trash.clone(),kept.piles.clone()));
    assert_eq!(rusqlite::Connection::open(&path).unwrap().query_row::<i64,_,_>("PRAGMA user_version",[],|r|r.get(0)).unwrap(),10);
    assert_eq!(Store::list_backups(dir.path()).unwrap().iter().filter(|b|b.kind=="migration").count(),1);
    // The migrated file takes waiting work; a v9 backup restores over it unchanged.
    wait(&mut s,&["a"],"회신",None,"2026-10-11").unwrap();
    let epoch=s.snapshot().unwrap().epoch;let restored=s.restore(&backup,&epoch,&dir.path().join("safety.db")).unwrap();
    assert_eq!((restored.tasks,restored.trash),(kept.tasks,kept.trash));
}
