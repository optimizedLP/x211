import { useState } from 'react'

import { ACCESS_EMAIL, getSupabase } from '../lib/supabase'

/**
 * One field, one code.
 *
 * The email behind it is a fixed internal address that nobody types; the code
 * people enter is that account's password. Supabase Auth enforces it server
 * side, so an anonymous visitor cannot read the inventory even holding the
 * public key.
 */
export function Login() {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy || code.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      const { error: signInError } = await getSupabase().auth.signInWithPassword({
        email: ACCESS_EMAIL,
        password: code,
      })
      if (signInError) {
        const message = signInError.message
        setError(
          /invalid login credentials/i.test(message)
            ? 'That code was not recognised. Check the code, and that the shared ' +
              'account exists and is confirmed in Supabase → Authentication → Users.'
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
          <label className="block">
            <span className="text-xs font-semibold text-ink">Access code</span>
            <input
              type="password"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoFocus
              autoComplete="current-password"
              placeholder="Ask the IT office for the code"
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
            {busy ? 'Checking…' : 'Unlock'}
          </button>

          <p className="mt-3 text-center text-[11px] text-muted">
            Typed once per device — the browser stays signed in.
          </p>
        </form>
      </div>
    </div>
  )
}
