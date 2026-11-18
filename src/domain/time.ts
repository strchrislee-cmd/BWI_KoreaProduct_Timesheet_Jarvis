// Date/slot helpers. Dates are plain 'YYYY-MM-DD' strings computed in UTC so that
// results never shift with the browser's time zone.

export const SLOT_MINUTES = 30
export const SLOTS_PER_DAY = 48
export const SLOT_HOURS = SLOT_MINUTES / 60

const pad = (n: number) => String(n).padStart(2, '0')

export function slotToTime(index: number): string {
  const minutes = index * SLOT_MINUTES
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

/** 'HH:MM' → slot index (rounded down to the 30-min slot). */
export function timeToSlot(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return Math.floor((h * 60 + m) / SLOT_MINUTES)
}

function toUtc(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function fromUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function makeDate(year: number, month: number, day: number): string {
  return fromUtc(new Date(Date.UTC(year, month - 1, day)))
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date)
  d.setUTCDate(d.getUTCDate() + days)
  return fromUtc(d)
}

/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(date: string): number {
  return (toUtc(date).getUTCDay() + 6) % 7
}

export function isWeekend(date: string): boolean {
  return weekdayIndex(date) >= 5
}

export function mondayOf(date: string): string {
  return addDays(date, -weekdayIndex(date))
}

/** Monday..Sunday of the week containing `date`. */
export function weekDates(date: string): string[] {
  const monday = mondayOf(date)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** ISO-8601 week number (weeks start Monday; week 1 contains the first Thursday). */
export function isoWeek(date: string): { year: number; week: number } {
  const thursday = toUtc(addDays(mondayOf(date), 3))
  const year = thursday.getUTCFullYear()
  const jan1 = Date.UTC(year, 0, 1)
  const week = Math.floor((thursday.getTime() - jan1) / 86_400_000 / 7) + 1
  return { year, week }
}

export function eachDate(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

export function monthGrid(date: string): string[] {
  // 6 weeks × 7 days starting on the Monday on/before the 1st of the month
  const first = date.slice(0, 8) + '01'
  const start = mondayOf(first)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function shortLabel(date: string): string {
  return `${WEEKDAY_SHORT[weekdayIndex(date)]} ${date.slice(5)}`
}

/** Today in the browser's local time zone. */
export function todayLocal(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
