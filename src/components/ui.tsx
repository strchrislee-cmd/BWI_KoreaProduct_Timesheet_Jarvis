import { X } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type CardTone = 'white' | 'sage' | 'accent' | 'dark'
const TONES: Record<CardTone, string> = {
  white: 'bg-surface',
  sage: 'bg-sage',
  accent: 'bg-accent text-white',
  dark: 'bg-primary text-white',
}

export function Card({
  title,
  action,
  tone = 'white',
  className,
  children,
}: {
  title?: ReactNode
  action?: ReactNode
  tone?: CardTone
  className?: string
  children?: ReactNode
}) {
  return (
    <section className={cx('rounded-[var(--radius-card)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]', TONES[tone], className)}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-bold">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'light'
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-soft',
  outline: 'border border-primary text-primary bg-white hover:bg-sage-light',
  ghost: 'text-ink hover:bg-sage-light',
  light: 'bg-white text-ink hover:bg-sage-light',
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
    />
  )
}

type PillTone = 'green' | 'orange' | 'grey' | 'yellow' | 'blue'
const PILLS: Record<PillTone, string> = {
  green: 'bg-sage text-primary',
  orange: 'bg-accent text-white',
  grey: 'bg-[#ececec] text-muted',
  yellow: 'bg-cat-meeting text-ink',
  blue: 'bg-cat-general text-ink',
}

export function Pill({ tone = 'grey', children, className }: { tone?: PillTone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', PILLS[tone], className)}>
      {children}
    </span>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-label={title}>
      <div className={cx('max-h-[90vh] w-full overflow-auto rounded-[var(--radius-card)] bg-white p-6 shadow-xl', wide ? 'max-w-4xl' : 'max-w-lg')}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-sage-light">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ErrorNote({ error }: { error?: Error | string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-[#9a3a0e]">
      {typeof error === 'string' ? error : error.message}
    </p>
  )
}

export function Loading() {
  return <p className="p-6 text-sm text-muted">Loading…</p>
}

export { cx }
