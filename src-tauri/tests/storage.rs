use blokky_core::{db::{managed_backup_path, Store}, model::*};
use tempfile::tempdir;

fn command(s: &Store, action: Action) -> Command {
    Command { request_id: uuid::Uuid::new_v4().to_string(), epoch: s.snapshot().unwrap().epoch, action }
}
fn create(s: &mut Store, id: &str) -> Task {
    let c = command(s, Action::Create { id: id.into(), title: "한글 업무".into() });
    s.apply(&c).unwrap().tasks.into_iter().find(|t| t.id == id).unwrap()
}
fn update(t: &Task, start: &str, duration: i64) -> Action {
    Action::Update { id: t.id.clone(), expected_revision: t.revision, title: t.title.clone(), body: "[x] 확인\n메모 보존".into(), starts_at: Some(start.into()), duration }
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
    let a=s.snapshot().unwrap().tasks.into_iter().find(|task|task.id=="a").unwrap();
    let c=command(&s,Action::SetCompleted{id:a.id,expected_revision:a.revision,completed:true});s.apply(&c).unwrap();
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
    for old in before.tasks {
        let task=result.tasks.iter().find(|t|t.id==old.id).unwrap();
        assert_eq!((task.title.clone(),task.body.clone(),task.completed),(old.title,old.body,old.completed));
        assert_eq!(task.starts_at,if old.id=="other" {old.starts_at}else {None});
        assert_eq!(task.revision,old.revision+i64::from(old.id!="other"));
    }
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
    // Overlap and lunch preserve the work in the unplanned list; Wednesday is not a selected weekday.
    assert_eq!(snapshot.tasks.iter().filter(|t|t.starts_at.is_none()).count(),3);
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
    for version in [1,2] {
        let path=dir.path().join(format!("legacy-{version}.db"));let mut s=Store::open(&path).unwrap();let task=create(&mut s,"legacy");drop(s);
        let conn=rusqlite::Connection::open(&path).unwrap();
        let mut settings=serde_json::to_value(Settings::default()).unwrap();settings.as_object_mut().unwrap().remove("routines");
        conn.execute("UPDATE meta SET value=?1 WHERE key='settings'",[settings.to_string()]).unwrap();
        conn.execute_batch(&format!("DROP TABLE routine_occurrences; PRAGMA user_version={version};")).unwrap();drop(conn);
        assert_eq!(Store::inspect_backup(&path).unwrap().tasks,1);
        let mut target=Store::open(&dir.path().join(format!("restored-{version}.db"))).unwrap();let epoch=target.snapshot().unwrap().epoch;
        assert_eq!(target.restore(&path,&epoch,&dir.path().join(format!("safety-{version}.db"))).unwrap().tasks,vec![task.clone()]);
        let mut s=Store::open(&path).unwrap();assert_eq!(s.snapshot().unwrap().tasks,vec![task]);assert!(s.snapshot().unwrap().settings.routines.is_empty());
        let c=command(&s,Action::SetRoutines{expected_revision:1,routines:vec![routine("new",600)]});s.apply(&c).unwrap();assert_eq!(ensure(&mut s,"2026-10-05","2026-10-05").tasks.len(),2);
        assert_eq!(rusqlite::Connection::open(&path).unwrap().query_row::<i64,_,_>("PRAGMA user_version",[],|r|r.get(0)).unwrap(),3);
    }
}

#[test]
fn splitting_preserves_total_time_notes_and_atomic_retry() {
    let dir=tempdir().unwrap(); let path=dir.path().join("app.db"); let mut s=Store::open(&path).unwrap();
    let a=create(&mut s,"a"); let c=command(&s,update(&a,"2026-10-08T10:00",90));
    let a=s.apply(&c).unwrap().tasks[0].clone();
    for (new_id,first_duration) in [("a",45),("b",0),("b",20),("b",90)] {
        let c=command(&s,Action::Split{id:a.id.clone(),expected_revision:a.revision,new_id:new_id.into(),first_duration});
        assert!(s.apply(&c).is_err());
        let tasks=s.snapshot().unwrap().tasks;assert_eq!(tasks.len(),1);assert_eq!(tasks[0].duration,90);assert_eq!(tasks[0].revision,a.revision);
    }
    let c=command(&s,Action::Split{id:a.id.clone(),expected_revision:a.revision,new_id:"b".into(),first_duration:45});
    s.apply(&c).unwrap();assert_eq!(s.apply(&c).unwrap().tasks.len(),2);
    let stale=command(&s,Action::Split{id:a.id.clone(),expected_revision:a.revision,new_id:"c".into(),first_duration:15});
    assert_eq!(s.apply(&stale).unwrap_err().code,"conflict");
    drop(s);let s=Store::open(&path).unwrap();let tasks=s.snapshot().unwrap().tasks;
    assert_eq!(tasks.iter().map(|t|t.duration).sum::<i64>(),90);
    assert!(tasks.iter().all(|t|t.body==a.body&&t.title==a.title));
    assert_eq!(tasks.iter().find(|t|t.id=="a").unwrap().starts_at,a.starts_at);
    assert!(tasks.iter().find(|t|t.id=="b").unwrap().starts_at.is_none());
}

#[test]
fn persistence_revisions_and_retry_receipts() {
    let dir = tempdir().unwrap(); let path = dir.path().join("app.db");
    let mut store = Store::open(&path).unwrap();
    let create_cmd = command(&store, Action::Create { id: "a".into(), title: "메모".into() });
    let a = store.apply(&create_cmd).unwrap().tasks[0].clone();
    assert_eq!(store.apply(&create_cmd).unwrap().tasks.len(), 1);
    let edit = command(&store, update(&a, "2026-10-08T10:00", 45));
    store.apply(&edit).unwrap();
    let stale = command(&store, Action::Delete { id: a.id.clone(), expected_revision: a.revision });
    assert_eq!(store.apply(&stale).unwrap_err().code, "conflict");
    drop(store);
    let store = Store::open(&path).unwrap(); let a = &store.snapshot().unwrap().tasks[0];
    assert_eq!(a.revision, 2); assert_eq!(a.body, "[x] 확인\n메모 보존"); assert_eq!(a.duration, 45);
}

#[test]
fn scheduling_rejects_overlap_and_preserves_identity_on_move() {
    let dir = tempdir().unwrap(); let mut s = Store::open(&dir.path().join("app.db")).unwrap();
    let a = create(&mut s, "a"); let b = create(&mut s, "b");
    let c = command(&s, update(&a, "2026-10-08T10:00", 45)); s.apply(&c).unwrap();
    for (date, duration, code) in [
        ("2026-10-08T10:30",30,"overlap"), ("2026-10-08T12:00",30,"unavailable"),
        ("2026-10-10T10:00",30,"unavailable"), ("2026-10-08T23:45",30,"unavailable"),
        ("2026-10-08T10:01",30,"validation"), ("2026-02-30T10:00",30,"validation"),
        ("2026-10-08T11:00",5,"validation")
    ] {
        let c = command(&s, update(&b,date,duration)); assert_eq!(s.apply(&c).unwrap_err().code,code);
    }
    let c = command(&s, update(&b,"2026-10-08T10:45",30)); s.apply(&c).unwrap();
    let a = s.snapshot().unwrap().tasks.into_iter().find(|t| t.id=="a").unwrap();
    let c = command(&s, update(&a,"2026-10-09T10:00",45)); let after = s.apply(&c).unwrap();
    assert_eq!(after.tasks.len(),2); assert_eq!(after.tasks.iter().filter(|t| t.starts_at.as_deref()==Some("2026-10-08T10:00")).count(),0);
    let mut days = after.settings.days.clone(); days[4].enabled=false;
    let c = command(&s, Action::SetSettings { expected_revision: after.settings.revision, days });
    assert_eq!(s.apply(&c).unwrap_err().code,"unavailable");
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
    let invalid=command(&s,Action::CreateScheduled{id:"next".into(),title:"다음 주".into(),starts_at:Some("2026-10-15T12:00".into()),duration:30});
    assert_eq!(s.apply(&invalid).unwrap_err().code,"unavailable");
    settings.exceptions[0].kind="leave".into();settings.exceptions[0].day.enabled=false;
    let c=command(&s,set(&settings,false));assert_eq!(s.apply(&c).unwrap_err().code,"unavailable");
    assert_eq!(s.snapshot().unwrap().settings.exceptions[0].kind,"custom");
    let c=command(&s,set(&settings,true));let snapshot=s.apply(&c).unwrap();
    assert_eq!(snapshot.tasks[0].id,"lunch");assert_eq!(snapshot.tasks[0].starts_at,None);assert_eq!(snapshot.tasks[0].revision,2);
    assert_eq!(s.apply(&c).unwrap().tasks[0].revision,2);
    let backup=dir.path().join("backup.db");s.backup(&backup).unwrap();drop(s);
    let mut s=Store::open(&path).unwrap();let restored=s.snapshot().unwrap();assert_eq!(restored.settings.exceptions[0].kind,"leave");
    assert_eq!(restored.settings.weekly_target,2400);assert_eq!(restored.settings.work_days,5);
    s.restore(&backup,&restored.epoch,&dir.path().join("safety.db")).unwrap();
    assert_eq!(s.snapshot().unwrap().settings,restored.settings);
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
    let old = command(&s, Action::SetCompleted { id:a.id.clone(), expected_revision:a.revision, completed:true });
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
    let c=command(&s,Action::SetCompleted{id:a.id,expected_revision:a.revision,completed:true});s.apply(&c).unwrap();
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
    for (sql,code) in [("UPDATE tasks SET id='' WHERE id='a'","validation"),("PRAGMA user_version=4","schema")] {
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
