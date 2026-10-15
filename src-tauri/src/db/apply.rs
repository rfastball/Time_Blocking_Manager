use super::*;
use std::collections::{HashMap,HashSet};

const CHANGED: &str = "다른 창에서 작업이 변경됐습니다. 다시 확인하세요.";

// Appending after completed flow tasks lets an undone task return to its own place.
pub(super) fn next_flow_order(tasks: &[Task], date: &str) -> i64 {
    tasks.iter().filter(|t|t.plan_date.as_deref()==Some(date)&&t.starts_at.is_none()).filter_map(|t|t.flow_order).max().unwrap_or(0)+1
}

pub(super) fn is_open_flow(t: &Task, date: &str) -> bool {
    t.plan_date.as_deref()==Some(date) && t.starts_at.is_none() && t.flow_order.is_some() && !t.completed
}

pub(super) fn minute_on(at: &str, date: &str) -> Result<i64> {
    use chrono::Timelike;
    let parsed=parse_start(at)?;
    if parsed.date().format("%Y-%m-%d").to_string()!=date {return Err(error("validation","배치 기준 시각은 같은 날짜여야 합니다."));}
    Ok(i64::from(parsed.hour()*60+parsed.minute()))
}

// The anchor only moves forward so a delayed retry cannot reopen past space.
pub(super) fn advance_anchor(conn: &Connection, date: &str, minute: i64) -> Result<()> {
    conn.execute("INSERT INTO day_layouts(date,anchor) VALUES(?1,?2) ON CONFLICT(date) DO UPDATE SET anchor=max(anchor,excluded.anchor)",params![date,minute])?;
    Ok(())
}

pub(super) fn unique_revisions(items: &[TaskRevision], message: &str) -> Result<HashMap<String,i64>> {
    let mut expected=HashMap::new();
    for task in items {
        if task.id.is_empty() || task.id.len()>100 || task.revision<1 || expected.insert(task.id.clone(),task.revision).is_some() {return Err(error("validation",message));}
    }
    Ok(expected)
}

impl Store {
    pub fn apply_at(&mut self, command: &Command, now: i64) -> Result<Snapshot> {
        if command.request_id.is_empty() || command.request_id.len() > 100 { return Err(error("validation", "요청 식별자가 올바르지 않습니다.")); }
        let payload = format!("{:x}",Sha256::digest(serde_json::to_vec(command)?));
        let tx = self.conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let snapshot = read(&tx)?;
        if command.epoch != snapshot.epoch { return Err(error("epoch", "복원 전 화면의 요청입니다. 초안을 보존하고 최신 데이터를 확인하세요.")); }
        if recorded_request(&tx,command,&payload)? {return Ok(snapshot);}
        validate_request_time(command,now,receipt_cutoff(&tx)?)?;
        let w=Write{tx:&tx,s:&snapshot,now};
        match &command.action {
            Action::Create{id,title} => w.create(id,title),
            Action::CreateScheduled{id,title,starts_at,duration} => w.create_scheduled(id,title,starts_at,*duration),
            Action::CreateFlow{id,title,date,duration} => w.create_flow(id,title,date,*duration),
            Action::Update{id,expected_revision,title,body,starts_at,duration,plan_date,before,sized} =>
                w.update(w.task_at(id,*expected_revision)?,title,body,starts_at,*duration,plan_date,before,*sized),
            Action::SetCompleted{id,expected_revision,completed,date} => w.set_completed(w.task_at(id,*expected_revision)?,*completed,date),
            Action::Delete{id,expected_revision} => w.delete(w.task_at(id,*expected_revision)?),
            Action::RestoreTrashed{id} => w.restore_trashed(id),
            Action::PurgeTrashed{ids} => w.purge_trashed(ids),
            Action::SplitPieces{id,expected_revision,pieces,date} => w.split_pieces(w.task_at(id,*expected_revision)?,pieces,date),
            Action::SetSettings{expected_revision,days} => w.set_settings(*expected_revision,days),
            Action::SetSchedule{expected_revision,days,exceptions,weekly_target,work_days,move_conflicts:_} => w.set_schedule(*expected_revision,days,exceptions,*weekly_target,*work_days),
            Action::SetRoutines{expected_revision,routines} => w.set_routines(*expected_revision,routines),
            Action::EnsureRoutines{from,to} => w.ensure_routines(from,to),
            Action::ClearDay{date,expected_tasks} => w.clear_day(date,expected_tasks),
            Action::ReorderFlow{date,expected} => w.reorder_flow(date,expected),
            Action::CompleteFlow{date,items,at} => w.complete_flow(date,items,at),
            Action::Reflow{date,at} => w.reflow(date,at),
            Action::PlaceUnplanned{items,pile,create_at,index} => w.place_unplanned(items,pile,create_at,*index),
            Action::MergeUnplanned{id,items} => w.merge_unplanned(id,items),
            Action::MovePile{pile,position} => w.move_pile(pile,*position),
            Action::ShipFlow{date,items,before} => w.ship_flow(date,items,before),
            Action::Wait{items,trigger,until,since} => w.wait(items,trigger,until,since),
            Action::Revive{items} => w.revive(items),
        }?;
        normalize_piles(&tx)?;
        // Retain a tolerated future request until its own retry horizon also expires.
        tx.execute("INSERT INTO receipts(id,payload,accepted_at) VALUES(?1,?2,?3)", params![command.request_id,payload,now.max(command.issued_at.unwrap_or(now))])?;
        let result = read(&tx)?;
        validate_bench(&result)?;
        tx.commit()?;
        Ok(result)
    }
}

// One action's writes inside the open transaction, checked against the state read at its start, at the request's clock.
struct Write<'a> { tx: &'a Connection, s: &'a Snapshot, now: i64 }

impl<'a> Write<'a> {
    // The task an editor or a block menu acted on, still at the revision it saw.
    fn task_at(&self, id: &str, revision: i64) -> Result<&'a Task> {
        let Some(current) = self.s.tasks.iter().find(|t| t.id == id) else { return Err(error("conflict", "항목이 이미 삭제됐습니다. 작성 내용을 보존했습니다.")); };
        if current.revision != revision { return Err(error("conflict", "다른 창에서 항목이 변경됐습니다. 작성 내용을 보존했습니다.")); }
        Ok(current)
    }
    // Every listed task at its listed revision and fit for the move, in the listed order.
    fn tasks_at(&self, items: &[TaskRevision], fits: impl Fn(&Task) -> bool) -> Result<Vec<&'a Task>> {
        items.iter().map(|i|self.s.tasks.iter().find(|t|t.id==i.id&&t.revision==i.revision&&fits(t))).collect::<Option<_>>().ok_or_else(||error("conflict",CHANGED))
    }
    // Trashed work is stamped with the same clock as the receipt.
    fn trash_stamp(&self) -> Result<String> {
        chrono::DateTime::from_timestamp_millis(self.now).map(trash_stamp).ok_or_else(||error("validation","요청 시각이 올바르지 않습니다."))
    }
    fn taken(&self, id: &str) -> bool { self.s.tasks.iter().chain(self.s.trash.iter().map(|t|&t.task)).any(|t|t.id==id) }
    fn save_settings(&self, settings: Settings) -> Result<()> {
        validate_settings(&settings)?;
        self.tx.execute("UPDATE meta SET value=?1 WHERE key='settings'",[serde_json::to_string(&settings)?])?;
        Ok(())
    }

    fn create(&self, id: &str, title: &str) -> Result<()> {
        // Captured work has no chosen length yet and lands on top of the 투입구.
        let task = Task { id: id.into(), title: title.trim().into(), duration: 30, revision: 1, proto: true, ..Task::default() };
        validate_task(&task, &self.s.tasks)?;
        insert_task(self.tx,&task,None)?;
        place(self.tx,std::slice::from_ref(&task.id),None,0)
    }
    fn create_scheduled(&self, id: &str, title: &str, starts_at: &Option<String>, duration: i64) -> Result<()> {
        let plan_date=starts_at.as_deref().map(|start|start.get(..10).unwrap_or_default().to_string());
        let task=Task{id:id.into(),title:title.trim().into(),starts_at:starts_at.clone(),duration,revision:1,plan_date,..Task::default()};
        validate_task(&task,&self.s.tasks)?;
        insert_task(self.tx,&task,None)
    }
    fn create_flow(&self, id: &str, title: &str, date: &str, duration: i64) -> Result<()> {
        parse_date(date)?;
        let task=Task{id:id.into(),title:title.trim().into(),duration,revision:1,plan_date:Some(date.into()),flow_order:Some(next_flow_order(&self.s.tasks,date)),..Task::default()};
        validate_task(&task,&self.s.tasks)?;
        insert_task(self.tx,&task,None)
    }

    #[allow(clippy::too_many_arguments)]
    fn update(&self, current: &Task, title: &str, body: &str, starts_at: &Option<String>, duration: i64, plan_date: &Option<String>, before: &Option<String>, sized: Option<bool>) -> Result<()> {
        let (id,revision)=(&current.id,current.revision);
        let derived=starts_at.as_deref().map(|start|start.get(..10).unwrap_or_default().to_string());
        if derived.is_some() && plan_date.is_some() && derived!=*plan_date {return Err(error("validation","시각을 고정한 날짜와 계획 날짜가 다릅니다."));}
        let date=derived.or_else(||plan_date.clone());
        if let Some(date)=&date {parse_date(date)?;}
        if date.is_none() && current.completed && current.plan_date.is_some() {return Err(error("validation","완료한 작업은 준비로 옮길 수 없어요. 완료를 취소한 뒤 옮겨 주세요."));}
        let mut shift=None;
        let flow_order=match (starts_at,&date,before) {
            (None,Some(date),Some(before)) => {
                let target=self.s.tasks.iter().find(|t|&t.id==before && t.id!=*id && is_open_flow(t,date))
                    .ok_or_else(||error("validation","순서를 정할 같은 날짜의 작업을 확인하세요."))?;
                shift=target.flow_order.map(|order|(date.clone(),order));target.flow_order
            }
            (_,_,Some(_)) => return Err(error("validation","순서는 날짜만 정한 작업에서 지정할 수 있습니다.")),
            (None,Some(date),None) if current.plan_date.as_ref()==Some(date) && current.flow_order.is_some() => current.flow_order,
            (None,Some(date),None) => Some(next_flow_order(&self.s.tasks,date)),
            _ => None,
        };
        let task = Task { title: title.trim().into(), body: body.into(), starts_at: starts_at.clone(), duration, plan_date: date, flow_order, ..current.clone() };
        validate_task(&task, &self.s.tasks)?;
        // Inserting before another task moves only the later order numbers of that day.
        if let Some((date,order))=shift {self.tx.execute("UPDATE tasks SET flow_order=flow_order+1 WHERE plan_date=?1 AND starts_at IS NULL AND flow_order>=?2 AND id<>?3 AND deleted_at IS NULL",params![date,order,id])?;}
        // A length chosen or a date given makes a proto block a sized one, for good.
        let proto=current.proto&&task.plan_date.is_none()&&duration==current.duration&&sized!=Some(true);
        self.tx.execute("UPDATE tasks SET title=?1,body=?2,starts_at=?3,duration=?4,plan_date=?5,flow_order=?6,proto=?7,revision=revision+1 WHERE id=?8 AND revision=?9", params![task.title,task.body,task.starts_at,task.duration,task.plan_date,task.flow_order,proto,id,revision])?;
        // Sent back to 준비 by a button: on top of the shelf.
        if task.plan_date.is_none()&&current.plan_date.is_some()&&!current.completed {shelve(self.tx,std::slice::from_ref(id))?;}
        Ok(())
    }
    fn set_completed(&self, current: &Task, completed: bool, date: &Option<String>) -> Result<()> {
        let (id,revision)=(&current.id,current.revision);
        if completed && !current.completed && current.plan_date.is_none() {
            // There is no completion without a date: 준비 work done now is that day's completion. Nothing is laid out again.
            let date=date.as_deref().ok_or_else(||error("validation","완료한 날짜를 확인하세요."))?;
            parse_date(date)?;
            self.tx.execute("UPDATE tasks SET completed=1,plan_date=?1,flow_order=?2,proto=0,revision=revision+1 WHERE id=?3 AND revision=?4",params![date,next_flow_order(&self.s.tasks,date),id,revision])?;
        } else {
            self.tx.execute("UPDATE tasks SET completed=?1,revision=revision+1 WHERE id=?2 AND revision=?3", params![completed,id,revision])?;
            // A completion kept from before that rule has no date; undone, the work goes back on top of the shelf.
            if !completed && current.completed && current.plan_date.is_none() {shelve(self.tx,std::slice::from_ref(id))?;}
        }
        Ok(())
    }
    fn delete(&self, current: &Task) -> Result<()> {
        self.tx.execute("UPDATE tasks SET deleted_at=?1 WHERE id=?2 AND revision=?3", params![self.trash_stamp()?,current.id,current.revision])?;
        Ok(())
    }
    fn restore_trashed(&self, id: &str) -> Result<()> {
        let Some(item)=self.s.trash.iter().find(|t|t.task.id==id) else {return Err(error("conflict","휴지통에서 이미 복원했거나 지운 항목입니다. 다시 확인하세요."));};
        let mut task=Task{revision:item.task.revision+1,..item.task.clone()};
        if task.starts_at.is_some() {
            if let Err(e)=validate_task(&task,&self.s.tasks) {
                if e.code!="overlap" {return Err(e);}
                // As in D8/D9 the task keeps its date as flow work; only the taken time is released.
                task.starts_at=None;task.flow_order=Some(next_flow_order(&self.s.tasks,task.plan_date.as_deref().unwrap_or_default()));
            }
        } else if let (Some(date),Some(order))=(&task.plan_date,task.flow_order) {
            // Back into its old place in the day's order; later work moves one step down.
            self.tx.execute("UPDATE tasks SET flow_order=flow_order+1 WHERE plan_date=?1 AND starts_at IS NULL AND flow_order>=?2 AND deleted_at IS NULL",params![date,order])?;
        }
        validate_task(&task,&self.s.tasks)?;
        self.tx.execute("UPDATE tasks SET starts_at=?1,flow_order=?2,revision=?3,deleted_at=NULL WHERE id=?4",params![task.starts_at,task.flow_order,task.revision,id])?;
        // Open unplanned work returns to its place on the shelf or the top of the 들어옴; sized work whose pile is gone goes on top of the shelf.
        // Waiting work returns to 기다림 with its trigger.
        if on_bench(&task) {
            let pile=match task.pile_id.as_deref() {
                Some(p) if p==SHELF||self.s.piles.iter().any(|x|x.id==p) => Some(p),
                Some(_) if !task.proto => Some(SHELF),
                _ => None,
            };
            let index=if pile.is_some()&&pile==task.pile_id.as_deref() {task.pile_order.map_or(0,|order|(order-1).max(0) as usize)} else {0};
            if pile==Some(SHELF) {ensure_shelf(self.tx)?;}
            self.tx.execute("UPDATE tasks SET pile_id=NULL,pile_order=NULL WHERE id=?1",[id])?;
            place(self.tx,&[id.to_string()],pile,index)?;
        }
        Ok(())
    }
    fn purge_trashed(&self, ids: &[String]) -> Result<()> {
        let mut seen=HashSet::new();
        if ids.is_empty() || ids.iter().any(|id|!seen.insert(id)) {return Err(error("validation","지울 휴지통 항목을 확인하세요."));}
        if ids.iter().any(|id|!self.s.trash.iter().any(|t|&t.task.id==id)) {return Err(error("conflict","다른 창에서 휴지통이 바뀌었습니다. 다시 확인하세요."));}
        for id in ids {self.tx.execute("DELETE FROM tasks WHERE id=?1 AND deleted_at IS NOT NULL",[id])?;}
        Ok(())
    }

    // The cutting board's result: the first piece keeps the original's id and place, the others follow it.
    fn split_pieces(&self, current: &Task, pieces: &[Piece], date: &Option<String>) -> Result<()> {
        let (id,revision)=(&current.id,current.revision);
        if current.completed {return Err(error("validation","완료한 블록은 나눌 수 없어요."));}
        if pieces.is_empty() || pieces.len()>100 || pieces[0].id!=*id {return Err(error("validation","조각 정보를 확인하세요."));}
        let mut seen=HashSet::new();
        for piece in pieces {
            let taken=piece.id!=*id && self.taken(&piece.id);
            if piece.id.is_empty() || piece.id.len()>100 || !seen.insert(piece.id.as_str()) || taken {return Err(error("validation","이미 사용 중인 블록 식별자입니다."));}
        }
        let bench=current.plan_date.is_none();
        // Done pieces of 준비 work are that day's completion, like any completion there.
        let done_on=if bench && pieces.iter().any(|p|p.completed) {
            let date=date.as_deref().ok_or_else(||error("validation","완료한 날짜를 확인하세요."))?;parse_date(date)?;Some(date.to_string())
        } else {None};
        let mut tasks:Vec<Task>=self.s.tasks.iter().filter(|t|t.id!=*id).cloned().collect();
        let start=current.starts_at.as_deref().map(parse_start).transpose()?;
        let mut minute=start.map(|s|{use chrono::Timelike;i64::from(s.hour()*60+s.minute())});
        let order=current.flow_order;
        // Later work of the day moves down to make room for the pieces after the first.
        if let (Some(date),None,Some(order))=(&current.plan_date,&current.starts_at,order) {
            self.tx.execute("UPDATE tasks SET flow_order=flow_order+?1 WHERE plan_date=?2 AND starts_at IS NULL AND flow_order>?3 AND id<>?4 AND deleted_at IS NULL",params![pieces.len() as i64-1,date,order,id])?;
        }
        let mut open=Vec::new();
        for (n,piece) in pieces.iter().enumerate() {
            let mut task=Task{id:piece.id.clone(),title:piece.title.trim().into(),body:piece.body.clone(),duration:piece.duration,completed:piece.completed,
                revision:if n==0 {current.revision+1} else {1},plan_date:current.plan_date.clone(),..Task::default()};
            if let Some(m)=minute {
                // A fixed block's pieces stay fixed, one after another from its time.
                task.starts_at=Some(format!("{}T{:02}:{:02}",current.plan_date.as_deref().unwrap_or_default(),m/60,m%60));minute=Some(m+piece.duration);
            } else if let Some(order)=order {
                task.flow_order=Some(order+n as i64);
            } else if piece.completed {
                let date=done_on.clone().unwrap();task.flow_order=Some(next_flow_order(&tasks,&date));task.plan_date=Some(date);
            } else {
                // Open pieces of waiting work keep waiting on the same trigger.
                task.proto=piece.proto;open.push(task.id.clone());
                (task.wait_for,task.wait_until,task.wait_since)=(current.wait_for.clone(),current.wait_until.clone(),current.wait_since.clone());
            }
            validate_task(&task,&tasks)?;
            if n==0 {
                self.tx.execute("UPDATE tasks SET title=?1,body=?2,duration=?3,completed=?4,starts_at=?5,plan_date=?6,flow_order=?7,proto=?8,pile_id=NULL,pile_order=NULL,revision=?9 WHERE id=?10 AND revision=?11",
                    params![task.title,task.body,task.duration,task.completed,task.starts_at,task.plan_date,task.flow_order,task.proto,task.revision,id,revision])?;
            } else {insert_task(self.tx,&task,None)?;}
            tasks.push(task);
        }
        // On the bench the open pieces take the original's place in its pile, in order.
        if on_bench(current) {
            let pile=current.pile_id.as_deref();
            let index=self.s.tasks.iter().filter(|t|on_bench(t)&&t.pile_id.as_deref()==pile&&t.pile_order<current.pile_order).count();
            place(self.tx,&open,pile,index)?;
        }
        Ok(())
    }

    fn set_settings(&self, expected_revision: i64, days: &[WorkingDay]) -> Result<()> {
        if expected_revision != self.s.settings.revision { return Err(error("conflict", "다른 창에서 시간 설정이 변경됐습니다. 작성 내용을 보존했습니다.")); }
        self.save_settings(Settings { days: days.to_vec(), revision: expected_revision + 1, ..self.s.settings.clone() })
    }
    fn set_schedule(&self, expected_revision: i64, days: &[WorkingDay], exceptions: &[DayException], weekly_target: i64, work_days: i64) -> Result<()> {
        if expected_revision!=self.s.settings.revision {return Err(error("conflict","다른 창에서 시간 설정이 변경됐습니다. 다시 확인하세요."));}
        self.save_settings(Settings{days:days.to_vec(),exceptions:exceptions.to_vec(),weekly_target,work_days,revision:expected_revision+1,routines:self.s.settings.routines.clone()})
    }
    fn set_routines(&self, expected_revision: i64, routines: &[Routine]) -> Result<()> {
        if expected_revision!=self.s.settings.revision {return Err(error("conflict","다른 창에서 정기 업무 설정이 변경됐습니다. 다시 확인하세요."));}
        let mut settings=Settings{routines:routines.to_vec(),revision:expected_revision+1,..self.s.settings.clone()};
        for routine in &mut settings.routines {routine.title=routine.title.trim().into();}
        self.save_settings(settings)
    }
    fn ensure_routines(&self, from: &str, to: &str) -> Result<()> {
        let from=parse_date(from)?;let to=parse_date(to)?;
        let count=(to-from).num_days()+1;
        if !(1..=62).contains(&count) {return Err(error("validation","정기 업무 생성 기간은 1일부터 62일까지 지정하세요."));}
        let mut tasks=self.s.tasks.clone();
        for offset in 0..count {
            let date=from+chrono::Duration::days(offset);let key=date.format("%Y-%m-%d").to_string();
            for routine in &self.s.settings.routines {
                if !routine.weekdays.contains(&(date.weekday().num_days_from_monday() as usize)) {continue;}
                let generated=self.tx.execute("INSERT OR IGNORE INTO routine_occurrences(routine_id,date) VALUES(?1,?2)",params![routine.id,key])?;
                if generated==0 {continue;}
                let mut task=Task{id:uuid::Uuid::new_v4().to_string(),title:routine.title.clone(),body:routine.body.clone(),starts_at:Some(format!("{key}T{:02}:{:02}",routine.start/60,routine.start%60)),duration:routine.duration,revision:1,plan_date:Some(key.clone()),..Task::default()};
                let validation=validate_task(&task,&tasks);
                if let Err(e)=&validation {if e.code!="overlap" {return Err(e.clone());}}
                let day=self.s.settings.day(date);
                // Automatic routines prefer working time; explicit placements are unrestricted.
                if validation.is_err() || !day.enabled || routine.start<day.start || routine.start+routine.duration>day.end
                    || day.breaks.iter().any(|b|routine.start<b.end && routine.start+routine.duration>b.start) {
                    // The routine still belongs to this date; only its exact time is released.
                    task.starts_at=None;task.flow_order=Some(next_flow_order(&tasks,&key));
                }
                insert_task(self.tx,&task,None)?;
                tasks.push(task);
            }
        }
        Ok(())
    }

    fn clear_day(&self, date: &str, expected_tasks: &[TaskRevision]) -> Result<()> {
        parse_date(date)?;
        let expected=unique_revisions(expected_tasks,"하루 초기화 항목 정보를 확인하세요.")?;
        let scheduled:Vec<_>=self.s.tasks.iter().filter(|task|task.plan_date.as_deref()==Some(date)).collect();
        if scheduled.len()!=expected.len() || scheduled.iter().any(|task|expected.get(&task.id)!=Some(&task.revision)) {return Err(error("conflict","다른 창에서 하루 일정이 변경됐습니다. 다시 확인하세요."));}
        // Completed work stays as that day's record; only open work goes back to 준비.
        for task in scheduled.iter().filter(|t|!t.completed) {self.tx.execute("UPDATE tasks SET starts_at=NULL,plan_date=NULL,flow_order=NULL,revision=revision+1 WHERE id=?1",[&task.id])?;}
        // The day's open work goes on top of the shelf in the order it was planned.
        let mut open:Vec<_>=scheduled.iter().filter(|t|!t.completed).collect();
        open.sort_by(|a,b|a.flow_order.is_none().cmp(&b.flow_order.is_none()).then(a.flow_order.cmp(&b.flow_order)).then(a.starts_at.cmp(&b.starts_at)).then(a.id.cmp(&b.id)));
        shelve(self.tx,&open.iter().map(|t|t.id.clone()).collect::<Vec<_>>())?;
        self.tx.execute("DELETE FROM day_layouts WHERE date=?1",[date])?;
        Ok(())
    }
    fn reorder_flow(&self, date: &str, expected: &[TaskRevision]) -> Result<()> {
        parse_date(date)?;
        let revisions=unique_revisions(expected,"하루 순서 항목 정보를 확인하세요.")?;
        let open:Vec<_>=self.s.tasks.iter().filter(|t|is_open_flow(t,date)).collect();
        if open.len()!=revisions.len() || open.iter().any(|t|revisions.get(&t.id)!=Some(&t.revision)) {return Err(error("conflict","다른 창에서 하루 순서가 변경됐습니다. 다시 확인하세요."));}
        // Order is a property of the day, so it does not invalidate open task editors.
        for (index,task) in expected.iter().enumerate() {self.tx.execute("UPDATE tasks SET flow_order=?1 WHERE id=?2",params![index as i64+1,task.id])?;}
        Ok(())
    }
    fn complete_flow(&self, date: &str, items: &[TaskRevision], at: &Option<String>) -> Result<()> {
        parse_date(date)?;
        let revisions=unique_revisions(items,"완료할 항목 정보를 확인하세요.")?;
        if revisions.is_empty() {return Err(error("validation","완료할 항목을 선택하세요."));}
        let anchor=at.as_deref().map(|at|minute_on(at,date)).transpose()?;
        for (id,revision) in &revisions {
            if !self.s.tasks.iter().any(|t|&t.id==id && t.revision==*revision && is_open_flow(t,date)) {return Err(error("conflict",CHANGED));}
        }
        for (id,revision) in &revisions {self.tx.execute("UPDATE tasks SET completed=1,revision=revision+1 WHERE id=?1 AND revision=?2",params![id,revision])?;}
        if let Some(minute)=anchor {advance_anchor(self.tx,date,minute)?;}
        Ok(())
    }
    fn reflow(&self, date: &str, at: &str) -> Result<()> {
        parse_date(date)?;
        let minute=minute_on(at,date)?;advance_anchor(self.tx,date,minute)
    }
    fn ship_flow(&self, date: &str, items: &[TaskRevision], before: &Option<String>) -> Result<()> {
        parse_date(date)?;
        let revisions=unique_revisions(items,"실을 항목 정보를 확인하세요.")?;
        if revisions.is_empty() {return Err(error("validation","실을 항목을 선택하세요."));}
        let mut tasks=self.s.tasks.clone();
        for item in items {
            let Some(t)=tasks.iter_mut().find(|t|t.id==item.id&&t.revision==item.revision&&!t.completed) else {return Err(error("conflict",CHANGED));};
            t.flow_order=None;t.starts_at=None;t.plan_date=None;
        }
        let order=before.as_deref().map(|id|tasks.iter().find(|t|t.id==id&&is_open_flow(t,date))
            .and_then(|t|t.flow_order).ok_or_else(||error("validation","끼워 넣을 위치를 다시 확인하세요."))).transpose()?;
        if let Some(order)=order {
            for t in tasks.iter_mut().filter(|t|t.plan_date.as_deref()==Some(date)&&t.starts_at.is_none()&&t.flow_order.is_some_and(|o|o>=order)) {
                t.flow_order=t.flow_order.map(|o|o+items.len() as i64);self.tx.execute("UPDATE tasks SET flow_order=?1 WHERE id=?2",params![t.flow_order,t.id])?;
            }
        }
        for (index,item) in items.iter().enumerate() {
            let order=order.map(|o|o+index as i64).unwrap_or_else(||next_flow_order(&tasks,date));
            let t=tasks.iter_mut().find(|t|t.id==item.id).unwrap();
            t.plan_date=Some(date.into());t.flow_order=Some(order);
            self.tx.execute("UPDATE tasks SET starts_at=NULL,plan_date=?1,flow_order=?2,proto=0,pile_id=NULL,pile_order=NULL,revision=revision+1 WHERE id=?3",params![date,order,item.id])?;
        }
        Ok(())
    }

    fn place_unplanned(&self, items: &[TaskRevision], pile: &Option<String>, create_at: &Option<i64>, index: i64) -> Result<()> {
        unique_revisions(items,"옮길 항목 정보를 확인하세요.")?;
        if items.is_empty() || index<0 {return Err(error("validation","옮길 항목과 위치를 확인하세요."));}
        let moving=self.tasks_at(items,|t|!t.completed)?;
        let exists=|id:&str|self.s.piles.iter().any(|p|p.id==id);
        match (pile.as_deref(),create_at) {
            (Some(id),Some(at)) => {
                if id.is_empty() || id.len()>100 || exists(id) || *at<1 {return Err(error("validation","새 더미 정보를 확인하세요."));}
                // A new pile takes the asked position; those at or after it move one step right.
                self.tx.execute("UPDATE piles SET position=position+1 WHERE position>=?1",[at])?;
                self.tx.execute("INSERT INTO piles(id,position) VALUES(?1,?2)",params![id,at])?;
            }
            (None,Some(_)) => return Err(error("validation","새 더미 정보를 확인하세요.")),
            (Some(id),None) if !exists(id) => return Err(error("conflict","더미가 바뀌었습니다. 다시 확인하세요.")),
            _ => {},
        }
        // Dated work coming back loses its date and waiting work its trigger; moving within the bench is a property of the bench, like a day's order.
        for t in &moving {
            if t.plan_date.is_some()||t.wait_since.is_some() {self.tx.execute("UPDATE tasks SET starts_at=NULL,plan_date=NULL,flow_order=NULL,wait_for=NULL,wait_until=NULL,wait_since=NULL,revision=revision+1 WHERE id=?1",[&t.id])?;}
        }
        place(self.tx,&moving.iter().map(|t|t.id.clone()).collect::<Vec<_>>(),pile.as_deref(),index as usize)
    }
    fn merge_unplanned(&self, id: &str, items: &[TaskRevision]) -> Result<()> {
        let revisions=unique_revisions(items,"합칠 항목 정보를 확인하세요.")?;
        if revisions.len()<2 {return Err(error("validation","합칠 준비 작업을 두 개 이상 선택하세요."));}
        let originals=self.tasks_at(items,|t|on_bench(t)&&t.starts_at.is_none())?;
        if self.taken(id) {return Err(error("validation","이미 사용 중인 블록 식별자입니다."));}
        let first=originals[0];
        let body=originals.iter().map(|t|{
            let title=t.title.replace(['\r','\n']," ");
            if t.body.is_empty() {format!("- [ ] {title}")} else {format!("- [ ] {title}\n\n{}",t.body)}
        }).collect::<Vec<_>>().join("\n\n");
        let duration=originals.iter().try_fold(0_i64,|sum,t|sum.checked_add(t.duration))
            .ok_or_else(||error("validation","합친 소요시간이 너무 큽니다."))?;
        let task=Task{id:id.into(),title:first.title.clone(),body,duration,revision:1,..Task::default()};
        validate_task(&task,&self.s.tasks)?;
        let pile=first.pile_id.as_deref();
        let index=self.s.tasks.iter().filter(|t|on_bench(t)&&t.pile_id.as_deref()==pile&&!revisions.contains_key(&t.id)&&t.pile_order<first.pile_order).count();
        let deleted_at=self.trash_stamp()?;
        for t in originals {self.tx.execute("UPDATE tasks SET deleted_at=?1 WHERE id=?2 AND revision=?3",params![deleted_at,t.id,t.revision])?;}
        insert_task(self.tx,&task,None)?;
        place(self.tx,&[task.id],pile,index)
    }
    fn move_pile(&self, pile: &str, position: i64) -> Result<()> {
        let mut ids:Vec<_>=self.s.piles.iter().map(|p|p.id.clone()).collect();
        let Some(from)=ids.iter().position(|id|id==pile) else {return Err(error("conflict","더미가 바뀌었습니다. 다시 확인하세요."));};
        if position<1 {return Err(error("validation","더미 위치를 확인하세요."));}
        let id=ids.remove(from);let at=(position as usize-1).min(ids.len());ids.insert(at,id);
        for (n,id) in ids.iter().enumerate() {self.tx.execute("UPDATE piles SET position=?1 WHERE id=?2",params![n as i64+1,id])?;}
        Ok(())
    }

    fn wait(&self, items: &[TaskRevision], trigger: &str, until: &Option<String>, since: &str) -> Result<()> {
        let revisions=unique_revisions(items,"기다릴 항목 정보를 확인하세요.")?;
        if revisions.is_empty() {return Err(error("validation","기다릴 작업을 선택하세요."));}
        let trigger=trigger.trim();
        if trigger.len()>200 {return Err(error("validation","기다림 조건을 확인하세요."));}
        parse_date(since)?;if let Some(until)=until {parse_date(until)?;}
        // Out of its day, pile or 기다림 trigger; the day keeps its other order numbers, as when work goes back to 준비.
        for t in self.tasks_at(items,|t|!t.completed)? {
            self.tx.execute("UPDATE tasks SET starts_at=NULL,plan_date=NULL,flow_order=NULL,pile_id=NULL,pile_order=NULL,wait_for=?1,wait_until=?2,wait_since=?3,revision=revision+1 WHERE id=?4",
                params![trigger,until,t.wait_since.as_deref().unwrap_or(since),t.id])?;
        }
        Ok(())
    }
    fn revive(&self, items: &[TaskRevision]) -> Result<()> {
        let revisions=unique_revisions(items,"꺼낼 항목 정보를 확인하세요.")?;
        if revisions.is_empty() {return Err(error("validation","꺼낼 작업을 선택하세요."));}
        let back=self.tasks_at(items,|_|true)?;
        if back.iter().any(|t|t.wait_since.is_none()) {return Err(error("validation","기다리는 작업만 꺼낼 수 있어요."));}
        for t in &back {self.tx.execute("UPDATE tasks SET wait_for=NULL,wait_until=NULL,wait_since=NULL,revision=revision+1 WHERE id=?1",[&t.id])?;}
        let (protos,sized):(Vec<&Task>,Vec<&Task>)=back.into_iter().partition(|t|t.proto);
        shelve(self.tx,&sized.iter().map(|t|t.id.clone()).collect::<Vec<_>>())?;
        let protos:Vec<String>=protos.iter().map(|t|t.id.clone()).collect();
        if !protos.is_empty() {place(self.tx,&protos,None,0)?;}
        Ok(())
    }
}
