// What an e-mail link (invite, sign-in link, password reset) brought back in the address bar.
// Supabase puts the result in the URL (#access_token=… or #error=…&error_description=…).
// Read once at start-up: Supabase clears the fragment after a successful sign-in.

export interface AuthLink {
  /** the link signed the person in */
  signedIn: boolean
  /** the link failed (e.g. otp_expired: already used or expired) */
  error: { code: string; message: string } | null
}

export function parseAuthLink(href: string): AuthLink {
  const url = new URL(href)
  const params = new URLSearchParams(url.hash.replace(/^#/, ''))
  url.searchParams.forEach((v, k) => {
    if (!params.has(k)) params.set(k, v)
  })
  const code = params.get('error_code') ?? params.get('error')
  const message = params.get('error_description')
  if (code || message) return { signedIn: false, error: { code: code ?? '', message: message ?? code ?? '' } }
  return { signedIn: params.has('access_token'), error: null }
}

/** The login screen's message for a failed link. */
export function linkErrorText(error: { code: string; message: string }): string {
  if (error.code === 'otp_expired' || /expired|invalid/i.test(error.message))
    return 'This e-mail link was already used or has expired. Company mail security (e.g. Outlook Safe Links) can open links before you do, which uses them up. Sign in with your password, or ask your admin for a temporary password.'
  return `The e-mail link did not sign you in: ${error.message}`
}

export const AUTH_LINK: AuthLink = typeof window === 'undefined' ? { signedIn: false, error: null } : parseAuthLink(window.location.href)

let linkSignInTaken = false
/** true once after an e-mail link signed the person in (then: go and set a password) */
export function takeLinkSignIn(): boolean {
  if (linkSignInTaken || !AUTH_LINK.signedIn) return false
  linkSignInTaken = true
  return true
}
