// Thin wrapper around @supabase/supabase-js.
// Exposes a singleton client and a guard `hasSupabase` so the rest of
// the app can degrade gracefully when env vars aren't set (local-only
// mode, no auth, evaluations stay in localStorage).
import { createClient } from '@supabase/supabase-js'

const URL  = import.meta.env.VITE_SUPABASE_URL
const KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY

export const hasSupabase = Boolean(URL && KEY)

export const supabase = hasSupabase
  ? createClient(URL, KEY, {
      auth: {
        // Persist session across reloads in localStorage and parse the
        // magic-link tokens that Supabase appends to the redirect URL.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

// Sends a magic-link email (passwordless). The link redirects back to
// `window.location.origin`, where Supabase reads the token, stores the
// session, and auth.onAuthStateChange fires.
export async function sendMagicLink(email) {
  if (!supabase) throw new Error('Supabase not configured')
  const redirectTo = window.location.origin + window.location.pathname
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  })
  if (error) throw error
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
}

export async function getSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}
