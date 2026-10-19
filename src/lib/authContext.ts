import { createContext, useContext } from 'react'

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in'

/**
 * What an account may do. Stored next to the account in Supabase (`profiles`)
 * and enforced by row-level security; the UI only reflects it.
 */
export type Role = 'admin' | 'guest'

export interface AuthValue {
  status: AuthStatus
  /** null until the session's role has been read. Treated as guest meanwhile. */
  role: Role | null
  isAdmin: boolean
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
