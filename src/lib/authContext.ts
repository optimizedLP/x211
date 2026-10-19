import { createContext, useContext } from 'react'

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in'

export interface AuthValue {
  status: AuthStatus
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
