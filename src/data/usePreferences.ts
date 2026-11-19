import { useEffect, useMemo, useRef, useState } from 'react'
import { readPrefs, type Prefs } from './preferences'
import { useStore, useUser } from './StoreContext'

/** The signed-in user's preferences with a safe updater (quick successive updates don't clobber). */
export function usePreferences() {
  const { store, refreshUser } = useStore()
  const user = useUser()
  const prefs = useMemo(() => readPrefs(user.preferences), [user.preferences])
  const latest = useRef<Prefs>(prefs)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    latest.current = prefs
  }, [prefs])

  async function update(fn: (p: Prefs) => Prefs) {
    const next = fn(latest.current)
    latest.current = next
    try {
      await store.updateProfile(user.id, { preferences: { ...user.preferences, ...next } })
      await refreshUser()
      setError(null)
    } catch (e) {
      setError(e as Error)
    }
  }

  return { prefs, update, error }
}
