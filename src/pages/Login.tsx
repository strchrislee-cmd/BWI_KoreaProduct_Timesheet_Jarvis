import { Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button, ErrorNote } from '../components/ui'
import { useStore } from '../data/StoreContext'

export function Login() {
  const { store } = useStore()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await store.sendMagicLink(email.trim())
      setSent(true)
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="grid w-full max-w-4xl gap-5 md:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col justify-between rounded-[var(--radius-card)] bg-primary p-8 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-2xl font-extrabold text-primary">J</div>
            <div>
              <div className="text-2xl font-extrabold">JARVIS</div>
              <div className="text-sm opacity-80">Internal Groupware Assistant</div>
            </div>
          </div>
          <p className="mt-16 text-4xl font-extrabold leading-tight">Your timesheet, on autopilot.</p>
        </div>
        <form onSubmit={submit} className="rounded-[var(--radius-card)] bg-white p-8">
          <h1 className="text-4xl font-extrabold">Sign in</h1>
          <p className="mb-6 mt-1 text-muted">Invite-only workspace. Use your work e-mail.</p>
          {sent ? (
            <p className="rounded-xl bg-sage px-4 py-3 font-semibold text-primary">Check your inbox — we sent a sign-in link to {email}.</p>
          ) : (
            <div className="space-y-3">
              <label className="flex items-center gap-2 rounded-full border border-line px-4 py-2 focus-within:border-primary">
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
              <ErrorNote error={error} />
              <Button type="submit" className="w-full py-3" disabled={busy}>
                {busy ? 'Sending…' : 'Send magic link'}
              </Button>
            </div>
          )}
          <p className="mt-6 text-xs text-muted">Got an invite? Open the link in your e-mail to activate your account.</p>
        </form>
      </div>
    </div>
  )
}
