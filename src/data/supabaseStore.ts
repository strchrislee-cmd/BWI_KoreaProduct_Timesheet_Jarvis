import type { KanbanCard, KanbanStatus, KanbanTask, MoveReason } from '../domain/kanban'
import type { AccessRequest } from '../domain/org'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  GroupProject,
  Invitation,
  InviteSent,
  LeaveRequest,
  MasterImport,
  MasterImportResult,
  MasterRow,
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
import { aliasConflict, projectNameKey } from '../domain/projects'
import { WORK_TYPE_GRAY, workTypeNameProblem } from '../domain/workTypes'
import type { DataStore } from './store'
import type { ProjectImportPlan } from '../domain/projectFile'

type Result<T> = { data: T | null; error: { message: string } | null }

/** manager / team arrive with migration 0013; until then a profile has neither */
const withOrg = (p: Profile): Profile => ({ ...p, manager_id: p.manager_id ?? null, team: p.team ?? '' })

function must<T>(res: Result<T>): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

const PROJECT_COLUMNS =
  'id, code, name, kind, system_key, counts_toward_total, sort_order, status, hidden, manual, sheet_name, first_seen_import_id, last_seen_import_id, created_at'
const SLOT_COLUMNS = 'user_id, work_date, slot_index, kind, group_project_id, label, description, details, focus, work_type_id'

export class SupabaseStore implements DataStore {
  readonly mode = 'supabase' as const
  private sb: SupabaseClient

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey)
  }

  private async userId(): Promise<string> {
    const { data } = await this.sb.auth.getSession()
    if (!data.session) throw new Error('Not signed in')
    return data.session.user.id
  }

  async currentUser() {
    const { data } = await this.sb.auth.getSession()
    if (!data.session) return null
    const p = must<Profile | null>(await this.sb.from('profiles').select('*').eq('id', data.session.user.id).maybeSingle())
    return p && withOrg(p)
  }
  async sendMagicLink(email: string) {
    const { error } = await this.sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    })
    if (error) throw new Error(error.message)
  }
  async signInWithPassword(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  }
  async changePassword(password: string) {
    const { error } = await this.sb.auth.updateUser({ password })
    if (error) throw new Error(error.message)
  }
  async signOut() {
    await this.sb.auth.signOut()
  }
  onAuthChange(cb: () => void) {
    const { data } = this.sb.auth.onAuthStateChange(() => cb())
    return () => data.subscription.unsubscribe()
  }

  async listProfiles() {
    return must<Profile[]>(await this.sb.from('profiles').select('*').order('name')).map(withOrg)
  }
  async updateProfile(id: string, patch: Partial<Profile>) {
    must(await this.sb.from('profiles').update(patch).eq('id', id))
  }
  async getOrgSettings() {
    return must<OrgSettings>(await this.sb.from('org_settings').select('ai_enabled, ai_model').eq('id', 1).single())
  }
  async updateOrgSettings(patch: Partial<OrgSettings>) {
    must(await this.sb.from('org_settings').update(patch).eq('id', 1))
  }

  async listProjects() {
    return must<GroupProject[]>(await this.sb.from('group_projects').select(PROJECT_COLUMNS))
  }
  async listAliases() {
    return must<ProjectAlias[]>(await this.sb.from('project_aliases').select('id, group_project_id, alias, created_by, user_id'))
  }
  async addAlias(groupProjectId: string, alias: string, personal: boolean) {
    const created_by = await this.userId()
    const user_id = personal ? created_by : null
    // the unique indexes cover team aliases and each user's own; a personal alias must not shadow a team one either
    aliasConflict(await this.listAliases(), alias.trim(), user_id)
    must(await this.sb.from('project_aliases').insert({ group_project_id: groupProjectId, alias: alias.trim(), created_by, user_id }))
  }
  async deleteAlias(id: string) {
    must(await this.sb.from('project_aliases').delete().eq('id', id))
  }
  async addProject(input: { name: string; code: string | null; kind: ProjectKind }) {
    must(await this.sb.rpc('add_group_project', { p_name: input.name, p_code: input.code, p_kind: input.kind }))
  }
  async removeProject(id: string) {
    return must<'deleted' | 'hidden'>(await this.sb.rpc('remove_group_project', { p_id: id }))
  }
  async renameProject(id: string, name: string) {
    const clean = name.replace(/\s+/g, ' ').trim()
    if (!clean) throw new Error('project name is required')
    const same = must<{ id: string }[]>(await this.sb.from('group_projects').select('id').eq('name_key', projectNameKey(clean)).neq('id', id))
    if (same.length) throw new Error(`이미 있는 프로젝트입니다: ${clean}`)
    must(await this.sb.from('group_projects').update({ name: clean }).eq('id', id))
  }
  async reorderProjects(updates: { id: string; sort_order: number }[]) {
    for (const u of updates) must(await this.sb.from('group_projects').update({ sort_order: u.sort_order }).eq('id', u.id))
  }
  async importProjectList(plan: ProjectImportPlan) {
    const created_by = await this.userId()
    for (const { id, ...patch } of plan.updates) must(await this.sb.from('group_projects').update(patch).eq('id', id))
    for (const { aliases, ...row } of plan.inserts) {
      const { id } = must<{ id: string }>(await this.sb.from('group_projects').insert(row).select('id').single())
      for (const alias of aliases) must(await this.sb.from('project_aliases').insert({ group_project_id: id, alias, created_by }))
    }
    for (const a of plan.aliasInserts) must(await this.sb.from('project_aliases').insert({ group_project_id: a.projectId, alias: a.alias, created_by }))
  }
  async restoreProject(id: string) {
    must(await this.sb.from('group_projects').update({ hidden: false }).eq('id', id))
  }
  async latestImport() {
    return must<MasterImport | null>(
      await this.sb.from('master_imports').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    )
  }
  async applyMasterImport(input: { fileName: string; contentHash: string; rows: MasterRow[] }) {
    return must<MasterImportResult>(
      await this.sb.rpc('apply_master_import', {
        p_file_name: input.fileName,
        p_source: 'manual',
        p_content_hash: input.contentHash,
        p_rows: input.rows,
      }),
    )
  }

  async listSlots(userId: string, from: string, to: string) {
    return must<TimeSlot[]>(
      await this.sb.from('time_slots').select(SLOT_COLUMNS).eq('user_id', userId).gte('work_date', from).lte('work_date', to),
    )
  }
  async saveSlots(slots: TimeSlot[]) {
    if (!slots.length) return
    must(await this.sb.from('time_slots').upsert(slots, { onConflict: 'user_id,work_date,slot_index' }))
  }
  async clearSlots(userId: string, date: string, slotIndexes: number[]) {
    if (!slotIndexes.length) return
    must(await this.sb.from('time_slots').delete().match({ user_id: userId, work_date: date }).in('slot_index', slotIndexes))
  }
  async replaceDay(userId: string, date: string, slots: TimeSlot[]) {
    must(await this.sb.from('time_slots').delete().match({ user_id: userId, work_date: date }))
    if (slots.length) must(await this.sb.from('time_slots').insert(slots))
  }

  async getWorkDay(userId: string, date: string) {
    return must<WorkDay | null>(
      await this.sb.from('work_days').select('user_id, work_date, start_time, end_time').match({ user_id: userId, work_date: date }).maybeSingle(),
    )
  }
  async saveWorkDay(day: WorkDay) {
    must(await this.sb.from('work_days').upsert(day, { onConflict: 'user_id,work_date' }))
  }

  async listWorkTypes() {
    return must<WorkType[]>(await this.sb.from('work_types').select('id, name, sort_order, color, hidden, created_at'))
  }
  async addWorkType(name: string) {
    const list = await this.listWorkTypes()
    const problem = workTypeNameProblem(name, list)
    if (problem) throw new Error(problem)
    const sort_order = Math.max(0, ...list.map((w) => w.sort_order)) + 1
    must(await this.sb.from('work_types').insert({ name: name.replace(/\s+/g, ' ').trim(), sort_order, color: WORK_TYPE_GRAY }))
  }
  async updateWorkType(id: string, patch: Partial<Pick<WorkType, 'name' | 'color' | 'hidden'>>) {
    const clean = { ...patch }
    if (patch.name !== undefined) {
      const problem = workTypeNameProblem(patch.name, await this.listWorkTypes(), id)
      if (problem) throw new Error(problem)
      clean.name = patch.name.replace(/\s+/g, ' ').trim()
    }
    must(await this.sb.from('work_types').update(clean).eq('id', id))
  }
  async reorderWorkTypes(updates: { id: string; sort_order: number }[]) {
    for (const u of updates) must(await this.sb.from('work_types').update({ sort_order: u.sort_order }).eq('id', u.id))
  }
  async removeWorkType(id: string) {
    return must<'deleted' | 'hidden'>(await this.sb.rpc('remove_work_type', { p_id: id }))
  }

  async listTemplates(userId: string) {
    return must<TaskTemplate[]>(
      await this.sb
        .from('task_templates')
        .select('id, user_id, kind, group_project_id, label, description, work_type_id, sort_order, color, created_at')
        .eq('user_id', userId)
        .order('sort_order')
        .order('created_at'),
    )
  }
  async addTemplate(template: Omit<TaskTemplate, 'id'>) {
    return must<{ id: string }>(await this.sb.from('task_templates').insert(template).select('id').single()).id
  }
  async updateTemplate(id: string, patch: Partial<Pick<TaskTemplate, 'color' | 'description' | 'sort_order'>>) {
    must(await this.sb.from('task_templates').update(patch).eq('id', id))
  }
  async deleteTemplate(id: string) {
    must(await this.sb.from('task_templates').delete().eq('id', id))
  }

  async listKanban(userId: string) {
    return must<KanbanCard[]>(
      await this.sb
        .from('kanban_cards')
        .select('id, user_id, group_project_id, label, work_type_id, description, status, sort_order, created_at, updated_at, done_at')
        .eq('user_id', userId)
        .order('sort_order'),
    )
  }
  async addKanbanCard(card: KanbanTask & { user_id: string; status: KanbanStatus; sort_order: number }, reason: MoveReason) {
    const done_at = card.status === 'done' ? new Date().toISOString() : null
    const { id } = must<{ id: string }>(await this.sb.from('kanban_cards').insert({ ...card, done_at }).select('id').single())
    must(await this.sb.from('kanban_moves').insert({ card_id: id, user_id: card.user_id, from_status: null, to_status: card.status, reason }))
    return id
  }
  async moveKanbanCard(card: KanbanCard, to: KanbanStatus, sortOrder: number, reason: MoveReason) {
    const now = new Date().toISOString()
    const changed = card.status !== to
    const patch = changed ? { status: to, sort_order: sortOrder, updated_at: now, done_at: to === 'done' ? now : null } : { sort_order: sortOrder }
    must(await this.sb.from('kanban_cards').update(patch).eq('id', card.id))
    if (changed) must(await this.sb.from('kanban_moves').insert({ card_id: card.id, user_id: card.user_id, from_status: card.status, to_status: to, reason }))
  }
  async deleteKanbanCard(id: string) {
    must(await this.sb.from('kanban_cards').delete().eq('id', id))
  }

  async listAccessRequests() {
    return must<AccessRequest[]>(
      await this.sb.from('access_requests').select('id, requester_id, owner_id, status, created_at, decided_at, expires_at').order('created_at', { ascending: false }),
    )
  }
  async requestAccess(ownerId: string) {
    const { data } = await this.sb.auth.getSession()
    must(await this.sb.from('access_requests').insert({ requester_id: data.session?.user.id, owner_id: ownerId }))
  }
  async decideAccessRequest(id: string, approve: boolean, hours?: number) {
    must(await this.sb.rpc('decide_access_request', { p_id: id, p_approve: approve, p_hours: hours ?? null }))
  }

  async getBackground(userId: string) {
    const row = must<{ image_data: string } | null>(
      await this.sb.from('user_backgrounds').select('image_data').eq('user_id', userId).maybeSingle(),
    )
    return row?.image_data ?? null
  }
  async saveBackground(userId: string, imageData: string | null) {
    if (imageData) must(await this.sb.from('user_backgrounds').upsert({ user_id: userId, image_data: imageData }))
    else must(await this.sb.from('user_backgrounds').delete().eq('user_id', userId))
  }

  async listLeave(userId: string, from: string, to: string) {
    return must<LeaveRequest[]>(
      await this.sb
        .from('leave_requests')
        .select('id, user_id, leave_type, start_date, end_date, hours_per_day, note')
        .eq('user_id', userId)
        .lte('start_date', to)
        .gte('end_date', from),
    )
  }
  async addLeave(leave: Omit<LeaveRequest, 'id'>) {
    must(await this.sb.from('leave_requests').insert(leave))
  }
  async deleteLeave(id: string) {
    must(await this.sb.from('leave_requests').delete().eq('id', id))
  }

  async listInvitations() {
    return must<Invitation[]>(
      await this.sb.from('invitations').select('id, email, role, can_export, status, created_at').order('created_at', { ascending: false }),
    )
  }
  async invite(input: { email: string; role: Role; can_export: boolean; password?: string }): Promise<{ sent: InviteSent }> {
    const { data } = await this.sb.auth.getSession()
    const res = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify(input),
    })
    const body = (await res.json().catch(() => ({}))) as { error?: string; sent?: InviteSent }
    if (!res.ok) throw new Error(body.error ?? `Invite failed (${res.status})`)
    return { sent: body.sent ?? 'invite' }
  }
  /** POST /api/admin/user (see api/_lib/userAdminCore.ts) */
  private async userAdmin(body: Record<string, unknown>) {
    const { data } = await this.sb.auth.getSession()
    const res = await fetch('/api/admin/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify(body),
    })
    const out = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(out.error ?? `Request failed (${res.status})`)
  }
  async setUserPassword(userId: string, password: string) {
    await this.userAdmin({ action: 'set_password', user_id: userId, password })
  }
  async deleteUser(userId: string) {
    await this.userAdmin({ action: 'delete', user_id: userId })
  }
  async revokeInvitation(id: string) {
    must(await this.sb.from('invitations').update({ status: 'revoked' }).eq('id', id))
  }
  async deleteInvitation(id: string) {
    must(await this.sb.from('invitations').delete().eq('id', id))
  }
}
