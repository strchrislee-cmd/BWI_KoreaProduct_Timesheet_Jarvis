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
  WorkDay,
} from '../domain/types'

/**
 * Everything the UI needs from persistence. Two implementations:
 * - SupabaseStore (production, Postgres + RLS)
 * - LocalStore (demo mode, browser localStorage) — used when Supabase env vars are empty.
 */
export interface DataStore {
  readonly mode: 'demo' | 'supabase'

  currentUser(): Promise<Profile | null>
  sendMagicLink(email: string): Promise<void>
  signOut(): Promise<void>
  onAuthChange(cb: () => void): () => void

  listProfiles(): Promise<Profile[]>
  updateProfile(id: string, patch: Partial<Profile>): Promise<void>
  getOrgSettings(): Promise<OrgSettings>
  updateOrgSettings(patch: Partial<OrgSettings>): Promise<void>

  listProjects(): Promise<GroupProject[]>
  listAliases(): Promise<ProjectAlias[]>
  addAlias(groupProjectId: string, alias: string): Promise<void>
  deleteAlias(id: string): Promise<void>
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
  listTemplates(userId: string): Promise<TaskTemplate[]>
  addTemplate(template: Omit<TaskTemplate, 'id' | 'created_at'>): Promise<void>
  updateTemplate(id: string, patch: Partial<Pick<TaskTemplate, 'color' | 'description' | 'sort_order'>>): Promise<void>
  deleteTemplate(id: string): Promise<void>

  /** Uploaded background photo of the signed-in user (data URL), or null. */
  getBackground(userId: string): Promise<string | null>
  saveBackground(userId: string, imageData: string | null): Promise<void>

  listLeave(userId: string, from: string, to: string): Promise<LeaveRequest[]>
  addLeave(leave: Omit<LeaveRequest, 'id'>): Promise<void>
  deleteLeave(id: string): Promise<void>

  listInvitations(): Promise<Invitation[]>
  invite(input: { email: string; role: Role; can_export: boolean }): Promise<void>
  revokeInvitation(id: string): Promise<void>
}
