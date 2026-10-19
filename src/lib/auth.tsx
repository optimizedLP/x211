import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { AuthContext } from './authContext'
import type { AuthStatus } from './authContext'
import { isBackendConfigured, supabase } from './supabase'

/**
 * Tracks the one shared session.
 *
 * With no backend configured the app is always "signed in" — the localStorage
 * adapter has no accounts and a gate would block a local demo.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(isBackendConfigured ? 'loading' : 'signed-in')

  useEffect(() => {
    if (!supabase) return

    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setStatus(data.session ? 'signed-in' : 'signed-out')
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? 'signed-in' : 'signed-out')
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  return <AuthContext.Provider value={{ status, signOut }}>{children}</AuthContext.Provider>
}
