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
  if (!key) throw new Error('Mistral API key not configured')

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
    throw new Error(`Mistral HTTP ${res.status} ${txt.slice(0, 200)}`)
  }
  const json = await res.json()
  const content = json?.choices?.[0]?.message?.content
  if (!content) throw new Error('Mistral returned no content')

  let parsed
  try { parsed = JSON.parse(content) }
  catch { throw new Error('Mistral returned non-JSON content') }

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
