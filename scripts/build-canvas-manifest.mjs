// Scans public/canvas/ for OVPM-NNN-*.pptx files and writes a static
// manifest at src/data/canvas.js that the app uses to look up the URL
// of each tool's source canvas (and where to find its slide-3 thumbnail).
// Run after dropping new files into public/canvas/:
//   node scripts/build-canvas-manifest.mjs
import { readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const SRC  = join(ROOT, 'public', 'canvas')
const OUT  = join(ROOT, 'src', 'data', 'canvas.js')

const files = readdirSync(SRC).filter(f => /^OVPM-\d{3}-.*\.pptx$/i.test(f))
const map = {}
for (const f of files) {
  const id = parseInt(f.slice(5, 8), 10)
  map[id] = f
}
const ids = Object.keys(map).map(Number).sort((a, b) => a - b)
const last = ids[ids.length - 1] || 0

const lines = []
lines.push('// AUTO-GENERATED — run `node scripts/build-canvas-manifest.mjs`')
lines.push('// to refresh after adding/removing files in public/canvas/.')
lines.push('')
lines.push('// Index 0 unused; index N → filename for tool id N (or null).')
lines.push('export const CANVAS_FILES = [')
lines.push('  null,')
for (let i = 1; i <= last; i++) {
  const f = map[i]
  lines.push(f ? `  ${JSON.stringify(f)},` : '  null,')
}
lines.push(']')
lines.push('')
lines.push('export function canvasUrl(toolId) {')
lines.push('  const file = CANVAS_FILES[toolId]')
lines.push('  return file ? `/canvas/${file}` : null')
lines.push('}')
lines.push('')
lines.push('export function canvasThumbUrl(toolId) {')
lines.push('  const id = String(toolId).padStart(3, "0")')
lines.push('  return `/canvas-thumbs/OVPM-${id}.png`')
lines.push('}')
lines.push('')

writeFileSync(OUT, lines.join('\n'), 'utf8')
console.log(`wrote ${OUT}`)
console.log(`  ${ids.length} canvases (id range ${ids[0]}..${last})`)
