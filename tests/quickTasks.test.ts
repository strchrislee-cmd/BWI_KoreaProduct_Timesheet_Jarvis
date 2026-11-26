import { describe, expect, it } from 'vitest'
import { EMPTY_TASK_LABEL, quickTaskName } from '../src/domain/quickTasks'

describe('quick task names', () => {
  it('uses the Task; an empty Task reads (내용 없음), never the project name', () => {
    expect(quickTaskName({ description: '도면 검토' })).toBe('도면 검토')
    expect(quickTaskName({ description: '' })).toBe(EMPTY_TASK_LABEL)
    expect(quickTaskName({ description: '   ' })).toBe('(내용 없음)')
  })
})

describe('quick add preset slots', () => {
  it('reads saved slots defensively; items without a slot are in slot 1', async () => {
    const { readQuickSlots, slotOf, slotLabel, DEFAULT_QUICK_SLOTS } = await import('../src/domain/quickTasks')
    expect(readQuickSlots(undefined)).toEqual(DEFAULT_QUICK_SLOTS)
    const s = readQuickSlots({ active: 2, names: ['2026 Q1', 5, '  '], of: { a: 2, b: 0, c: 9, d: 'x' } })
    expect(s.active).toBe(2)
    expect(s.names).toEqual(['2026 Q1', '', '', ''])
    expect(s.of).toEqual({ a: 2 }) // 0 is the default, 9 and 'x' are not slots
    expect(slotOf(s, 'a')).toBe(2)
    expect(slotOf(s, 'zzz')).toBe(0)
    expect(slotLabel(s, 0)).toBe('2026 Q1')
    expect(slotLabel(s, 3)).toBe('4')
    expect(readQuickSlots({ active: 7 }).active).toBe(0)
  })
})
