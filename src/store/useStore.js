import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { TOOLS, SKILL_LEVELS } from '../data/tools'
import { computeBadges } from '../data/badges'

const STORAGE_KEY = 'uq-v2'        // keep the storage slot stable; bump
                                   // schema version below for migrations
const SCHEMA_VERSION = 4
const LEVEL_W = Object.fromEntries(
  Object.entries(SKILL_LEVELS).map(([k, v]) => [k, v.weight])
)

// Diff badge unlocks between two states. Returns the IDs that are
// newly true in `next`, minus anything the user has already been
// notified about (so a re-rated card on a tier they already cleared
// doesn't re-pop the toast). Used by practiceTool / skipTool to
// queue spontaneous celebrations.
function badgesNewlyUnlocked(prevState, nextState, seenBadgeIds) {
  const beforeIds = new Set(
    computeBadges(prevState).filter(b => b.unlocked).map(b => b.id),
  )
  const seen = new Set(seenBadgeIds || [])
  return computeBadges(nextState)
    .filter(b => b.unlocked && !beforeIds.has(b.id) && !seen.has(b.id))
    .map(b => b.id)
}

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
      view: 'welcome',     // 'welcome'|'login'|'projectFit'|'map'|'explore'|'dashboard'|'facilitator'|'profile'
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
      // FIFO queue of badge IDs that have just unlocked but haven't
      // been shown to the user yet. Populated by practiceTool /
      // skipTool when a rating tips a predicate over its threshold.
      // The global <BadgeToaster /> consumes one at a time, animates
      // it in, then calls dequeueBadgeToast() (which also marks the
      // badge seen) so it never shows twice.
      pendingBadgeToasts: [],

      // ── Explore cursor — persisted so CONTINUE resumes where left ─
      eGate: null,
      eDim:  null,
      eIdx:  0,
      eFlipped: false,
      // Optional override of the gate/dim filter: an explicit list of
      // tool names to swipe through. Used by 'Rate this project's
      // methods' so the user can land directly on the AI shortlist
      // instead of hunting them down across the whole catalogue.
      // null = no override, fall back to gate/dim selection.
      // ePoolLabel is what the explore screen shows above the deck
      // when in pool mode (e.g. the project name).
      ePoolNames: null,
      ePoolLabel: null,
      // Where to go when the user clears all cards in the override
      // pool (project name + suggestions, etc). Defaults to projectFit.
      ePoolReturn: null,

      // ── Dashboard target gate (set when clicking a gate radar) ────
      dashboardGate: null,

      // ── Session (facilitator/participants) ─
      sessionId:   null,
      sessionRole: null,

      // ── Projects (multi-project support) ────────────────────
      // Each AI analysis creates a Project entry. `currentProjectId`
      // points at the one currently shown in the welcome / project-
      // fit / dashboard surfaces. Project shape:
      //   { id, name, desc, suggestions: [{tool, why}], createdAt, updatedAt }
      // `suggestions` keeps the hydrated `tool` reference for
      // ergonomic rendering; the sync layer dehydrates to
      // `{tool_name, why}` when persisting to Supabase.
      projects: [],
      currentProjectId: null,
      // Mirror of the current project's data — kept so existing
      // consumers that read projectContext / aiSuggestions don't
      // need to all change at once. Both are derived from
      // projects.find(p => p.id === currentProjectId).
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
      goLogin:       () => set({ view: 'login' }),

      // ── Project actions ─────────────────────────────────────
      // Create a new saved project from a fresh AI analysis. Sets
      // it as the active one so the rest of the app (ProjectFit,
      // workshop wizard) reads through projectContext / aiSuggestions
      // without needing to know about the projects array.
      addProject: ({ name, desc, suggestions }) => set(state => {
        const id = (typeof crypto?.randomUUID === 'function')
          ? crypto.randomUUID()
          : `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const now = new Date().toISOString()
        const newProject = {
          id,
          name: name || 'Untitled project',
          desc: desc || '',
          suggestions: Array.isArray(suggestions) ? suggestions : [],
          createdAt: now, updatedAt: now,
        }
        return {
          projects: [...(state.projects || []), newProject],
          currentProjectId: id,
          projectContext: { name: newProject.name, desc: newProject.desc },
          aiSuggestions:  newProject.suggestions,
        }
      }),

      // Switch to a previously-saved project. Loads its data into
      // the projectContext / aiSuggestions mirrors the rest of the
      // app reads from.
      selectProject: (id) => set(state => {
        const p = (state.projects || []).find(p => p.id === id)
        if (!p) return {}
        return {
          currentProjectId: id,
          projectContext:   { name: p.name, desc: p.desc },
          aiSuggestions:    p.suggestions || [],
        }
      }),

      // Patch the *current* project (e.g. when "Find more methods"
      // appends to the suggestion list, or the user renames it).
      // Bumps updatedAt and refreshes the mirror state.
      updateCurrentProject: (patch) => set(state => {
        if (!state.currentProjectId) return {}
        const projects = (state.projects || []).map(p =>
          p.id === state.currentProjectId
            ? { ...p, ...patch, updatedAt: new Date().toISOString() }
            : p,
        )
        const cur = projects.find(p => p.id === state.currentProjectId)
        return {
          projects,
          projectContext: cur ? { name: cur.name, desc: cur.desc } : state.projectContext,
          aiSuggestions:  cur?.suggestions || state.aiSuggestions,
        }
      }),

      // Remove a project. If it was the active one, fall back to
      // the most recently updated remaining entry (or null if none).
      deleteProject: (id) => set(state => {
        const projects = (state.projects || []).filter(p => p.id !== id)
        const wasCurrent = state.currentProjectId === id
        if (!wasCurrent) return { projects }
        const fallback = [...projects].sort((a, b) =>
          (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0] || null
        return {
          projects,
          currentProjectId: fallback?.id || null,
          projectContext:   fallback ? { name: fallback.name, desc: fallback.desc } : null,
          aiSuggestions:    fallback?.suggestions || [],
        }
      }),

      // Replace the entire projects list (called by syncSupabase
      // after an auth pull). Tries to preserve the active selection
      // if its id survives the pull, otherwise lands on the most
      // recent project so reload-then-continue works.
      setProjects: (arr) => set(state => {
        const projects = Array.isArray(arr) ? arr : []
        const stillActive = projects.find(p => p.id === state.currentProjectId)
        const fallback = stillActive
          || [...projects].sort((a, b) =>
              (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0]
          || null
        return {
          projects,
          currentProjectId: fallback?.id || null,
          projectContext:   fallback ? { name: fallback.name, desc: fallback.desc } : state.projectContext,
          aiSuggestions:    fallback?.suggestions || state.aiSuggestions,
        }
      }),

      // Legacy mirror setters — kept so existing callers (the chat
      // welcome flow that runs the AI before deciding to save, the
      // "find more methods" appender) keep working. They write only
      // to the mirror state, never to the projects array. Callers
      // that *should* persist now use addProject / updateCurrentProject.
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
          ePoolNames: null, ePoolLabel: null, ePoolReturn: null,
        }
      }),
      goExploreDim: (gate, dim) => set(state => {
        const pool = TOOLS.filter(t => t.g.includes(gate) && t.d?.includes(dim))
        return {
          view: 'explore',
          eGate: gate, eDim: dim,
          eIdx: resumeIdx(pool, state.practiced, state.skipped),
          eFlipped: false,
          ePoolNames: null, ePoolLabel: null, ePoolReturn: null,
        }
      }),

      // Custom-pool explore: take an explicit list of tool names
      // (typically a project's AI shortlist) and walk the swipe
      // deck through ONLY those, in order. ePoolReturn is the view
      // string the complete-screen routes back to when the deck is
      // cleared (defaults to projectFit so a project flow loops
      // back to its shortlist).
      goExplorePool: (names, { label = null, returnTo = 'projectFit' } = {}) => set(state => {
        const pool = (names || [])
          .map(n => TOOLS.find(t => t.n === n))
          .filter(Boolean)
        return {
          view: 'explore',
          eGate: null, eDim: null,
          eIdx: resumeIdx(pool, state.practiced, state.skipped),
          eFlipped: false,
          ePoolNames: names || [],
          ePoolLabel: label,
          ePoolReturn: returnTo,
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
        const nextPracticed = { ...state.practiced, [name]: level }
        const popIds = badgesNewlyUnlocked(
          { practiced: state.practiced, skipped: state.skipped },
          { practiced: nextPracticed,    skipped: newSkipped },
          state.seenBadgeIds,
        )
        return {
          practiced: nextPracticed,
          skipped:   newSkipped,
          xp:        state.xp + xpDelta,
          pendingBadgeToasts: popIds.length
            ? [...(state.pendingBadgeToasts || []), ...popIds]
            : state.pendingBadgeToasts,
        }
      }),

      // "Skip" — left swipe. Tool is hidden from the deck on resume but
      // still surfaceable from the dashboard if the user wants to revisit.
      skipTool: (name) => set(state => {
        if (state.skipped.includes(name)) return {}
        const nextSkipped = [...state.skipped, name]
        const popIds = badgesNewlyUnlocked(
          { practiced: state.practiced, skipped: state.skipped },
          { practiced: state.practiced, skipped: nextSkipped },
          state.seenBadgeIds,
        )
        return {
          skipped: nextSkipped,
          pendingBadgeToasts: popIds.length
            ? [...(state.pendingBadgeToasts || []), ...popIds]
            : state.pendingBadgeToasts,
        }
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

      // Pop the head of the pending-toasts queue and mark it seen
      // in one atomic update. The toaster calls this when the user
      // dismisses or the auto-hide timer fires.
      dequeueBadgeToast: () => set(state => {
        const queue = state.pendingBadgeToasts || []
        if (!queue.length) return {}
        const [head, ...rest] = queue
        const seen = new Set(state.seenBadgeIds || [])
        seen.add(head)
        return {
          pendingBadgeToasts: rest,
          seenBadgeIds: Array.from(seen),
        }
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
        pendingBadgeToasts: [],
        eGate: null, eDim: null, eIdx: 0, eFlipped: false,
        ePoolNames: null, ePoolLabel: null, ePoolReturn: null,
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
