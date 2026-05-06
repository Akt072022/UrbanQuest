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
  // Wipe persisted tokens FIRST. supabase.auth.signOut() goes through
  // the same internal lock as getUser/refreshSession, which is what
  // gets stuck when the cached session was issued under a different
  // API key (e.g. project switched anon → publishable key). Clearing
  // localStorage up-front guarantees a reload starts unsigned even
  // if the lib call below hangs and we never await it.
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('sb-') || k.startsWith('supabase.')) {
        localStorage.removeItem(k)
      }
    })
  } catch { /* localStorage might be locked-down */ }
  // Fire-and-forget the SDK call — we don't await it, because if the
  // auth lock is wedged it never resolves. The localStorage wipe
  // already achieved the same effect from the user's perspective.
  try {
    supabase.auth.signOut()?.catch?.(() => {})
  } catch { /* swallow */ }
}

export async function getSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

// Shortcut for "who's signed in right now?". Returns null if nobody.
// Uses getSession() (cached, sync-ish — never blocks) instead of
// getUser() (which makes a network call to /auth/v1/user and gets
// stuck behind the auth-js lock when the cached session JWT no
// longer matches the project's API key configuration).
async function currentUserId() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data?.session?.user?.id || null
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
  const uid = await currentUserId()
  if (!uid) return []
  const { data, error } = await supabase
    .from('team_members')
    .select(`
      role,
      joined_at,
      teams ( id, name, city, proj, invite_code, created_at, created_by )
    `)
    .eq('user_id', uid)
  if (error) {
    console.warn('[teams] listMyTeams failed:', error.message)
    return []
  }
  return (data || [])
    .filter(r => r.teams)
    .map(r => ({ ...r.teams, role: r.role, joined_at: r.joined_at }))
}

// Wrap a Supabase op so a single hung step (paused project waking up,
// flaky network) can't blow the whole budget. Each step gets its own
// short timeout — when one trips, we throw an error that *names the
// step*, so the surfaced message tells the user which call stalled
// instead of an opaque "timed out".
function withStepTimeout(promise, ms, stepLabel) {
  let timer
  const timeoutP = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${stepLabel} stalled after ${Math.round(ms/1000)}s`)),
      ms,
    )
  })
  return Promise.race([promise, timeoutP]).finally(() => clearTimeout(timer))
}

export async function createTeam({ name, city, proj }) {
  if (!supabase) throw new Error('Auth is not configured.')

  // Step-by-step timing log. If something hangs the user can copy
  // these out of the console and we know exactly which call stalled.
  const t0 = performance.now()
  const tag = (label) =>
    console.log(`[teams.create] ${label} +${Math.round(performance.now() - t0)}ms`)
  tag('start')

  // Resolve the user id from the cached session — never call getUser()
  // or refreshSession(), both of which serialise on the supabase-js
  // internal auth lock. That lock wedges if the persisted session
  // JWT was issued under a different API-key configuration than the
  // project currently uses (typical after a project's anon-key →
  // publishable-key migration), and once wedged every auth method
  // hangs forever. getSession() reads from memory/storage, can't
  // hang, and gives us the only field we actually need (user.id).
  const uid = await currentUserId()
  tag('session loaded')
  if (!uid) throw new Error('Sign in first — no active session.')

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

  // First write gets a longer budget — Supabase free-tier projects
  // pause after a week of inactivity and the first request takes
  // ~5-15s to spin them back up. Subsequent calls are fast.
  const { error: e1 } = await withStepTimeout(
    supabase.from('teams').insert({
      id: teamId,
      name: name?.trim() || 'My team',
      city: city?.trim() || null,
      proj: proj || null,
      invite_code,
      created_by: uid,
    }),
    25000, 'insert teams',
  )
  tag('insert teams done')
  if (e1) {
    const detail = `[${e1.code || '?'}] ${e1.message}${e1.details ? ' — ' + e1.details : ''}`
    console.error('[teams.create] insert team failed:', e1)
    throw new Error('Could not create team: ' + detail)
  }

  const { error: e2 } = await withStepTimeout(
    supabase.from('team_members')
      .insert({ team_id: teamId, user_id: uid, role: 'facilitator' }),
    10000, 'insert team_members',
  )
  tag('insert team_members done')
  if (e2) {
    const detail = `[${e2.code || '?'}] ${e2.message}${e2.details ? ' — ' + e2.details : ''}`
    console.error('[teams.create] insert membership failed:', e2)
    await supabase.from('teams').delete().eq('id', teamId)
    throw new Error('Could not add you to the team: ' + detail)
  }

  const { data: team, error: e3 } = await withStepTimeout(
    supabase.from('teams').select('*').eq('id', teamId).single(),
    10000, 'select teams',
  )
  tag('select teams done')
  if (e3) {
    console.error('[teams.create] post-insert select failed:', e3)
    return { id: teamId, name, city: city || null, proj: proj || null, invite_code, created_by: uid }
  }
  return team
}

export async function joinTeamByCode(rawCode) {
  if (!supabase) throw new Error('Auth is not configured.')
  const code = (rawCode || '').trim().toUpperCase()
  if (!code) throw new Error('Enter an invite code.')

  const uid = await currentUserId()
  if (!uid) throw new Error('Sign in first — no active session.')

  // The RPC bypasses RLS inside its body and returns at most one row
  // matching the exact invite code, so we don't leak the team
  // directory.
  const { data, error } = await withStepTimeout(
    supabase.rpc('lookup_team_by_invite', { p_code: code }),
    15000, 'lookup_team_by_invite',
  )
  if (error) throw new Error(error.message)
  const team = data?.[0]
  if (!team) throw new Error('Invite code not found.')

  // Idempotent — primary key (team_id, user_id) makes a duplicate
  // join an explicit conflict, which we treat as success.
  const { error: e2 } = await withStepTimeout(
    supabase.from('team_members').upsert(
      { team_id: team.id, user_id: uid, role: 'participant' },
      { onConflict: 'team_id,user_id', ignoreDuplicates: true },
    ),
    10000, 'insert team_members',
  )
  if (e2 && !/duplicate|conflict/i.test(e2.message)) throw new Error(e2.message)
  return team
}

export async function leaveTeam(teamId) {
  if (!supabase) return
  const uid = await currentUserId()
  if (!uid) return
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', uid)
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

// Roster with emails — backed by the SECURITY DEFINER RPC
// `list_team_members` because auth.users isn't directly readable
// from the client. The RPC enforces team-membership before
// returning any rows, so the email surface is strictly to teammates.
export async function fetchTeamRoster(teamId) {
  if (!supabase) return []
  const { data, error } = await supabase
    .rpc('list_team_members', { p_team_id: teamId })
  if (error) {
    console.warn('[teams] list_team_members failed:', error.message)
    return []
  }
  return data || []
}
