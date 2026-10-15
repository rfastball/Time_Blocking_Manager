use blokky_core::{db::Store, model::*};
use serde_json::{json, Map, Value};
use std::{fs, path::{Path, PathBuf}};
use tempfile::tempdir;

// Golden fixtures shared with src/parity.test.ts. This store is the source of truth: UPDATE_PARITY=1 rewrites
// every <name>.expected.json from it, and the preview store must reach the same states from the same steps.
// "$rev:<task id>" and "$rev:settings" in an action stand for the current revision before that step;
// a step's own "request_id" (default <name>-<step>) lets a later step retry it.
const NOW: i64 = 1_800_000_000_000;
// Every task field both stores keep; board_x/y are left out (the preview store never assigns them).
const FIELDS: [&str; 15] = ["id","title","body","starts_at","duration","completed","revision","plan_date","flow_order","proto","pile_id","pile_order","wait_for","wait_until","wait_since"];

fn fixtures() -> PathBuf { Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/parity") }
fn generated(id: &str) -> bool { id.len()==36 && id.char_indices().all(|(i,c)|if [8,13,18,23].contains(&i) {c=='-'} else {c.is_ascii_hexdigit()}) }
// Routine occurrences get random ids on both sides; they are named by their date and title instead.
fn task(t: &Value) -> Value {
    let mut out=Map::new();
    for key in FIELDS {out.insert(key.into(),match t.get(key) {Some(v) if !v.is_null()=>v.clone(),_ if key=="proto"=>json!(false),_=>Value::Null});}
    if generated(out["id"].as_str().unwrap()) {out.insert("id".into(),json!(format!("~{}~{}",out["plan_date"].as_str().unwrap_or(""),out["title"].as_str().unwrap())));}
    Value::Object(out)
}
// Volatile parts (epoch, deleted_at, receipts, board positions) are left out; lists are put in a fixed order.
fn normalize(s: &Snapshot) -> Value {
    let v=serde_json::to_value(s).unwrap();
    let tasks=|key:&str|{let mut list:Vec<Value>=v[key].as_array().unwrap().iter().map(task).collect();list.sort_by(|a,b|a["id"].as_str().cmp(&b["id"].as_str()));list};
    let mut piles=v["piles"].as_array().unwrap().clone();piles.sort_by_key(|p|p["position"].as_i64());
    let mut layouts=v["layouts"].as_array().unwrap().clone();layouts.sort_by(|a,b|a["date"].as_str().cmp(&b["date"].as_str()));
    let st=&v["settings"];
    json!({"tasks":tasks("tasks"),"trash":tasks("trash"),"piles":piles,"layouts":layouts,
        "settings":{"revision":st["revision"],"days":st["days"],"exceptions":st["exceptions"],"weekly_target":st["weekly_target"],"work_days":st["work_days"],"routines":st["routines"]}})
}
fn resolve(v: &Value, s: &Snapshot) -> Value {
    match v {
        Value::String(text) => match text.strip_prefix("$rev:") {
            Some("settings") => json!(s.settings.revision),
            Some(id) => json!(s.tasks.iter().find(|t|t.id==id).unwrap_or_else(||panic!("no task for {text}")).revision),
            None => v.clone(),
        },
        Value::Array(items) => Value::Array(items.iter().map(|x|resolve(x,s)).collect()),
        Value::Object(map) => Value::Object(map.iter().map(|(k,x)|(k.clone(),resolve(x,s))).collect()),
        _ => v.clone(),
    }
}
// Each task, pile, layout and settings value on its own line.
fn pretty(v: &Value, depth: usize, flat: bool) -> String {
    let pad="  ".repeat(depth+1);
    let child=|key:&str,x:&Value|if flat {x.to_string()} else {pretty(x,depth+1,matches!(key,"tasks"|"trash"|"piles"|"layouts"|"settings"))};
    match v {
        Value::Array(items) if !items.is_empty() => format!("[\n{}\n{}]",items.iter().map(|x|format!("{pad}{}",child("",x))).collect::<Vec<_>>().join(",\n"),"  ".repeat(depth)),
        Value::Object(map) if !map.is_empty() => format!("{{\n{}\n{}}}",map.iter().map(|(k,x)|format!("{pad}{}: {}",Value::String(k.clone()),child(k,x))).collect::<Vec<_>>().join(",\n"),"  ".repeat(depth)),
        _ => v.to_string(),
    }
}

fn run(name: &str, fixture: &Value) -> Value {
    let dir=tempdir().unwrap();let mut s=Store::open(&dir.path().join("app.db")).unwrap();
    let initial=normalize(&s.snapshot().unwrap());let mut states=vec![];
    for (n,step) in fixture["steps"].as_array().unwrap().iter().enumerate() {
        let before=s.snapshot().unwrap();
        let action:Action=serde_json::from_value(resolve(&step["action"],&before)).unwrap_or_else(|e|panic!("{name} step {n}: {e}"));
        let request_id=step.get("request_id").and_then(Value::as_str).map_or_else(||format!("{name}-{n}"),str::to_string);
        let c=Command{request_id,epoch:before.epoch.clone(),issued_at:Some(NOW),action};
        match (s.apply_at(&c,NOW),step.get("error").and_then(Value::as_str)) {
            (Ok(after),None) => states.push(normalize(&after)),
            (Err(e),Some(code)) => {
                assert_eq!(e.code,code,"{name} step {n}: {}",e.message);
                let after=s.snapshot().unwrap();assert_eq!(after.tasks,before.tasks,"{name} step {n}: a rejection changes nothing");assert_eq!(normalize(&after),normalize(&before));
                states.push(json!({"error":e.code}));
            }
            (Ok(_),Some(code)) => panic!("{name} step {n}: expected {code}, but it was accepted"),
            (Err(e),None) => panic!("{name} step {n}: {e}"),
        }
    }
    json!({"name":name,"initial":initial,"states":states})
}

#[test]
fn the_rust_store_reaches_every_golden_parity_state() {
    let update=std::env::var("UPDATE_PARITY").is_ok_and(|v|v=="1");
    let mut paths:Vec<_>=fs::read_dir(fixtures()).unwrap().map(|e|e.unwrap().path())
        .filter(|p|p.extension().is_some_and(|e|e=="json")&&!p.to_string_lossy().ends_with(".expected.json")).collect();
    paths.sort();assert!(paths.len()>=8,"parity fixtures are missing");
    for path in paths {
        let fixture:Value=serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        let name=fixture["name"].as_str().unwrap();assert_eq!(path.file_stem().unwrap().to_string_lossy(),name,"a fixture is named after its file");
        let result=run(name,&fixture);let golden=path.with_file_name(format!("{name}.expected.json"));
        if update {fs::write(&golden,pretty(&result,0,false)+"\n").unwrap();continue;}
        let expected:Value=serde_json::from_str(&fs::read_to_string(&golden).unwrap_or_else(|_|panic!("{golden:?} is missing; run with UPDATE_PARITY=1"))).unwrap();
        assert_eq!(result["initial"],expected["initial"],"{name}: initial state");
        let (got,want)=(result["states"].as_array().unwrap(),expected["states"].as_array().unwrap());
        assert_eq!(got.len(),want.len(),"{name}: step count; rerun with UPDATE_PARITY=1 after changing the fixture");
        for (n,(got,want)) in got.iter().zip(want).enumerate() {assert_eq!(got,want,"{name} step {n}: the store no longer matches the golden file; rerun with UPDATE_PARITY=1 if intended");}
    }
}
