// MID (중분류): the kind of work done in a half hour (개발-신규, 지원-8D, 회의-INT, …), next to the
// category (which project). Admins keep the list (Projects → MID); a slot may leave it empty.
import { projectNameKey } from './projects.js'
import type { WorkType } from './types.js'

/** Starting list — the same as the insert in supabase/migrations/0011_work_types.sql (tested). */
export const DEFAULT_WORK_TYPES: { name: string; color: string }[] = [
  { name: '개발-신규', color: '#2E9E5B' },
  { name: '개발-파생', color: '#57B894' },
  { name: '개발-설계변경', color: '#8BC34A' },
  { name: '개발-선행검토', color: '#1E88A8' },
  { name: '검증-시험·인증', color: '#7E57C2' },
  { name: '검증-시제품', color: '#AB47BC' },
  { name: '지원-생산', color: '#F28C28' },
  { name: '지원-8D', color: '#E5534B' },
  { name: '지원-견적', color: '#D4A017' },
  { name: '회의-INT', color: '#3B82F6' },
  { name: '회의-EXT', color: '#0EA5E9' },
  { name: '일반-이메일 및 일반업무', color: '#94A3B8' },
]

/** Fallback color of a MID without one. */
export const WORK_TYPE_GRAY = '#94A3B8'

export function sortWorkTypes(list: WorkType[]): WorkType[] {
  return [...list].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

/** What the dropdowns offer: not hidden, in the admin's order. */
export function selectableWorkTypes(list: WorkType[]): WorkType[] {
  return sortWorkTypes(list.filter((w) => !w.hidden))
}

/** The MID a typed or pasted name means (spacing/case-insensitive), among the offered ones. */
export function findWorkType(text: string, list: WorkType[]): WorkType | undefined {
  const key = projectNameKey(text)
  return key ? selectableWorkTypes(list).find((w) => projectNameKey(w.name) === key) : undefined
}

/** Why a new or renamed MID name is not accepted, or null. */
export function workTypeNameProblem(name: string, list: WorkType[], exceptId?: string): string | null {
  const clean = name.replace(/\s+/g, ' ').trim()
  if (!clean) return 'MID 이름을 입력하세요.'
  const same = list.find((w) => w.id !== exceptId && projectNameKey(w.name) === projectNameKey(clean))
  if (same) return same.hidden ? `숨긴 MID에 같은 이름이 있습니다: ${clean} (숨긴 항목 보기 → 되돌리기)` : `이미 있는 MID입니다: ${clean}`
  return null
}
