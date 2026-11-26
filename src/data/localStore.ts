import { aliasConflict, diffMaster, projectNameKey, sheetNameAfterRename } from '../domain/projects'
import { deleteUserProblem, normalizeRole } from '../domain/roles'
import { SEED_ALIASES, SEED_PROJECTS } from '../domain/seed'
import { DEFAULT_WORK_TYPES, WORK_TYPE_GRAY, workTypeNameProblem } from '../domain/workTypes'
import type {
  GroupProject,
  Invitation,
  LeaveRequest,
  MasterImport,
  OrgSettings,
  Profile,
  ProjectAlias,
  ProjectKind,
  Role,
  TaskTemplate,
  TimeSlot,
  WorkDay,
  WorkType,
} from '../domain/types'
import type { DataStore } from './store'
import type { ProjectImportPlan } from '../domain/projectFile'

// Demo mode: same behaviour as the Supabase schema, persisted in localStorage.
const KEY = 'timecrumbs-demo-v1'
/** Key used before the app was renamed from JARVIS; its data is moved to KEY on first load. */
const LEGACY_KEY = 'jarvis-demo-v1'
const DEMO_EMAIL = 'demo@teamembedded.local'

interface DemoState {
  profiles: Profile[]
  org: OrgSettings
  projects: GroupProject[]
  aliases: ProjectAlias[]
  imports: MasterImport[]
  slots: TimeSlot[]
  leaves: LeaveRequest[]
  invitations: Invitation[]
  templates: TaskTemplate[]
  workTypes: WorkType[]
  workDays: WorkDay[]
  backgrounds: Record<string, string>
}

const uid = () => crypto.randomUUID()
const DEMO_USER_ID = 'demo-admin'

function seed(): DemoState {
  const projects: GroupProject[] = SEED_PROJECTS.map((p) => ({
    ...p,
    id: uid(),
    code: null,
    status: 'active',
    hidden: false,
    manual: false,
    sheet_name: null,
    first_seen_import_id: null,
    last_seen_import_id: null,
    created_at: new Date().toISOString(),
  }))
  return {
    profiles: [
      {
        id: DEMO_USER_ID,
        email: DEMO_EMAIL,
        name: 'Demo User',
        engineer_code: 'DU',
        role: 'admin',
        can_export: true,
        timezone: 'Asia/Seoul',
        work_start: '07:30',
        work_end: '16:30',
        lunch_start: '12:00',
        lunch_end: '13:00',
        daily_target_hours: 8,
        template_style: 'detailed',
        preferences: {},
      },
    ],
    org: { ai_enabled: false, ai_model: 'claude-opus-5-5' },
    projects,
    aliases: SEED_ALIASES.map((a) => ({
      id: uid(),
      alias: a.alias,
      group_project_id: projects.find((p) => p.system_key === a.system_key)!.id,
      created_by: null,
      user_id: null,
    })),
    imports: [],
    slots: [],
    leaves: [],
    invitations: [],
    templates: [],
    workTypes: seedWorkTypes(),
    workDays: [],
    backgrounds: {},
  }
}

function seedWorkTypes(): WorkType[] {
  return DEFAULT_WORK_TYPES.map((w, i) => ({ id: uid(), name: w.name, sort_order: i + 1, color: w.color, hidden: false, created_at: new Date().toISOString() }))
}

export class LocalStore implements DataStore {
  readonly mode = 'demo' as const
  private state: DemoState

  constructor() {
    const legacy = localStorage.getItem(LEGACY_KEY)
    const raw = localStorage.getItem(KEY) ?? legacy
    if (raw) {
      const saved = JSON.parse(raw) as Partial<DemoState> & Omit<DemoState, 'templates' | 'workDays' | 'backgrounds' | 'workTypes'>
      // demo data saved by older versions lacks these collections / fields
      const epoch = '2026-01-01T00:00:00.000Z'
      this.state = {
        ...saved,
        projects: saved.projects.map((p) => ({ ...p, created_at: p.created_at ?? epoch, hidden: p.hidden ?? false, manual: p.manual ?? false, sheet_name: p.sheet_name ?? null })),
        templates: (saved.templates ?? []).map((t) => ({ ...t, color: t.color ?? null, created_at: t.created_at ?? epoch, work_type_id: t.work_type_id ?? null })),
        slots: saved.slots.map((x) => ({ ...x, details: x.details ?? '', work_type_id: x.work_type_id ?? null })),
        workTypes: saved.workTypes ?? seedWorkTypes(),
        workDays: saved.workDays ?? [],
        backgrounds: saved.backgrounds ?? {},
        profiles: saved.profiles.map((p) => ({ ...p, email: ['demo@jarvis.local', 'demo@timecrumbs.local'].includes(p.email) ? DEMO_EMAIL : p.email, role: normalizeRole(p.role) })),
        invitations: saved.invitations.map((i) => ({ ...i, role: normalizeRole(i.role) })),
        aliases: saved.aliases.map((a) => ({ ...a, user_id: a.user_id ?? null })),
      }
    } else {
      this.state = seed()
    }
    this.persist()
    if (legacy !== null) localStorage.removeItem(LEGACY_KEY) // moved to the new key above
  }

  private persist() {
    localStorage.setItem(KEY, JSON.stringify(this.state))
  }

  private mutate(fn: (s: DemoState) => void) {
    fn(this.state)
    this.persist()
  }

  static reset() {
    localStorage.removeItem(KEY)
    localStorage.removeItem(LEGACY_KEY)
  }

  async currentUser() {
    const p = this.state.profiles.find((x) => x.id === DEMO_USER_ID)
    return p ? { ...p } : null // copies, so React sees changes
  }
  async sendMagicLink() {}
  // demo: there is no sign-in, so no passwords
  async signInWithPassword() {}
  async changePassword() {}
  async signOut() {}
  onAuthChange() {
    return () => {}
  }

  async listProfiles() {
    return this.state.profiles.map((p) => ({ ...p })).sort((a, b) => a.name.localeCompare(b.name))
  }
  async updateProfile(id: string, patch: Partial<Profile>) {
    this.mutate((s) => {
      const p = s.profiles.find((x) => x.id === id)
      if (!p) throw new Error('Profile not found')
      if (p.role === 'admin' && patch.role && patch.role !== 'admin' && !s.profiles.some((x) => x.id !== id && x.role === 'admin'))
        throw new Error('cannot remove the last admin')
      Object.assign(p, patch)
    })
  }
  /** Demo only: preview another level as the single demo user (skips the last-admin rule). */
  async setDemoRole(role: Role) {
    this.mutate((s) => {
      const p = s.profiles.find((x) => x.id === DEMO_USER_ID)
      if (p) p.role = role
    })
  }
  async getOrgSettings() {
    return { ...this.state.org }
  }
  async updateOrgSettings(patch: Partial<OrgSettings>) {
    this.mutate((s) => Object.assign(s.org, patch))
  }

  async listProjects() {
    return this.state.projects.map((p) => ({ ...p }))
  }
  async listAliases() {
    return this.state.aliases.map((a) => ({ ...a }))
  }
  async addAlias(groupProjectId: string, alias: string, personal: boolean) {
    const text = alias.trim()
    if (!text) throw new Error('Alias is empty')
    aliasConflict(this.state.aliases, text, personal ? DEMO_USER_ID : null)
    this.mutate((s) => s.aliases.push({ id: uid(), group_project_id: groupProjectId, alias: text, created_by: DEMO_USER_ID, user_id: personal ? DEMO_USER_ID : null }))
  }
  async deleteAlias(id: string) {
    this.mutate((s) => (s.aliases = s.aliases.filter((a) => a.id !== id)))
  }
  async addProject(input: { name: string; code: string | null; kind: ProjectKind }) {
    const name = input.name.replace(/\s+/g, ' ').trim()
    if (!name) throw new Error('project name is required')
    const same = this.state.projects.find((p) => projectNameKey(p.name) === projectNameKey(name))
    if (same) throw new Error(same.hidden ? `숨긴 항목에 같은 이름이 있습니다: ${name} (숨긴 항목 보기 → 되돌리기)` : `이미 있는 프로젝트입니다: ${name}`)
    const order = Math.max(0, ...this.state.projects.filter((p) => p.kind === input.kind).map((p) => p.sort_order)) + 1
    this.mutate((s) =>
      s.projects.push({
        id: uid(),
        code: input.code,
        name,
        kind: input.kind,
        system_key: null,
        counts_toward_total: true,
        sort_order: order,
        status: 'active',
        hidden: false,
        manual: true,
        sheet_name: null,
        first_seen_import_id: null,
        last_seen_import_id: null,
        created_at: new Date().toISOString(),
      }),
    )
  }
  async removeProject(id: string): Promise<'deleted' | 'hidden'> {
    const p = this.state.projects.find((x) => x.id === id)
    if (!p) throw new Error('project not found')
    if (p.system_key) throw new Error('built-in rows cannot be removed')
    const used = this.state.slots.some((x) => x.group_project_id === id) || this.state.templates.some((t) => t.group_project_id === id)
    if (p.manual && !used) {
      this.mutate((s) => {
        s.projects = s.projects.filter((x) => x.id !== id)
        s.aliases = s.aliases.filter((a) => a.group_project_id !== id)
      })
      return 'deleted'
    }
    this.mutate((s) => (s.projects.find((x) => x.id === id)!.hidden = true))
    return 'hidden'
  }
  async renameProject(id: string, name: string) {
    const clean = name.replace(/\s+/g, ' ').trim()
    if (!clean) throw new Error('project name is required')
    if (this.state.projects.some((p) => p.id !== id && projectNameKey(p.name) === projectNameKey(clean))) throw new Error(`이미 있는 프로젝트입니다: ${clean}`)
    this.mutate((s) => {
      const p = s.projects.find((x) => x.id === id)
      if (p) Object.assign(p, { sheet_name: sheetNameAfterRename(p, clean), name: clean })
    })
  }
  async reorderProjects(updates: { id: string; sort_order: number }[]) {
    this.mutate((s) => {
      for (const u of updates) {
        const p = s.projects.find((x) => x.id === u.id)
        if (p) p.sort_order = u.sort_order
      }
    })
  }
  async importProjectList(plan: ProjectImportPlan) {
    const now = new Date().toISOString()
    this.mutate((s) => {
      for (const u of plan.updates) {
        const p = s.projects.find((x) => x.id === u.id)
        if (p) Object.assign(p, u)
      }
      for (const ins of plan.inserts) {
        const { aliases, ...row } = ins
        const id = uid()
        s.projects.push({ ...row, id, system_key: null, counts_toward_total: true, status: 'active', first_seen_import_id: null, last_seen_import_id: null, created_at: now })
        for (const alias of aliases) s.aliases.push({ id: uid(), group_project_id: id, alias, created_by: DEMO_USER_ID, user_id: null })
      }
      for (const a of plan.aliasInserts) s.aliases.push({ id: uid(), group_project_id: a.projectId, alias: a.alias, created_by: DEMO_USER_ID, user_id: null })
    })
  }
  async restoreProject(id: string) {
    this.mutate((s) => {
      const p = s.projects.find((x) => x.id === id)
      if (p) p.hidden = false
    })
  }
  async latestImport() {
    const last = this.state.imports.at(-1)
    return last ? { ...last } : null
  }

  async applyMasterImport(input: { fileName: string; contentHash: string; rows: import('../domain/types').MasterRow[] }) {
    const existing = this.state.imports.find((i) => i.content_hash === input.contentHash)
    if (existing) return { status: 'duplicate' as const, import_id: existing.id }

    const diff = diffMaster(this.state.projects, input.rows)
    const imp: MasterImport = {
      id: uid(),
      file_name: input.fileName,
      source: 'manual',
      content_hash: input.contentHash,
      is_baseline: this.state.imports.length === 0,
      total_count: input.rows.length,
      added_count: diff.added.length,
      missing_count: diff.missing.length,
      created_at: new Date().toISOString(),
    }
    this.mutate((s) => {
      s.imports.push(imp)
      for (const m of diff.matched) {
        const p = s.projects.find((x) => x.id === m.project.id)!
        // renamed in the app: keep the app's name, remember the sheet's current spelling
        const renamed = !!p.sheet_name
        Object.assign(p, {
          name: renamed ? p.name : m.row.name,
          sheet_name: renamed && projectNameKey(m.row.name) !== projectNameKey(p.name) ? m.row.name : null,
          code: m.row.code ?? p.code,
          sort_order: m.order,
          status: 'active',
          manual: false,
          last_seen_import_id: imp.id,
        })
      }
      for (const a of diff.added) {
        s.projects.push({
          id: uid(),
          code: a.row.code,
          name: a.row.name,
          kind: a.row.kind,
          system_key: null,
          counts_toward_total: true,
          sort_order: a.order,
          status: 'active',
          hidden: false,
          manual: false,
          sheet_name: null,
          first_seen_import_id: imp.id,
          last_seen_import_id: imp.id,
          created_at: imp.created_at,
        })
      }
      for (const m of diff.missing) s.projects.find((x) => x.id === m.id)!.status = 'missing'
    })
    return {
      status: 'imported' as const,
      import_id: imp.id,
      is_baseline: imp.is_baseline,
      total: imp.total_count,
      added: imp.added_count,
      added_names: diff.added.map((a) => a.row.name),
      missing: imp.missing_count,
    }
  }

  async listSlots(userId: string, from: string, to: string) {
    return this.state.slots.filter((s) => s.user_id === userId && s.work_date >= from && s.work_date <= to).map((s) => ({ ...s }))
  }
  async saveSlots(slots: TimeSlot[]) {
    this.mutate((s) => {
      for (const slot of slots) {
        s.slots = s.slots.filter(
          (x) => !(x.user_id === slot.user_id && x.work_date === slot.work_date && x.slot_index === slot.slot_index),
        )
        s.slots.push({ ...slot })
      }
    })
  }
  async clearSlots(userId: string, date: string, slotIndexes: number[]) {
    const drop = new Set(slotIndexes)
    this.mutate(
      (s) => (s.slots = s.slots.filter((x) => !(x.user_id === userId && x.work_date === date && drop.has(x.slot_index)))),
    )
  }
  async replaceDay(userId: string, date: string, slots: TimeSlot[]) {
    this.mutate((s) => {
      s.slots = s.slots.filter((x) => !(x.user_id === userId && x.work_date === date))
      s.slots.push(...slots.map((x) => ({ ...x })))
    })
  }

  async getWorkDay(userId: string, date: string) {
    const d = this.state.workDays.find((w) => w.user_id === userId && w.work_date === date)
    return d ? { ...d } : null
  }
  async saveWorkDay(day: WorkDay) {
    if (day.end_time <= day.start_time) throw new Error('End time must be after start time')
    this.mutate((s) => {
      s.workDays = s.workDays.filter((w) => !(w.user_id === day.user_id && w.work_date === day.work_date))
      s.workDays.push({ ...day })
    })
  }

  async listWorkTypes() {
    return this.state.workTypes.map((w) => ({ ...w }))
  }
  async addWorkType(name: string) {
    const problem = workTypeNameProblem(name, this.state.workTypes)
    if (problem) throw new Error(problem)
    const sort_order = Math.max(0, ...this.state.workTypes.map((w) => w.sort_order)) + 1
    this.mutate((s) =>
      s.workTypes.push({ id: uid(), name: name.replace(/\s+/g, ' ').trim(), sort_order, color: WORK_TYPE_GRAY, hidden: false, created_at: new Date().toISOString() }),
    )
  }
  async updateWorkType(id: string, patch: Partial<Pick<WorkType, 'name' | 'color' | 'hidden'>>) {
    const clean = { ...patch }
    if (patch.name !== undefined) {
      const problem = workTypeNameProblem(patch.name, this.state.workTypes, id)
      if (problem) throw new Error(problem)
      clean.name = patch.name.replace(/\s+/g, ' ').trim()
    }
    this.mutate((s) => {
      const w = s.workTypes.find((x) => x.id === id)
      if (w) Object.assign(w, clean)
    })
  }
  async reorderWorkTypes(updates: { id: string; sort_order: number }[]) {
    this.mutate((s) => {
      for (const u of updates) {
        const w = s.workTypes.find((x) => x.id === u.id)
        if (w) w.sort_order = u.sort_order
      }
    })
  }
  async removeWorkType(id: string): Promise<'deleted' | 'hidden'> {
    // same rule as remove_work_type() in 0011: delete when unused, otherwise hide
    const used = this.state.slots.some((x) => x.work_type_id === id) || this.state.templates.some((t) => t.work_type_id === id)
    this.mutate((s) => {
      if (used) {
        const w = s.workTypes.find((x) => x.id === id)
        if (w) w.hidden = true
      } else s.workTypes = s.workTypes.filter((x) => x.id !== id)
    })
    return used ? 'hidden' : 'deleted'
  }

  async listTemplates(userId: string) {
    return this.state.templates.filter((t) => t.user_id === userId).map((t) => ({ ...t }))
  }
  async addTemplate(template: Omit<TaskTemplate, 'id'>) {
    if (!template.label.trim() && !template.description.trim()) throw new Error('Template is empty')
    const id = uid()
    this.mutate((s) => s.templates.push({ ...template, id, created_at: new Date().toISOString() }))
    return id
  }
  async updateTemplate(id: string, patch: Partial<Pick<TaskTemplate, 'color' | 'description' | 'sort_order'>>) {
    if (patch.description !== undefined && !patch.description.trim()) throw new Error('Name is empty')
    this.mutate((s) => {
      const t = s.templates.find((x) => x.id === id)
      if (t) Object.assign(t, patch)
    })
  }
  async deleteTemplate(id: string) {
    this.mutate((s) => (s.templates = s.templates.filter((t) => t.id !== id)))
  }

  async getBackground(userId: string) {
    return this.state.backgrounds[userId] ?? null
  }
  async saveBackground(userId: string, imageData: string | null) {
    this.mutate((s) => {
      if (imageData) s.backgrounds[userId] = imageData
      else delete s.backgrounds[userId]
    })
  }

  async listLeave(userId: string, from: string, to: string) {
    return this.state.leaves.filter((l) => l.user_id === userId && l.start_date <= to && l.end_date >= from).map((l) => ({ ...l }))
  }
  async addLeave(leave: Omit<LeaveRequest, 'id'>) {
    if (leave.end_date < leave.start_date) throw new Error('End date is before start date')
    this.mutate((s) => s.leaves.push({ ...leave, id: uid() }))
  }
  async deleteLeave(id: string) {
    this.mutate((s) => (s.leaves = s.leaves.filter((l) => l.id !== id)))
  }

  async listInvitations() {
    return this.state.invitations.map((i) => ({ ...i })).reverse()
  }
  async invite(input: { email: string; role: Profile['role']; can_export: boolean }) {
    const email = input.email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Invalid e-mail address')
    // demo: no e-mail is sent; inviting again (also "다시 보내기") replaces the earlier invitation
    this.mutate((s) => {
      s.invitations = s.invitations.filter((i) => i.email !== email)
      s.invitations.push({ id: uid(), email, role: input.role, can_export: input.can_export, status: 'pending', created_at: new Date().toISOString() })
    })
    return { sent: 'invite' as const }
  }
  async deleteInvitation(id: string) {
    this.mutate((s) => (s.invitations = s.invitations.filter((i) => i.id !== id)))
  }
  async setUserPassword() {} // demo: no passwords
  async deleteUser(userId: string) {
    const target = this.state.profiles.find((p) => p.id === userId)
    if (!target) throw new Error('User not found')
    const problem = deleteUserProblem(DEMO_USER_ID, target, this.state.profiles)
    if (problem) throw new Error(problem)
    this.mutate((s) => {
      s.profiles = s.profiles.filter((p) => p.id !== userId)
      s.slots = s.slots.filter((x) => x.user_id !== userId)
      s.leaves = s.leaves.filter((x) => x.user_id !== userId)
      s.templates = s.templates.filter((x) => x.user_id !== userId)
      s.workDays = s.workDays.filter((x) => x.user_id !== userId)
      s.aliases = s.aliases.filter((x) => x.user_id !== userId)
      s.invitations = s.invitations.filter((i) => i.email !== target.email.toLowerCase())
      delete s.backgrounds[userId]
    })
  }
  async revokeInvitation(id: string) {
    this.mutate((s) => {
      const inv = s.invitations.find((i) => i.id === id)
      if (inv) inv.status = 'revoked'
    })
  }
}
