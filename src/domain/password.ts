// Password rules, shared by the sign-in screens and POST /api/admin/invite.

export const MIN_PASSWORD_LENGTH = 8

export type PasswordProblem = 'Password must be at least 8 characters' | 'The two passwords do not match'

/** Why a new password is not accepted, or null. Pass `confirm` when the form asks for it twice. */
export function passwordProblem(password: string, confirm?: string): PasswordProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'Password must be at least 8 characters'
  if (confirm !== undefined && confirm !== password) return 'The two passwords do not match'
  return null
}
