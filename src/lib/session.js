/**
 * Session manager — Supabase Realtime Broadcast (cross-device).
 *
 * Falls back to a `BroadcastChannel` (same-device, same-origin) when
 * Supabase isn't configured, so dev mode without env vars still works.
 *
 * Messages exchanged on a session:
 *   { type: 'ping' }
 *   { type: 'pong',         payload: { participantId } }
 *   { type: 'triage_start', payload: { gate, tools } }
 *   { type: 'triage_card',  payload: { participantId, tool, status, level } }
 *   { type: 'triage_done',  payload: { participantId } }
 *   { type: 'question',     payload: { questionId, text, type, tool, gate } }
 *   { type: 'response',     payload: { participantId, value, questionId } }
 *   { type: 'reveal' }
 */

import { supabase, hasSupabase } from './supabase'

const EVENT = 'msg'    // single broadcast event channel for all our messages

export function makeRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

// ── Channel wrapper ────────────────────────────────────────────
// Both transports expose the same surface so the rest of the app
// doesn't care which one is in use:
//   ch.close()      — tear down
//   sendMsg(ch, m)  — broadcast a message
//   subscribe(ch,h) — register the message handler
//
// Supabase channels are async to subscribe; we queue any send() calls
// that happen before the channel is fully connected and flush them
// on the SUBSCRIBED status change.

function makeBcWrapper(roomId) {
  const bc = new BroadcastChannel('ovpm-' + roomId)
  let handler = null
  bc.onmessage = (e) => handler?.(e.data)
  return {
    _kind: 'bc',
    _send: (msg) => bc.postMessage(msg),
    _setHandler: (h) => { handler = h },
    onStatus: (cb) => { cb?.('SUBSCRIBED') },     // local channels are always live
    isConnected: () => true,
    close: () => bc.close(),
  }
}

function makeSbWrapper(roomId) {
  let handler   = null
  let statusCb  = null
  let connected = false
  const queue   = []
  const ch = supabase.channel('ovpm-' + roomId, {
    config: { broadcast: { self: false } },
  })
  ch.on('broadcast', { event: EVENT }, ({ payload }) => {
    handler?.(payload)
  })
  ch.subscribe((status, err) => {
    // Always surface the status. Common values:
    //   SUBSCRIBED       → channel is live, queue can be flushed
    //   CHANNEL_ERROR    → server rejected the channel (RLS, paused project)
    //   TIMED_OUT        → no response from realtime in time
    //   CLOSED           → channel was closed
    statusCb?.(status, err)
    if (status === 'SUBSCRIBED') {
      connected = true
      while (queue.length) {
        ch.send({ type: 'broadcast', event: EVENT, payload: queue.shift() })
      }
    } else if (status === 'CLOSED') {
      connected = false
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn('[session] realtime channel', status, err || '')
    }
  })
  return {
    _kind: 'sb',
    _send: (msg) => {
      if (connected) {
        ch.send({ type: 'broadcast', event: EVENT, payload: msg })
      } else {
        queue.push(msg)
      }
    },
    _setHandler: (h) => { handler = h },
    onStatus: (cb) => { statusCb = cb },
    isConnected: () => connected,
    close: () => { try { supabase.removeChannel(ch) } catch { /* noop */ } },
  }
}

/** Open (or join) a session channel. Use Supabase Realtime when
 *  configured, BroadcastChannel otherwise. */
export function openChannel(roomId) {
  return hasSupabase ? makeSbWrapper(roomId) : makeBcWrapper(roomId)
}

/** Broadcast a message to every other participant in the channel. */
export function sendMsg(channel, msg) {
  if (!channel) return
  channel._send(msg)
}

/** Register the message handler. Replaces any previous handler. */
export function subscribe(channel, handler) {
  if (!channel) return
  channel._setHandler(handler)
}

/** Register a connection-status listener. Calls the callback with the
 *  Supabase channel status (SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT /
 *  CLOSED). For BroadcastChannel fallback it fires SUBSCRIBED once. */
export function onStatus(channel, cb) {
  channel?.onStatus?.(cb)
}

export function isConnected(channel) {
  return !!channel?.isConnected?.()
}

/** Cleanup. Safe to call more than once. */
export function closeChannel(channel) {
  channel?.close?.()
}

/** Generate a participant URL — shareable as QR for cross-device join. */
export function participantUrl(roomId) {
  const base = window.location.origin + window.location.pathname
  return base + '?room=' + roomId
}
