import { useState } from 'react'

import type { Role } from '../lib/authContext'
import { ACCESS_EMAIL, GUEST_EMAIL, getSupabase } from '../lib/supabase'

const ROLE_KEY = 'x211:login-role'

/** Remembers the last door used, so staff tap "guest" once on their machine. */
function storedRole(): Role {
  try {
    return localStorage.getItem(ROLE_KEY) === 'guest' ? 'guest' : 'admin'
  } catch {
    return 'admin'
  }
}

/**
 * One field, two accounts.
 *
 * The emails behind the switch are fixed internal addresses nobody types; the
 * code people enter is that account's password. Which account is chosen here
 * only picks the door to try — what the account may do is decided by its role
 * in `profiles`, and enforced by row-level security.
 */
export function Login() {
  const [role, setRole] = useState<Role>(storedRole)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const choose = (next: Role) => {
    if (next === role) return
    setRole(next)
    // A code belongs to one account; carrying it across would look like a
    // rejected code on the other side.
    setCode('')
    setError(null)
    try {
      localStorage.setItem(ROLE_KEY, next)
    } catch {
      // Storage can be unavailable (private mode); the switch still works.
    }
  }

  const submit = async () => {
    if (busy || code.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      const { error: signInError } = await getSupabase().auth.signInWithPassword({
        email: role === 'admin' ? ACCESS_EMAIL : GUEST_EMAIL,
        password: code,
      })
      if (signInError) {
        const message = signInError.message
        setError(
          /invalid login credentials/i.test(message)
            ? 'That code was not recognised. Check the code, and that this account exists ' +
              'and is confirmed in Supabase → Authentication → Users.'
            : /email not confirmed/i.test(message)
              ? 'That account is not confirmed yet. In Supabase → Authentication → Users, ' +
                'confirm it (or recreate it with “Auto Confirm User” ticked).'
              : message,
        )
        setBusy(false)
        return
      }
      // Success flips the auth state; the app replaces this screen on its own.
    } catch (unexpected) {
      setError(unexpected instanceof Error ? unexpected.message : String(unexpected))
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="font-mono text-2xl font-bold tracking-tight text-accent">x211</div>
          <p className="mt-1 text-xs text-muted">School Device Inventory</p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="rounded-xl border border-line bg-panel p-6"
        >
          <div
            role="group"
            aria-label="Account"
            className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-line bg-panel-2 p-1"
          >
            {(['admin', 'guest'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => choose(option)}
                aria-pressed={role === option}
                title={
                  option === 'admin'
                    ? 'Add, edit, import and remove devices'
                    : 'Browse the inventory without changing it'
                }
                className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                  role === option
                    ? 'border border-accent/45 bg-accent/15 font-semibold text-accent'
                    : 'border border-transparent font-medium text-muted hover:text-ink'
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-ink">access code</span>
            <input
              type="password"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoFocus
              autoComplete="current-password"
              className="mt-2 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-accent/60 focus:ring-2 focus:ring-accent/20 focus:outline-none"
            />
          </label>

          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || code.trim() === ''}
            className="mt-4 w-full rounded-lg border border-accent/50 bg-accent/15 px-3 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/25 disabled:opacity-40"
          >
            {busy ? 'Checking…' : 'Authenticate'}
          </button>
        </form>
      </div>
    </div>
  )
}
