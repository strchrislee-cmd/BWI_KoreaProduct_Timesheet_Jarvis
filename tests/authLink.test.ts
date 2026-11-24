import { describe, expect, it } from 'vitest'
import { linkErrorText, parseAuthLink } from '../src/lib/authLink'

describe('parseAuthLink', () => {
  it('nothing in the address bar', () => {
    expect(parseAuthLink('https://app.example.com/')).toEqual({ signedIn: false, error: null })
  })
  it('a link that signed the person in (invite, sign-in link, password reset)', () => {
    const href = 'https://app.example.com/#access_token=abc&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery'
    expect(parseAuthLink(href)).toEqual({ signedIn: true, error: null })
  })
  it('a used or expired link, as Supabase sends it back (fragment or query)', () => {
    const want = { signedIn: false, error: { code: 'otp_expired', message: 'Email link is invalid or has expired' } }
    expect(parseAuthLink('https://app.example.com/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')).toEqual(want)
    expect(parseAuthLink('https://app.example.com/?error=access_denied&error_code=otp_expired&error_description=Email%20link%20is%20invalid%20or%20has%20expired')).toEqual(want)
  })
})

describe('linkErrorText', () => {
  it('explains used/expired links (e.g. opened first by a mail scanner)', () => {
    expect(linkErrorText({ code: 'otp_expired', message: 'Email link is invalid or has expired' })).toMatch(/already used or has expired/)
  })
  it('passes other reasons through', () => {
    expect(linkErrorText({ code: 'server_error', message: 'Database error' })).toBe('The e-mail link did not sign you in: Database error')
  })
})
