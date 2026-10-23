// Which routines have stopped running, read from history/routines.md: the same rules as
// .claude/skills/routines/scripts/routine-status.sh and .ps1 (the startup note and /health use those),
// so the board and the startup note always agree. scripts/ci/routine-status-parity.sh runs all three on the
// same logs. No imports and only plain type annotations: Node runs this file directly in that check.
//
// Two kinds of lines: runs (written by the routine), and the user's changes, logged by the assistant or this
// board: "set up (...)", "changed (...)", "paused", "resumed", "deleted". Only "set up" and "resumed" make a
// paused or deleted routine active again. A routine is stalled when the newer of its latest run and its latest
// set up/changed/resumed line is more than 2 (daily), 4 (weekdays), 9 (weekly) or 16 (fortnightly) days old,
// and at most 45 (older: inactive). Names match case-blind in A-Z only. "routines" is the assistant's own name.

export type Cadence = 'daily' | 'weekdays' | 'weekly' | 'fortnightly'
export type RoutineState = 'ok' | 'stalled' | 'stopped' | 'inactive'
export type Routine = {
  key: string
  name: string
  state: RoutineState
  // 'run' with the latest run's date, or 'setup' with the date it was set up (no run since).
  last: 'run' | 'setup'
  date: string
  cadence: Cadence
  // The latest run's result and time ('' when none), and the newest date anything was logged for it.
  result: string
  time: string
  ref: string
  // How many days may pass between runs before it counts as stalled.
  limit: number
}
export type RunLine = { date: string; time: string; name: string; result: string }

const SEP = ' · '
const LIMITS: Record<Cadence, number> = { daily: 2, weekdays: 4, weekly: 9, fortnightly: 16 }
export const lowerAz = (s: string): string => s.replace(/[A-Z]/g, c => c.toLowerCase())
const isChange = (rs: string): boolean => /^(set up|changed|paused|resumed|deleted)/.test(rs)

// Days since a fixed start for a real YYYY-MM-DD date, else 0 (the same formula as the scripts).
export function dayNumber(s: string): number {
  let y = Number(s.slice(0, 4)); let m = Number(s.slice(5, 7)); const d = Number(s.slice(8, 10))
  if (!(m >= 1 && m <= 12 && d >= 1)) return 0
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
  const dim = m === 2 ? (leap ? 29 : 28) : (m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31)
  if (d > dim) return 0
  if (m <= 2) { y--; m += 12 }
  return 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + Math.floor((153 * (m - 3) + 2) / 5) + d
}

function cadenceIn(s: string): Cadence | '' {
  if (s.includes('fortnightly')) return 'fortnightly'
  if (s.includes('weekdays')) return 'weekdays'
  if (s.includes('daily')) return 'daily'
  if (s.includes('weekly')) return 'weekly'
  return ''
}

// Every dated line, as { date, time, name, result } (malformed and impossible dates skipped).
export function logLines(text: string): RunLine[] {
  const out: RunLine[] = []
  const lines = text.replace(/^﻿/, '').split('\n')
  for (const raw of lines) {
    const ln = raw.replace(/\r$/, '')
    const m = /^- (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})( |$)/.exec(ln)
    if (!m || dayNumber(m[1] ?? '') === 0) continue
    let rest = ln.slice(18).trim()
    if (rest.startsWith(SEP.trim())) rest = rest.slice(SEP.trim().length).trim()
    const i = rest.indexOf(SEP)
    const name = (i >= 0 ? rest.slice(0, i) : rest).trim()
    const result = i >= 0 ? rest.slice(i + SEP.length).trim() : ''
    if (name !== '') out.push({ date: m[1] ?? '', time: m[2] ?? '', name, result })
  }
  return out
}

// Runs only (not the user's changes, not the assistant's notes), newest last.
export function runLines(text: string): RunLine[] {
  return logLines(text).filter(l => lowerAz(l.name) !== 'routines' && !isChange(lowerAz(l.result)))
}

export function routineStatus(text: string, today: string): Routine[] {
  type Acc = { name: string; stop: boolean; ran: boolean; cad: Cadence | ''; run: string; admin: string; setup: string; result: string; time: string }
  const order: string[] = []
  const acc = new Map<string, Acc>()
  for (const l of logLines(text)) {
    const k = lowerAz(l.name)
    if (k === 'routines') continue
    const rs = lowerAz(l.result)
    let a = acc.get(k)
    if (!a) { a = { name: l.name, stop: false, ran: false, cad: '', run: '', admin: '', setup: '', result: '', time: '' }; acc.set(k, a); order.push(k) }
    a.name = l.name
    if (/^(paused|deleted)/.test(rs)) { a.stop = true; continue }
    if (rs.startsWith('set up')) { a.stop = false; a.setup = l.date; a.admin = l.date; a.ran = false; const c = cadenceIn(rs); if (c) a.cad = c; continue }
    if (rs.startsWith('changed')) { a.admin = l.date; const c = cadenceIn(rs); if (c) a.cad = c; continue }
    if (rs.startsWith('resumed')) { a.stop = false; a.admin = l.date; continue }
    a.run = l.date; a.ran = true; a.result = l.result; a.time = l.time
  }
  const t = dayNumber(today)
  return order.map(k => {
    const a = acc.get(k) as Acc
    const cadence: Cadence = a.cad || (k === 'morning scan' || k === 'follow-up drafts' ? 'weekdays' : k === 'inbox check' ? 'daily' : 'weekly')
    const limit = LIMITS[cadence]
    const ref = a.admin > a.run ? a.admin : a.run
    let state: RoutineState
    if (ref === '') state = 'stopped'
    else {
      const age = t - dayNumber(ref)
      state = a.stop ? 'stopped' : age > 45 ? 'inactive' : age > limit ? 'stalled' : 'ok'
    }
    return {
      key: k, name: a.name, state, cadence, limit, ref,
      last: a.ran ? 'run' : 'setup',
      date: a.ran ? a.run : (a.setup !== '' ? a.setup : ref),
      result: a.ran ? a.result : '',
      time: a.ran ? a.time : '',
    }
  })
}

// The line routine-status.sh prints for one routine (the parity check compares these).
export const statusLine = (r: Routine): string => [r.state, r.name, r.last, r.date, r.cadence].join('\t')
