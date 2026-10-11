// plan_date only: flow plan ordered by flow_order. starts_at: fixed at that time. Neither: unplanned.
// proto: captured with no chosen length yet. pile_id/pile_order: open unplanned work's place on the bench (pile_id null: the 투입구).
export interface Task { id:string; title:string; body:string; starts_at:string|null; duration:number; completed:boolean; revision:number; plan_date:string|null; flow_order:number|null; proto?:boolean; pile_id?:string|null; pile_order?:number|null }
// One piece from the cutting board; the first keeps the original id.
export interface Piece {id:string;title:string;body:string;duration:number;proto:boolean;completed:boolean}
// A user pile on the 미계획 bench, left to right by position. The 투입구 has no entry and always comes first.
export interface Pile {id:string;position:number}
export interface Break {start:number;end:number;label:string}
export interface WorkingDay { enabled:boolean;start:number;end:number;breaks:Break[] }
export interface DayException {date:string;kind:'custom'|'leave'|'early';day:WorkingDay}
export interface Routine {id:string;title:string;body:string;weekdays:number[];start:number;duration:number}
export interface Settings {days:WorkingDay[];revision:number;exceptions?:DayException[];weekly_target?:number;work_days?:number;routines?:Routine[]}
export interface DayLayout {date:string;anchor:number}
// A deleted task kept whole (UTC deleted_at) until restored, purged, or past the store's retention.
export interface Trashed extends Task {deleted_at:string}
export interface Snapshot {epoch:string;tasks:Task[];settings:Settings;layouts:DayLayout[];trash:Trashed[];piles?:Pile[]}
export interface AppError {code:string;message:string;retryable:boolean}
export interface BackupInspection {created_at:string|null;tasks:number;completed:number;scheduled:number}
export interface ManagedBackup {id:string;kind:'hour'|'day'|'manual'|'safety'|'migration';created_at:string|null;tasks:number|null;completed:number|null;scheduled:number|null;error:string|null}
export interface TaskRevision {id:string;revision:number}
export type Action = {type:'create';id:string;title:string}
 | {type:'update';id:string;expected_revision:number;title:string;body:string;starts_at:string|null;duration:number;plan_date:string|null;before?:string|null;sized?:boolean}
 | {type:'place_unplanned';items:TaskRevision[];pile:string|null;create_at?:number|null;index:number}
 | {type:'move_pile';pile:string;position:number}
 | {type:'ship_flow';date:string;items:TaskRevision[]}
 | {type:'set_completed';id:string;expected_revision:number;completed:boolean;date?:string}
 | {type:'complete_flow';date:string;items:TaskRevision[];at:string|null}
 | {type:'reflow';date:string;at:string}
 | {type:'reorder_flow';date:string;expected:TaskRevision[]}
 | {type:'delete';id:string;expected_revision:number}
 | {type:'restore_trashed';id:string}
 | {type:'purge_trashed';ids:string[]}
 | {type:'split_pieces';id:string;expected_revision:number;pieces:Piece[];date?:string}
 | {type:'set_settings';expected_revision:number;days:WorkingDay[]}
 | {type:'set_routines';expected_revision:number;routines:Routine[]}
 | {type:'ensure_routines';from:string;to:string}
 | {type:'clear_day';date:string;expected_tasks:TaskRevision[]}
 | {type:'set_schedule';expected_revision:number;days:WorkingDay[];exceptions:DayException[];weekly_target:number;work_days:number;move_conflicts:boolean}
 | {type:'create_scheduled';id:string;title:string;starts_at:string|null;duration:number}
 | {type:'create_flow';id:string;title:string;date:string;duration:number};
export interface Command { request_id:string;epoch:string;action:Action }
