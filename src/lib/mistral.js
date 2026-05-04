// Mistral chat-completion wrapper used by the Project method-fit
// workshop to suggest methods for a specific project.
//
// We send the project name + description plus a compact catalogue of
// the 133 methods (name + gate(s) + dim(s) + first slice of definition)
// and ask the model for a 10–12-method shortlist with one-line
// rationale per pick. Output is constrained to JSON so the UI can
// render it as a list.
//
// The same `VITE_MISTRAL_API_KEY` used for Voxtral TTS is reused here.

import { TOOLS, GATE_LABEL, DIM_BY_ID } from '../data/tools'

const URL    = import.meta.env.VITE_MISTRAL_CHAT_URL || 'https://api.mistral.ai/v1/chat/completions'
const MODEL  = import.meta.env.VITE_MISTRAL_CHAT_MODEL || 'mistral-large-latest'

export const hasMistral = !!import.meta.env.VITE_MISTRAL_API_KEY

// One row per method: `- Persona [Impact; SO/SP]: One-line definition…`
// 133 rows × ~150 chars ≈ 20 kB — fits comfortably in any model's context.
function compactCatalogue() {
  return TOOLS.map(t => {
    const gates = (t.g || []).map(g => GATE_LABEL[g]).filter(Boolean).join('/')
    const dims  = (t.d || []).map(d => DIM_BY_ID[d]?.short).filter(Boolean).join('/')
    const def   = (t.def || '').replace(/\s+/g, ' ').slice(0, 100).trim()
    return `- ${t.n} [${gates}; ${dims}]${def ? ': ' + def : ''}`
  }).join('\n')
}

export async function suggestMethods({ name, desc }) {
  const key = import.meta.env.VITE_MISTRAL_API_KEY
  if (!key) throw new Error('AI is not configured.')

  const sys = [
    'You are an expert urban-planning and co-design method advisor.',
    'You only recommend methods from the provided catalogue — never invent names.',
    'Your goal is to help the facilitator focus the workshop on the highest-leverage methods for the specific project at hand.',
    'Output strict JSON only.',
  ].join(' ')

  const user = `Project: ${name?.trim() || 'Unnamed project'}

Description:
${desc?.trim() || '(no description provided)'}

From the catalogue below, recommend the 10 to 12 methods most likely to deliver value for THIS project. Spread your picks across gates and dimensions if it helps the team move forward. For each pick, give one short sentence (≈ 25 words max) explaining why it fits this specific project.

Return ONLY this JSON shape — no prose, no code fences:
{
  "suggestions": [
    { "name": "<exact method name from the catalogue>", "why": "<one short sentence>" }
  ]
}

Catalogue:
${compactCatalogue()}`

  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user',   content: user },
      ],
      temperature: 0.3,
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    // Surface a generic message to the UI; keep the raw body in the
    // console so the developer can still diagnose.
    if (txt) console.warn('[ai] HTTP', res.status, txt)
    throw new Error(`Analysis service returned an error (${res.status}).`)
  }
  const json = await res.json()
  const content = json?.choices?.[0]?.message?.content
  if (!content) throw new Error('Analysis returned no content.')

  let parsed
  try { parsed = JSON.parse(content) }
  catch { throw new Error('Analysis returned an unexpected response.') }

  const raw = Array.isArray(parsed?.suggestions) ? parsed.suggestions : []

  // Map names back to TOOLS entries. Models occasionally tweak casing
  // or add trailing punctuation, so we try exact, then case-insensitive
  // and ignore anything that doesn't match a real method.
  const out = []
  const seen = new Set()
  for (const s of raw) {
    if (!s || typeof s.name !== 'string') continue
    let tool = TOOLS.find(t => t.n === s.name)
    if (!tool) {
      const lc = s.name.toLowerCase().trim()
      tool = TOOLS.find(t => t.n.toLowerCase() === lc)
    }
    if (!tool || seen.has(tool.n)) continue
    seen.add(tool.n)
    out.push({ tool, why: String(s.why || '').trim() })
  }
  return out
}

// ── AI capability analysis ─────────────────────────────────────
// Reads the team's evaluation state and returns a small structured
// recommendation: a narrative + 3-5 actionable items the dashboard
// can render as cards. Used by the "AI insights" button on the
// Recommended Actions panel — never auto-fired (each call costs).
export async function analyzeTeamCapability({ practiced, scoresByDim, gateStats }) {
  const key = import.meta.env.VITE_MISTRAL_API_KEY
  if (!key) throw new Error('AI is not configured.')

  // Compact summary the model can reason over without the 133-row
  // catalogue (the Recommended Actions don't need to suggest from a
  // wider set than what's on the user's current map).
  const total       = Object.keys(practiced).length
  const byLevel     = { regular: 0, occasional: 0, theory: 0 }
  for (const lvl of Object.values(practiced)) byLevel[lvl] = (byLevel[lvl] || 0) + 1
  const dimSummary  = scoresByDim.map(d =>
    `- ${d.label}: ${d.count}/${d.total} (${d.score}%)`).join('\n')
  const gateSummary = gateStats.map(g =>
    `- ${GATE_LABEL[g.gate]}: ${g.done}/${g.total} (${g.pct}%)`).join('\n')

  const stage = total < 15 ? 'sparse'
              : total < 50 ? 'mixed'
              : 'rich'

  const sys = [
    'You are advising an urban planning team on how to grow their method capability.',
    'They are using a 133-method catalogue across 4 gates (Impact, Fit, Anchoring, Sustainability) and 6 dimensions (Spatial, Heritage, Social, Environmental, Economic, Regulation).',
    'Recommend ONLY methods that are in the catalogue. Output strict JSON.',
  ].join(' ')

  const user = `Team capability snapshot:
- Total methods evaluated: ${total} of ${TOOLS.length}
- At regular practice level: ${byLevel.regular}
- At occasional level: ${byLevel.occasional}
- At theoretical-only level: ${byLevel.theory}
- Stage: ${stage}

Coverage by dimension:
${dimSummary}

Coverage by gate:
${gateSummary}

Catalogue (compact):
${TOOLS.map(t => `- ${t.n} [g:${(t.g || []).join(',')}; d:${(t.d || []).join('/')}]`).join('\n')}

Based on this snapshot:
${stage === 'sparse'
  ? '- The team has barely populated its capability map. Recommend 3 specific WORKSHOPS or CHALLENGES they should run next to fill in the most useful diagnostic data (e.g., "Run a triage on the dimensions with 0% coverage", "Have each team member rate 5 methods they use most"). Do NOT suggest individual methods to evaluate yet — the priority is to get more data.'
  : stage === 'mixed'
  ? '- Mid-stage. Recommend 2 workshops/challenges to deepen the weakest gate or dimension AND 2 specific methods (by exact name) to evaluate next that would unlock the best follow-up insight.'
  : '- They have rich data. Recommend 3 methods (by exact name) to APPLY now on a typical urban transformation project (preferably methods at regular practice level), and 3 methods to LEARN next (theoretical-only or untouched, in their weakest dimensions).'}

Return ONLY this JSON shape — no prose, no code fences:
{
  "narrative": "<one short paragraph (≤ 60 words) framing the team's current state>",
  "actions": [
    {
      "type": "workshop" | "evaluate" | "apply" | "learn",
      "title": "<imperative ≤ 8 words>",
      "method_name": "<exact catalogue name>" | null,
      "rationale": "<one short sentence explaining why this matters now>"
    }
  ]
}`

  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user',   content: user },
      ],
      temperature: 0.4,
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    if (txt) console.warn('[ai] HTTP', res.status, txt)
    throw new Error(`Analysis service returned an error (${res.status}).`)
  }
  const json = await res.json()
  const content = json?.choices?.[0]?.message?.content
  if (!content) throw new Error('Analysis returned no content.')
  let parsed
  try { parsed = JSON.parse(content) }
  catch { throw new Error('Analysis returned an unexpected response.') }

  // Normalize: resolve method_name to a TOOLS entry where possible.
  const actions = Array.isArray(parsed?.actions) ? parsed.actions.map(a => {
    const name = (a?.method_name || '').trim()
    let tool = null
    if (name) {
      tool = TOOLS.find(t => t.n === name)
      if (!tool) tool = TOOLS.find(t => t.n.toLowerCase() === name.toLowerCase())
    }
    return {
      type:      String(a?.type || '').toLowerCase(),
      title:     String(a?.title || '').trim(),
      rationale: String(a?.rationale || '').trim(),
      tool,
    }
  }).filter(a => a.title) : []

  return {
    narrative: String(parsed?.narrative || '').trim(),
    actions,
    stage,
  }
}
