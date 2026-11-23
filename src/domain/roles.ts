// User levels. Admins see and edit everything; L1 / L2 / L3 have the same rights for now
// (log and see their own time, read the shared master data, keep personal settings). Rules per
// level — e.g. an L2 reading the L1s in their group — come later.
import type { Role } from './types.js'

export const ROLES: { value: Role; label: string; desc: string }[] = [
  { value: 'l1', label: 'L1', desc: '자기 시간 기록 · 개인 설정' },
  { value: 'l2', label: 'L2', desc: '지금은 L1과 같은 권한' },
  { value: 'l3', label: 'L3', desc: '지금은 L1과 같은 권한' },
  { value: 'admin', label: 'Admin', desc: '사용자·프로젝트 관리, 모든 자료' },
]

export const roleLabel = (role: Role): string => ROLES.find((r) => r.value === role)?.label ?? role

/** Roles saved before levels existed: member → L1, viewer → L2 (same as migration 0009). */
export function normalizeRole(role: unknown): Role {
  if (role === 'member') return 'l1'
  if (role === 'viewer') return 'l2'
  return ROLES.some((r) => r.value === role) ? (role as Role) : 'l1'
}
