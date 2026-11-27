import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { readPrefs } from '../data/preferences'
import { useStore, useUser } from '../data/StoreContext'
import { msUntilNextBoundary, reminderFor } from '../domain/reminders'
import { SLOT_MINUTES, timeToSlot, todayLocal } from '../domain/time'
import { ReminderToast, SHOW_REMINDER_TOAST } from './ReminderToast'
import { DoingLogToast } from './DoingLogToast'

/**
 * Every :00 / :30, asks to log the half hour that just ended (weekdays, inside the day's working
 * hours, not lunch, not already logged): an input toast in the app (ReminderToast) and, when
 * allowed, a browser notification that brings the tab forward.
 * Works while a TeamEmbedded tab is open (it may be minimised or in the background).
 * With Daily Kanban → Log Enable on, the toast asks to log the card in Doing instead (DoingLogToast).
 */
export function ReminderScheduler() {
  const { store } = useStore()
  const user = useUser()
  const navigate = useNavigate()
  const prefs = readPrefs(user.preferences)
  const kanbanLog = prefs.kanbanLog
  const enabled = prefs.notifications || kanbanLog
  const [toast, setToast] = useState<{ date: string; slot: number } | null>(null)

  useEffect(() => {
    if (!enabled) return
    let timer = 0
    let cancelled = false

    const fire = async () => {
      try {
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
        if (r && !cancelled) setToast({ date, slot: r.slot }) // a newer reminder replaces an unanswered one
        if (r && !cancelled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const n = new Notification(kanbanLog ? 'TeamEmbedded · Daily Kanban 기록' : 'TeamEmbedded · 30분 기록', {
            body: kanbanLog ? `${r.text} (Doing 업무로 기록하기)` : r.text,
            tag: 'timecrumbs-reminder',
          })
          n.onclick = () => {
            window.focus()
            navigate(kanbanLog ? `/timesheets/kanban?date=${date}` : `/timesheets?date=${date}`)
            n.close()
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

    // Settings' try-it button: the half hour that just ended, whether or not it is logged
    const showNow = () => {
      const now = new Date()
      setToast({ date: todayLocal(now), slot: Math.max(0, Math.floor((now.getHours() * 60 + now.getMinutes()) / SLOT_MINUTES) - 1) })
    }
    window.addEventListener(SHOW_REMINDER_TOAST, showNow)

    schedule()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.removeEventListener(SHOW_REMINDER_TOAST, showNow)
    }
  }, [enabled, kanbanLog, store, user.id, user.work_start, user.work_end, user.lunch_start, user.lunch_end, navigate])

  if (!toast) return null
  const key = `${toast.date}:${toast.slot}`
  return kanbanLog ? (
    <DoingLogToast key={key} date={toast.date} slot={toast.slot} onClose={() => setToast(null)} />
  ) : (
    <ReminderToast key={key} date={toast.date} slot={toast.slot} onClose={() => setToast(null)} />
  )
}
