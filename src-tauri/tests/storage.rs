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
    for key in ["exceptions","weekly_target","work_days"] {value.as_object_mut().unwrap().remove(key);}
    let legacy:Settings=serde_json::from_value(value).unwrap();assert_eq!(legacy.weekly_target,2400);assert!(legacy.exceptions.is_empty());
    let day=settings.days[0].clone();
    for date in ["2026-02-30","2026-1-01"] {settings.exceptions=vec![DayException{date:date.into(),kind:"custom".into(),day:day.clone()}];assert!(validate_settings(&settings).is_err());}
    let exception=DayException{date:"2026-10-09".into(),kind:"early".into(),day:WorkingDay{end:900,..day}};
    settings.exceptions=vec![exception.clone()];assert!(validate_settings(&settings).is_ok());
    settings.exceptions.push(exception);assert!(validate_settings(&settings).is_err());
    settings.exceptions.clear();settings.weekly_target=-15;assert!(validate_settings(&settings).is_err());
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
    for (sql,code) in [("UPDATE tasks SET id='' WHERE id='a'","validation"),("PRAGMA user_version=3","schema")] {
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
