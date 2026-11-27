// User levels. Admins see and edit everything. L1 / L2 / L3 log their own time, read the shared
// master data and keep personal settings; reading other people's time follows the Org Chart
// (domain/org.ts, migration 0013): an L2 reads the L1s below them, an L3 the L2s and L1s below them.
import type { Role } from './types.js'

export const ROLES: { value: Role; label: string; desc: string }[] = [
  { value: 'l1', label: 'L1', desc: '자기 시간 기록 · 개인 설정' },
  { value: 'l2', label: 'L2', desc: '+ 조직도에서 아래 L1의 기록 보기' },
  { value: 'l3', label: 'L3', desc: '+ 조직도에서 아래 L2·L1의 기록 보기' },
  { value: 'admin', label: 'Admin', desc: '사용자·프로젝트 관리, 모든 자료' },
]

export const roleLabel = (role: Role): string => ROLES.find((r) => r.value === role)?.label ?? role

/** Roles saved before levels existed: member → L1, viewer → L2 (same as migration 0009). */
export function normalizeRole(role: unknown): Role {
  if (role === 'member') return 'l1'
  if (role === 'viewer') return 'l2'
  return ROLES.some((r) => r.value === role) ? (role as Role) : 'l1'
}

export type DeleteUserProblem = 'You cannot delete your own account' | 'Cannot delete the last admin'

/** Why an admin may not delete this account, or null (Admin → Users, POST /api/admin/user). */
export function deleteUserProblem(callerId: string, target: { id: string; role: string }, profiles: { role: string }[]): DeleteUserProblem | null {
  if (target.id === callerId) return 'You cannot delete your own account'
  if (target.role === 'admin' && profiles.filter((p) => p.role === 'admin').length <= 1) return 'Cannot delete the last admin'
  return null
}
