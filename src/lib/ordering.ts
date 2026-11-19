// Sorting / manual ordering for Notion-like option lists.

export type SortMode = 'manual' | 'name' | 'name_desc' | 'created' | 'created_desc'

export const SORT_LABELS: Record<SortMode, string> = {
  manual: '수동 (드래그 순서)',
  name: '이름순 (가→하)',
  name_desc: '이름 역순 (하→가)',
  created: '생성일순 (오래된 것부터)',
  created_desc: '최신순 (최근 것부터)',
}

export function isSortMode(v: unknown): v is SortMode {
  return typeof v === 'string' && v in SORT_LABELS
}

/**
 * Sort items. `manual` follows the keys in `manualOrder`; items not listed keep the
 * incoming (fallback) order after the listed ones.
 */
export function sortItems<T>(
  items: T[],
  mode: SortMode,
  get: { key: (t: T) => string; name: (t: T) => string; created: (t: T) => string },
  manualOrder: string[] = [],
): T[] {
  const indexed = items.map((item, i) => ({ item, i }))
  const byName = (a: T, b: T) => get.name(a).localeCompare(get.name(b), 'ko')
  const byCreated = (a: T, b: T) => get.created(a).localeCompare(get.created(b))
  const rank = new Map(manualOrder.map((k, i) => [k, i]))
  const cmp: Record<SortMode, (a: { item: T; i: number }, b: { item: T; i: number }) => number> = {
    manual: (a, b) => (rank.get(get.key(a.item)) ?? Infinity) - (rank.get(get.key(b.item)) ?? Infinity) || a.i - b.i,
    name: (a, b) => byName(a.item, b.item) || a.i - b.i,
    name_desc: (a, b) => byName(b.item, a.item) || a.i - b.i,
    created: (a, b) => byCreated(a.item, b.item) || a.i - b.i,
    created_desc: (a, b) => byCreated(b.item, a.item) || a.i - b.i,
  }
  return indexed.sort(cmp[mode]).map((x) => x.item)
}

/** Move the element at `from` to position `to`. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [x] = next.splice(from, 1)
  next.splice(to, 0, x)
  return next
}
