import { Plus } from 'lucide-react'
import { PageTitle } from '../components/Shell'
import { cx } from '../components/ui'
import { useT } from '../lib/i18n'

// Dashboard content is intentionally undefined for now (concept-design/README.md §5 · 02).
const SLOTS = ['md:col-span-2 md:row-span-2', 'md:col-span-2', '', '', 'md:row-span-2 md:col-start-4 md:row-start-1']

export function Home() {
  const tr = useT()
  return (
    <div>
      <p className="text-sm text-muted">{tr('Welcome back,')}</p>
      <PageTitle>{tr('Home')}</PageTitle>
      <div className="grid auto-rows-[160px] gap-4 md:grid-cols-4">
        {SLOTS.map((span, i) => (
          <div
            key={i}
            className={cx('glass flex flex-col items-center justify-center gap-2 rounded-card border-2 !border-dashed !border-white/80 text-muted', span)}
          >
            <Plus />
            <span className="text-sm font-semibold">{i === 0 ? 'Dashboard widgets will be defined in a later phase' : 'Widget slot – TBD'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
