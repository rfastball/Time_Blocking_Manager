use chrono::{Datelike, NaiveDateTime, Timelike};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot { pub epoch: String, pub tasks: Vec<Task>, pub settings: Settings, #[serde(default)] pub layouts: Vec<DayLayout> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Command {
    pub request_id: String,
    pub epoch: String,
    pub action: Action,
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
        #[serde(default, skip_serializing_if="Option::is_none")] before: Option<String> },
    SetCompleted { id: String, expected_revision: i64, completed: bool },
    Delete { id: String, expected_revision: i64 },
    Split { id:String, expected_revision:i64, new_id:String, first_duration:i64 },
    SetSettings { expected_revision: i64, days: Vec<WorkingDay> },
    SetSchedule { expected_revision:i64,days:Vec<WorkingDay>,exceptions:Vec<DayException>,weekly_target:i64,work_days:i64,move_conflicts:bool },
    SetRoutines { expected_revision:i64, routines:Vec<Routine> },
    EnsureRoutines { from:String, to:String },
    ClearDay { date:String, expected_tasks:Vec<TaskRevision> },
    ReorderFlow { date:String, expected:Vec<TaskRevision> },
    CompleteFlow { date:String, items:Vec<TaskRevision>, at:Option<String> },
    Reflow { date:String, at:String },
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

pub fn validate_task(task: &Task, tasks: &[Task], settings: &Settings) -> Result<()> {
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
    let day = settings.day(dt.date());
    if !day.enabled || minute < day.start || end > day.end || day.breaks.iter().any(|b| minute < b.end && end > b.start) {
        return Err(error("unavailable", "작업 불가 시간입니다. 빈 작업 가능 시간에 배치하세요."));
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
