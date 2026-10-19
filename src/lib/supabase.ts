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
 * The single shared account. Nobody types this address — it is the hidden
 * identifier behind the one field people do type: the access code, which is
 * just this user's password.
 *
 * Kept in an env var rather than in source: it is not a secret (it ships in the
 * bundle, like any email-auth client), but there is no reason for a real
 * address to sit in a public repo.
 */
export const ACCESS_EMAIL = import.meta.env.VITE_ACCESS_EMAIL || 'access@x211.local'
