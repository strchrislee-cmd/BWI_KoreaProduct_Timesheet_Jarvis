import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Profile } from '../domain/types'
import { LocalStore } from './localStore'
import type { DataStore } from './store'
import { SupabaseStore } from './supabaseStore'

function createStore(): DataStore {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  return url && key ? new SupabaseStore(url, key) : new LocalStore()
}

interface StoreValue {
  store: DataStore
  /** undefined while loading, null when signed out */
  user: Profile | null | undefined
  refreshUser: () => Promise<void>
}

const Ctx = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const store = useMemo(createStore, [])
  const [user, setUser] = useState<Profile | null | undefined>(undefined)

  const refreshUser = useCallback(async () => {
    try {
      setUser(await store.currentUser())
    } catch {
      setUser(null)
    }
  }, [store])

  useEffect(() => {
    void refreshUser()
    return store.onAuthChange(() => void refreshUser())
  }, [store, refreshUser])

  return <Ctx.Provider value={{ store, user, refreshUser }}>{children}</Ctx.Provider>
}

export function useStore(): StoreValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore outside StoreProvider')
  return v
}

/** The signed-in profile (only use below the auth guard). */
export function useUser(): Profile {
  const { user } = useStore()
  if (!user) throw new Error('No signed-in user')
  return user
}
