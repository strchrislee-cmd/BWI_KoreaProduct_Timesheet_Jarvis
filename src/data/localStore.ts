import { planKanbanSync, taskKey, type KanbanCard, type KanbanStatus, type KanbanTask, type MoveReason } from '../domain/kanban'
import { canPropose, canRequest, GRANT_HOURS, visibleIds, wouldLoop, type AccessRequest } from '../domain/org'
import { AI_MODEL, koreaDayStart, readItems, type AiCleanupResult, type AiUsage, type CorrectionProposal } from '../domain/aiCleanup'
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
  kanbanCards: KanbanCard[]
  kanbanMoves: { id: number; card_id: string; user_id: string; from_status: KanbanStatus | null; to_status: KanbanStatus; reason: MoveReason; moved_at: string }[]
  accessRequests: AccessRequest[]
  /** demo: only the hint of the AI key is kept ('…abcd'), never the key */
  aiKeyHint: string | null
  aiUsage: AiUsage[]
  proposals: CorrectionProposal[]
}

const uid = () => crypto.randomUUID()
const DEMO_USER_ID = 'demo-admin'
/** ids of the made-up demo teammates (seedDemoTeam) */
const DEMO_TEAM = 'demo-team-'

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
        manager_id: null,
        team: '',
      },
    ],
    org: { ai_enabled: false, ai_model: AI_MODEL, ai_daily_limit: 10 },
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
    kanbanCards: [],
    kanbanMoves: [],
    accessRequests: [],
    aiKeyHint: null,
    aiUsage: [],
    proposals: [],
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
      const saved = JSON.parse(raw) as Partial<DemoState> & Omit<DemoState, 'templates' | 'workDays' | 'backgrounds' | 'workTypes' | 'kanbanCards' | 'kanbanMoves' | 'accessRequests' | 'aiKeyHint' | 'aiUsage' | 'proposals'>
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
        kanbanCards: saved.kanbanCards ?? [],
        kanbanMoves: saved.kanbanMoves ?? [],
        accessRequests: saved.accessRequests ?? [],
        org: { ...saved.org, ai_model: AI_MODEL, ai_daily_limit: saved.org.ai_daily_limit ?? 10 },
        aiKeyHint: saved.aiKeyHint ?? null,
        aiUsage: saved.aiUsage ?? [],
        proposals: saved.proposals ?? [],
        profiles: saved.profiles.map((p) => ({
          ...p,
          email: ['demo@jarvis.local', 'demo@timecrumbs.local'].includes(p.email) ? DEMO_EMAIL : p.email,
          role: normalizeRole(p.role),
          manager_id: p.manager_id ?? null,
          team: p.team ?? '',
        })),
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
    // browser tests can make saving take as long as it does over the network (window.__TE_DEMO_LATENCY_MS)
    const latency = (globalThis as { __TE_DEMO_LATENCY_MS?: number }).__TE_DEMO_LATENCY_MS
    if (latency) await new Promise((r) => setTimeout(r, latency))
    this.mutate((s) => {
      const p = s.profiles.find((x) => x.id === id)
      if (!p) throw new Error('Profile not found')
      if (p.role === 'admin' && patch.role && patch.role !== 'admin' && !s.profiles.some((x) => x.id !== id && x.role === 'admin'))
        throw new Error('cannot remove the last admin')
      if (patch.manager_id !== undefined && patch.manager_id !== p.manager_id && wouldLoop(s.profiles, id, patch.manager_id))
        throw new Error('the reporting line cannot loop back to this person')
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
  /**
   * Demo only: a small made-up team around the demo user so the Org Chart, the Team window and the
   * level rules can be tried in one browser (names are fictional). Logs a few tasks on `date`.
   */
  async seedDemoTeam(date: string) {
    if (this.state.profiles.some((p) => p.id.startsWith(DEMO_TEAM))) return
    const base = this.state.profiles.find((p) => p.id === DEMO_USER_ID)!
    const person = (n: number, name: string, code: string, role: Role, team: string, manager_id: string | null): Profile => ({
      ...base,
      id: `${DEMO_TEAM}${n}`,
      email: `team${n}@teamembedded.local`,
      name,
      engineer_code: code,
      role,
      team,
      manager_id,
      preferences: {},
    })
    const team = [
      person(1, '한서윤', 'HSY', 'l3', '제품개발', null),
      person(2, '오하린', 'OHR', 'l2', '시험팀', DEMO_USER_ID),
      person(3, '윤도현', 'YDH', 'l1', '설계팀', DEMO_USER_ID),
      person(4, '서지아', 'SJA', 'l1', '설계팀', DEMO_USER_ID),
      person(5, '강민호', 'KMH', 'l1', '시험팀', `${DEMO_TEAM}2`),
    ]
    const key = (k: string) => this.state.projects.find((p) => p.system_key === k)!.id
    const log: [number, number, number, string, string][] = [
      // person, first slot, last slot, project, Task
      [1, 18, 20, key('meeting'), '리더 회의'],
      [1, 21, 27, key('general'), '일정 검토'],
      [2, 18, 23, key('general'), '시험 계획서'],
      [2, 26, 29, key('meeting'), '고객 회의'],
      [3, 18, 21, key('general'), '도면 검토'],
      [3, 22, 23, key('meeting'), '설계 회의'],
      [3, 26, 29, key('general'), '3D 모델링'],
      [4, 18, 19, key('meeting'), '주간 회의'],
      [4, 20, 25, key('support'), '시험 지원'],
      [4, 26, 31, key('general'), '부품 리스트 정리'],
      [5, 19, 24, key('support'), '시험 장비 점검'],
      [5, 26, 30, key('general'), '데이터 정리'],
    ]
    const now = new Date().toISOString()
    this.mutate((s) => {
      s.profiles.push(...team)
      const me = s.profiles.find((p) => p.id === DEMO_USER_ID)!
      if (!me.manager_id) Object.assign(me, { manager_id: `${DEMO_TEAM}1`, team: me.team || '설계팀' })
      for (const [n, first, last, projectId, task] of log)
        for (let i = first; i <= last; i++)
          s.slots.push({ user_id: `${DEMO_TEAM}${n}`, work_date: date, slot_index: i, kind: 'work', group_project_id: projectId, label: '', description: task, details: '', focus: null, work_type_id: null })
      for (const p of team) {
        const day = s.slots.filter((x) => x.user_id === p.id && x.work_date === date)
        const plan = planKanbanSync([], day, Math.max(...day.map((x) => x.slot_index)))
        plan.create.forEach((c, i) => {
          const id = uid()
          s.kanbanCards.push({ ...c.task, id, user_id: p.id, status: c.status, sort_order: i + 1, created_at: now, updated_at: now, done_at: null })
          // like a card made by the Daily Log: its first move is its creation
          s.kanbanMoves.push({ id: s.kanbanMoves.length + 1, card_id: id, user_id: p.id, from_status: null, to_status: c.status, reason: 'log', moved_at: now })
        })
      }
      // a teammate already asked the demo user (answer it on the Org Chart while the demo level is L2)
      s.accessRequests.push({ id: uid(), requester_id: `${DEMO_TEAM}3`, owner_id: DEMO_USER_ID, status: 'pending', created_at: now, decided_at: null, expires_at: null })
    })
  }

  private me() {
    return this.state.profiles.find((p) => p.id === DEMO_USER_ID)!
  }

  async setAiKey(key: string | null) {
    if (this.me().role !== 'admin') throw new Error('only admins can set the AI key')
    const k = (key ?? '').trim()
    if (k && k.length < 20) throw new Error('AI 키가 너무 짧습니다')
    this.mutate((s) => void (s.aiKeyHint = k ? `…${k.slice(-4)}` : null))
  }
  async aiKeyHint() {
    return this.me().role === 'admin' ? this.state.aiKeyHint : null
  }
  async listAiUsage(since: string) {
    const admin = this.me().role === 'admin'
    return this.state.aiUsage.filter((u) => (admin || u.user_id === DEMO_USER_ID) && u.created_at >= since).map((u) => ({ ...u })).reverse()
  }
  /** Demo: the same checks as the server; the answer comes from /api/ai/cleanup (browser tests answer it). */
  async aiCleanup(date: string, ownerId: string): Promise<AiCleanupResult> {
    const { org, profiles } = this.state
    const me = this.me()
    const owner = profiles.find((p) => p.id === ownerId)
    if (!org.ai_enabled) throw new Error('AI 정리가 꺼져 있습니다. 관리자에게 알려 주세요.')
    if (!owner || (ownerId !== me.id && !canPropose(me, owner, profiles))) throw new Error('이 사람의 기록에는 제안할 수 없습니다.')
    if (!this.state.aiKeyHint) throw new Error('AI 키가 아직 없습니다. 관리자에게 알려 주세요.')
    const since = koreaDayStart(new Date()).toISOString()
    const used = () => this.state.aiUsage.filter((u) => u.user_id === me.id && u.created_at >= since).length
    if (used() >= org.ai_daily_limit) throw new Error(`오늘 AI 정리 ${org.ai_daily_limit}회를 모두 썼습니다. 내일 다시 쓸 수 있습니다.`)
    const res = await fetch('/api/ai/cleanup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, owner_id: ownerId }) })
    if (!res.ok) throw new Error('데모 모드에서는 AI 정리를 쓸 수 없습니다 (Supabase에 연결된 사이트에서 됩니다).')
    const body = (await res.json()) as AiCleanupResult
    const usage = body.usage ?? { input_tokens: 0, output_tokens: 0, cost_usd: 0 }
    this.mutate((s) => {
      s.aiUsage.push({ id: s.aiUsage.length + 1, user_id: me.id, owner_id: ownerId, work_date: date, model: AI_MODEL, ...usage, created_at: new Date().toISOString() })
    })
    return { items: readItems(body.items), remaining: Math.max(0, org.ai_daily_limit - used()), usage }
  }
  async listProposals() {
    const admin = this.me().role === 'admin'
    return this.state.proposals
      .filter((p) => admin || p.owner_id === DEMO_USER_ID || p.author_id === DEMO_USER_ID)
      .map((p) => ({ ...p, items: readItems(p.items) }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  async sendProposal(p: Pick<CorrectionProposal, 'owner_id' | 'work_date' | 'items' | 'note' | 'by_ai'>) {
    const owner = this.state.profiles.find((x) => x.id === p.owner_id)
    if (!owner || !canPropose(this.me(), owner, this.state.profiles)) throw new Error('이 사람의 기록에는 제안할 수 없습니다.')
    if (!p.items.length || p.items.length > 48) throw new Error('바꿀 줄이 없습니다')
    this.mutate((s) => {
      s.proposals.push({ ...p, id: uid(), author_id: DEMO_USER_ID, status: 'open', applied: null, created_at: new Date().toISOString(), answered_at: null })
    })
  }
  async answerProposal(id: string, applied: number[]) {
    const p = this.state.proposals.find((x) => x.id === id)
    if (!p || p.owner_id !== DEMO_USER_ID) throw new Error('only the person it was sent to can answer')
    if (p.status !== 'open') throw new Error('this proposal has already been answered')
    if (applied.some((i) => i < 0 || i >= p.items.length)) throw new Error('unknown item')
    this.mutate((s) => Object.assign(s.proposals.find((x) => x.id === id)!, { status: 'answered', applied, answered_at: new Date().toISOString() }))
  }
  async withdrawProposal(id: string) {
    this.mutate((s) => void (s.proposals = s.proposals.filter((x) => !(x.id === id && x.author_id === DEMO_USER_ID && x.status === 'open'))))
  }

  /** Reading someone's time follows the org chart, as in the database (0013 → visible_user_ids). */
  private canRead(userId: string) {
    const me = this.state.profiles.find((p) => p.id === DEMO_USER_ID)
    return !!me && visibleIds(me, this.state.profiles, this.state.accessRequests, new Date()).has(userId)
  }

  async listAccessRequests() {
    const me = this.state.profiles.find((p) => p.id === DEMO_USER_ID)
    return this.state.accessRequests
      .filter((r) => me?.role === 'admin' || r.requester_id === DEMO_USER_ID || r.owner_id === DEMO_USER_ID)
      .map((r) => ({ ...r }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  async requestAccess(ownerId: string) {
    const me = this.state.profiles.find((p) => p.id === DEMO_USER_ID)
    const owner = this.state.profiles.find((p) => p.id === ownerId)
    if (!me || !owner || !canRequest(me, owner)) throw new Error('An L1 can ask only an L2')
    if (this.state.accessRequests.some((r) => r.requester_id === me.id && r.owner_id === ownerId && r.status === 'pending')) throw new Error('이미 요청했습니다')
    this.mutate((s) => {
      s.accessRequests.push({ id: uid(), requester_id: me.id, owner_id: ownerId, status: 'pending', created_at: new Date().toISOString(), decided_at: null, expires_at: null })
    })
  }
  async decideAccessRequest(id: string, approve: boolean, hours?: number) {
    const r = this.state.accessRequests.find((x) => x.id === id)
    if (!r || r.owner_id !== DEMO_USER_ID) throw new Error('only the person who was asked can answer this request')
    if (r.status !== 'pending') throw new Error('this request has already been answered')
    if (approve && !GRANT_HOURS.some((g) => g.hours === hours)) throw new Error('approve for 1 hour, 1 day or 1 week')
    const now = Date.now()
    this.mutate((s) => {
      const x = s.accessRequests.find((y) => y.id === id)!
      x.status = approve ? 'approved' : 'denied'
      x.decided_at = new Date(now).toISOString()
      x.expires_at = approve ? new Date(now + hours! * 3_600_000).toISOString() : null
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
    if (!this.canRead(userId)) return []
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
    if (!this.canRead(userId)) return null
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

  async listKanbanMoves(userId: string, since: string) {
    if (!this.canRead(userId)) return []
    return this.state.kanbanMoves.filter((m) => m.user_id === userId && m.moved_at >= since).map((m) => ({ ...m }))
  }
  async listKanban(userId: string) {
    if (!this.canRead(userId)) return []
    return this.state.kanbanCards.filter((c) => c.user_id === userId).map((c) => ({ ...c }))
  }
  async addKanbanCard(card: KanbanTask & { user_id: string; status: KanbanStatus; sort_order: number }, reason: MoveReason) {
    if (!card.group_project_id && !card.label.trim() && !card.description.trim()) throw new Error('A card needs a project or a Task')
    // one card per task and person, as in the database
    if (this.state.kanbanCards.some((c) => c.user_id === card.user_id && taskKey(c) === taskKey(card))) throw new Error('This task already has a card')
    const id = uid()
    const now = new Date().toISOString()
    this.mutate((s) => {
      s.kanbanCards.push({ ...card, id, created_at: now, updated_at: now, done_at: card.status === 'done' ? now : null })
      s.kanbanMoves.push({ id: s.kanbanMoves.length + 1, card_id: id, user_id: card.user_id, from_status: null, to_status: card.status, reason, moved_at: now })
    })
    return id
  }
  async moveKanbanCard(card: KanbanCard, to: KanbanStatus, sortOrder: number, reason: MoveReason) {
    const now = new Date().toISOString()
    this.mutate((s) => {
      const c = s.kanbanCards.find((x) => x.id === card.id)
      if (!c) throw new Error('Card not found')
      if (c.status !== to) {
        s.kanbanMoves.push({ id: s.kanbanMoves.length + 1, card_id: c.id, user_id: c.user_id, from_status: c.status, to_status: to, reason, moved_at: now })
        Object.assign(c, { status: to, updated_at: now, done_at: to === 'done' ? now : null })
      }
      c.sort_order = sortOrder
    })
  }
  async deleteKanbanCard(id: string) {
    this.mutate((s) => {
      s.kanbanCards = s.kanbanCards.filter((c) => c.id !== id)
      s.kanbanMoves = s.kanbanMoves.filter((m) => m.card_id !== id)
    })
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
