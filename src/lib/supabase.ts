import { createClient } from '@supabase/supabase-js'

/**
 * One client for the whole app.
 *
 * The key here is the **publishable** key (`sb_publishable_…`). It is designed
 * to be public: it ships in the bundle and only reaches what row-level security
 * allows. The secret key must never appear in this repo or in a `VITE_`
 * variable, because everything `VITE_` is compiled into the browser bundle.
 *
 * When the env vars are missing the app falls back to the localStorage adapter,
 * so a fresh clone still runs without any secrets.
 */

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const isBackendConfigured = Boolean(url && publishableKey)

export const supabase = isBackendConfigured
  ? createClient(url as string, publishableKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The URL carries no auth tokens, so there is nothing to detect here.
        detectSessionInUrl: false,
      },
    })
  : null

export function getSupabase() {
  if (!supabase) throw new Error('Supabase is not configured. Add the two VITE_ variables.')
  return supabase
}

/**
 * The two accounts behind the two access codes. Nobody types these addresses —
 * they are the hidden identifiers behind the one field people do type: the
 * access code, which is just that account's password.
 *
 * `ACCESS_EMAIL` is admin (may write); `GUEST_EMAIL` is the shared read-only
 * account. The role itself is not decided here: it comes from `profiles` and is
 * enforced by row-level security.
 *
 * Kept in env vars rather than in source: they are not secrets (they ship in the
 * bundle, like any email-auth client), but there is no reason for a real
 * address to sit in a public repo.
 */
export const ACCESS_EMAIL = import.meta.env.VITE_ACCESS_EMAIL || 'access@x211.local'
export const GUEST_EMAIL = import.meta.env.VITE_GUEST_EMAIL || 'guest@x211.local'
