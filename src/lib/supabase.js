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

// ── Team helpers ──────────────────────────────────────────────
// Phase 1 of the workshop dashboard: surface team_id alongside
// every evaluation so cross-member aggregation becomes possible.

// Generate a random short code (avoid 0/O/1/I to dodge OCR confusion).
function makeInviteCode(len = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]
  return s
}

export async function listMyTeams() {
  if (!supabase) return []
  // RLS: teams_member_read scopes the join naturally to teams the
  // caller belongs to, so a wide select is safe here.
  const { data, error } = await supabase
    .from('team_members')
    .select(`
      role,
      joined_at,
      teams ( id, name, city, proj, invite_code, created_at, created_by )
    `)
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
  if (error) {
    console.warn('[teams] listMyTeams failed:', error.message)
    return []
  }
  return (data || [])
    .filter(r => r.teams)
    .map(r => ({ ...r.teams, role: r.role, joined_at: r.joined_at }))
}

export async function createTeam({ name, city, proj }) {
  if (!supabase) throw new Error('Auth is not configured.')
  const userRes = await supabase.auth.getUser()
  const user = userRes.data.user
  if (!user) throw new Error('Sign in first.')

  // Pick a unique-enough code; collisions on 6 chars from a 32-char
  // alphabet are vanishingly rare at this scale, so a single attempt
  // is fine. If a collision ever surfaces we'll handle it then.
  const invite_code = makeInviteCode()
  const { data: team, error: e1 } = await supabase
    .from('teams')
    .insert({
      name: name?.trim() || 'My team',
      city: city?.trim() || null,
      proj: proj || null,
      invite_code,
      created_by: user.id,
    })
    .select()
    .single()
  if (e1) throw new Error(e1.message)

  // The creator becomes a facilitator member of their own team.
  const { error: e2 } = await supabase
    .from('team_members')
    .insert({ team_id: team.id, user_id: user.id, role: 'facilitator' })
  if (e2) {
    // Roll back the orphan team if the membership write fails.
    await supabase.from('teams').delete().eq('id', team.id)
    throw new Error(e2.message)
  }
  return team
}

export async function joinTeamByCode(rawCode) {
  if (!supabase) throw new Error('Auth is not configured.')
  const code = (rawCode || '').trim().toUpperCase()
  if (!code) throw new Error('Enter an invite code.')
  const userRes = await supabase.auth.getUser()
  const user = userRes.data.user
  if (!user) throw new Error('Sign in first.')

  // The RPC bypasses RLS inside its body and returns at most one row
  // matching the exact invite code, so we don't leak the team
  // directory.
  const { data, error } = await supabase
    .rpc('lookup_team_by_invite', { p_code: code })
  if (error) throw new Error(error.message)
  const team = data?.[0]
  if (!team) throw new Error('Invite code not found.')

  // Idempotent — primary key (team_id, user_id) makes a duplicate
  // join an explicit conflict, which we treat as success.
  const { error: e2 } = await supabase
    .from('team_members')
    .upsert(
      { team_id: team.id, user_id: user.id, role: 'participant' },
      { onConflict: 'team_id,user_id', ignoreDuplicates: true },
    )
  if (e2 && !/duplicate|conflict/i.test(e2.message)) throw new Error(e2.message)
  return team
}

export async function leaveTeam(teamId) {
  if (!supabase) return
  const userRes = await supabase.auth.getUser()
  const user = userRes.data.user
  if (!user) return
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
}

export async function fetchTeamMembers(teamId) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('team_members')
    .select('user_id, role, joined_at')
    .eq('team_id', teamId)
  if (error) {
    console.warn('[teams] fetchTeamMembers failed:', error.message)
    return []
  }
  return data || []
}
