import type { KanbanCard, KanbanStatus, KanbanTask, MoveReason } from '../domain/kanban'
import type { AccessRequest } from '../domain/org'
import type { AiCleanupResult, AiUsage, CorrectionProposal } from '../domain/aiCleanup'
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
import type { ProjectImportPlan } from '../domain/projectFile'

/**
 * Everything the UI needs from persistence. Two implementations:
 * - SupabaseStore (production, Postgres + RLS)
 * - LocalStore (demo mode, browser localStorage) — used when Supabase env vars are empty.
 */
export interface DataStore {
  readonly mode: 'demo' | 'supabase'

  currentUser(): Promise<Profile | null>
  sendMagicLink(email: string): Promise<void>
  signInWithPassword(email: string, password: string): Promise<void>
  /** the signed-in user's new password (Settings) */
  changePassword(password: string): Promise<void>
  signOut(): Promise<void>
  onAuthChange(cb: () => void): () => void

  listProfiles(): Promise<Profile[]>
  updateProfile(id: string, patch: Partial<Profile>): Promise<void>
  getOrgSettings(): Promise<OrgSettings>
  updateOrgSettings(patch: Partial<OrgSettings>): Promise<void>

  listProjects(): Promise<GroupProject[]>
  listAliases(): Promise<ProjectAlias[]>
  /** personal: only for the signed-in user's own time (L1–L3); otherwise a team alias (admins) */
  addAlias(groupProjectId: string, alias: string, personal: boolean): Promise<void>
  deleteAlias(id: string): Promise<void>
  /** Admins: add a project by hand (see manualProjectRow for name/code). */
  addProject(input: { name: string; code: string | null; kind: ProjectKind }): Promise<void>
  /** Admins: delete a hand-added project nobody has used yet, otherwise hide it. */
  removeProject(id: string): Promise<'deleted' | 'hidden'>
  restoreProject(id: string): Promise<void>
  /** Admins: rename any project (a master-sheet row remembers the sheet's name, see sheetNameAfterRename). */
  renameProject(id: string, name: string): Promise<void>
  /** new sort orders (No) of projects; admins */
  reorderProjects(updates: { id: string; sort_order: number }[]): Promise<void>
  /** Admins: apply a loaded project list file (see planProjectImport). */
  importProjectList(plan: ProjectImportPlan): Promise<void>
  latestImport(): Promise<MasterImport | null>
  applyMasterImport(input: { fileName: string; contentHash: string; rows: MasterRow[] }): Promise<MasterImportResult>

  listSlots(userId: string, from: string, to: string): Promise<TimeSlot[]>
  saveSlots(slots: TimeSlot[]): Promise<void>
  clearSlots(userId: string, date: string, slotIndexes: number[]): Promise<void>
  replaceDay(userId: string, date: string, slots: TimeSlot[]): Promise<void>
  /** Per-day start/end; null when the profile defaults apply. */
  getWorkDay(userId: string, date: string): Promise<WorkDay | null>
  saveWorkDay(day: WorkDay): Promise<void>

  /** The signed-in user's repeated tasks. */
  /** MID (중분류) list, hidden ones included (old slots still show them) */
  listWorkTypes(): Promise<WorkType[]>
  /** Admins: add at the end of the list */
  addWorkType(name: string): Promise<void>
  /** Admins: rename, recolor, or restore (hidden: false) */
  updateWorkType(id: string, patch: Partial<Pick<WorkType, 'name' | 'color' | 'hidden'>>): Promise<void>
  /** Admins: new order */
  reorderWorkTypes(updates: { id: string; sort_order: number }[]): Promise<void>
  /** Admins: delete if nobody used it yet, otherwise hide it */
  removeWorkType(id: string): Promise<'deleted' | 'hidden'>

  listTemplates(userId: string): Promise<TaskTemplate[]>
  /** resolves to the new quick-add item's id */
  addTemplate(template: Omit<TaskTemplate, 'id' | 'created_at'>): Promise<string>
  updateTemplate(id: string, patch: Partial<Pick<TaskTemplate, 'color' | 'description' | 'sort_order'>>): Promise<void>
  deleteTemplate(id: string): Promise<void>

  // Daily Kanban (one card per Project · Type · Task; every column change is kept in kanban_moves)
  listKanban(userId: string): Promise<KanbanCard[]>
  /** resolves to the new card's id; records its first move (into `status`) */
  addKanbanCard(card: KanbanTask & { user_id: string; status: KanbanStatus; sort_order: number }, reason: MoveReason): Promise<string>
  /** to another column (recorded as a move) or to another place in the same column */
  moveKanbanCard(card: KanbanCard, to: KanbanStatus, sortOrder: number, reason: MoveReason): Promise<void>
  deleteKanbanCard(id: string): Promise<void>

  // Org chart (0013): an L1 asks an L2 to see their time; that L2 approves for 1 h / 1 day / 1 week
  /** requests you made or received (admins: all), newest first */
  listAccessRequests(): Promise<AccessRequest[]>
  requestAccess(ownerId: string): Promise<void>
  decideAccessRequest(id: string, approve: boolean, hours?: number): Promise<void>

  // AI 정리 and correction proposals (0014): the company's Claude key stays on the server
  /** admins: set (or, with null, remove) the key */
  setAiKey(key: string | null): Promise<void>
  /** admins: '…abcd' when a key is set, else null */
  aiKeyHint(): Promise<string | null>
  /** uses since `since` (ISO time): your own; admins everyone's */
  listAiUsage(since: string): Promise<AiUsage[]>
  /** proposed changes for one day of yourself or of someone you may send proposals to (counts one use) */
  aiCleanup(date: string, ownerId: string): Promise<AiCleanupResult>
  /** proposals sent to you or by you (admins: all), newest first */
  listProposals(): Promise<CorrectionProposal[]>
  sendProposal(p: Pick<CorrectionProposal, 'owner_id' | 'work_date' | 'items' | 'note' | 'by_ai'>): Promise<void>
  /** the person it was sent to: which items they applied (their log is changed separately) */
  answerProposal(id: string, applied: number[]): Promise<void>
  /** the author takes back a proposal that is not answered yet */
  withdrawProposal(id: string): Promise<void>

  /** Uploaded background photo of the signed-in user (data URL), or null. */
  getBackground(userId: string): Promise<string | null>
  saveBackground(userId: string, imageData: string | null): Promise<void>

  listLeave(userId: string, from: string, to: string): Promise<LeaveRequest[]>
  addLeave(leave: Omit<LeaveRequest, 'id'>): Promise<void>
  deleteLeave(id: string): Promise<void>

  listInvitations(): Promise<Invitation[]>
  /** with a password: account made (or its password set) without e-mail, see api/_lib/inviteCore.ts */
  invite(input: { email: string; role: Role; can_export: boolean; password?: string }): Promise<{ sent: InviteSent }>
  revokeInvitation(id: string): Promise<void>
  /** Admins, Users table: set someone's password (no e-mail) */
  setUserPassword(userId: string, password: string): Promise<void>
  /** Admins, Users table: delete the account and all of that person's records (not yourself, not the last admin) */
  deleteUser(userId: string): Promise<void>
  /** remove an invitation row (revoked / accepted ones; the account itself stays) */
  deleteInvitation(id: string): Promise<void>
}
