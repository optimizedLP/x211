import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'

import { AuthContext } from './authContext'
import type { AuthStatus, Role } from './authContext'
import { isBackendConfigured, supabase } from './supabase'

/**
 * Tracks the session and the role attached to it.
 *
 * With no backend configured the app is always "signed in" as an admin — the
 * localStorage adapter has no accounts and a gate would block a local demo.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(isBackendConfigured ? 'loading' : 'signed-in')
  const [role, setRole] = useState<Role | null>(isBackendConfigured ? null : 'admin')

  useEffect(() => {
    const client = supabase
    if (!client) return

    let cancelled = false
    /** Guards against a slow role read landing after the account signed out. */
    let latest = 0

    /**
     * The role is read once per session, and the screen stays on "Loading…"
     * until it lands so an admin never sees the guest view flash.
     *
     * Fail closed: a missing row, a missing table or a network error all mean
     * guest. Postgres enforces the same rule, so the UI is never the only thing
     * standing between a guest and a write.
     */
    const apply = async (session: Session | null) => {
      const run = ++latest

      if (!session) {
        if (cancelled) return
        setRole(null)
        setStatus('signed-out')
        return
      }

      const { data, error } = await client
        .from('profiles')
        .select('role')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (cancelled || run !== latest) return
      if (error) {
        console.warn('Could not read this account’s role; treating it as guest.', error)
      }
      const stored = (data as { role?: string } | null)?.role
      setRole(!error && stored === 'admin' ? 'admin' : 'guest')
      setStatus('signed-in')
    }

    client.auth.getSession().then(({ data }) => {
      void apply(data.session)
    })

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      // Deferred: Supabase asks callbacks not to call back into the client
      // while the auth event is still being delivered.
      setTimeout(() => {
        void apply(session)
      }, 0)
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

  return (
    <AuthContext.Provider value={{ status, role, isAdmin: role === 'admin', signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
