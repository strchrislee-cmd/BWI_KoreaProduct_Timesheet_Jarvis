import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { readPrefs } from '../data/preferences'
import { useStore, useUser } from '../data/StoreContext'
import { msUntilNextBoundary, reminderFor } from '../domain/reminders'
import { timeToSlot, todayLocal } from '../domain/time'

/**
 * Browser notification every :00 / :30 asking to log the half hour that just ended
 * (weekdays, inside the day's working hours, not lunch, not already logged).
 * Works while a TimeCrumbs tab is open (it may be minimised or in the background).
 */
export function ReminderScheduler() {
  const { store } = useStore()
  const user = useUser()
  const navigate = useNavigate()
  const enabled = readPrefs(user.preferences).notifications

  useEffect(() => {
    if (!enabled || typeof Notification === 'undefined') return
    let timer = 0
    let cancelled = false

    const fire = async () => {
      try {
        if (Notification.permission === 'granted') {
          const now = new Date()
          const date = todayLocal(now)
          const [day, slots] = await Promise.all([store.getWorkDay(user.id, date), store.listSlots(user.id, date, date)])
          const lunch = new Set<number>()
          for (let i = timeToSlot(user.lunch_start); i < timeToSlot(user.lunch_end); i++) lunch.add(i)
          const r = reminderFor(now, {
            start: day?.start_time ?? user.work_start,
            end: day?.end_time ?? user.work_end,
            lunch,
            filled: new Set(slots.map((s) => s.slot_index)),
          })
          if (r && !cancelled) {
            const n = new Notification('TimeCrumbs · 30분 기록', { body: r.text, tag: 'timecrumbs-reminder' })
            n.onclick = () => {
              window.focus()
              navigate(`/timesheets?date=${date}`)
              n.close()
            }
          }
        }
      } catch {
        // a failed check just skips this reminder
      }
      if (!cancelled) schedule()
    }
    const schedule = () => {
      timer = window.setTimeout(() => void fire(), msUntilNextBoundary(new Date()))
    }

    schedule()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [enabled, store, user.id, user.work_start, user.work_end, user.lunch_start, user.lunch_end, navigate])

  return null
}
