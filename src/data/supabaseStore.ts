import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  GroupProject,
  Invitation,
  LeaveRequest,
  MasterImport,
  MasterImportResult,
  MasterRow,
  OrgSettings,
  Profile,
  ProjectAlias,
  Role,
  TaskTemplate,
  TimeSlot,
} from '../domain/types'
import type { DataStore } from './store'

type Result<T> = { data: T | null; error: { message: string } | null }

function must<T>(res: Result<T>): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

const PROJECT_COLUMNS =
  'id, code, name, kind, system_key, counts_toward_total, sort_order, status, first_seen_import_id, last_seen_import_id'
const SLOT_COLUMNS = 'user_id, work_date, slot_index, kind, group_project_id, label, description, focus'

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
    return must<Profile | null>(await this.sb.from('profiles').select('*').eq('id', data.session.user.id).maybeSingle())
  }
  async sendMagicLink(email: string) {
    const { error } = await this.sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    })
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
    return must<Profile[]>(await this.sb.from('profiles').select('*').order('name'))
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
    return must<ProjectAlias[]>(await this.sb.from('project_aliases').select('id, group_project_id, alias, created_by'))
  }
  async addAlias(groupProjectId: string, alias: string) {
    const created_by = await this.userId()
    must(await this.sb.from('project_aliases').insert({ group_project_id: groupProjectId, alias: alias.trim(), created_by }))
  }
  async deleteAlias(id: string) {
    must(await this.sb.from('project_aliases').delete().eq('id', id))
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

  async listTemplates(userId: string) {
    return must<TaskTemplate[]>(
      await this.sb
        .from('task_templates')
        .select('id, user_id, kind, group_project_id, label, description, sort_order')
        .eq('user_id', userId)
        .order('sort_order')
        .order('created_at'),
    )
  }
  async addTemplate(template: Omit<TaskTemplate, 'id'>) {
    must(await this.sb.from('task_templates').insert(template))
  }
  async deleteTemplate(id: string) {
    must(await this.sb.from('task_templates').delete().eq('id', id))
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
  async invite(input: { email: string; role: Role; can_export: boolean }) {
    const { data } = await this.sb.auth.getSession()
    const res = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Invite failed (${res.status})`)
  }
  async revokeInvitation(id: string) {
    must(await this.sb.from('invitations').update({ status: 'revoked' }).eq('id', id))
  }
}
