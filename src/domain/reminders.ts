import { SLOT_MINUTES, slotToTime, timeToMinutes } from './time.js'

/** Milliseconds from `now` to the next :00 or :30 (plus a 1 s margin). */
export function msUntilNextBoundary(now: Date): number {
  const ms = (now.getMinutes() * 60 + now.getSeconds()) * 1000 + now.getMilliseconds()
  const period = SLOT_MINUTES * 60 * 1000
  return period - (ms % period) + 1000
}

/**
 * Reminder for the half hour that just ended, or null when none is needed:
 * weekends, outside the day's working hours, lunch, or already logged.
 */
export function reminderFor(
  now: Date,
  opts: { start: string; end: string; lunch: Set<number>; filled: Set<number> },
): { slot: number; text: string } | null {
  const day = now.getDay()
  if (day === 0 || day === 6) return null
  const slot = Math.floor((now.getHours() * 60 + now.getMinutes()) / SLOT_MINUTES) - 1
  if (slot < 0) return null
  const from = slot * SLOT_MINUTES
  if (from < timeToMinutes(opts.start) || from + SLOT_MINUTES > timeToMinutes(opts.end)) return null
  if (opts.lunch.has(slot) || opts.filled.has(slot)) return null
  return { slot, text: `${slotToTime(slot)}–${slotToTime(slot + 1)} 업무를 기록해 주세요` }
}
