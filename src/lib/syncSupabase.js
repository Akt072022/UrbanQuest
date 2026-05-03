// Wires Supabase auth + storage to the zustand store.
//   • On sign-in:  push local evaluations to the cloud, then pull the
//                  full cloud set so the user picks up changes made
//                  from another device.
//   • On store change (practiced / skipped) while signed in: debounced
//                  upsert to the cloud. Deletes are propagated too.
//   • On sign-out: clear the user pointer in the store; local data
//                  stays in localStorage as before.
import { supabase, hasSupabase } from './supabase'
import { useStore } from '../store/useStore'
import { SKILL_LEVELS } from '../data/tools'

// XP weights mirror useStore.LEVEL_W. We re-derive xp from `practiced`
// after a pull so a fresh device that just signed in shows the correct
// XP / level / badges instead of starting at 0.
const LEVEL_W = Object.fromEntries(
  Object.entries(SKILL_LEVELS).map(([k, v]) => [k, v.weight])
)
function xpFromPracticed(practiced) {
  return Object.values(practiced).reduce(
    (s, lvl) => s + Math.round(10 * (LEVEL_W[lvl] ?? 0)),
    0,
  )
}

const PUSH_DEBOUNCE = 800   // ms — coalesce rapid swipe-rights
const ENABLED       = hasSupabase

let pushTimer  = null
let pendingPush = false
let lastPushed = { practiced: {}, skipped: [] }

function shallowSamePracticed(a, b) {
  const ka = Object.keys(a), kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) if (a[k] !== b[k]) return false
  return true
}

function shallowSameArray(a, b) {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  for (const x of a) if (!setB.has(x)) return false
  return true
}

async function pushDelta() {
  pushTimer = null
  pendingPush = false
  if (!ENABLED) return
  const session = (await supabase.auth.getSession()).data.session
  if (!session?.user) return
  const userId = session.user.id

  const { practiced, skipped } = useStore.getState()

  // ── Evaluations: upsert all current rows
  const evalRows = Object.entries(practiced).map(([tool_name, level]) => ({
    user_id: userId, tool_name, level,
  }))
  if (evalRows.length) {
    const { error } = await supabase.from('evaluations')
      .upsert(evalRows, { onConflict: 'user_id,tool_name' })
    if (error) console.warn('[sync] evaluations upsert failed:', error.message)
  }
  // Delete tools the user un-evaluated locally (i.e. were in lastPushed
  // but no longer in practiced).
  const removedEvals = Object.keys(lastPushed.practiced || {})
    .filter(k => !(k in practiced))
  if (removedEvals.length) {
    const { error } = await supabase.from('evaluations')
      .delete().eq('user_id', userId).in('tool_name', removedEvals)
    if (error) console.warn('[sync] evaluations delete failed:', error.message)
  }

  // ── Skipped: upsert + diff-delete
  const skipRows = skipped.map(tool_name => ({ user_id: userId, tool_name }))
  if (skipRows.length) {
    const { error } = await supabase.from('skipped_tools')
      .upsert(skipRows, { onConflict: 'user_id,tool_name' })
    if (error) console.warn('[sync] skipped upsert failed:', error.message)
  }
  const removedSkip = (lastPushed.skipped || []).filter(t => !skipped.includes(t))
  if (removedSkip.length) {
    const { error } = await supabase.from('skipped_tools')
      .delete().eq('user_id', userId).in('tool_name', removedSkip)
    if (error) console.warn('[sync] skipped delete failed:', error.message)
  }

  lastPushed = { practiced: { ...practiced }, skipped: [...skipped] }
}

function schedulePush() {
  pendingPush = true
  if (pushTimer) return
  pushTimer = setTimeout(pushDelta, PUSH_DEBOUNCE)
}

async function pullFull(userId) {
  const [{ data: evalRows, error: e1 },
         { data: skipRows, error: e2 }] = await Promise.all([
    supabase.from('evaluations')
      .select('tool_name,level').eq('user_id', userId),
    supabase.from('skipped_tools')
      .select('tool_name').eq('user_id', userId),
  ])
  if (e1) console.warn('[sync] evaluations fetch failed:', e1.message)
  if (e2) console.warn('[sync] skipped fetch failed:', e2.message)

  const cloud_practiced = Object.fromEntries(
    (evalRows || []).map(r => [r.tool_name, r.level]),
  )
  const cloud_skipped = (skipRows || []).map(r => r.tool_name)

  // Merge: local writes that the cloud doesn't have yet are kept and
  // pushed on the next debounced push (above).
  const { practiced, skipped } = useStore.getState()
  const merged_practiced = { ...cloud_practiced, ...practiced }
  const merged_skipped   = Array.from(new Set([...cloud_skipped, ...skipped]))

  useStore.setState({
    practiced: merged_practiced,
    skipped:   merged_skipped,
    // Pick the higher of the locally-tracked xp and the xp derived from
    // the merged set, so signing in on a fresh device restores progress
    // without ever clobbering an unsynced local gain.
    xp:        Math.max(useStore.getState().xp || 0, xpFromPracticed(merged_practiced)),
  })
  lastPushed = { practiced: { ...merged_practiced }, skipped: [...merged_skipped] }
  // Push merged set so the cloud catches up to anything that was local-only.
  schedulePush()
}

export function initSupabaseSync() {
  if (!ENABLED) return () => {}

  // Auth state watcher
  const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      useStore.setState({
        userId:    session.user.id,
        userEmail: session.user.email,
      })
      await pullFull(session.user.id)
    } else {
      useStore.setState({ userId: null, userEmail: null })
      lastPushed = { practiced: {}, skipped: [] }
    }
  })

  // Initial session
  supabase.auth.getSession().then(({ data }) => {
    if (data.session?.user) {
      useStore.setState({
        userId:    data.session.user.id,
        userEmail: data.session.user.email,
      })
      pullFull(data.session.user.id)
    }
  })

  // Push on every change to practiced / skipped (coalesced)
  const unsub = useStore.subscribe((state, prev) => {
    if (!state.userId) return
    if (state.practiced !== prev.practiced || state.skipped !== prev.skipped) {
      schedulePush()
    }
  })

  return () => {
    sub?.subscription?.unsubscribe?.()
    unsub?.()
  }
}
