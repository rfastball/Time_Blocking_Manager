# 단독형 캘린더 품질 검증 — 저장소 담당

검증일: 2026-10-09. 기준 HEAD `3a24447`. 담당 범위: T-21~T-30, T-34, T-36 및 Rust 날짜·입력·겹침 검증 근거. 사용자 DB를 열거나 수정하지 않았다. 아래 실행은 기존 통합 테스트와 격리된 임시 SQLite 파일만 사용했다. 과거 `docs/validation.md` 기록을 이번 실행으로 계산하지 않았다.

**기존 Rust 통합 테스트 11/11 및 추가 저장소 probe 5그룹이 통과했다. 첨부 체크리스트의 담당 12항목 전체 합격을 뜻하지 않는다.** 네이티브 앱의 강제 종료·UI 성공 표시·디스크 가득 참·쓰기 권한·네트워크 차단은 실행하지 않았다. 알림은 현재 제품 계약에서 미지원이다. 현재 DB 손상 시 앱 내부 복원에 접근할 수 없는 소스상 결함을 확인했다.

## 실행 환경과 결과

- 프로젝트 `scripts/run.ps1:5`~`9`와 같은 로컬 toolchain 환경을 사용했다. npm 시험은 다른 담당자가 실행하므로 중복 실행하지 않았다.
- `cargo 1.99.0 (5f94df478 2026-08-27)`, `rustc 1.99.0 (b940084d7 2026-09-28)`. 제품 `blokky 0.1.0`, DB schema 2. 기존 suite와 probe는 desktop 기능 없는 debug 빌드다.
- 최초 sandbox 실행: 종료 코드 101, 9/11 통과, 본체 4.77초, shell 내부 wall 5.220초. `storage.rs:115`, `storage.rs:137`의 관리 백업 생성에서 파일 접근 오류. cargo도 부모 경로 canonicalize 경고를 출력했다.
- 동일 명령을 승인된 권한 환경에서 재실행: 종료 코드 0, **11/11 통과**, 본체 **3.49초**, 빌드 완료 0.20초, shell 내부 wall **3.903초**. 코드 변경 없이 실패 2건이 통과하여 sandbox 경로 정규화 제한에 따른 실행 오류로 분리했다. incremental cache hard-link 실패 후 copy fallback 경고는 남았으나 테스트 실패는 없었다.
- unit/doc test는 각각 0개다. 통과 개수 11은 `src-tauri/tests/storage.rs`의 통합 시나리오 수이며, 모든 P0 요구 개수가 아니다.

```powershell
$storageRoot = (Get-Location).Path
$env:CARGO_HOME = Join-Path $storageRoot '.tools/cargo'
$env:RUSTUP_HOME = Join-Path $storageRoot '.tools/rustup'
$env:PATH = (Join-Path $env:CARGO_HOME 'bin') + ';' + $env:PATH
cargo --version
rustc --version
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --locked
```

## 항목별 판정

`부분 확인`은 실행한 하위 조건만 통과하고 해당 T 행의 나머지 조건은 미충족·미실행임을 뜻한다. `미지원`은 기존 기능의 오동작으로 단정하지 않으며, 첨부 목표를 그대로 P0 계약으로 채택하면 요구 미충족이다.

| ID | 판정 | 이번 실행·소스 근거 | 전체 합격에 남은 조건 |
| --- | --- | --- | --- |
| T-21 저장 직후 강제 종료 | 부분 확인 | 기존 정상 close/reopen: `storage.rs:37`, `:75`, `:214`. probe는 `Store::apply`가 반환한 뒤 자기 child를 kill하고 다시 열어 제목·메모·시각·길이·revision·근무 목표 포함 snapshot 전체가 동일함을 확인, 손실 0건. WAL/FULL `db.rs:133`, commit 후 반환 `db.rs:219`. | 배포 앱 저장 완료 표시 직후 강제 종료는 미실행. 반복 예외·분류 모델 미지원. 저장 서비스 child 종료가 앱 UI/IPC/OS 전원 장애를 대신하지 않는다. |
| T-22 중단·저장 실패 | 부분 확인 | 기존 분할·설정 거부 및 재시도 `storage.rs:16`, `:75`. probe에서 Split의 두 번째 INSERT 직전, SetSchedule의 작업 이동 후 설정 UPDATE 직전 SQL trigger ABORT 주입: snapshot 원상 유지, 실패 요청 receipt 추가 없음, close/reopen 후에도 부분 반영 0건. 트랜잭션 경계 `db.rs:151`, `:177`, `:197`, `:218`. | 실제 단계별 process kill·디스크 용량 부족·OS 권한 오류·네이티브 실패 표시 미실행. ABORT는 SQL 실패이며 ENOSPC/권한 실패와 동일하다고 주장하지 않는다. 반복 분할 미지원. |
| T-23 오프라인 사용 | 부분 확인 | 기존 파일 DB suite 및 probe에서 로컬 조회·생성·변경·삭제 실패·재열기·복원 경로 실행. Rust 저장소는 SQLite 기반이며 런타임 원격 API 없음. 프런트 저장은 IPC `main.ts:102`; CSP의 connect-src는 IPC로 제한 `tauri.conf.json:17`; 번들 로컬 frontend `tauri.conf.json:10`. | 실제 네트워크를 차단한 배포 앱에서 조회·CRUD·검색·재실행은 미실행. 검색·알림 미지원. 설치기의 offlineInstaller 설정만으로 차단 환경 설치/사용을 통과 처리하지 않는다. |
| T-24 백업·빈 저장소 복원 | 부분 확인 | 기존 백업 검사·안전 백업·epoch 보호 `storage.rs:113`, `:165`, 초안 보호 `:214`. probe에서 빈 Store에 정상 작업 1개(메모·배치 포함), 날짜별 근무 예외 1개, 근무 설정을 복원한 뒤 task/settings 의미상 동일·새 epoch·재열기 보존 확인. `db.rs:224`, `:310`. | 종일·여러 날·반복·취소 회차·분류·알림 상태 모델 미지원. 테마·캡처 단축키·자동실행은 SQLite 밖에 있어 이 백업으로 복원되지 않는다(아래 범위 참조). 배포 앱 UI 왕복 미실행. |
| T-25 업데이트·이관 | 부분 확인 | 기존 legacy JSON 기본값 `storage.rs:100`; v1 백업 읽기 및 잘못된 version 원본 보존 `:187`~`:199`. probe에서 실제 DB `user_version=1` + 새 설정 필드 없는 JSON + 작업/메모를 만들어 Store로 열어 v2 전환, 필드 기본값·메모 보존 확인. 버전 검증 `db.rs:106`, 갱신 `:132`. | 지원 이전 배포본의 실제 fixture·업데이트 설치·형식 전환 각 단계의 종료/쓰기 실패는 미실행. 정상 v1 읽기 결과만으로 중단 안전성 전체 합격 불가. |
| T-26 손상·복구 | 부분 확인 / 소스상 복구 결함 | 기존 손상·빈 파일 자동 초기화 금지 및 원본 바이트 보존 `storage.rs:204`; 손상 백업은 오류 항목으로 남음 `:148`, `:155`; 읽기 전용 검사 `db.rs:299`. 아래 소스 경로에서 손상 현재 DB의 앱 내 복원을 차단함을 확인했다. | 손상된 현재 DB에서 백업으로 정상 상태까지 복구하는 T 행 조건을 충족하지 못한다. 네이티브 UI 재현 및 읽기 불가 ACL 시험은 미실행. DB 삭제는 `db.rs:119`~`:128`에서 새 DB 생성으로 처리하므로 최초 실행과 과거 DB 삭제의 구분 계약도 없다. |
| T-27 알림 시각·대상 | 미지원 | `README.md:55`에 알림 미지원. `model.rs:5`의 Task 및 `model.rs:67`의 Action에 알림/종일/반복/시간대 필드 없음. Cargo desktop plugin 목록 `Cargo.toml:20`에도 notification engine 없음. | 알림 지원 계약·정답 데이터·엔진·시험 전부 필요. 소스 점검만 수행, 알림 실행 0건. |
| T-28 알림 변경·취소 | 미지원 | T-27과 동일한 제품 계약. 예약·취소 저장 모델 및 엔진 없음. | 이동·삭제·반복 예외에 연결된 예약 취소·재예약 시험 0건. |
| T-29 권한·예약 실패 | 미지원 | T-27과 동일. 현재 UI의 저장 오류/전역 단축키 오류는 알림 권한 오류가 아니다. | 알림 권한·등록 실패·권한 회복 실행 0건. |
| T-30 종료·재부팅·지난 알림 | 미지원 | T-27과 동일. 자동실행 `main.rs:116`은 알림 예약 엔진이 아니다. | 상태별 전달 지연·누락·중복 및 지난 알림 정책 자체 미확정. OS 재부팅·절전·시계 변경 실행 0건. |
| T-34 원문 전송·로그 | 소스 확인 / 런타임 미실행 | 로깅 `main.rs:16`은 시각/app/schema/event/code만 쓰고 mutation `:39`도 payload 대신 오류 코드만 전달한다. startup `:162`~`:164`는 실행파일/DB 위치를 기록한다. `model.rs:89` 오류 변환은 원문 SQL 오류를 일반 문구로 대체한다. 프런트 `src` 및 Rust `src`에서 fetch/axios/WebSocket/sendBeacon/console/log/tracing/외부 URL 런타임 호출 검색, 원문 전송 경로 발견 없음. CSP IPC 제한 `tauri.conf.json:17`. | 식별 가능한 제목·메모를 넣고 네이티브 정상/검색/오류 중 실제 네트워크 요청·진단 파일을 관찰한 시험은 미실행. 의존성·WebView·OS 트래픽의 부재를 소스 검색으로 증명하지 않는다. startup 경로에 사용자명 등이 들어갈 수 있다. |
| T-36 저장 성능 | 보조 진단 실행 / 정식 기준 미판정 | 임시 DB 일반 미계획 작업 10,000개, SetCompleted 5회 워밍업+50회 표본, 실제 apply(commit+snapshot 포함) p95 **36.740ms**, min33.512/max37.879ms. debug Rust core 직접 호출. `db.rs:81`은 전체 snapshot을 읽고 `db.rs:219`~`:220`은 read 후 commit하여 성공 반환을 앞당기지 않는다. | 첨부 baseline의 반복 원본 1,000·예외 1,000·캘린더 10개는 현재 미지원. 대표 기기·배포 빌드·UI/IPC부터 영속 완료까지·일반/반복 작업군 계약을 충족한 측정이 아니므로 p95 300ms 요구를 합격 처리하지 않는다. |

## 복구·백업 범위의 구체적 공백

**현재 DB가 손상되면 앱 내부 백업 복원을 실행할 정상 Store가 없다.** `main.rs:159`에서 Store::open 결과를 받고 `:161`에서 `Mutex<Result<Store>>`에 Err도 보관한다. `with_store`의 `main.rs:21`~`:24`는 Err이면 전달한 작업 closure를 실행하지 않는다. 복원 handler도 `main.rs:67`에서 이 함수를 거치므로 저장소 오류를 그대로 반환한다. `load`의 `main.rs:28`은 같은 손상 파일을 다시 열 뿐이다. 프런트 `main.ts:189`는 `!ready`이면 다시 불러오기만 있는 load-state로 조기 반환해 설정/백업 UI에도 진입하지 못한다. 이것은 소스에 근거한 경로 분석이며 네이티브 UI에서 새로 재현한 결과는 아니다. 손상 파일 자동 삭제/초기화가 발생했다는 주장은 하지 않는다. 기존 suite는 원본 바이트 보존을 실제 확인했다.

SQLite 백업은 작업 및 근무 설정을 포함한다(`db.rs:224`, `model.rs:30`). 테마는 `main.ts:23`, `:552`의 localStorage, 캡처 단축키는 `main.rs:108`의 `capture-shortcut.txt`, 자동실행은 `main.rs:116`의 OS 등록에 저장된다. DB 전체 복제만으로 이 설정들이 복원되지는 않는다. 백업의 ‘설정’이 근무 설정에 한정되는지, 개인 설정까지 포함하는지 계약을 구체화해야 한다.

## Rust 날짜·입력·겹침 보조 근거

- `storage.rs:53` 실행 통과: 겹침·점심·주말·자정 넘김·15분 이외 시작·존재하지 않는 2월30일·최소 길이 미달 거부, 인접 블록 허용, 이동 ID 유지, 기존 배치와 충돌하는 근무 설정 거부.
- `storage.rs:75` 실행 통과: 날짜별 근무 예외는 다른 주에 적용되지 않고 휴가와 충돌하면 동의 전 원자적으로 거부한다. 명시적 move_conflicts 이후 작업을 미계획으로 보내되 ID/revision을 유지한다. 이 예외는 반복 일정의 회차 예외가 아니다.
- 소스 계약 `model.rs:141` parse_start: 고정 `YYYY-MM-DDTHH:mm`, 1900~9999년, timezone 없는 NaiveDateTime. `model.rs:150` validate_task: 제목/메모 byte 상한, 길이15~1440·15분 단위, 해당 날짜 근무시간/휴식/겹침 제한. 시간대·DST·윤년 독립 정답 데이터셋 전부를 실행한 것은 아니다.

## 추가 probe 결과와 비용

`write-lean-tests`를 먼저 읽고 아래 delta brief를 적용했다. 기존 owner 검색 대상은 `src-tauri/tests/storage.rs`의 Store/apply/backup/restore/legacy 및 `docs/test-policy.md`였다.

- Unique risk: 저장 서비스가 close를 실행하지 못한 확정 변경의 손실, 첫 SQL 쓰기 후 실패한 복합 변경의 부분 반영, 빈 저장소 복원과 실제 v1 파일 의미 보존. 기존 owner는 정상 drop/reopen·입력 검증 실패·기존 Store 복원이라 이 실패 신호를 완전히 검출하지 못한다.
- Selected layer: 파일 DB를 실제 쓰는 일회성 Rust core probe. 강제 종료는 probe 자신의 child 1개에만 수행했다. 제품 앱이나 OS를 종료하지 않았다.
- Expected cost delta: 기존 suite 유지, 영구 test/CI/coverage 변경 0. 일회성 cargo example build/run 1회, child process 1개, 임시 DB만 사용. 실제 file-DB 및 강제 종료 요구를 추가 검사하는 비용이다.
- Evidence to retire: 임시 `src-tauri/examples/calendar_quality_probe.rs`는 결과와 재현 소스를 이 문서에 남긴 뒤 제거했다. 독립적인 기존 테스트 증거를 삭제하지 않았다.
- Actual delta: 영구 added/extended/removed tests **0/0/0**, collected-case delta0, coverage floor 영향0. probe 본체 **2.553초**, cargo dev compile **2.08초**, 실행 exit0. 기존 suite에 합쳐 측정하지 않았으므로 suite runtime 증분은 미측정. 신규 의존성 없음.

```text
PROBE force_kill_committed_store: PASS; child=1; data_loss=0
PROBE sql_failure_atomicity: PASS; injection_points=2; partial_changes=0
PROBE empty_store_restore: PASS; tasks=1; settings_equal=true; day_exceptions=1; fresh_epoch=true
PROBE legacy_open: PASS; user_version=1->2; task_and_notes_preserved=true; default_fields=true
PROBE storage_only_perf: tasks=10000; recurrence=0; calendars=0; warmups=5; samples=50; p95_ms=36.740; min_ms=33.512; max_ms=37.879; build=debug; operation=SetCompleted
PROBE total_seconds=2.553
```

## 일회성 probe 재현 소스

아래 코드를 `src-tauri/examples/calendar_quality_probe.rs`에 저장하고 위 toolchain 환경에서 다음 명령을 실행한다. `tempfile`은 기존 dev-dependency다. 종료 후 이 임시 소스를 제거한다. 프로그램은 tempdir를 자동 제거하며, child가 commit flag를 만든 후 해당 child만 kill한다. p95는 정렬된 표본50개의 48번째 값(nearest rank)이다. 파일 DB 및 child 실행이 허용되는 환경이 필요하다.

```powershell
cargo run --manifest-path src-tauri/Cargo.toml --example calendar_quality_probe --no-default-features --locked
```

<!-- Probe source below is the exact executed source. -->
```rust
use blokky_core::{db::Store, model::*};
use rusqlite::{params, Connection};
use std::{fs, path::Path, process::{Command as Process, Stdio}, time::{Duration, Instant}};

fn apply(s: &mut Store, action: Action) -> Result<Snapshot> {
    s.apply(&Command { request_id: uuid::Uuid::new_v4().to_string(), epoch: s.snapshot()?.epoch, action })
}
fn create(s: &mut Store, id: &str, start: Option<&str>, duration: i64) -> Task {
    apply(s, Action::CreateScheduled {id:id.into(),title:format!("품질시험-{id}"),starts_at:start.map(String::from),duration}).unwrap().tasks.into_iter().find(|t|t.id==id).unwrap()
}
fn json(s: &Store) -> serde_json::Value { serde_json::to_value(s.snapshot().unwrap()).unwrap() }
fn child(root: &Path) {
    let mut s=Store::open(&root.join("crash.db")).unwrap();
    let a=create(&mut s,"crash",Some("2026-10-08T10:00"),45);
    apply(&mut s,Action::Update{id:a.id,expected_revision:a.revision,title:"강제종료-확정제목".into(),body:"강제종료-확정메모".into(),starts_at:a.starts_at,duration:a.duration}).unwrap();
    let settings=s.snapshot().unwrap().settings;
    apply(&mut s,Action::SetSchedule{expected_revision:settings.revision,days:settings.days,exceptions:settings.exceptions,weekly_target:2100,work_days:4,move_conflicts:false}).unwrap();
    fs::write(root.join("ready.json"),serde_json::to_vec(&s.snapshot().unwrap()).unwrap()).unwrap();
    fs::write(root.join("committed.flag"),[]).unwrap();
    loop { std::thread::park(); }
}
fn main() {
    let args:Vec<_>=std::env::args().collect();
    if args.get(1).map(String::as_str)==Some("--commit-child") { child(Path::new(&args[2])); return; }
    let timer=Instant::now();let dir=tempfile::tempdir().unwrap();let root=dir.path();
    let mut process=Process::new(std::env::current_exe().unwrap()).arg("--commit-child").arg(root).stdout(Stdio::null()).spawn().unwrap();
    let deadline=Instant::now()+Duration::from_secs(10);
    while !root.join("committed.flag").exists() {
        assert!(Instant::now()<deadline,"child did not commit");
        assert!(process.try_wait().unwrap().is_none(),"child exited early");
        std::thread::sleep(Duration::from_millis(10));
    }
    process.kill().unwrap();process.wait().unwrap();
    let expected:serde_json::Value=serde_json::from_slice(&fs::read(root.join("ready.json")).unwrap()).unwrap();
    let reopened=Store::open(&root.join("crash.db")).unwrap();assert_eq!(json(&reopened),expected);drop(reopened);
    println!("PROBE force_kill_committed_store: PASS; child=1; data_loss=0");

    let path=root.join("atomic.db");let mut s=Store::open(&path).unwrap();let a=create(&mut s,"a",Some("2026-10-08T10:00"),90);
    let before=json(&s);let conn=Connection::open(&path).unwrap();
    conn.execute_batch("CREATE TRIGGER fail_split BEFORE INSERT ON tasks WHEN NEW.id='b' BEGIN SELECT RAISE(ABORT,'quality-injected-second-write'); END;").unwrap();
    assert!(apply(&mut s,Action::Split{id:a.id.clone(),expected_revision:a.revision,new_id:"b".into(),first_duration:45}).is_err());assert_eq!(json(&s),before);
    let receipts:i64=conn.query_row("SELECT count(*) FROM receipts",[],|r|r.get(0)).unwrap();assert_eq!(receipts,1);
    conn.execute_batch("DROP TRIGGER fail_split; CREATE TRIGGER fail_settings BEFORE UPDATE ON meta WHEN NEW.key='settings' BEGIN SELECT RAISE(ABORT,'quality-injected-after-task-move'); END;").unwrap();
    let settings=s.snapshot().unwrap().settings;let mut days=settings.days.clone();days[3].enabled=false;
    assert!(apply(&mut s,Action::SetSchedule{expected_revision:settings.revision,days,exceptions:settings.exceptions,weekly_target:settings.weekly_target,work_days:settings.work_days,move_conflicts:true}).is_err());assert_eq!(json(&s),before);
    conn.execute_batch("DROP TRIGGER fail_settings;").unwrap();drop(conn);drop(s);assert_eq!(json(&Store::open(&path).unwrap()),before);
    println!("PROBE sql_failure_atomicity: PASS; injection_points=2; partial_changes=0");

    let mut source=Store::open(&root.join("source.db")).unwrap();let t=create(&mut source,"backup",Some("2026-10-08T10:00"),30);
    apply(&mut source,Action::Update{id:t.id,expected_revision:t.revision,title:"백업 제목".into(),body:"백업 메모".into(),starts_at:t.starts_at,duration:t.duration}).unwrap();
    let settings=source.snapshot().unwrap().settings;let mut day=settings.days[4].clone();day.enabled=false;
    apply(&mut source,Action::SetSchedule{expected_revision:settings.revision,days:settings.days,exceptions:vec![DayException{date:"2026-10-09".into(),kind:"leave".into(),day}],weekly_target:2100,work_days:4,move_conflicts:false}).unwrap();
    let expected=source.snapshot().unwrap();let backup=root.join("backup.db");source.backup(&backup).unwrap();
    let empty_path=root.join("empty.db");let mut empty=Store::open(&empty_path).unwrap();let epoch=empty.snapshot().unwrap().epoch;
    let restored=empty.restore(&backup,&epoch,&root.join("safety-empty.db")).unwrap();assert_eq!(restored.tasks,expected.tasks);assert_eq!(restored.settings,expected.settings);assert_ne!(restored.epoch,expected.epoch);
    drop(empty);let restored=Store::open(&empty_path).unwrap().snapshot().unwrap();assert_eq!(restored.tasks,expected.tasks);assert_eq!(restored.settings,expected.settings);
    println!("PROBE empty_store_restore: PASS; tasks=1; settings_equal=true; day_exceptions=1; fresh_epoch=true");

    let legacy_path=root.join("legacy.db");let legacy=Store::open(&legacy_path).unwrap();drop(legacy);
    let conn=Connection::open(&legacy_path).unwrap();let mut legacy_settings=serde_json::to_value(Settings::default()).unwrap();
    for key in ["exceptions","weekly_target","work_days"] {legacy_settings.as_object_mut().unwrap().remove(key);}
    conn.execute("UPDATE meta SET value=?1 WHERE key='settings'",[legacy_settings.to_string()]).unwrap();conn.execute_batch("PRAGMA user_version=1; INSERT INTO tasks(id,title,body) VALUES('legacy','구버전 제목','구버전 메모');").unwrap();drop(conn);
    let migrated=Store::open(&legacy_path).unwrap();let snap=migrated.snapshot().unwrap();assert_eq!(snap.tasks[0].body,"구버전 메모");assert_eq!(snap.settings.weekly_target,2400);assert_eq!(snap.settings.work_days,5);assert!(snap.settings.exceptions.is_empty());drop(migrated);
    let conn=Connection::open(&legacy_path).unwrap();let version:i64=conn.query_row("PRAGMA user_version",[],|r|r.get(0)).unwrap();assert_eq!(version,2);drop(conn);
    println!("PROBE legacy_open: PASS; user_version=1->2; task_and_notes_preserved=true; default_fields=true");

    let perf_path=root.join("perf.db");let perf=Store::open(&perf_path).unwrap();drop(perf);let mut conn=Connection::open(&perf_path).unwrap();
    let tx=conn.transaction().unwrap();{let mut stmt=tx.prepare("INSERT INTO tasks(id,title,body) VALUES(?1,?2,?3)").unwrap();for i in 0..10000 {stmt.execute(params![format!("p{i:05}"),format!("품질 성능 시험 {i}"),"한글 메모 ".repeat(8)]).unwrap();}}tx.commit().unwrap();drop(conn);
    let mut perf=Store::open(&perf_path).unwrap();let mut samples=Vec::new();
    for i in 0..55 {let start=Instant::now();let result=apply(&mut perf,Action::SetCompleted{id:"p00000".into(),expected_revision:i+1,completed:i%2==0}).unwrap();let elapsed=start.elapsed().as_secs_f64()*1000.0;assert_eq!(result.tasks.len(),10000);if i>=5 {samples.push(elapsed);}}
    samples.sort_by(f64::total_cmp);let p95=samples[47];
    println!("PROBE storage_only_perf: tasks=10000; recurrence=0; calendars=0; warmups=5; samples=50; p95_ms={p95:.3}; min_ms={:.3}; max_ms={:.3}; build=debug; operation=SetCompleted",samples[0],samples[49]);
    println!("PROBE total_seconds={:.3}",timer.elapsed().as_secs_f64());
}
```
