import { defaultEndTime, startTimeOptions, timeOptions, timeToMinutes } from '../domain/time'

const fmt = (minutes: number) => (minutes % 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes / 60}h`)

/**
 * Start/end of the working day in 30-min steps. Changing the start resets the end to
 * start + target hours (+ lunch inside); the end can then be moved later (overtime).
 */
export function TimeRangePicker({
  start,
  end,
  targetHours,
  lunchStart,
  lunchEnd,
  disabled,
  onChange,
}: {
  start: string
  end: string
  targetHours: number
  lunchStart: string
  lunchEnd: string
  disabled?: boolean
  onChange: (range: { start: string; end: string }) => void
}) {
  const defaultEnd = defaultEndTime(start, targetHours, lunchStart, lunchEnd)
  const lunchInside = timeToMinutes(defaultEnd) - timeToMinutes(start) - Math.round(targetHours * 60)
  const diff = timeToMinutes(end) - timeToMinutes(defaultEnd)
  const endChoices = timeOptions(timeToMinutes(start) + 30)
  if (!endChoices.includes(end)) endChoices.unshift(end)

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <select
        aria-label="Start time"
        className="field !w-auto !rounded-full !px-2 !py-1"
        value={start}
        disabled={disabled}
        onChange={(e) => onChange({ start: e.target.value, end: defaultEndTime(e.target.value, targetHours, lunchStart, lunchEnd) })}
      >
        {startTimeOptions(start).map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
      <span className="text-muted">→</span>
      <select
        aria-label="End time"
        className="field !w-auto !rounded-full !px-2 !py-1"
        value={end}
        disabled={disabled}
        onChange={(e) => onChange({ start, end: e.target.value })}
      >
        {endChoices.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
      <span className="text-xs text-muted" data-testid="hours-note">
        {diff > 0
          ? `+${fmt(diff)} 연장`
          : diff < 0
            ? `${fmt(-diff)} 단축`
            : `근무 ${targetHours}h${lunchInside > 0 ? ` + 점심 ${fmt(lunchInside)}` : ''}`}
      </span>
    </div>
  )
}
