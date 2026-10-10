// plan_date only: flow plan ordered by flow_order. starts_at: fixed at that time. Neither: unplanned.
export interface Task { id:string; title:string; body:string; starts_at:string|null; duration:number; completed:boolean; revision:number; plan_date:string|null; flow_order:number|null }
export interface Break {start:number;end:number;label:string}
export interface WorkingDay { enabled:boolean;start:number;end:number;breaks:Break[] }
export interface DayException {date:string;kind:'custom'|'leave'|'early';day:WorkingDay}
export interface Routine {id:string;title:string;body:string;weekdays:number[];start:number;duration:number}
export interface Settings {days:WorkingDay[];revision:number;exceptions?:DayException[];weekly_target?:number;work_days?:number;routines?:Routine[]}
export interface DayLayout {date:string;anchor:number}
// A deleted task kept whole (UTC deleted_at) until restored, purged, or past the store's retention.
export interface Trashed extends Task {deleted_at:string}
export interface Snapshot {epoch:string;tasks:Task[];settings:Settings;layouts:DayLayout[];trash:Trashed[]}
export interface AppError {code:string;message:string;retryable:boolean}
export interface BackupInspection {created_at:string|null;tasks:number;completed:number;scheduled:number}
export interface ManagedBackup {id:string;kind:'hour'|'day'|'manual'|'safety'|'migration';created_at:string|null;tasks:number|null;completed:number|null;scheduled:number|null;error:string|null}
export interface TaskRevision {id:string;revision:number}
export type Action = {type:'create';id:string;title:string}
 | {type:'update';id:string;expected_revision:number;title:string;body:string;starts_at:string|null;duration:number;plan_date:string|null;before?:string|null}
 | {type:'set_completed';id:string;expected_revision:number;completed:boolean}
 | {type:'complete_flow';date:string;items:TaskRevision[];at:string|null}
 | {type:'reflow';date:string;at:string}
 | {type:'reorder_flow';date:string;expected:TaskRevision[]}
 | {type:'delete';id:string;expected_revision:number}
 | {type:'restore_trashed';id:string}
 | {type:'purge_trashed';ids:string[]}
 | {type:'split';id:string;expected_revision:number;new_id:string;first_duration:number}
 | {type:'set_settings';expected_revision:number;days:WorkingDay[]}
 | {type:'set_routines';expected_revision:number;routines:Routine[]}
 | {type:'ensure_routines';from:string;to:string}
 | {type:'clear_day';date:string;expected_tasks:TaskRevision[]}
 | {type:'set_schedule';expected_revision:number;days:WorkingDay[];exceptions:DayException[];weekly_target:number;work_days:number;move_conflicts:boolean}
 | {type:'create_scheduled';id:string;title:string;starts_at:string|null;duration:number}
 | {type:'create_flow';id:string;title:string;date:string;duration:number};
export interface Command { request_id:string;epoch:string;action:Action }
