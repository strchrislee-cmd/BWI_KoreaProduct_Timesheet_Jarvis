import { sortProjects } from './projects.js'
import { SLOT_HOURS, isWeekend, isoWeek } from './time.js'
import type { GroupProject, LeaveRequest, LeaveType, SystemKey, TimeSlot } from './types.js'

// ── Weekly plan (업무진행세부계획) ────────────────────────────────────────────

export interface WeeklyPlanRow {
  week: number
  date: string
  /** Local name as written in the existing weekly sheet ("일반업무" for general/meeting). */
  localProject: string
  groupProjectId: string | null
  groupProjectName: string
  work: '회의' | '기타'
  item: string
  label: string
  hours: number
  startSlot: number
  endSlot: number // exclusive
}

/** Merge consecutive work slots with the same project/label/description into one row. */
export function buildWeeklyPlan(slots: TimeSlot[], projects: GroupProject[]): WeeklyPlanRow[] {
  const byId = new Map(projects.map((p) => [p.id, p]))
  const work = slots
    .filter((s) => s.kind === 'work')
    .sort((a, b) => a.work_date.localeCompare(b.work_date) || a.slot_index - b.slot_index)

  const rows: WeeklyPlanRow[] = []
  let cur: WeeklyPlanRow | null = null
  for (const s of work) {
    const item = s.description.trim()
    const continues =
      cur !== null &&
      cur.date === s.work_date &&
      cur.endSlot === s.slot_index &&
      cur.groupProjectId === s.group_project_id &&
      cur.label === s.label &&
      cur.item === (item || s.label)
    if (continues && cur) {
      cur.endSlot += 1
      cur.hours += SLOT_HOURS
      continue
    }
    const project = s.group_project_id ? byId.get(s.group_project_id) : undefined
    const isGeneral = project?.system_key === 'general' || project?.system_key === 'meeting'
    cur = {
      week: isoWeek(s.work_date).week,
      date: s.work_date,
      localProject: isGeneral ? '일반업무' : s.label || project?.name || '',
      groupProjectId: s.group_project_id,
      groupProjectName: project?.name ?? '',
      work: project?.system_key === 'meeting' ? '회의' : '기타',
      item: item || s.label,
      label: s.label,
      hours: SLOT_HOURS,
      startSlot: s.slot_index,
      endSlot: s.slot_index + 1,
    }
    rows.push(cur)
  }
  return rows
}

// ── Group timesheet (그룹 제출 포맷) ───────────────────────────────────────────

export const LEAVE_TARGET: Record<LeaveType, SystemKey> = {
  annual: 'leave',
  half_am: 'leave',
  half_pm: 'leave',
  sick: 'leave',
  company: 'company_leave',
  biz_trip: 'biz_trip',
}

export const DEFAULT_LEAVE_HOURS: Record<LeaveType, number> = {
  annual: 8,
  half_am: 4,
  half_pm: 4,
  sick: 8,
  company: 8,
  biz_trip: 8,
}

export interface GroupTimesheetRow {
  project: GroupProject
  hours: number[]
  total: number
}

export interface DayIssue {
  date: string
  type: 'unmapped' | 'empty' | 'under' | 'over'
  hours: number
}

export interface GroupTimesheet {
  dates: string[]
  rows: GroupTimesheetRow[]
  /** Sum of project + timelog rows (the unnumbered subtotal row in the group sheet). */
  projectSubtotal: number[]
  unmapped: number[]
  /** "Individual Sum": every row that counts toward the day + unmapped hours. */
  daily: number[]
  weekTotal: number
  issues: DayIssue[]
}

export function buildGroupTimesheet(input: {
  slots: TimeSlot[]
  leaves: LeaveRequest[]
  projects: GroupProject[]
  dates: string[]
  targetHours: number
}): GroupTimesheet {
  const { slots, leaves, projects, dates, targetHours } = input
  const col = new Map(dates.map((d, i) => [d, i]))
  const hours = new Map<string, number[]>()
  const unmapped = dates.map(() => 0)
  const add = (projectId: string, i: number, h: number) => {
    if (!hours.has(projectId)) hours.set(projectId, dates.map(() => 0))
    hours.get(projectId)![i] += h
  }

  for (const s of slots) {
    const i = col.get(s.work_date)
    if (i === undefined || s.kind !== 'work') continue
    if (s.group_project_id) add(s.group_project_id, i, SLOT_HOURS)
    else unmapped[i] += SLOT_HOURS
  }

  const bySystemKey = new Map(projects.filter((p) => p.system_key).map((p) => [p.system_key!, p]))
  for (const l of leaves) {
    const target = bySystemKey.get(LEAVE_TARGET[l.leave_type])
    if (!target) continue
    for (const d of dates) {
      const i = col.get(d)!
      if (d >= l.start_date && d <= l.end_date && !isWeekend(d)) add(target.id, i, l.hours_per_day)
    }
  }

  const visible = sortProjects(projects.filter((p) => p.status === 'active' || hours.has(p.id)))
  const rows = visible.map((project) => {
    const h = hours.get(project.id) ?? dates.map(() => 0)
    return { project, hours: h, total: h.reduce((a, b) => a + b, 0) }
  })

  const sumCols = (filter: (r: GroupTimesheetRow) => boolean) =>
    dates.map((_, i) => rows.filter(filter).reduce((a, r) => a + r.hours[i], 0))
  const projectSubtotal = sumCols((r) => r.project.kind !== 'local_section')
  const counted = sumCols((r) => r.project.counts_toward_total)
  const daily = counted.map((v, i) => v + unmapped[i])

  const issues: DayIssue[] = []
  dates.forEach((date, i) => {
    if (unmapped[i] > 0) issues.push({ date, type: 'unmapped', hours: unmapped[i] })
    if (isWeekend(date)) return
    if (daily[i] === 0) issues.push({ date, type: 'empty', hours: 0 })
    else if (daily[i] < targetHours) issues.push({ date, type: 'under', hours: daily[i] })
    else if (daily[i] > targetHours) issues.push({ date, type: 'over', hours: daily[i] })
  })

  return {
    dates,
    rows,
    projectSubtotal,
    unmapped,
    daily,
    weekTotal: daily.reduce((a, b) => a + b, 0),
    issues,
  }
}
