import { KeyRound, Mail } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { BackgroundLayer } from '../components/BackgroundLayer'
import { Button, ErrorNote } from '../components/ui'
import { useStore } from '../data/StoreContext'
import { AUTH_LINK, linkErrorText } from '../lib/authLink'

/** Supabase's wording for a wrong e-mail/password pair, made actionable. */
function signInError(err: Error): Error {
  if (/invalid login credentials/i.test(err.message))
    return new Error('Wrong e-mail or password. No password yet? Use "Forgot password?" to get a sign-in link, then set one in Settings.')
  return err
}

export function Login() {
  const { store } = useStore()
  // password: e-mail + password; link: e-mail a sign-in link (first visit, forgotten password)
  const [mode, setMode] = useState<'password' | 'link'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  // a failed e-mail link lands here with the reason in the address bar; say so instead of a silent login screen
  const [error, setError] = useState<Error | null>(AUTH_LINK.error ? new Error(linkErrorText(AUTH_LINK.error)) : null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (AUTH_LINK.error) window.history.replaceState(window.history.state, '', window.location.pathname)
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'password') {
        await store.signInWithPassword(email.trim(), password) // the app switches to the signed-in screens on success
      } else {
        await store.sendMagicLink(email.trim())
        setSent(true)
      }
    } catch (err) {
      setError(signInError(err as Error))
    } finally {
      setBusy(false)
    }
  }

  const switchTo = (next: 'password' | 'link') => {
    setMode(next)
    setSent(false)
    setError(null)
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <BackgroundLayer />
      <div className="grid w-full max-w-4xl gap-5 md:grid-cols-[1.1fr_1fr]">
        <div className="glass-dark flex flex-col justify-between rounded-card p-8 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-control bg-white text-2xl font-extrabold text-primary">T</div>
            <div>
              <div className="font-display text-2xl font-extrabold">TeamEmbedded</div>
              <div className="text-sm opacity-80">Gods of Team Embedded</div>
            </div>
          </div>
          <p className="mt-16 font-display text-4xl font-extrabold leading-tight">Your timesheet, on autopilot.</p>
        </div>
        <form onSubmit={submit} className="glass rounded-card p-8">
          <h1 className="font-display text-4xl font-extrabold">Sign in</h1>
          <p className="mb-6 mt-1 text-muted">Invite-only workspace. Use your work e-mail.</p>
          {sent ? (
            <p className="rounded-control bg-sage px-4 py-3 font-semibold text-primary">Check your inbox — we sent a sign-in link to {email}.</p>
          ) : (
            <div className="space-y-3">
              <label className="flex items-center gap-2 rounded-control border border-line px-4 py-2 focus-within:border-primary">
                <Mail size={18} className="text-primary" />
                <input
                  type="email"
                  required
                  aria-label="Work e-mail"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-transparent outline-none"
                />
              </label>
              {mode === 'password' && (
                <label className="flex items-center gap-2 rounded-control border border-line px-4 py-2 focus-within:border-primary">
                  <KeyRound size={18} className="text-primary" />
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    aria-label="Password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent outline-none"
                  />
                </label>
              )}
              <ErrorNote error={error} />
              <Button type="submit" className="w-full py-3" disabled={busy}>
                {mode === 'password' ? (busy ? 'Signing in…' : 'Sign in') : busy ? 'Sending…' : 'Send sign-in link'}
              </Button>
            </div>
          )}
          <button type="button" className="mt-4 text-sm font-semibold text-primary underline" onClick={() => switchTo(mode === 'password' ? 'link' : 'password')}>
            {mode === 'password' ? 'Forgot password? Get a sign-in link by e-mail' : 'Back to password sign-in'}
          </button>
          <p className="mt-4 text-xs text-muted">
            Got an invite? Open the link in your e-mail (or sign in with the temporary password from your admin), then set your own password in Settings.
          </p>
        </form>
      </div>
    </div>
  )
}
