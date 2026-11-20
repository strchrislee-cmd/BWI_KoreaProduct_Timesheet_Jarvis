// Shared domain types. Mirrors supabase/migrations/0001_init.sql.
// NOTE: files in src/domain, src/excel are also imported by Vercel functions (Node ESM),
// so relative imports there must keep the ".js" extension.

export type Role = 'admin' | 'member' | 'viewer'
export type ProjectKind = 'project' | 'timelog' | 'local_section'
export type ProjectStatus = 'active' | 'missing'
export type SlotKind = 'work' | 'nonwork'
export type LeaveType = 'annual' | 'half_am' | 'half_pm' | 'company' | 'biz_trip' | 'sick'
export type TemplateStyle = 'compact' | 'detailed' | 'project_first'

/** Group rows with a fixed meaning (seeded in 0002_seed.sql). */
export type SystemKey =
  | 'leave'
  | 'general'
  | 'meeting'
  | 'support'
  | 'mold_support'
  | 'company_leave'
  | 'pnc'
  | 'biz_trip'

export interface Profile {
  id: string
  email: string
  name: string
  engineer_code: string
  role: Role
  can_export: boolean
  timezone: string
  work_start: string // HH:MM
  work_end: string
  lunch_start: string
  lunch_end: string
  daily_target_hours: number
  template_style: TemplateStyle
  preferences: Record<string, unknown>
}

export interface OrgSettings {
  ai_enabled: boolean
  ai_model: string
}

export interface GroupProject {
  id: string
  code: string | null
  name: string
  kind: ProjectKind
  system_key: SystemKey | null
  counts_toward_total: boolean
  sort_order: number
  status: ProjectStatus
  /** removed by an admin: not offered anywhere, kept for existing logs, restorable */
  hidden: boolean
  /** added by hand in JARVIS (not from the master sheet) */
  manual: boolean
  first_seen_import_id: string | null
  last_seen_import_id: string | null
  created_at: string
}

export interface ProjectAlias {
  id: string
  group_project_id: string
  alias: string
  created_by: string | null
}

export interface MasterImport {
  id: string
  file_name: string
  source: 'manual' | 'ingest'
  content_hash: string
  is_baseline: boolean
  total_count: number
  added_count: number
  missing_count: number
  created_at: string
}

/** A row read from the group master sheet (only numbered project / timelog rows). */
export interface MasterRow {
  name: string
  code: string | null
  kind: 'project' | 'timelog'
}

export interface MasterImportResult {
  status: 'imported' | 'duplicate'
  import_id: string
  is_baseline?: boolean
  total?: number
  added?: number
  added_names?: string[]
  missing?: number
}

export interface TimeSlot {
  user_id: string
  work_date: string // YYYY-MM-DD
  slot_index: number // 0..47 (30-min slots)
  kind: SlotKind
  group_project_id: string | null
  label: string
  description: string
  focus: number | null // 0..3
}

/** A personal "repeated task" (Notion-style select option): category + task text. */
export interface TaskTemplate {
  id: string
  user_id: string
  kind: SlotKind
  group_project_id: string | null
  label: string
  description: string
  sort_order: number
  color: string | null // #RRGGBB; null = category color
  created_at: string
}

/** Working hours of one day ("HH:MM", end may be "24:00"). */
export interface WorkDay {
  user_id: string
  work_date: string
  start_time: string
  end_time: string
}

export interface LeaveRequest {
  id: string
  user_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  hours_per_day: number
  note: string
}

export interface Invitation {
  id: string
  email: string
  role: Role
  can_export: boolean
  status: 'pending' | 'accepted' | 'revoked'
  created_at: string
}
