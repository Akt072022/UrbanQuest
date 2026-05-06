import { useRef, useState, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import {
  GATE_LABEL, TOOLS, DIM_BY_ID,
  toolsForGate, toolsForGateDim, practicedForGate,
  DIMENSIONS, SKILL_LEVELS,
  scoreForGateDim,
} from '../data/tools'
import { canvasUrl, canvasThumbUrl, CANVAS_FILES } from '../data/canvas'
import { BADGES, computeBadges } from '../data/badges'
import { GateSymbol, stageFromRatio } from '../components/GateSymbol'
import { ScrappyButton, ScrappyChip } from '../components/ScrappyButton'
import { SwipeWrap } from '../components/SwipeWrap'

const INK = '#1C2530'
const YELLOW = '#FFC83D'
const TEAL = '#14B8A6'
const CORAL = '#FB7185'
const GATE_COL = ['','#F97316','#3B82F6','#10B981','#8B5CF6']

// Right-swipe rating zones — the further the user drags, the higher
// the commitment level. Thresholds tuned for ~280-360 px wide cards
// on mobile so transitions between zones feel snappy (~50 px each)
// and the top level is reachable without dragging past the screen
// edge. Each zone carries a hint so the band itself communicates
// what level the user is about to commit to.
const RIGHT_ZONES = [
  { threshold: 25,  label: 'READ ABOUT', hint: 'In theory only',  color: '#5A5550', value: 'theory' },
  { threshold: 80,  label: 'TRIED IT',   hint: 'A few times',     color: '#F97316', value: 'occasional' },
  { threshold: 140, label: 'I RUN IT',   hint: 'Routine practice', color: '#10B981', value: 'regular' },
]
// Single left-swipe drop target — mirror of one rightZones entry
// for the "new to me" rating. Threshold matches the right side's
// commitment band (140 px → top level) so left and right gestures
// feel symmetric.
const LEFT_ZONE = { threshold: 60, value: 'new' }

function gateRgba(g, a) {
  // RGB triples mirror GATE_COL above so any rgba() helper stays in
  // sync with the headline gate colours.
  const m = { 1: '249,115,22', 2: '59,130,246', 3: '16,185,129', 4: '139,92,246' }
  return `rgba(${m[g]},${a})`
}

// ── TTS ───────────────────────────────────────────────────────
// Default: browser's built-in SpeechSynthesis (free, local).
// To swap to an external TTS (e.g. Voxtral, OpenAI, ElevenLabs),
// implement the same shape as `browserSpeak` and wire it in
// `playTTS` below — see comment block in playTTS.
function browserSpeak(text, { onStart, onEnd } = {}) {
  if (!window.speechSynthesis) return null
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = 0.95
  const en = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('en'))
  if (en) u.voice = en
  u.onstart = () => onStart?.()
  u.onend   = () => onEnd?.()
  u.onerror = () => onEnd?.()
  window.speechSynthesis.speak(u)
  return {
    cancel: () => { window.speechSynthesis?.cancel() },
  }
}

export function stopTTS() {
  if (window.speechSynthesis) window.speechSynthesis.cancel()
}

// Voxtral TTS — Mistral's hosted text-to-speech API.
// Endpoint: POST https://api.mistral.ai/v1/audio/speech
// Body:     { input, model, voice_id, response_format }
// Response: application/json → { audio_data: "<base64-encoded MP3>" }
// We default to one of the built-in neutral English presets so no
// voice cloning / dashboard setup is needed. Override via env var if
// you want a different mood (e.g. en_paul_cheerful, gb_oliver_neutral)
// or a French voice (fr_marie_neutral). Full list of presets:
//   https://huggingface.co/spaces/mistralai/voxtral-tts-demo
async function voxtralSpeak(text, { onStart, onEnd } = {}) {
  const key   = import.meta.env.VITE_MISTRAL_API_KEY
  const url   = import.meta.env.VITE_MISTRAL_TTS_URL || 'https://api.mistral.ai/v1/audio/speech'
  const model = import.meta.env.VITE_MISTRAL_TTS_MODEL || 'voxtral-mini-tts-2603'
  const voice = import.meta.env.VITE_MISTRAL_TTS_VOICE_ID || 'en_paul_neutral'
  if (!key) return null

  let cancelled = false
  let audio = null
  try {
    const body = {
      input: text,
      model,
      voice_id: voice,
      response_format: 'mp3',
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.warn('[Voxtral TTS] HTTP', res.status, err)
      return null
    }

    const json = await res.json()
    const b64  = json?.audio_data
    if (!b64) {
      console.warn('[Voxtral TTS] response had no audio_data field')
      return null
    }
    if (cancelled) return null

    // base64 → bytes → Blob URL the <audio> element can play
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'audio/mpeg' })
    const objUrl = URL.createObjectURL(blob)

    audio = new Audio(objUrl)
    audio.onplay  = () => onStart?.()
    audio.onended = () => { onEnd?.(); URL.revokeObjectURL(objUrl) }
    audio.onerror = () => { onEnd?.(); URL.revokeObjectURL(objUrl) }
    audio.play().catch(() => onEnd?.())
  } catch (err) {
    console.warn('[Voxtral TTS] failed, falling back to browser:', err)
    return null
  }
  return {
    cancel: () => {
      cancelled = true
      if (audio) { audio.pause(); audio.currentTime = 0 }
    },
  }
}

export function playTTS(tool, { onStart, onEnd } = {}) {
  const text = [tool.n + '.', tool.def, 'Practitioner tip:', tool.t].join(' ')
  // 1) Try Voxtral first if the API key is set
  const tryVoxtral = voxtralSpeak(text, { onStart, onEnd })
  // voxtralSpeak is async; return a handle that cancels whichever
  // backend ends up playing (Voxtral or the browser fallback).
  let active = null
  tryVoxtral.then(handle => {
    if (handle) { active = handle }
    else { active = browserSpeak(text, { onStart, onEnd }) }   // fallback
  })
  return {
    cancel: () => { active?.cancel?.(); stopTTS() },
  }
}

// (PillButton removed — using shared ScrappyButton)

// ── Dim complete — shown when the user finishes a dim-specific
// deck (e.g. arriving from a dashboard suggestion that filtered to
// one dim, or from the new "Start with X" flow on the map). The
// previous behaviour fell through to GateComplete which celebrates
// the WHOLE gate's clearance — confusing when the user has only
// finished one slice of it. We surface a small, accurate summary +
// two clear next steps instead. ────────────────────────────────
function DimComplete({ gate, dim }) {
  const {
    goMap, goExploreDim, goReviewDim, goCard, eMode,
    practiced, skipped, seenBadgeIds, markBadgesSeen,
  } = useStore(useShallow(s => ({
    goMap:           s.goMap,
    goExploreDim:    s.goExploreDim,
    goReviewDim:     s.goReviewDim,
    goCard:          s.goCard,
    eMode:           s.eMode,
    practiced:       s.practiced,
    skipped:         s.skipped,
    seenBadgeIds:    s.seenBadgeIds,
    markBadgesSeen:  s.markBadgesSeen,
  })))
  const dimMeta = DIM_BY_ID[dim]
  const col     = dimMeta?.color || GATE_COL[gate]

  // Find the next dim of the same gate that still has un-touched tools.
  const skipSet = new Set(skipped || [])
  const nextDim = DIMENSIONS.find(d => {
    if (d.id === dim) return false
    const pool = toolsForGateDim(gate, d.id)
    return pool.some(t => !practiced[t.n] && !skipSet.has(t.n))
  })

  // Are there already-rated tools in this slice that the user
  // could revisit? Only surface the 'Review already-rated' CTA
  // when there's something to review — and only on the unreviewed
  // pass (after a 'reviewed' pass we'd just loop).
  const dimSlice = TOOLS.filter(t => t.g.includes(gate) && t.d?.includes(dim))
  const ratedCount = dimSlice.filter(t =>
    practiced[t.n] || skipSet.has(t.n)).length
  const showReviewCTA = eMode !== 'reviewed' && ratedCount > 0

  // Slice stats — drives the always-visible reward chip below the
  // headline. The user has finished the gate × dim intersection;
  // show how many methods they've picked up in *this dim across all
  // gates*, since that's what the dim badge tiers measure.
  const dimToolsAll  = TOOLS.filter(t => t.d?.includes(dim))
  const dimEvaluated = dimToolsAll.filter(t => practiced[t.n]).length
  const dimRegular   = dimToolsAll.filter(t => practiced[t.n] === 'regular').length

  // Newly-earned badges — unlocked AND not in seenBadgeIds. Dismiss
  // by hitting either CTA, which marks them seen so they never
  // re-fire on a later visit.
  const seenSet  = new Set(seenBadgeIds || [])
  const newBadges = computeBadges({ practiced, skipped })
    .filter(b => b.unlocked && !seenSet.has(b.id))
  const dismissBadges = () => {
    if (newBadges.length) markBadgesSeen(newBadges.map(b => b.id))
  }

  // Next un-earned tier within *this dim* — when the dim-complete
  // didn't itself trip a new badge (because the user already cleared
  // the dim's curious/familiar tiers earlier, say), still show the
  // ladder so the screen always has a reward signal: "you're 3 of 5
  // toward Familiar". Returns null if the dim is fully mastered.
  // Each tier carries the unit the user needs more of, so the
  // progress card can spell out exactly what 'N more' means
  // ('evaluate 3 more methods', 'run 3 more regularly') instead of
  // an ambiguous '3 more to unlock it'.
  const dimTiers = [
    { tier: 'Curious',      threshold: 1, current: dimEvaluated,
      unit: 'methods evaluated', verb: 'evaluate' },
    { tier: 'Familiar',     threshold: 5, current: dimEvaluated,
      unit: 'methods evaluated', verb: 'evaluate' },
    { tier: 'Practitioner', threshold: 3, current: dimRegular,
      unit: 'methods you run regularly', verb: 'run regularly' },
    { tier: 'Master',       threshold: Math.ceil(dimToolsAll.length * 0.5),
      current: dimRegular,
      unit: 'methods you run regularly', verb: 'run regularly' },
  ]
  const nextTier = dimTiers.find(t => t.current < t.threshold)

  return (
    <div className="anim-fadein" style={{ textAlign: 'center', padding: '40px 16px' }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: '#E6F4EC', border: `3px solid ${col}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 18px',
      }}>
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
          <path d="M5 13l4 4L19 7" stroke={col} strokeWidth="3"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div style={{
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontSize: 'clamp(28px,8vw,42px)', color: col, lineHeight: 1,
        textTransform: 'uppercase', letterSpacing: '.02em',
        padding: '0 16px',
      }}>
        {dimMeta?.label || 'Dimension'}
      </div>
      <div style={{
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontSize: 18, color: INK, marginTop: 8, marginBottom: 22,
        letterSpacing: '.05em',
      }}>
        DONE FOR {GATE_LABEL[gate].toUpperCase()}
      </div>

      <BadgeReward badges={newBadges} />

      {/* Fallback reward — guaranteed visual feedback when finishing
          the slice didn't itself trip a new badge. Shows progress
          toward the next un-reached tier of *this dim* so the user
          always leaves the screen with a sense of "I moved the
          needle". Hidden when a fresh badge already takes the spot. */}
      {newBadges.length === 0 && nextTier && (() => {
        const remaining = nextTier.threshold - nextTier.current
        // Resolve the actual badge object so we can render the
        // (locked) icon. dim badge ids are dim_<dim>_<tier-lower>.
        const badgeId = `dim_${dim}_${nextTier.tier.toLowerCase()}`
        const badge = BADGES.find(b => b.id === badgeId)
        return (
          <div style={{
            maxWidth: 360, margin: '0 auto 22px',
            padding: '14px 16px',
            background: '#FFFDF8',
            border: `2.5px solid ${col}`,
            borderRadius: 14,
            boxShadow: '3px 3px 0 ' + col,
          }}>
            {/* Eyebrow: 'You're working toward' so the panel reads
                as a goal-tracker, not a stat. */}
            <div style={{
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontWeight: 900, fontSize: 10, color: '#5A5550',
              letterSpacing: '.1em', textTransform: 'uppercase',
              textAlign: 'center', marginBottom: 8,
            }}>
              ✦ Next badge to unlock
            </div>
            {/* Locked badge icon — same silhouette treatment as the
                Profile screen's BadgeTile (filter: brightness(0)
                opacity(.4)) so the user reads 'badge, not earned'
                at a glance. Painted in greys with a dashed border
                instead of the dim's accent colour. */}
            {badge && (
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                margin: '0 auto 10px',
                background: '#D6CFC1',
                border: `2px dashed #9C958A`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, color: '#9C958A',
                overflow: 'hidden',
              }}>
                {badge.iconSrc ? (
                  <img src={badge.iconSrc} alt=""
                    draggable={false}
                    style={{
                      width: '88%', height: '88%', objectFit: 'contain',
                      clipPath: 'circle(50%)',
                      mixBlendMode: 'multiply',
                      filter: 'brightness(0) opacity(.4)',
                      userSelect: 'none', pointerEvents: 'none',
                    }} />
                ) : badge.icon}
              </div>
            )}
            {/* Badge name — the actual reward. Greyed out to match
                the locked icon above. */}
            <div style={{
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontWeight: 900, fontSize: 18, color: '#7B746A',
              textAlign: 'center', lineHeight: 1.1, marginBottom: 10,
              textTransform: 'uppercase', letterSpacing: '.04em',
            }}>
              {dimMeta?.label} · {nextTier.tier}
            </div>
            {/* Progress label that actually names the unit, so
                'N / M' isn't a riddle. */}
            <div style={{
              fontSize: 12, color: '#3F3A36', lineHeight: 1.4,
              textAlign: 'center', marginBottom: 6,
            }}>
              <b style={{
                fontFamily: 'Barlow Condensed, Impact, sans-serif',
                fontSize: 16, color: INK,
              }}>{nextTier.current} of {nextTier.threshold}</b>
              {' '}{nextTier.unit}
            </div>
            <div style={{
              position: 'relative',
              height: 10, borderRadius: 6,
              background: '#F2EDE4',
              border: `2px solid ${INK}`,
              overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${Math.min(100, Math.round(100 * nextTier.current / nextTier.threshold))}%`,
                background: col,
                transition: 'width .35s ease',
              }} />
            </div>
            <div style={{
              fontSize: 12, color: '#5A5550', lineHeight: 1.45,
              textAlign: 'center', marginTop: 10,
            }}>
              {remaining === 1
                ? `${nextTier.verb.charAt(0).toUpperCase()}${nextTier.verb.slice(1)} 1 more method to earn this badge.`
                : `${nextTier.verb.charAt(0).toUpperCase()}${nextTier.verb.slice(1)} ${remaining} more methods to earn this badge.`}
            </div>
          </div>
        )
      })()}

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        maxWidth: 320, margin: '0 auto',
      }}>
        {nextDim && (
          <ScrappyButton
            onClick={() => { dismissBadges(); goExploreDim(gate, nextDim.id) }}
            color={YELLOW}>
            ▼ NEXT: {nextDim.label.toUpperCase()} →
          </ScrappyButton>
        )}
        {showReviewCTA && (
          <ScrappyButton
            onClick={() => { dismissBadges(); goReviewDim(gate, dim) }}
            color="#FFFFFF">
            REVIEW MY {ratedCount} RATED METHODS
          </ScrappyButton>
        )}
        <ScrappyButton onClick={() => { dismissBadges(); goMap() }} color="#FFFFFF">
          ← BACK TO MAP
        </ScrappyButton>
      </div>
    </div>
  )
}

// ── Reward strip — celebrates badges the user has unlocked but
//   not yet been notified about. Compact "trophy + name" tiles
//   under the celebration headline. Hides when there's nothing
//   newly earned. ────────────────────────────────────────────────
function BadgeReward({ badges }) {
  if (!badges?.length) return null
  return (
    <div style={{
      maxWidth: 360, margin: '0 auto 22px',
      padding: '12px 14px',
      background: '#FFFDF8',
      border: `2.5px solid ${INK}`, borderRadius: 14,
      boxShadow: '3px 3px 0 ' + INK,
    }}>
      <div style={{
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontWeight: 900, fontSize: 11, color: '#5A5550',
        letterSpacing: '.08em', textTransform: 'uppercase',
        marginBottom: 8, textAlign: 'center',
      }}>
        ✦ {badges.length} new badge{badges.length === 1 ? '' : 's'}
      </div>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {badges.map(b => (
          <div key={b.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px',
            background: b.col + '18',
            border: `2px solid ${b.col}`,
            borderRadius: 10,
            animation: 'badge-pop .35s cubic-bezier(.4,0,.2,1)',
          }}>
            <div style={{
              flexShrink: 0,
              width: 36, height: 36, borderRadius: '50%',
              background: '#FFFFFF',
              border: `2px solid ${b.col}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
              overflow: 'hidden',
            }}>
              {b.iconSrc ? (
                <img src={b.iconSrc} alt=""
                  draggable={false}
                  style={{
                    width: '88%', height: '88%', objectFit: 'contain',
                    clipPath: 'circle(50%)',
                    mixBlendMode: 'multiply',
                  }} />
              ) : b.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{
                fontFamily: 'Barlow Condensed, Impact, sans-serif',
                fontWeight: 900, fontSize: 14, color: INK,
                letterSpacing: '.02em',
                lineHeight: 1.05,
                whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{b.name}</div>
              <div style={{
                fontSize: 11, color: '#5A5550', marginTop: 2, lineHeight: 1.3,
              }}>{b.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes badge-pop {
          from { transform: scale(.7); opacity: 0; }
          to   { transform: scale(1);  opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ── Gate complete celebration ─────────────────────────────────
function GateComplete({ gate }) {
  const {
    goMap, goCard, practiced, skipped, seenBadgeIds, markBadgesSeen,
  } = useStore(useShallow(s => ({
    goMap:           s.goMap,
    goCard:          s.goCard,
    practiced:       s.practiced,
    skipped:         s.skipped,
    seenBadgeIds:    s.seenBadgeIds,
    markBadgesSeen:  s.markBadgesSeen,
  })))
  const tools = toolsForGate(gate)
  const pr    = practicedForGate(gate, practiced)
  const seenSet  = new Set(seenBadgeIds || [])
  const newBadges = computeBadges({ practiced, skipped })
    .filter(b => b.unlocked && !seenSet.has(b.id))
  const dismissBadges = () => {
    if (newBadges.length) markBadgesSeen(newBadges.map(b => b.id))
  }
  const col   = GATE_COL[gate]

  // Per-dim scores → drive the same radar polygon as the map.
  const dims = DIMENSIONS.map(dim => ({
    id:    dim.id,
    total: toolsForGateDim(gate, dim.id).length,
    score: scoreForGateDim(gate, dim.id, practiced),
  }))
  const RAD = 92
  const angles = [30, 90, 150, 210, 270, 330].map(a => a * Math.PI / 180)
  const polyStr = (radii) => angles.map((a, i) => {
    const r = radii[i]
    return `${(r * Math.sin(a)).toFixed(1)},${(-r * Math.cos(a)).toFixed(1)}`
  }).join(' ')
  const outerPts    = polyStr(angles.map(() => RAD))
  const progressPts = polyStr(dims.map(d => RAD * (d.total > 0 ? d.score / d.total : 0)))
  const VB = (RAD + 8) * 2

  return (
    <div className="anim-fadein" style={{ textAlign: 'center', padding: '40px 16px' }}>
      <div style={{
        width: VB, height: VB, margin: '0 auto 18px',
      }}>
        <svg width="100%" height="100%"
          viewBox={`${-VB/2} ${-VB/2} ${VB} ${VB}`}
          style={{ display: 'block', overflow: 'visible' }}>
          <polygon points={outerPts}
            fill="#F2EDE4" stroke={INK} strokeWidth={3}
            strokeLinejoin="round" />
          {angles.map((a, i) => (
            <line key={i}
              x1={0} y1={0}
              x2={(RAD * Math.sin(a)).toFixed(1)}
              y2={(-RAD * Math.cos(a)).toFixed(1)}
              stroke={INK} strokeWidth={1} opacity={0.18} />
          ))}
          <polygon points={progressPts}
            fill={col} fillOpacity={0.85}
            stroke={col} strokeWidth={3}
            strokeLinejoin="round" />
          <circle cx={0} cy={0} r={3} fill={INK} />
        </svg>
      </div>
      <div style={{
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontSize: 'clamp(28px,8vw,42px)', color: col, lineHeight: 1,
        textTransform: 'uppercase', letterSpacing: '.02em',
        padding: '0 16px',
      }}>
        {GATE_LABEL[gate]}
      </div>
      <div style={{
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontSize: 18, color: INK, marginTop: 8, marginBottom: 22,
        letterSpacing: '.05em',
      }}>
        CLEARED
      </div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '10px 20px', borderRadius: 999,
        background: '#FFFFFF', border: `2.5px solid ${INK}`,
        boxShadow: 'none', marginBottom: 22,
      }}>
        <span style={{ fontFamily: 'Barlow Condensed, Impact, sans-serif', fontSize: 26, color: col }}>
          {pr}/{tools.length}
        </span>
        <span style={{ fontFamily: '-apple-system, Helvetica Neue, sans-serif', fontSize: 14, color: '#5A5550', fontWeight: 700 }}>
          methods evaluated
        </span>
      </div>

      <BadgeReward badges={newBadges} />

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        maxWidth: 320, margin: '0 auto',
      }}>
        <ScrappyButton onClick={() => { dismissBadges(); goMap() }} color={YELLOW}>
          BACK TO MAP →
        </ScrappyButton>
        <ScrappyButton
          onClick={() => { dismissBadges(); goCard(0) }}
          color="#FFFFFF">
          REVIEW MY ANSWERS
        </ScrappyButton>
      </div>
    </div>
  )
}

// ── Pool complete — shown when the user finishes rating a custom
// list of methods (typically a project's AI shortlist). Routes
// back to wherever they came from with a clear "see results" CTA
// pointing at the dashboard's Project tab. ─────────────────────
function PoolComplete({ label, returnTo, count }) {
  const { goMap, goWelcome, goProjectFit, goDashboard, goCard } =
    useStore(useShallow(s => ({
      goMap:        s.goMap,
      goWelcome:    s.goWelcome,
      goProjectFit: s.goProjectFit,
      goDashboard:  s.goDashboard,
      goCard:       s.goCard,
    })))
  const back = returnTo === 'projectFit' ? goProjectFit
             : returnTo === 'welcome'    ? goWelcome
             : goMap

  return (
    <div className="anim-fadein" style={{ textAlign: 'center', padding: '40px 16px' }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: '#FFF4D8', border: `3px solid #F97316`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 18px',
      }}>
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
          <path d="M5 13l4 4L19 7" stroke="#F97316" strokeWidth="3"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div style={{
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontSize: 'clamp(28px,8vw,42px)', color: '#F97316', lineHeight: 1,
        textTransform: 'uppercase', letterSpacing: '.02em',
        padding: '0 16px',
      }}>
        {label || 'Project shortlist'}
      </div>
      <div style={{
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontSize: 18, color: INK, marginTop: 8, marginBottom: 22,
        letterSpacing: '.05em',
      }}>
        {count} METHOD{count === 1 ? '' : 'S'} RATED
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        maxWidth: 320, margin: '0 auto',
      }}>
        <ScrappyButton onClick={() => goDashboard()} color={YELLOW}>
          ▼ SEE PROJECT DASHBOARD →
        </ScrappyButton>
        <ScrappyButton onClick={back} color="#FFFFFF">
          ← BACK TO SHORTLIST
        </ScrappyButton>
        <ScrappyButton onClick={() => goCard(0)} color="#FFFFFF">
          REVIEW MY ANSWERS
        </ScrappyButton>
      </div>
    </div>
  )
}

// ── Image lightbox — fullscreen viewer with zoom toggle ──────
//   • Click backdrop or × button → close
//   • Click the image → toggle 1× ↔ 2.4× (zoomed view scrolls in
//     its container, both touch & wheel)
//   • Pointer + touch friendly; keyboard "Escape" also closes.
export function ImageLightbox({ src, alt, onClose }) {
  const [zoomed, setZoomed] = useState(false)
  const scrollRef = useRef(null)

  // Esc to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Recentre the scroll container when toggling zoom
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (zoomed) {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
      el.scrollTop  = (el.scrollHeight - el.clientHeight) / 2
    }
  }, [zoomed])

  // Render via a portal directly under <body>. The CardStack uses 3D
  // transforms (rotateY) which create a new containing block — without
  // the portal, `position: fixed` would be relative to the rotated card
  // and the lightbox would clip to the card's bounds instead of filling
  // the browser viewport.
  return createPortal((
    <div onClick={onClose}
      role="dialog" aria-modal="true" aria-label="Image preview"
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0,
        animation: 'lb-fade .15s ease',
      }}>
      <button onClick={onClose}
        aria-label="Close"
        style={{
          position: 'absolute', top: 14, right: 14,
          width: 40, height: 40, borderRadius: '50%',
          background: '#FFFFFF', color: INK,
          border: `2.5px solid ${INK}`,
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 22, lineHeight: 1,
          cursor: 'pointer', zIndex: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '2px 2px 0 ' + INK,
        }}>×</button>
      <div ref={scrollRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100vw', height: '100vh',
          overflow: zoomed ? 'auto' : 'hidden',
          background: 'transparent',
          cursor: zoomed ? 'zoom-out' : 'zoom-in',
          touchAction: zoomed ? 'pan-x pan-y' : 'manipulation',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
        <img src={src} alt={alt} draggable={false}
          onClick={() => setZoomed(z => !z)}
          style={{
            display: 'block',
            // Default: fill the full browser viewport, contained
            // inside it (no cropping). Zoomed: 240% of the larger
            // dimension so panning has real estate.
            width:  zoomed ? 'min(240vw, 240vh)' : '100vw',
            height: zoomed ? 'auto' : '100vh',
            maxWidth:  zoomed ? 'none' : '100vw',
            maxHeight: zoomed ? 'none' : '100vh',
            objectFit: 'contain',
            userSelect: 'none',
            transition: 'width .25s ease, height .25s ease',
          }} />
      </div>
      {/* Hint chip — fades after first interaction */}
      <div style={{
        position: 'absolute', bottom: 18, left: '50%',
        transform: 'translateX(-50%)',
        padding: '6px 12px',
        background: 'rgba(255,255,255,0.92)',
        border: `2px solid ${INK}`, borderRadius: 999,
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontWeight: 900, fontSize: 11,
        color: INK, letterSpacing: '.05em', textTransform: 'uppercase',
        pointerEvents: 'none',
      }}>{zoomed ? 'Drag to pan · click to zoom out' : 'Click image to zoom in'}</div>
      <style>{`@keyframes lb-fade { from { opacity:0 } to { opacity:1 } }`}</style>
    </div>
  ), document.body)
}

// ── Cover (face A) ────────────────────────────────────────────
export function CardCover({ tool, gate }) {
  const col = GATE_COL[gate]
  const toolNum = tool ? TOOLS.indexOf(tool) + 1 : null
  const thumbSrc = toolNum ? canvasThumbUrl(toolNum) : null
  const [thumbOk, setThumbOk] = useState(!!thumbSrc)
  return (
    <div style={{
      position: 'absolute', inset: 0,
      borderRadius: 22, overflow: 'hidden',
      background: '#FFFDF8',
      border: `3px solid ${INK}`,
      boxShadow: 'none',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 6,
        background: col,
      }} />
      {/* Slide-3 preview when available; gate symbol otherwise. */}
      {thumbSrc && thumbOk ? (
        <div style={{
          width: '92%', aspectRatio: '4 / 3',
          border: `2px solid ${INK}`, borderRadius: 14,
          background: '#FFFFFF', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img src={thumbSrc} alt={`${tool?.n} canvas preview`}
            onError={() => setThumbOk(false)}
            draggable={false}
            style={{
              width: '100%', height: '100%', objectFit: 'contain',
              userSelect: 'none', pointerEvents: 'none',
            }} />
        </div>
      ) : (
        <div style={{ width: 120, height: 120, padding: 4 }}>
          <GateSymbol gate={gate} stage={5} color={col} locked={false} />
        </div>
      )}
      {tool?.n && (
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontSize: 16, color: INK, marginTop: 14, lineHeight: 1.15,
          textAlign: 'center', maxWidth: '92%',
        }}>{tool.n}</div>
      )}
      <div style={{
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontSize: 13, color: col, marginTop: 6, letterSpacing: '.04em',
      }}>
        {GATE_LABEL[gate]}{toolNum ? ` · #${String(toolNum).padStart(3,'0')}` : ''}
      </div>
    </div>
  )
}

// ── Synthesis face (face B) ───────────────────────────────────
export function CardSynthesis({ tool, gate, onDive, alreadyLevel = null, alreadySkipped = false }) {
  const toolNum  = TOOLS.indexOf(tool) + 1
  const col      = GATE_COL[gate]
  const thumbSrc = canvasThumbUrl(toolNum)
  const [thumbOk, setThumbOk] = useState(true)
  const [zoom, setZoom]       = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const handleRef = useRef(null)
  // null | 'desc' | 'tip' — accordion state for the body text. The
  // card stays a fixed shape; tapping the def or the tip swaps which
  // one is expanded so all the text is reachable without an internal
  // scroll. Reset on tool change.
  const [expanded, setExpanded] = useState(null)

  // Detect whether the def / tip actually need clamping at their
  // default sizes. Short methods often fit in the card without any
  // truncation — making them tappable in that case is misleading
  // (the user clicks expecting "more" and gets nothing). We only
  // turn a section into an accordion when it actually overflows.
  const descRef = useRef(null)
  const tipRef  = useRef(null)
  const [descOverflows, setDescOverflows] = useState(false)
  const [tipOverflows,  setTipOverflows]  = useState(false)

  // Reset thumbnail load state whenever the displayed tool changes,
  // otherwise a previously-failed load would prevent the next image.
  useEffect(() => {
    setThumbOk(true); setZoom(false); setExpanded(null)
  }, [toolNum])

  // Stop speech when this card unmounts or the tool changes
  useEffect(() => () => {
    handleRef.current?.cancel?.()
    stopTTS()
    setSpeaking(false)
  }, [tool])

  const toggleSpeak = (e) => {
    e.stopPropagation()
    if (speaking) {
      handleRef.current?.cancel?.()
      stopTTS()
      setSpeaking(false)
      return
    }
    handleRef.current = playTTS(tool, {
      onStart: () => setSpeaking(true),
      onEnd:   () => setSpeaking(false),
    })
    // Some browsers don't fire onstart synchronously
    setSpeaking(true)
  }

  // Reconstruct the full description from the source fields. The
  // `tool.def` field is pre-truncated (ends with "…") for legacy
  // synth-card layouts; rebuilding lets us render the whole thing
  // and auto-fit it inside the fixed card.
  const why      = tool.gu?.[gate] || (tool.g?.[0] && tool.gu?.[tool.g[0]]) || null
  const evidence = tool.evidence || null
  const fullDef  = (why && evidence)
    ? `${why}. ${evidence}`
    : (why || evidence || tool.def || '')

  // Accordion line counts — only one of {desc, tip} is "expanded"
  // at a time. The card stays a fixed shape; whatever isn't
  // expanded gets line-clamped tightly. No internal scroll: a tap
  // on the truncated section opens it (and collapses the other).
  //
  // `null` clamp = render natural (no -webkit-line-clamp at all).
  // We use that when the text actually fits, so short methods don't
  // get a false "tap to read more" affordance.
  let descLines, tipLines
  if (expanded === 'desc') {
    descLines = 12
    tipLines  = tipOverflows ? 1 : null
  } else if (expanded === 'tip') {
    descLines = descOverflows ? 2 : null
    tipLines  = 8
  } else {
    descLines = descOverflows ? 4 : null
    tipLines  = tipOverflows  ? 2 : null
  }
  const descInteractive = descOverflows
  const tipInteractive  = tipOverflows

  // Measure overflow against the *default* clamp values (4 for def,
  // 2 for tip). Re-runs when the displayed tool or the body text
  // changes, and on resize via ResizeObserver so a card that fits
  // at desktop width but overflows on mobile rotates correctly.
  // Guards on `expanded === null` because measurement only makes
  // sense in the collapsed state — once expanded, the clamp values
  // change and the comparison is meaningless.
  useLayoutEffect(() => {
    if (expanded !== null) return
    const measure = () => {
      if (descRef.current) {
        const el = descRef.current
        setDescOverflows(el.scrollHeight > el.clientHeight + 1)
      }
      if (tipRef.current) {
        const el = tipRef.current
        setTipOverflows(el.scrollHeight > el.clientHeight + 1)
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (descRef.current) ro.observe(descRef.current)
    if (tipRef.current)  ro.observe(tipRef.current)
    return () => ro.disconnect()
  }, [fullDef, tool.t, tool.n, expanded])

  return (
    <div style={{
      position: 'absolute', inset: 0,
      borderRadius: 22, overflow: 'hidden',
      background: '#FFFDF8',
      border: `3px solid ${INK}`,
      boxShadow: 'none',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Canvas preview banner — slimmer than before and crop-
          biased to the bottom so the heading printed on the
          template image sits ABOVE the visible window. We see the
          structured part of the canvas, not its title. */}
      {thumbSrc && thumbOk && (
        <button onClick={() => setZoom(true)}
          aria-label="View canvas full screen"
          title="Click to zoom"
          style={{
            width: '100%', flexShrink: 0,
            aspectRatio: '16 / 5',
            borderBottom: `2px solid ${INK}`,
            background: '#F2EDE4',
            overflow: 'hidden',
            padding: 0, border: 'none', borderRadius: 0,
            cursor: 'zoom-in',
            position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <img src={thumbSrc} alt={`${tool.n} canvas preview`}
            onError={() => setThumbOk(false)}
            draggable={false}
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              // Centred crop — the canvas template's heading sits in
              // the top ~20% so a slim 16:5 window centred on the
              // image already trims it off, while keeping the
              // structured part of the canvas visible.
              objectPosition: '50% 50%',
              userSelect: 'none', pointerEvents: 'none',
            }} />
          {/* Zoom-hint icon, top-right corner */}
          <div style={{
            position: 'absolute', top: 6, right: 6,
            width: 24, height: 24, borderRadius: '50%',
            background: 'rgba(255,255,255,0.9)',
            border: `2px solid ${INK}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
              <circle cx="10" cy="10" r="6" stroke={INK} strokeWidth="2" />
              <path d="M10 7v6M7 10h6M14.5 14.5l4 4"
                stroke={INK} strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </button>
      )}
      {zoom && thumbSrc && (
        <ImageLightbox src={thumbSrc} alt={`${tool.n} canvas`}
          onClose={() => setZoom(false)} />
      )}
      {/* Already-evaluated banner — visible when the user revisits a
          tool they've already rated, so they don't loop endlessly. */}
      {(alreadyLevel || alreadySkipped) && (
        <div style={{
          flexShrink: 0,
          padding: '8px 14px',
          display: 'flex', alignItems: 'center', gap: 8,
          background: alreadySkipped
            ? '#9C958A'
            : (alreadyLevel === 'regular' ? '#10B981'
               : alreadyLevel === 'occasional' ? '#F97316' : '#5A5550'),
          color: '#FFFFFF',
          borderBottom: `2px solid ${INK}`,
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 11,
          letterSpacing: '.06em', textTransform: 'uppercase',
        }}>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="M5 13l4 4L19 7" fill="none" stroke="#FFFFFF"
              strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {alreadySkipped
            ? 'Marked as new to me'
            : `Already evaluated · ${SKILL_LEVELS[alreadyLevel]?.label || alreadyLevel}`}
          <span style={{ marginLeft: 'auto', opacity: .85, fontSize: 10 }}>
            (re-pick to update)
          </span>
        </div>
      )}
      <div style={{
        padding: '14px 16px 12px', flex: 1, minHeight: 0,
        // No internal scroll — the def + tip auto-shrink (textScale)
        // so all the content lands inside the fixed card box.
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Eyebrow — tool number, phase(s), AND dimensions all on
            one line. The dim labels used to live in their own row;
            inlining them frees a chunk of vertical space for the
            body text. */}
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontSize: 10, letterSpacing: '.06em', marginBottom: 4,
          display: 'flex', flexWrap: 'wrap', columnGap: 8, rowGap: 2,
          alignItems: 'baseline',
          color: '#9C958A',
        }}>
          <span>
            #{String(toolNum).padStart(3,'0')} · {tool.g.map(g => GATE_LABEL[g]).join(' / ')}
          </span>
          {(tool.d || []).map((did) => {
            const d = DIM_BY_ID[did]
            if (!d) return null
            return (
              <span key={did} style={{
                fontWeight: 900,
                color: d.color,
                textTransform: 'uppercase',
              }}>· {d.label}</span>
            )
          })}
        </div>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8,
        }}>
          <div style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontSize: 17, color: INK, lineHeight: 1.2, flex: 1,
            letterSpacing: '.01em',
          }}>{tool.n}</div>
          <button onClick={toggleSpeak}
            title={speaking ? 'Stop' : 'Read aloud'}
            style={{
              flexShrink: 0, width: 32, height: 32,
              background: 'transparent', border: 'none',
              cursor: 'pointer', padding: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            {speaking ? (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                <rect x="6.5" y="5" width="3.6" height="14" rx="1.2"
                  fill={INK} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
                <rect x="13.9" y="5" width="3.6" height="14" rx="1.2"
                  fill={INK} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
                <path d="M4 9.5 V14.5 H7.5 L12.5 18.5 V5.5 L7.5 9.5 H4 Z"
                  stroke={INK} strokeWidth="1.8" strokeLinejoin="round" fill="none" />
                <path d="M16 9 Q18 12 16 15"
                  stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none" />
                <path d="M18.5 7 Q21.5 12 18.5 17"
                  stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none" />
              </svg>
            )}
          </button>
        </div>
        {/* Definition — accordion only when the text actually
            overflows the default clamp. Short methods render at
            their natural height with no cursor: pointer and no
            click handler, so the user isn't tricked into tapping
            for "more" that doesn't exist. */}
        <p
          ref={descRef}
          onClick={descInteractive
            ? () => setExpanded(e => e === 'desc' ? null : 'desc')
            : undefined}
          style={{
            fontFamily: '-apple-system, Helvetica Neue, sans-serif', fontWeight: 700,
            fontSize: 14, color: '#3F3A36', lineHeight: 1.5,
            margin: '0 0 12px',
            cursor: descInteractive ? 'pointer' : 'default',
            ...(descLines != null ? {
              display: '-webkit-box',
              WebkitLineClamp: descLines,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            } : null),
          }}>
          {fullDef}
        </p>
        {/* Practitioner tip — same conditional accordion. */}
        {tool.t && (
          <div
            onClick={tipInteractive
              ? () => setExpanded(e => e === 'tip' ? null : 'tip')
              : undefined}
            style={{
              background: YELLOW + '40',
              borderRadius: 12, padding: '12px 12px 10px',
              marginBottom: 4,
              position: 'relative',
              cursor: tipInteractive ? 'pointer' : 'default',
            }}>
            <div style={{
              position: 'absolute', top: -8, left: 10,
              padding: '1px 6px', background: YELLOW,
              border: `2px solid ${INK}`, borderRadius: 4,
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontSize: 8, color: INK, letterSpacing: '.04em',
            }}>TIP</div>
            <p
              ref={tipRef}
              style={{
                fontFamily: '-apple-system, Helvetica Neue, sans-serif', fontWeight: 700,
                fontSize: 13, color: '#3F3A36', lineHeight: 1.35, margin: 0,
                marginTop: 2,
                ...(tipLines != null ? {
                  display: '-webkit-box',
                  WebkitLineClamp: tipLines,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                } : null),
              }}>{tool.t}</p>
          </div>
        )}
      </div>
      {/* Dive deeper bar */}
      <button onClick={onDive}
        style={{
          flexShrink: 0, padding: '12px',
          background: '#FFFFFF', color: INK,
          borderTop: `2px solid ${INK}`,
          borderLeft: 'none', borderRight: 'none', borderBottom: 'none',
          cursor: 'pointer',
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900,
          fontSize: 13, letterSpacing: '.08em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
        {/* Refresh-arrow icon — hand-drawn black */}
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
          <path d="M5 7 Q5 4 9 4 H16 L13 1.5 M16 4 L13 6.5"
            stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M19 17 Q19 20 15 20 H8 L11 22.5 M8 20 L11 17.5"
            stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
        DIVE DEEPER
      </button>
    </div>
  )
}

// ── Dive-deeper face (face C) ─────────────────────────────────
export function CardDeep({ tool, gate, onBack }) {
  const col      = GATE_COL[gate]
  const toolNum  = TOOLS.indexOf(tool) + 1
  const fileUrl  = canvasUrl(toolNum)
  const fileName = CANVAS_FILES[toolNum] || null

  return (
    <div style={{
      position: 'absolute', inset: 0,
      borderRadius: 22, overflow: 'hidden',
      background: '#FFFDF8',
      border: `3px solid ${INK}`,
      boxShadow: 'none',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '14px 16px 10px', flexShrink: 0,
        borderBottom: `2px dashed ${INK}33`,
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontSize: 10, color: col, letterSpacing: '.06em',
          }}>METHOD DETAILS</div>
          <div style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontSize: 16, color: INK, marginTop: 2, lineHeight: 1.1,
          }}>{tool.n}</div>
        </div>
        {fileUrl && (
          <a href={fileUrl}
            download={fileName || true}
            title={`Download ${fileName || 'canvas'}`}
            style={{
              flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 10px',
              background: col, color: '#FFFFFF',
              border: `2px solid ${INK}`, borderRadius: 10,
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontWeight: 900, fontSize: 11, letterSpacing: '.06em',
              textDecoration: 'none',
              textTransform: 'uppercase',
            }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
              <path d="M12 4v11M7 12l5 5 5-5M5 20h14"
                stroke="#FFFFFF" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Canvas
          </a>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {/* Mechanics — numbered steps */}
        {tool.steps && tool.steps.length > 0 && (
          <Section label="MECHANICS" emoji="🛠">
            {tool.steps.map((step, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, marginBottom: 14,
                alignItems: 'flex-start',
              }}>
                <div style={{
                  flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
                  background: col, border: `2px solid ${INK}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Barlow Condensed, Impact, sans-serif',
                  fontSize: 12, color: '#fff',
                }}>{i + 1}</div>
                <p style={{
                  fontFamily: '-apple-system, Helvetica Neue, sans-serif', fontWeight: 700,
                  fontSize: 13, color: '#3F3A36',
                  lineHeight: 1.5, margin: 0, flex: 1,
                }}>{step}</p>
              </div>
            ))}
          </Section>
        )}

        {/* Duration & material */}
        {(tool.duration || tool.material) && (
          <Section label="DURATION & MATERIAL" emoji="⏱">
            {tool.duration && (
              <p style={{
                fontFamily: '-apple-system, Helvetica Neue, sans-serif', fontWeight: 700,
                fontSize: 13, color: '#3F3A36', lineHeight: 1.5, margin: '0 0 10px',
              }}>
                <span style={{ color: col, fontFamily: 'Barlow Condensed, Impact, sans-serif', fontSize: 9, letterSpacing: '.04em' }}>DURATION · </span>
                {tool.duration}
              </p>
            )}
            {tool.material && (
              <p style={{
                fontFamily: '-apple-system, Helvetica Neue, sans-serif', fontWeight: 700,
                fontSize: 13, color: '#3F3A36', lineHeight: 1.5, margin: 0,
              }}>
                <span style={{ color: col, fontFamily: 'Barlow Condensed, Impact, sans-serif', fontSize: 9, letterSpacing: '.04em' }}>MATERIAL · </span>
                {tool.material}
              </p>
            )}
          </Section>
        )}

        {/* Produced evidence */}
        {tool.evidence && (
          <Section label="PRODUCED EVIDENCE" emoji="📋">
            <p style={{
              fontFamily: '-apple-system, Helvetica Neue, sans-serif', fontWeight: 700,
              fontSize: 13, color: '#3F3A36', lineHeight: 1.5, margin: 0,
            }}>{tool.evidence}</p>
          </Section>
        )}

        {/* Use case */}
        {tool.use && (
          <Section label="USE CASE" emoji="🌍">
            <p style={{
              fontFamily: '-apple-system, Helvetica Neue, sans-serif', fontWeight: 700,
              fontSize: 13, color: '#3F3A36', lineHeight: 1.5, margin: 0,
            }}>{tool.use}</p>
          </Section>
        )}

        {/* References — clickable when the docx had a real hyperlink,
            plain text otherwise (no Google fallback). */}
        {tool.refs && tool.refs.length > 0 && (
          <Section label="REFERENCES" emoji="📚">
            {tool.refs.map((r, i) => {
              // Support both old shape (string) and new shape ({t, u})
              const text = typeof r === 'string' ? r : r.t
              const url  = typeof r === 'string' ? null : r.u
              const baseStyle = {
                display: 'block',
                fontSize: 11, color: '#5A5550', lineHeight: 1.3,
                margin: '0 0 5px', paddingLeft: 14, position: 'relative',
              }
              const bullet = (
                <span style={{
                  position: 'absolute', left: 0, top: 0, color: col,
                  fontFamily: 'Barlow Condensed, Impact, sans-serif', fontSize: 11,
                }}>›</span>
              )
              if (url) {
                return (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                    style={{ ...baseStyle, textDecoration: 'none', transition: 'color .15s' }}
                    onMouseEnter={e => {
                      e.currentTarget.style.color = INK
                      e.currentTarget.style.textDecoration = 'underline'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.color = '#5A5550'
                      e.currentTarget.style.textDecoration = 'none'
                    }}>
                    {bullet}
                    {text}
                    <span aria-hidden="true" style={{
                      color: '#9C958A', fontSize: 9, marginLeft: 4, verticalAlign: 'super',
                    }}>↗</span>
                  </a>
                )
              }
              return (
                <p key={i} style={baseStyle}>
                  {bullet}
                  {text}
                </p>
              )
            })}
          </Section>
        )}
      </div>
      {/* Back to synthesis */}
      <button onClick={onBack}
        style={{
          flexShrink: 0, padding: '12px',
          background: '#FFFFFF', color: INK,
          borderTop: `2px solid ${INK}`,
          borderLeft: 'none', borderRight: 'none', borderBottom: 'none',
          cursor: 'pointer',
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900,
          fontSize: 13, letterSpacing: '.08em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
        ← BACK TO SYNTHESIS
      </button>
    </div>
  )
}

// ── Dive-deeper modal — full-screen portal that wraps CardDeep
// with a flip-in animation, internal scroll, and an explicit close
// affordance (× button, backdrop tap, Escape key). Lives outside
// the swipe deck so its scroll never fights the horizontal-swipe
// gesture; the deck's `touch-action: pan-y` sees only the deck
// itself, and the modal owns its own scroll container.
export function CardDeepModal({ tool, gate, onClose }) {
  // Esc to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal((
    <div
      onClick={onClose}
      role="dialog" aria-modal="true" aria-label="Method details"
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(28, 37, 48, 0.62)',
        display: 'flex', alignItems: 'stretch', justifyContent: 'center',
        padding: 0,
        animation: 'cd-fade .18s ease-out',
      }}>
      <button onClick={onClose}
        aria-label="Close"
        style={{
          position: 'absolute', top: 14, right: 14, zIndex: 2,
          width: 40, height: 40, borderRadius: '50%',
          background: '#FFFFFF', color: INK,
          border: `2.5px solid ${INK}`,
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 22, lineHeight: 1,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '2px 2px 0 ' + INK,
        }}>×</button>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          margin: '24px 12px',
          // The card-deep component itself already has a border /
          // background / overflow:hidden card frame, so we let it
          // own its presentation. We just give it a stable size
          // and the flip-in animation.
          animation: 'cd-flip .42s cubic-bezier(.2, .9, .25, 1) both',
          transformOrigin: 'center',
          // Take whatever vertical room is available — CardDeep
          // has its own inner scroll container.
          minHeight: 'min(640px, calc(100vh - 48px))',
          maxHeight: 'calc(100vh - 48px)',
          display: 'flex',
        }}>
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <CardDeep tool={tool} gate={gate} onBack={onClose} />
        </div>
      </div>
      <style>{`
        @keyframes cd-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes cd-flip {
          from { transform: perspective(1100px) rotateY(-90deg) scale(.92); opacity: 0; }
          to   { transform: perspective(1100px) rotateY(0)     scale(1);    opacity: 1; }
        }
      `}</style>
    </div>
  ), document.body)
}

function Section({ label, emoji, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontSize: 10, color: INK, letterSpacing: '.05em',
        marginBottom: 10,
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        <span>{emoji}</span> {label}
      </div>
      {children}
    </div>
  )
}

// ── Card stack — 3D flip cover ↔ synth ↔ deep ────────────────
// Responsive sizing: 340×540 on phones, scales up to 460×720 on
// desktop while keeping the same aspect ratio so the absolutely-
// positioned faces inside fit naturally.
const CARD_ASPECT = '340 / 540'

// Decorative card behind the active one — gives the deck weight so
// the user feels how many are left without having to read a counter.
// Two ghost cards fan slightly to the right + down with diminishing
// opacity. Pointer-events disabled so they never intercept taps; the
// active SwipeWrap sits above them at z-index 1.
export function GhostCard({ depth = 1 }) {
  const offX     = depth * 8
  const offY     = depth * 6
  const rot      = depth * 1.4
  const scale    = 1 - depth * 0.025
  const opacity  = 1 - depth * 0.18
  return (
    <div aria-hidden="true" style={{
      position: 'absolute',
      top: 0,
      left: '50%',
      width:  'min(95vw, 460px)',
      aspectRatio: CARD_ASPECT,
      background:   '#FFFDF8',
      border:       `2.5px solid ${INK}`,
      borderRadius: 18,
      boxShadow:    `${depth * 1.5}px ${depth * 2}px 0 ${INK}33`,
      transform: `translate(calc(-50% + ${offX}px), ${offY}px) rotate(${rot}deg) scale(${scale})`,
      transformOrigin: 'center center',
      opacity,
      pointerEvents: 'none',
      zIndex: -depth,
    }} />
  )
}

export function CardStack({ tool, gate, onDive, alreadyLevel, alreadySkipped }) {
  // The 3D flip wrapper that used to live here is gone. The 'cover'
  // face was dead code (face only ever toggled between 'synth' and
  // 'deep', never 'cover'), so the rotateY animation never actually
  // played — it was just a permanently-flipped 3D structure that
  // confused mobile WebKit's hit-testing and broke the swipe
  // gesture on some paths. CardSynthesis renders directly now;
  // 'dive deeper' opens CardDeep as a full-screen portal modal
  // (see CardDeepModal below) with its own internal scroll.
  return (
    <div style={{
      width: 'min(95vw, 460px)',
      aspectRatio: CARD_ASPECT,
      position: 'relative',
    }}>
      <CardSynthesis tool={tool} gate={gate} onDive={onDive}
        alreadyLevel={alreadyLevel} alreadySkipped={alreadySkipped} />
    </div>
  )
}

// Small chevron button used in the deck header to step the cursor
// back or forward without committing any rating. Disabled at the
// edges of the deck.
export function NavArrow({ dir, onClick, disabled }) {
  return (
    <button onClick={disabled ? undefined : onClick}
      aria-label={dir === 'prev' ? 'Previous card' : 'Next card'}
      title={dir === 'prev' ? 'Previous · no commit' : 'Next · no commit'}
      style={{
        width: 30, height: 30, padding: 0,
        background: '#FFFFFF',
        border: `2px solid ${INK}`, borderRadius: 999,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
        {dir === 'prev'
          ? <path d="M15 5 L8 12 L15 19" stroke={INK} strokeWidth="2.4"
              strokeLinecap="round" strokeLinejoin="round" />
          : <path d="M9 5 L16 12 L9 19" stroke={INK} strokeWidth="2.4"
              strokeLinecap="round" strokeLinejoin="round" />
        }
      </svg>
    </button>
  )
}

// ── Rating row — 4 single-tap options, no modal, no swipe.
// Replaces the previous swipe→modal flow with one direct decision.
// The four levels match the SKILL_LEVELS definition plus a fifth
// "new to me" option that maps to the existing skipTool() mechanism.
//   • new   → skipped[]            ("I haven't encountered this method")
//   • theory      → practiced.theory      ("I know about it, never run it")
//   • occasional  → practiced.occasional  ("I have run it sometimes")
//   • regular     → practiced.regular     ("I run it routinely")
//
// Hovering the active one is highlighted so the user can see their
// previous answer when revisiting a card.
export function RatingRow({
  show, currentLevel, currentSkipped, onPick,
  // The right-swipe drop-target preview, so the user gets feedback
  // on which button they're about to commit to without a separate
  // floating strip. Mirrors the values produced by RIGHT_ZONES.
  previewLevel = null,
}) {
  const OPTIONS = [
    { id: 'new',        label: 'New to me',  short: 'NEW',
      hint: "Haven't met it",        col: '#9C958A' },
    { id: 'theory',     label: 'Read about', short: 'READ',
      hint: 'In theory only',        col: '#5A5550' },
    { id: 'occasional', label: 'Tried it',   short: 'TRIED',
      hint: 'Used a few times',      col: '#F97316' },
    { id: 'regular',    label: 'I run it',   short: 'RUN',
      hint: 'Routine practice',      col: '#10B981' },
  ]
  const committedId = currentSkipped ? 'new' : (currentLevel || null)

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
      opacity: show ? 1 : 0,
      transform: show ? 'translateY(0)' : 'translateY(12px)',
      pointerEvents: show ? 'auto' : 'none',
      transition: 'all .3s',
    }}>
      {OPTIONS.map(opt => {
        const isCommitted = committedId === opt.id
        const isPreview   = previewLevel === opt.id
        // Preview wins visually while a drag is in flight — same
        // colour fill, but a thicker shadow + scale-up so the user
        // can tell apart "you're hovering on this band" from "this
        // is your committed level on a previously-rated card".
        const filled = isCommitted || isPreview
        return (
          <button key={opt.id}
            onClick={() => onPick(opt.id)}
            title={opt.hint}
            style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'stretch', justifyContent: 'center',
              padding: '8px 6px',
              background: filled ? opt.col : '#FFFFFF',
              color:      filled ? '#FFFFFF' : INK,
              border: `${isPreview ? 3 : 2.5}px solid ${INK}`,
              borderRadius: 12,
              cursor: 'pointer',
              boxShadow: isPreview
                ? '3px 3px 0 ' + INK
                : isCommitted
                ? '2px 2px 0 ' + INK
                : 'none',
              transform: isPreview
                ? 'translate(-1px,-2px) scale(1.04)'
                : isCommitted
                ? 'translate(-1px,-1px)'
                : 'none',
              transition: 'transform .08s, box-shadow .08s',
            }}>
            <span style={{
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontWeight: 900, fontSize: 12,
              letterSpacing: '.04em', textTransform: 'uppercase',
              lineHeight: 1.05,
            }}>{opt.label}</span>
            <span style={{
              fontFamily: '-apple-system, Helvetica Neue, sans-serif',
              fontWeight: 600, fontSize: 9,
              color: filled ? 'rgba(255,255,255,.85)' : '#9C958A',
              marginTop: 3, lineHeight: 1.2,
            }}>{opt.hint}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Progress dots ─────────────────────────────────────────────
export function ProgressDots({ tools, idx }) {
  return (
    <div style={{ display: 'flex', gap: 3, width: '100%' }}>
      {tools.map((_, i) => (
        <div key={i} style={{
          height: 6, borderRadius: 3,
          flex: 1, minWidth: 3, maxWidth: 22,
          transition: 'all .3s',
          background: i < idx ? '#9C958A' : i === idx ? INK : '#E0DAD2',
        }} />
      ))}
    </div>
  )
}

// ── Deck footer — chevrons + progress dots + counter on one row,
//   placed BELOW the card on all three card-sorting decks (Explore,
//   workshop ToolDeck, workshop FitDeck). The counter sits at the
//   end of the dashes so the eye flows naturally:
//   [<]  [- - - - - - - - - 12/18]  [>]
export function DeckFooter({ idx, total, onPrev, onNext }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      marginTop: 12,
    }}>
      <NavArrow dir="prev" onClick={onPrev} disabled={idx === 0} />
      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ flex: 1, display: 'flex', gap: 3 }}>
          {Array.from({ length: total }, (_, i) => (
            <div key={i} style={{
              height: 6, borderRadius: 3,
              flex: 1, minWidth: 3, maxWidth: 22,
              transition: 'all .3s',
              background: i < idx ? '#9C958A' : i === idx ? INK : '#E0DAD2',
            }} />
          ))}
        </div>
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 14,
          color: INK, flexShrink: 0,
          minWidth: 44, textAlign: 'right',
        }}>{idx + 1}/{total}</div>
      </div>
      <NavArrow dir="next" onClick={onNext} disabled={idx >= total - 1} />
    </div>
  )
}

// ── Main Explore view ──────────────────────────────────────────
export function ExploreView() {
  const { eGate, eDim, eIdx, ePoolNames, ePoolLabel, ePoolReturn, eMode,
          practiced, skipped,
          goMap, practiceTool, skipTool, nextCard, prevCard } =
    useStore(useShallow(s => ({
      eGate: s.eGate, eDim: s.eDim, eIdx: s.eIdx,
      ePoolNames:   s.ePoolNames,
      ePoolLabel:   s.ePoolLabel,
      ePoolReturn:  s.ePoolReturn,
      eMode:        s.eMode,
      practiced:    s.practiced,
      skipped:      s.skipped,
      goMap:        s.goMap,
      practiceTool: s.practiceTool,
      skipTool:     s.skipTool,
      nextCard:     s.nextCard,
      prevCard:     s.prevCard,
    })))

  // 'Dive deeper' is now a full-screen modal rather than a back-of-
  // card swap, so its scroll surface can't fight the swipe gesture
  // and we can hand the deck back its simple touch-action: pan-y
  // contract. deepTool is null when the modal is closed, the active
  // tool when it's open.
  const [deepTool, setDeepTool] = useState(null)
  // Last action drives the conveyor-belt animation: 'new' = old card
  // flew left, new one slides in from the right; otherwise inverse.
  const [lastAction, setLastAction] = useState(null)
  // Live drop-target value while the user is mid-drag-right. Drives
  // the RatingRow above the card to highlight the matching button.
  const [previewLevel, setPreviewLevel] = useState(null)

  // Tool pool resolution. If the user came in via a custom pool
  // (e.g. 'rate THIS project's shortlist'), build the deck strictly
  // from those names in order. Otherwise fall back to the gate /
  // dim filters.
  const isPool = Array.isArray(ePoolNames) && ePoolNames.length > 0
  const gate  = eGate
  // The base tool set for this deck (gate × dim or pool). Filtering
  // by eMode happens AFTER we lock this in so the user's progress
  // doesn't shrink the deck mid-session.
  const baseTools = isPool
    ? ePoolNames.map(n => TOOLS.find(t => t.n === n)).filter(Boolean)
    : (eDim ? toolsForGateDim(gate, eDim) : toolsForGate(gate))
  // The deck is filtered by eMode at session-start and locked into
  // a ref so subsequent rates don't reshape the array under the
  // user's feet (every rating would otherwise drop the just-rated
  // card from the unreviewed pool, making eIdx point at the wrong
  // card). Re-filter only when the session boundary changes
  // (gate / dim / mode / pool).
  const lockedToolsRef = useRef(null)
  const sessionKey = `${eGate}|${eDim}|${eMode}|${isPool ? ePoolNames?.join(',') : ''}`
  const lastSessionKeyRef = useRef(null)
  if (lastSessionKeyRef.current !== sessionKey) {
    lastSessionKeyRef.current = sessionKey
    if (eMode === 'reviewed') {
      // Already-rated only.
      lockedToolsRef.current = baseTools.filter(t =>
        practiced[t.n] || skipped.includes(t.n))
    } else if (eMode === 'unreviewed' && !isPool) {
      // Default deck: only un-touched cards. Pool mode bypasses
      // because the caller curated the order on purpose.
      lockedToolsRef.current = baseTools.filter(t =>
        !practiced[t.n] && !skipped.includes(t.n))
    } else {
      // 'all' or pool mode → no further filtering.
      lockedToolsRef.current = baseTools
    }
  }
  const tools = lockedToolsRef.current
  const col   = isPool ? '#F97316' : GATE_COL[gate]
  const dim   = (!isPool && eDim) ? DIM_BY_ID[eDim] : null

  // Close the dive-deeper modal whenever the active card changes,
  // so a leftover modal from the previous card doesn't appear over
  // the new one.
  useEffect(() => { setDeepTool(null) }, [eIdx, eGate, eDim, isPool, eMode])

  if (eIdx >= tools.length) {
    if (isPool) return <PoolComplete label={ePoolLabel} returnTo={ePoolReturn} count={tools.length} />
    if (eDim) return <DimComplete gate={gate} dim={eDim} />
    return <GateComplete gate={gate} />
  }

  const tool = tools[eIdx]

  // Single-tap rating — one of the four RatingRow buttons. Writes the
  // level (or marks the tool as new-to-me), keeps the banner visible
  // for ~700 ms so the user sees their choice land, then advances. The
  // 700 ms beat keeps the card-slide animation feeling like a response
  // to the tap rather than a jump cut.
  // Source distinguishes a button tap from a swipe so we can apply
  // the right rhythm to each: a tap gets a 700 ms beat (the button
  // pulses, the card sits a moment, then a fresh card slides in)
  // while a swipe advances right after its exit animation finishes
  // (the SwipeWrap's 220 ms exit IS the 'choice landed' beat;
  // adding another 700 ms felt like a freeze).
  //
  // Critically, lastAction is set together with nextCard inside the
  // setTimeout, NOT synchronously up-front. Setting it before the
  // key changes makes the wrapper's card-from-left keyframe run on
  // the *old* card while its SwipeWrap is still translateX'd at the
  // exit position; the two transforms compose into a stuck-looking
  // offset. Setting both at once means the keyframe only ever runs
  // on the new wrapper after the eIdx-key change.
  const handleRating = (id, source = 'tap') => {
    try { window.speechSynthesis?.cancel() } catch { /* noop */ }
    if (id === 'new') {
      skipTool(tool.n)
    } else {
      practiceTool(tool.n, id)   // 'theory' | 'occasional' | 'regular'
    }
    const advance = () => {
      setLastAction(id === 'new' ? 'skip' : 'practice')
      nextCard()
    }
    if (source === 'swipe') {
      // Swipe path: advance synchronously so React batches the
      // SwipeWrap's drag-reset, the lastAction set, and the
      // nextCard advance into a single render. The old wrapper
      // unmounts (key change) before any compositing artefact has
      // a chance to flash on screen.
      advance()
    } else {
      // Tap path: 700 ms beat lets the user see the rating button
      // light up before the deck advances.
      setTimeout(advance, 700)
    }
  }

  return (
    <div className="anim-fadein">
      {/* ── Header — back button + phase / dim label only. The
              counter, progress dots and prev/next chevrons all live
              in the DeckFooter below the card now, so the eye flow
              goes: header → rating buttons → card → progress + nav. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 12,
      }}>
        <ScrappyButton
          onClick={() => { window.speechSynthesis?.cancel(); goMap() }}
          color="#FFFFFF" size="sm">
          ← MAP
        </ScrappyButton>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontWeight: 900,
            fontSize: 18, color: col, lineHeight: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
            letterSpacing: '.02em',
          }}>
            {GATE_LABEL[gate]}
          </div>
          {dim && (
            <div style={{
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontWeight: 900,
              fontSize: 11, color: dim.color, marginTop: 3,
              letterSpacing: '.05em', textTransform: 'uppercase',
              lineHeight: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {dim.label}
            </div>
          )}
        </div>
      </div>

      {/* Rating buttons ABOVE the card. They double as drop-zone
          previews while a right-swipe is in flight: the matching
          button highlights as the user drags through each
          threshold. */}
      <div style={{ marginBottom: 12 }}>
        <RatingRow
          show={true}
          currentLevel={practiced[tool.n] || null}
          currentSkipped={skipped.includes(tool.n)}
          previewLevel={previewLevel}
          onPick={handleRating} />
      </div>

      {/* ── Card stack — swipe shortcuts: left → "New to me", right →
              drag-to-rate (3 zones). The decorative ghost cards
              behind the active one give the deck weight. */}
      <div style={{
        position: 'relative',
        display: 'flex', justifyContent: 'center',
        marginBottom: 12,
      }}>
        <div key={eIdx}
          style={{
            position: 'relative',
            zIndex: 1,
            // Animation direction follows the user's intent:
            //   • next / skip      → new card slides IN from the right
            //   • prev / practice  → new card slides IN from the left
            animation:
              lastAction === 'skip' || lastAction === 'next'
                ? 'card-from-right .35s cubic-bezier(.4,0,.2,1)'
                : lastAction === 'practice' || lastAction === 'prev'
                ? 'card-from-left .35s cubic-bezier(.4,0,.2,1)'
                : 'none',
          }}>
          <SwipeWrap
            enabled={!deepTool}
            onSwipe={(value) => {
              setPreviewLevel(null)
              handleRating(value, 'swipe')
            }}
            onZoneChange={setPreviewLevel}
            leftZone={LEFT_ZONE}
            rightZones={RIGHT_ZONES}>
            <CardStack
              tool={tool} gate={gate}
              onDive={() => setDeepTool(tool)}
              alreadyLevel={practiced[tool.n] || null}
              alreadySkipped={skipped.includes(tool.n)}
            />
          </SwipeWrap>
        </div>
      </div>
      <style>{`
        @keyframes card-from-left {
          from { transform: translateX(-110%) rotate(-4deg); opacity: 0; }
          to   { transform: translateX(0)     rotate(0);     opacity: 1; }
        }
        @keyframes card-from-right {
          from { transform: translateX(110%)  rotate(4deg);  opacity: 0; }
          to   { transform: translateX(0)     rotate(0);     opacity: 1; }
        }
      `}</style>

      {/* Footer — chevrons + dots + counter on one row, counter at
          the end of the dashes. */}
      <DeckFooter
        idx={eIdx} total={tools.length}
        onPrev={() => { setLastAction('prev'); prevCard() }}
        onNext={() => { setLastAction('next'); nextCard() }} />

      {/* Dive-deeper modal — full-screen, scrolls inside itself,
          dismissable with the × button or by tapping the backdrop. */}
      {deepTool && (
        <CardDeepModal
          tool={deepTool} gate={gate}
          onClose={() => setDeepTool(null)} />
      )}
    </div>
  )
}
