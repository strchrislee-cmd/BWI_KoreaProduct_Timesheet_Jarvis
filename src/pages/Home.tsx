import { Plus } from 'lucide-react'
import { PageTitle } from '../components/Shell'
import { cx } from '../components/ui'

// Dashboard content is intentionally undefined for now (concept-design/README.md §5 · 02).
const SLOTS = ['md:col-span-2 md:row-span-2', 'md:col-span-2', '', '', 'md:row-span-2 md:col-start-4 md:row-start-1']

export function Home() {
  return (
    <div>
      <p className="text-sm text-muted">Welcome back,</p>
      <PageTitle>Home</PageTitle>
      <div className="grid auto-rows-[160px] gap-4 md:grid-cols-4">
        {SLOTS.map((span, i) => (
          <div
            key={i}
            className={cx('flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-line bg-sage-light/50 text-muted', span)}
          >
            <Plus />
            <span className="text-sm font-semibold">{i === 0 ? 'Dashboard widgets will be defined in a later phase' : 'Widget slot – TBD'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
