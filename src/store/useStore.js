import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { TOOLS, SKILL_LEVELS } from '../data/tools'

const STORAGE_KEY = 'uq-v2'        // keep the storage slot stable; bump
                                   // schema version below for migrations
const SCHEMA_VERSION = 3
const LEVEL_W = Object.fromEntries(
  Object.entries(SKILL_LEVELS).map(([k, v]) => [k, v.weight])
)

// First tool in `pool` that the user hasn't yet evaluated nor skipped.
// Returns 0 when everything is done so the user can browse from the top.
function resumeIdx(pool, practiced, skipped) {
  if (!pool.length) return 0
  const skip = skipped instanceof Set ? skipped : new Set(skipped || [])
  const idx = pool.findIndex(t => !practiced[t.n] && !skip.has(t.n))
  // All done → land on the "complete" screen (idx === pool.length).
  // Only fresh state (nothing touched yet) returns 0.
  return idx >= 0 ? idx : pool.length
}

export const useStore = create(
  persist(
    (set, get) => ({
      // ── Core state ─────────────────────────
      view: 'welcome',     // 'welcome'|'projectFit'|'map'|'explore'|'dashboard'|'facilitator'|'profile'
      team: null,          // { name, city, proj }
      practiced: {},       // { [toolName]: 'regular' | 'occasional' | 'theory' }
      skipped:   [],       // [toolName] — explicitly passed-over for now
      flagged:   [],       // legacy bucket (no new writes); kept for migration
      xp: 0,
      // Badge IDs the user has already been notified about. Persisted
      // so a badge popup never re-fires for an old achievement after
      // a reload. Computed-vs-seen diff drives the "you just earned"
      // surfaces on DimComplete / GateComplete.
      seenBadgeIds: [],

      // ── Explore cursor — persisted so CONTINUE resumes where left ─
      eGate: null,
      eDim:  null,
      eIdx:  0,
      eFlipped: false,

      // ── Dashboard target gate (set when clicking a gate radar) ────
      dashboardGate: null,

      // ── Session (facilitator/participants) ─
      sessionId:   null,
      sessionRole: null,

      // ── Project method-fit (Phase 1 hero) ──────────────────
      // The user's current project description and the AI shortlist
      // generated from it. Persisted so a reload after typing a
      // project doesn't lose the suggestions. `aiSuggestions` is
      // an array of { tool: { n, g, d, ... }, why: string } picked
      // from the catalogue by suggestMethods().
      projectContext: null,    // { name, desc } | null
      aiSuggestions:  [],

      // ── Auth (set by syncSupabase, never persisted) ────────
      userId:    null,
      userEmail: null,
      // Cached list of teams the signed-in user belongs to. Refreshed
      // on auth pulls; never persisted (re-derived from Supabase).
      teams:         [],
      // Active team for tagging new evaluations + scoping the team
      // dashboard. Persisted so the same team stays selected across
      // reloads even when offline.
      currentTeamId: null,

      // ── Actions ────────────────────────────
      startGame: (team) => set((state) => ({
        team,
        xp: (state.xp || 0) + 5,
        view: 'map',
      })),

      // goMap intentionally KEEPS eGate / eDim set so the map can
      // surface "continue with <last dim>" pointing back to wherever
      // the user just came from. They get overwritten on the next
      // goExplore / goExploreDim call.
      goMap:         () => set({ view: 'map', eFlipped: false }),
      goDashboard:   (gate = null) => set({ view: 'dashboard', dashboardGate: gate }),
      goFacilitator: () => set({ view: 'facilitator' }),
      goProfile:     () => set({ view: 'profile' }),
      goProjectFit:  () => set({ view: 'projectFit' }),
      goWelcome:     () => set({ view: 'welcome' }),

      // Persist whatever the user typed about their project + the
      // AI shortlist that came back. Both shared with the workshop
      // wizard so "use these methods in a workshop" is a one-tap
      // hand-off instead of a re-prompt.
      setProjectContext: (ctx) => set({ projectContext: ctx }),
      setAiSuggestions:  (arr) => set({ aiSuggestions: Array.isArray(arr) ? arr : [] }),

      // Phase 1 deferred-auth helper — when a user wants to "browse"
      // without filling in the welcome form, give them a default
      // team blob so navbar / dashboard / etc keep working without
      // a sweep. They can rename it later from Profile.
      ensureDefaultTeam: () => set(state => state.team
        ? {}
        : { team: { name: 'My team', city: '', proj: 'mixed' } }),

      // Resume at the first un-touched tool of the gate (or dim).
      goExplore: (gate) => set(state => {
        const pool = TOOLS.filter(t => t.g.includes(gate))
        return {
          view: 'explore',
          eGate: gate, eDim: null,
          eIdx: resumeIdx(pool, state.practiced, state.skipped),
          eFlipped: false,
        }
      }),
      goExploreDim: (gate, dim) => set(state => {
        const pool = TOOLS.filter(t => t.g.includes(gate) && t.d?.includes(dim))
        return {
          view: 'explore',
          eGate: gate, eDim: dim,
          eIdx: resumeIdx(pool, state.practiced, state.skipped),
          eFlipped: false,
        }
      }),

      flipCard: () => set({ eFlipped: true }),

      // "I know it" — record skill level. XP is only awarded on the
      // delta: the first time a tool is evaluated, or when the user
      // upgrades the level (theory → occasional → regular). Re-tapping
      // the same level on an already-evaluated tool yields no XP, so
      // the user can revisit cards without farming the score.
      practiceTool: (name, level = 'regular') => set(state => {
        const w        = LEVEL_W[level] ?? 0
        const prevLvl  = state.practiced[name] ?? null
        const prevW    = LEVEL_W[prevLvl] ?? 0
        const xpDelta  = Math.max(0, Math.round(10 * (w - prevW)))
        const newSkipped = state.skipped.includes(name)
          ? state.skipped.filter(n => n !== name)
          : state.skipped
        return {
          practiced: { ...state.practiced, [name]: level },
          skipped:   newSkipped,
          xp:        state.xp + xpDelta,
        }
      }),

      // "Skip" — left swipe. Tool is hidden from the deck on resume but
      // still surfaceable from the dashboard if the user wants to revisit.
      skipTool: (name) => set(state => {
        if (state.skipped.includes(name)) return {}
        return { skipped: [...state.skipped, name] }
      }),

      // Legacy — kept so callers compile, but no longer wired to UI.
      flagTool: (name) => set(state => {
        if (state.flagged.includes(name)) return {}
        return { flagged: [...state.flagged, name] }
      }),

      nextCard: () => set(state => ({ eIdx: state.eIdx + 1, eFlipped: false })),
      // Free back/forth navigation — does NOT change practiced or
      // skipped state. Lets the user re-read a card or move ahead
      // without committing to "I know it" or "I don't know it".
      prevCard: () => set(state => ({
        eIdx: Math.max(0, state.eIdx - 1),
        eFlipped: false,
      })),
      goCard: (idx) => set({ eIdx: Math.max(0, idx | 0), eFlipped: false }),

      setSession: (id, role) => set({ sessionId: id, sessionRole: role }),

      // Append badge IDs to the seen list (deduplicated). Called when
      // the user dismisses a "you just earned" surface — once seen,
      // the badge disappears from the celebration UI but remains
      // unlocked on Profile forever.
      markBadgesSeen: (ids) => set(state => {
        const cur = new Set(state.seenBadgeIds || [])
        for (const id of (ids || [])) cur.add(id)
        return { seenBadgeIds: Array.from(cur) }
      }),

      // Team membership setters — populated by syncSupabase after auth
      // pulls / team CRUD calls in ProfileView.
      setTeams: (arr) => set({ teams: Array.isArray(arr) ? arr : [] }),
      setCurrentTeamId: (id) => set({ currentTeamId: id || null }),

      reset: () => set({
        view: 'welcome',
        team: null,
        practiced: {},
        skipped: [],
        flagged: [],
        xp: 0,
        seenBadgeIds: [],
        eGate: null, eDim: null, eIdx: 0, eFlipped: false,
        dashboardGate: null,
        sessionId: null, sessionRole: null,
        // Note: teams/currentTeamId are not reset — they belong to the
        // signed-in account, not the local game state.
      }),
    }),
    {
      name:    STORAGE_KEY,
      version: SCHEMA_VERSION,
      // Don't persist auth or the cached teams list — they're
      // re-hydrated from Supabase on every page load. `currentTeamId`
      // *is* persisted so the same active team stays selected even
      // when offline.
      partialize: (s) => {
        const { userId, userEmail, teams, ...rest } = s
        return rest
      },
      // v2 → v3: practiced was string[]. Convert to {name: 'regular'} so
      // existing users don't lose their evaluations. Old "flagged" tools
      // (= "I know it without doing it") become 'theory' level.
      migrate: (persisted, fromVersion) => {
        if (!persisted) return persisted
        if (fromVersion >= SCHEMA_VERSION) return persisted
        const out = { ...persisted }
        if (Array.isArray(persisted.practiced)) {
          out.practiced = Object.fromEntries(
            persisted.practiced.map(n => [n, 'regular']),
          )
        } else if (!persisted.practiced || typeof persisted.practiced !== 'object') {
          out.practiced = {}
        }
        if (Array.isArray(persisted.flagged)) {
          for (const n of persisted.flagged) {
            if (!out.practiced[n]) out.practiced[n] = 'theory'
          }
        }
        if (!Array.isArray(out.skipped)) out.skipped = []
        out.flagged = []
        return out
      },
    }
  )
)
