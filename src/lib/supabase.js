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
//
// Callers may pass an explicit `redirectTo` so they can attach query
// params that should survive the email round-trip (e.g. a base64 of
// the project the user typed before sign-in — `localStorage` isn't
// reliable across origins, so URL params are the defensive backup).
export async function sendMagicLink(email, redirectTo) {
  if (!supabase) throw new Error('Supabase not configured')
  const url = redirectTo || (window.location.origin + window.location.pathname)
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: url },
  })
  if (error) throw error
}

export async function signOut() {
  if (!supabase) return
  try {
    const { error } = await supabase.auth.signOut()
    if (error) console.warn('[supabase] signOut error:', error.message)
  } catch (err) {
    console.warn('[supabase] signOut threw:', err?.message || err)
  }
  // Belt-and-braces: even if onAuthStateChange doesn't fire (it
  // sometimes doesn't on stale sessions or stub clients), wipe the
  // persisted Supabase keys so a reload genuinely starts unsigned.
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('sb-') || k.startsWith('supabase.')) {
        localStorage.removeItem(k)
      }
    })
  } catch { /* localStorage might be locked-down */ }
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

  // Three-step dance because of the RLS gotcha:
  //   teams_create        → any authenticated user may INSERT
  //   teams_member_read   → only members may SELECT
  // At INSERT time the user is not yet in team_members, so a
  // .select().single() chained onto the insert returns 0 rows under
  // RLS and the .single() throws PGRST116. We instead:
  //   1. Generate the team id client-side and INSERT without select.
  //   2. Insert the team_members row so the user becomes a member.
  //   3. SELECT the team (now allowed).
  const teamId      = crypto.randomUUID()
  const invite_code = makeInviteCode()

  const { error: e1 } = await supabase
    .from('teams')
    .insert({
      id: teamId,
      name: name?.trim() || 'My team',
      city: city?.trim() || null,
      proj: proj || null,
      invite_code,
      created_by: user.id,
    })
  if (e1) {
    const detail = `[${e1.code || '?'}] ${e1.message}${e1.details ? ' — ' + e1.details : ''}`
    console.error('[teams] insert team failed:', e1)
    throw new Error('Could not create team: ' + detail)
  }

  const { error: e2 } = await supabase
    .from('team_members')
    .insert({ team_id: teamId, user_id: user.id, role: 'facilitator' })
  if (e2) {
    const detail = `[${e2.code || '?'}] ${e2.message}${e2.details ? ' — ' + e2.details : ''}`
    console.error('[teams] insert membership failed:', e2)
    // Best-effort orphan cleanup. The teams table has no DELETE
    // policy by default, so this may silently no-op — harmless.
    await supabase.from('teams').delete().eq('id', teamId)
    throw new Error('Could not add you to the team: ' + detail)
  }

  const { data: team, error: e3 } = await supabase
    .from('teams')
    .select('*')
    .eq('id', teamId)
    .single()
  if (e3) {
    console.error('[teams] post-insert select failed:', e3)
    // Fall back to a synthesised row so the caller still has
    // something to display — the team exists in the DB even if RLS
    // is somehow blocking the read here.
    return { id: teamId, name, city: city || null, proj: proj || null, invite_code, created_by: user.id }
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
