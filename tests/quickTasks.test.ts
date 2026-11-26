import { describe, expect, it } from 'vitest'
import { EMPTY_TASK_LABEL, quickTaskName } from '../src/domain/quickTasks'

describe('quick task names', () => {
  it('uses the Task; an empty Task reads (내용 없음), never the project name', () => {
    expect(quickTaskName({ description: '도면 검토' })).toBe('도면 검토')
    expect(quickTaskName({ description: '' })).toBe(EMPTY_TASK_LABEL)
    expect(quickTaskName({ description: '   ' })).toBe('(내용 없음)')
  })
})
