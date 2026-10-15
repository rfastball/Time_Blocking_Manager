use chrono::{Datelike, NaiveDateTime, Timelike};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub body: String,
    pub starts_at: Option<String>,
    pub duration: i64,
    pub completed: bool,
    pub revision: i64,
    // Fixed tasks derive plan_date from starts_at; flow tasks have a date and an order only.
    #[serde(default)] pub plan_date: Option<String>,
    #[serde(default)] pub flow_order: Option<i64>,
    // Captured without a chosen length yet; only unplanned work can be one, and it never becomes one again.
    #[serde(default)] pub proto: bool,
    // Open unplanned work sits in a pile (None: the 투입구) at an order; everything else has neither.
    #[serde(default)] pub pile_id: Option<String>,
    #[serde(default)] pub pile_order: Option<i64>,
    // The retired free board's position: read once by the v9 migration, never written for new work.
    #[serde(default)] pub board_x: Option<i64>,
    #[serde(default)] pub board_y: Option<i64>,
    // Pushed out to 기다림 (wait_since: the local day it was first pushed): open, dateless and in no pile until revived.
    // wait_for: what it waits on ('' unnamed); wait_until: the day from which it may come back. Time alone never revives it.
    #[serde(default)] pub wait_for: Option<String>,
    #[serde(default)] pub wait_until: Option<String>,
    #[serde(default)] pub wait_since: Option<String>,
}

// One piece from the cutting board. The first keeps the original task's id; the others are new tasks.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Piece { pub id: String, pub title: String, pub body: String, pub duration: i64, #[serde(default)] pub proto: bool, #[serde(default)] pub completed: bool }

// A pile row. Only the reserved 'shelf' (the 준비 shelf) remains in v9; the 들어옴 has no row.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Pile { pub id: String, pub position: i64 }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DayLayout { pub date: String, pub anchor: i64 }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Unavailable { pub start: i64, pub end: i64, pub label: String }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkingDay {
    pub enabled: bool,
    pub start: i64,
    pub end: i64,
    pub breaks: Vec<Unavailable>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DayException { pub date:String, pub kind:String, pub day:WorkingDay }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Routine {
    pub id: String, pub title: String, pub body: String,
    pub weekdays: Vec<usize>, pub start: i64, pub duration: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRevision { pub id: String, pub revision: i64 }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Settings {
    pub days: Vec<WorkingDay>, pub revision: i64,
    #[serde(default)] pub exceptions:Vec<DayException>,
    #[serde(default="default_target")] pub weekly_target:i64,
    #[serde(default="default_work_days")] pub work_days:i64,
    #[serde(default)] pub routines:Vec<Routine>,
}
fn default_target()->i64 {2400}
fn default_work_days()->i64 {5}
impl Settings {
    pub fn day(&self,date:chrono::NaiveDate)->&WorkingDay {
        let key=date.format("%Y-%m-%d").to_string();
        self.exceptions.iter().find(|e|e.date==key).map(|e|&e.day)
            .unwrap_or(&self.days[date.weekday().num_days_from_monday() as usize])
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self { revision: 1, exceptions:vec![],routines:vec![],weekly_target:2400,work_days:5,days: (0..7).map(|i| WorkingDay {
            enabled: i < 5, start: 540, end: 1080,
            breaks: vec![Unavailable { start: 720, end: 780, label: "점심".into() }],
        }).collect() }
    }
}

// A deleted task kept whole so restoring it returns the same date, order, time and completion.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Trashed { #[serde(flatten)] pub task: Task, pub deleted_at: String }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot { pub epoch: String, pub tasks: Vec<Task>, pub settings: Settings, #[serde(default)] pub layouts: Vec<DayLayout>, #[serde(default)] pub trash: Vec<Trashed>, #[serde(default)] pub piles: Vec<Pile> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Command {
    pub request_id: String,
    pub epoch: String,
    // Missing on old saved drafts: never renew an old request's retry lifetime.
    #[serde(default, skip_serializing_if = "Option::is_none")] pub issued_at: Option<i64>,
    pub action: Action,
}

pub const REQUEST_LIFETIME_MS: i64 = 30 * 24 * 60 * 60 * 1000;
pub const REQUEST_CLOCK_TOLERANCE_MS: i64 = 5 * 60 * 1000;
pub fn validate_request_time(command: &Command, now: i64, cutoff: i64) -> Result<()> {
    if now<=cutoff {return Err(error("clock","시스템 시각이 처리 기록 정리 시각보다 이전입니다. PC 시각을 확인하거나 백업에서 복원해 주세요."));}
    let Some(issued)=command.issued_at else {return Err(error("expired","이전 저장 요청의 처리 기록을 확인할 수 없습니다. 입력은 유지됩니다. 저장된 내용을 확인해 주세요."));};
    if issued>now.saturating_add(REQUEST_CLOCK_TOLERANCE_MS) {return Err(error("clock","PC 시각이 저장 요청 시각보다 이전입니다. PC 시각을 확인한 뒤 다시 시도해 주세요. 입력은 유지됩니다."));}
    if issued<0 || issued<=now.saturating_sub(REQUEST_LIFETIME_MS) || issued<=cutoff {
        return Err(error("expired","이전 저장 요청의 처리 기록을 확인할 수 없습니다. 입력은 유지됩니다. 저장된 내용을 확인해 주세요."));
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
    Create { id: String, title: String },
    CreateScheduled { id:String,title:String,starts_at:Option<String>,duration:i64 },
    CreateFlow { id:String, title:String, date:String, duration:i64 },
    // Omitted placement fields keep request fingerprints of older clients unchanged.
    Update { id: String, expected_revision: i64, title: String, body: String, starts_at: Option<String>, duration: i64,
        #[serde(default, skip_serializing_if="Option::is_none")] plan_date: Option<String>,
        #[serde(default, skip_serializing_if="Option::is_none")] before: Option<String>,
        // The length was chosen explicitly, even if it equals the stored one: a proto block becomes a sized one.
        #[serde(default, skip_serializing_if="Option::is_none")] sized: Option<bool> },
    // `date`: the day a 준비 task is completed on (today); dated work keeps its own date.
    SetCompleted { id: String, expected_revision: i64, completed: bool,
        #[serde(default, skip_serializing_if="Option::is_none")] date: Option<String> },
    // Delete sets the task aside in the trash; only purge removes it for good.
    Delete { id: String, expected_revision: i64 },
    RestoreTrashed { id: String },
    PurgeTrashed { ids: Vec<String> },
    // The cutting board's result: each piece becomes its own task where the original stood, in order.
    // `date`: the day a completed piece of 준비 work is recorded on (today).
    SplitPieces { id:String, expected_revision:i64, pieces:Vec<Piece>, #[serde(default, skip_serializing_if="Option::is_none")] date:Option<String> },
    SetSettings { expected_revision: i64, days: Vec<WorkingDay> },
    SetSchedule { expected_revision:i64,days:Vec<WorkingDay>,exceptions:Vec<DayException>,weekly_target:i64,work_days:i64,move_conflicts:bool },
    SetRoutines { expected_revision:i64, routines:Vec<Routine> },
    EnsureRoutines { from:String, to:String },
    ClearDay { date:String, expected_tasks:Vec<TaskRevision> },
    ReorderFlow { date:String, expected:Vec<TaskRevision> },
    CompleteFlow { date:String, items:Vec<TaskRevision>, at:Option<String> },
    Reflow { date:String, at:String },
    // Into a pile (None: the 투입구) before the card now at `index`; with `create_at` the pile is new at that position.
    PlaceUnplanned { items:Vec<TaskRevision>, pile:Option<String>, #[serde(default)] create_at:Option<i64>, index:i64 },
    // A fresh task replaces the selected open unplanned tasks; originals stay whole in the trash.
    MergeUnplanned { id:String, items:Vec<TaskRevision> },
    MovePile { pile:String, position:i64 },
    // In the given order before a flow task, or onto the end of the date's order.
    ShipFlow { date:String, items:Vec<TaskRevision>, #[serde(default, skip_serializing_if="Option::is_none")] before:Option<String> },
    // Out to 기다림 in the given order, or a new trigger for work already there; `since` only marks a first push.
    Wait { items:Vec<TaskRevision>, trigger:String, #[serde(default)] until:Option<String>, since:String },
    // Back from 기다림: sized work on top of the shelf, protos on top of the 들어옴, each in the given order.
    Revive { items:Vec<TaskRevision> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppError { pub code: String, pub message: String, pub retryable: bool }

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { write!(f, "{}: {}", self.code, self.message) }
}
impl std::error::Error for AppError {}
pub type Result<T> = std::result::Result<T, AppError>;
pub fn error(code: &str, message: &str) -> AppError {
    AppError { code: code.into(), message: message.into(), retryable: false }
}
impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        use rusqlite::ErrorCode::*;
        let code = match e.sqlite_error_code() {
            Some(DatabaseBusy | DatabaseLocked) => "busy",
            Some(DatabaseCorrupt | NotADatabase) => "corrupt",
            Some(DiskFull | PermissionDenied | ReadOnly | CannotOpen | SystemIoFailure) => "storage",
            Some(ConstraintViolation | TypeMismatch) => "validation",
            _ => "database",
        };
        Self { code: code.into(), message: match code {
            "busy" => "저장소가 사용 중입니다. 잠시 후 다시 시도하세요.",
            "corrupt" => "저장소 무결성을 확인할 수 없습니다. 원본은 보존됩니다.",
            "storage" => "저장할 수 없습니다. 디스크 공간과 파일 접근 권한을 확인하세요.",
            _ => "저장소 작업을 완료하지 못했습니다. 입력과 앱 버전을 확인하세요.",
        }.into(), retryable: code == "busy" }
    }
}
impl From<std::io::Error> for AppError {
    fn from(_: std::io::Error) -> Self { error("storage", "파일에 접근할 수 없습니다. 디스크 공간과 권한을 확인하세요.") }
}
impl From<serde_json::Error> for AppError {
    fn from(_: serde_json::Error) -> Self { error("schema", "저장된 데이터 형식을 읽을 수 없습니다.") }
}

pub fn validate_settings(settings: &Settings) -> Result<()> {
    let mut routine_ids=std::collections::HashSet::new();
    for routine in &settings.routines {
        let mut weekdays=std::collections::HashSet::new();
        if routine.id.is_empty() || routine.id.len()>100 || !routine_ids.insert(&routine.id)
            || routine.title.trim().is_empty() || routine.title.len()>2000 || routine.body.len()>200_000
            || routine.weekdays.is_empty() || routine.weekdays.iter().any(|day|*day>6 || !weekdays.insert(*day))
            || routine.start<0 || routine.start%15!=0 || routine.duration<15 || routine.duration>1440
            || routine.duration%15!=0 || routine.start>1440-routine.duration {
            return Err(error("validation","정기 업무의 제목, 요일, 시작시각과 소요시간을 확인하세요."));
        }
    }
    if settings.days.len() != 7 { return Err(error("validation", "월요일부터 일요일까지 7일의 설정이 필요합니다.")); }
    if !(15..=10080).contains(&settings.weekly_target)||settings.weekly_target%15!=0||!(1..=7).contains(&settings.work_days) {
        return Err(error("validation","주간 목표 시간과 근무일 수를 확인하세요."));
    }
    let mut dates=std::collections::HashSet::new();
    for exception in &settings.exceptions {
        parse_start(&format!("{}T00:00",exception.date))?;
        if !dates.insert(&exception.date)||!matches!(exception.kind.as_str(),"custom"|"leave"|"early")||exception.kind=="leave"&&exception.day.enabled {
            return Err(error("validation","날짜별 예외 설정을 확인하세요."));
        }
    }
    for day in settings.days.iter().chain(settings.exceptions.iter().map(|e|&e.day)) {
        if day.start < 0 || day.end > 1440 || day.start >= day.end || day.start%15!=0 || day.end%15!=0 {
            return Err(error("validation", "작업 시간의 시작과 끝을 확인하세요."));
        }
        let mut breaks = day.breaks.clone(); breaks.sort_by_key(|b| b.start);
        for (i, b) in breaks.iter().enumerate() {
            if b.start < day.start || b.end > day.end || b.start >= b.end || b.label.trim().is_empty()
                || b.start%15!=0 || b.end%15!=0 || b.label.len() > 200 || (i > 0 && breaks[i - 1].end > b.start) {
                return Err(error("validation", "작업 불가 시간은 근무시간 안에서 겹치지 않게 지정하세요."));
            }
        }
    }
    Ok(())
}

pub fn parse_start(value: &str) -> Result<NaiveDateTime> {
    let parsed = NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M")
        .map_err(|_| error("validation", "시작 날짜와 시각이 올바르지 않습니다."))?;
    if parsed.format("%Y-%m-%dT%H:%M").to_string() != value || !(1900..=9999).contains(&parsed.year()) {
        return Err(error("validation", "시작 날짜와 시각이 올바르지 않습니다."));
    }
    Ok(parsed)
}

pub fn validate_task(task: &Task, tasks: &[Task]) -> Result<()> {
    // Only waiting work carries a trigger; the place rules are checked with the bench.
    let wait_day=|d:&Option<String>|d.as_deref().map_or(true,|d|parse_start(&format!("{d}T00:00")).is_ok());
    if task.wait_since.is_none()&&(task.wait_for.is_some()||task.wait_until.is_some())
        || task.wait_for.as_ref().is_some_and(|w|w.len()>200||w.trim()!=w) || !wait_day(&task.wait_since) || !wait_day(&task.wait_until) {
        return Err(error("validation","기다림 조건을 확인하세요."));
    }
    match (task.board_x,task.board_y) {
        (None,None) => {},
        (Some(x),Some(y)) if (-100_000..=100_000).contains(&x)&&(-100_000..=100_000).contains(&y) => {},
        _ => return Err(error("validation","작업대 위치를 확인하세요.")),
    }
    if task.id.is_empty() || task.id.len() > 100 || task.title.trim().is_empty() || task.title.len() > 2000 || task.body.len() > 200_000
        || task.duration < 15 || task.duration > 1440 || task.duration % 15 != 0 {
        return Err(error("validation", "제목(최대 2,000바이트), 본문(최대 200KB), 소요시간을 확인하세요."));
    }
    if let Some(date)=task.plan_date.as_deref() { parse_start(&format!("{date}T00:00"))?; }
    let start=match (task.starts_at.as_deref(),task.plan_date.as_deref(),task.flow_order) {
        (Some(start),Some(date),None) if start.get(..10)==Some(date) => start,
        // Flow tasks are placed by the client layout and never reserve exact minutes.
        (None,Some(_),Some(_)) | (None,None,None) => return Ok(()),
        _ => return Err(error("validation","작업의 날짜·순서·시각 배치 상태가 올바르지 않습니다.")),
    };
    let dt = parse_start(start)?;
    let minute = (dt.hour() * 60 + dt.minute()) as i64;
    if minute % 15 != 0 { return Err(error("validation", "시작시각은 15분 단위로 지정하세요.")); }
    let end = minute + task.duration;
    if end > 1440 {
        return Err(error("validation", "블록은 같은 날짜 안에 배치하세요."));
    }
    for other in tasks.iter().filter(|t| t.id != task.id) {
        if let Some(other_start) = &other.starts_at {
            let odt = parse_start(other_start)?;
            let om = (odt.hour() * 60 + odt.minute()) as i64;
            if dt.date() == odt.date() && minute < om + other.duration && end > om {
                return Err(error("overlap", "다른 항목과 겹칩니다. 기존 배치는 그대로 유지됩니다."));
            }
        }
    }
    Ok(())
}
