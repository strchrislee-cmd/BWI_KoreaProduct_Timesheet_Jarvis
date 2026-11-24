import { describe, expect, it } from 'vitest'
import { passwordProblem } from '../src/domain/password'

describe('passwordProblem', () => {
  it('needs at least 8 characters', () => {
    expect(passwordProblem('1234567')).toBe('Password must be at least 8 characters')
    expect(passwordProblem('12345678')).toBeNull()
  })
  it('checks the second entry when given', () => {
    expect(passwordProblem('12345678', '12345679')).toBe('The two passwords do not match')
    expect(passwordProblem('12345678', '12345678')).toBeNull()
    expect(passwordProblem('short', 'other')).toBe('Password must be at least 8 characters')
  })
})
