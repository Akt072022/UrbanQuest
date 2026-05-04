// Persistence layer for live workshops. Each launched workshop is a
// row in `workshop_sessions`; every card a participant rates becomes
// a row in `session_responses`. The Team Dashboard reads these back
// to show history + evolution over time.
//
// All writes are fire-and-forget — the live UI keeps using the
// in-memory state arrays in FacilitatorView, persistence happens
// alongside without blocking the realtime broadcast loop. Errors
// are logged but never surfaced to participants.
import { supabase, hasSupabase } from './supabase'

export async function createSession({
  teamId, facilitatorId, roomId, mode, gate, dim, project, methodNames,
}) {
  if (!hasSupabase || !facilitatorId) return null
  const row = {
    team_id:         teamId || null,
    facilitator_id:  facilitatorId,
    room_id:         roomId,
    mode,
    gate:            gate ?? null,
    dim:             dim ?? null,
    project_name:    project?.name || null,
    project_desc:    project?.desc || null,
    method_names:    Array.isArray(methodNames) && methodNames.length > 0
                       ? methodNames : null,
  }
  const { data, error } = await supabase
    .from('workshop_sessions').insert(row).select('id').single()
  if (error) {
    console.warn('[sessionStore] createSession failed:', error.message)
    return null
  }
  return data.id
}

export async function endSession(sessionId) {
  if (!hasSupabase || !sessionId) return
  const { error } = await supabase
    .from('workshop_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) console.warn('[sessionStore] endSession failed:', error.message)
}

export async function recordResponse(sessionId, {
  kind, participantAnonId, participantUserId, toolName, payload,
}) {
  if (!hasSupabase || !sessionId) return
  const row = {
    session_id:           sessionId,
    participant_anon_id:  participantAnonId || 'anon',
    participant_user_id:  participantUserId || null,
    kind,
    tool_name:            toolName || null,
    payload:              payload || {},
  }
  const { error } = await supabase.from('session_responses').insert(row)
  if (error) console.warn('[sessionStore] recordResponse failed:', error.message)
}

export async function listSessionsForTeam(teamId, { limit = 20 } = {}) {
  if (!hasSupabase || !teamId) return []
  const { data, error } = await supabase
    .from('workshop_sessions')
    .select('*')
    .eq('team_id', teamId)
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.warn('[sessionStore] listSessionsForTeam failed:', error.message)
    return []
  }
  return data || []
}

export async function loadSessionFull(sessionId) {
  if (!hasSupabase || !sessionId) return null
  const [{ data: s, error: e1 },
         { data: r, error: e2 }] = await Promise.all([
    supabase.from('workshop_sessions').select('*').eq('id', sessionId).single(),
    supabase.from('session_responses').select('*').eq('session_id', sessionId)
      .order('created_at', { ascending: true }),
  ])
  if (e1) console.warn('[sessionStore] loadSessionFull (session):', e1.message)
  if (e2) console.warn('[sessionStore] loadSessionFull (responses):', e2.message)
  if (!s) return null
  return { session: s, responses: r || [] }
}

// Bulk fetch responses for a list of sessions in a single query —
// the Team Dashboard's evolution chart needs aggregated counts per
// session, and one round-trip is cheaper than N.
export async function loadResponsesForSessions(sessionIds) {
  if (!hasSupabase || !sessionIds?.length) return []
  const { data, error } = await supabase
    .from('session_responses')
    .select('session_id, kind, tool_name, payload, participant_user_id, participant_anon_id')
    .in('session_id', sessionIds)
  if (error) {
    console.warn('[sessionStore] loadResponsesForSessions failed:', error.message)
    return []
  }
  return data || []
}
