import type { Register } from 'claude-code'

import { addDays, alsoOf, csvTrouble, dateOrder, daysBetween, isIso, localDate, monthDay, orderFor, readCsv, toIso } from './csvdate'
import type { DateOrder } from './csvdate'

// Due alerts: one short toast when a session opens (and again if the date rolls over while it is
// open) listing what is due today or tomorrow, most urgent first. It only reads the user's files
// (jobs/tracker.csv, contacts/contacts.csv, outbox/, jobs/layoff-plan.md, profile/preferences.md); the session-start hook already gives Claude the
// same facts as context, so this is for the user's eyes only and never adds anything to the chat.
// What it has shown today is remembered in the plugin's own store (outside this folder), so the
// same alert doesn't come back the same day, even after a restart.

type Alert = { id: string; rank: number; date: string; text: string }
type Seen = { date: string; ids: string[] }

const TRACKER = 'jobs/tracker.csv'
const CONTACTS = 'contacts/contacts.csv'
const OUTBOX = 'outbox'
const MAX_LINES = 3
const OPEN = ['interested', 'applied', 'screening', 'interviewing', 'offer']
// Playbook: once a job is applied or later, the job row owns the follow-up date, not the contact
// (same list as the Contacts board, closed outcomes included).
const JOB_OWNS_FOLLOWUP = ['applied', 'screening', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn', 'ghosted']
const RANK = { damaged: -1, visa: 0, interview: 0, offer: 1, benefits: 1, deadline: 2, plan: 2, followup: 3, gmail: 4 }
const LAYOFF_PLAN = 'jobs/layoff-plan.md'

// Rows as lookups by lower-case column name, so column order and extra columns don't matter. Same CSV
// reader as the Pipeline mod (csvdate.ts); `order` is the date order for that row (its own dates first).
type Row = { get: (col: string) => string; order: DateOrder }
function table(text: string, order: DateOrder): { rows: Row[]; problem: string } {
  const { rows: [header = [], ...rows], problem } = readCsv(text)
  if (problem !== '') return { rows: [], problem }
  const names = header.map(h => h.trim().toLowerCase())
  return {
    problem,
    rows: rows.map(r => ({
      order: orderFor(r, order),
      get: (col: string) => {
        const i = names.indexOf(col)
        return i >= 0 ? (r[i] ?? '').trim() : ''
      },
    })),
  }
}

const pad = (n: number | string) => String(n).padStart(2, '0')

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// A month and day with no year: the next one on or after about six months ago.
function withYear(month: number, day: number, today: string): string {
  const year = Number(today.slice(0, 4))
  const guess = `${year}-${pad(month)}-${pad(day)}`
  return daysBetween(guess, today) > 180 ? `${year + 1}-${pad(month)}-${pad(day)}` : guess
}

// The date written in a next step like "Interview 2026-10-07", "Interview 10/7 2pm" or "Interview Oct 7".
function dateIn(text: string, today: string, order: DateOrder = ''): string {
  const iso = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text)
  if (iso) return `${iso[1]}-${pad(iso[2] ?? '')}-${pad(iso[3] ?? '')}`
  const slash = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/.exec(text)
  if (slash) {
    if (slash[3]) { const d = toIso(`${slash[1]}/${slash[2]}/${slash[3]}`, order); return isIso(d) ? d : '' }
    const md = monthDay(Number(slash[1]), Number(slash[2]), order)
    return md ? withYear(md[0], md[1], today) : ''
  }
  const named = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i.exec(text)
  if (named) return withYear(MONTHS.indexOf((named[1] ?? '').toLowerCase()) + 1, Number(named[2]), today)
  return ''
}

function when(date: string, today: string): string {
  if (date < today) return `overdue since ${date}`
  if (date === today) return 'due today'
  if (date === addDays(today, 1)) return 'due tomorrow'
  return `due ${date}`
}

async function readText($: any, path: string): Promise<string> {
  try {
    if (!(await $.fs.exists(path))) return ''
    return String(await $.fs.read(path)).replace(/^\uFEFF/, '')
  } catch {
    return ''
  }
}

// Front matter of an Outbox file, the same fields the Outbox panel reads.
function header(raw: string): Record<string, string> | undefined {
  const text = raw.replace(/\r\n?/g, '\n').replace(/^\s+(?=---)/, '')
  const m = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!m) return undefined
  const head: Record<string, string> = {}
  for (const line of (m[1] ?? '').split('\n')) {
    const at = line.indexOf(':')
    if (at < 1) continue
    let v = line.slice(at + 1).replace(/\s{2,}#\s.*$/, '').trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    head[line.slice(0, at).trim().toLowerCase()] = v
  }
  return head
}

// A "key: value" line in profile/preferences.md, outside HTML comments; '' when blank or missing.
function pref(prefs: string, key: string): string {
  const m = new RegExp(`^[ \\t]*(?:[-*][ \\t]+)?${key}:[ \\t]*(.*)$`, 'mi').exec(prefs.replace(/<!--[\s\S]*?-->/g, ''))
  return (m?.[1] ?? '').replace(/\s+#\s.*$/, '').replace(/[*`]/g, '').trim()
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// Days left on a visa unemployment clock, by the one formula in evaluate-job's visa-checks.md:
// used = visa_days_used + days from the later of visa_clock_start and the day after
// visa_days_used_as_of, through today, counting both ends. undefined when a number is missing.
export function visaDaysLeft(prefs: string, today: string): number | undefined {
  const start = toIso(pref(prefs, 'visa_clock_start'))
  const allowed = Number(pref(prefs, 'visa_days_allowed'))
  const usedText = pref(prefs, 'visa_days_used')
  const used = usedText === '' ? 0 : Number(usedText)
  if (!isIso(start) || !Number.isFinite(allowed) || allowed <= 0 || !Number.isFinite(used)) return undefined
  const asOf = toIso(pref(prefs, 'visa_days_used_as_of'))
  const from = isIso(asOf) && addDays(asOf, 1) > start ? addDays(asOf, 1) : start
  const running = from > today ? 0 : daysBetween(from, today) + 1
  return allowed - used - running
}

export async function collect($: any, today: string): Promise<Alert[]> {
  const prefs = await readText($, 'profile/preferences.md')
  const order = dateOrder(prefs)
  const tomorrow = addDays(today, 1)
  const alerts: Alert[] = []

  // Benefits and visa clocks keep running after a search is closed until the user clears them.
  const left = visaDaysLeft(prefs, today)
  if (left !== undefined && left <= 30) {
    alerts.push({ id: `visa|${today}`, rank: RANK.visa, date: today, text: `About ${Math.max(0, left)} days left on your visa unemployment clock (your own count; the official counter or your DSO has the real number). Type /today for details.` })
  }
  const certDay = pref(prefs, 'benefits_cert_day').toLowerCase()
  if (certDay !== '') {
    const [y = 1970, m = 1, d = 1] = today.split('-').map(Number)
    const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()] ?? ''
    if (weekday !== '' && certDay.slice(0, 3) === weekday.slice(0, 3)) {
      alerts.push({ id: `benefits|${today}`, rank: RANK.benefits, date: today, text: 'Today is your benefits certification day. Type /today for this period\'s work-search count.' })
    }
  }
  if (/^search_status:\s*closed/m.test(prefs)) return alerts.sort((a, b) => a.rank - b.rank)

  // Layoff plan: unchecked dated lines ("- [ ] 2026-10-12 (Mon): File for unemployment ...") due by tomorrow.
  for (const line of (await readText($, LAYOFF_PLAN)).split(/\r?\n/)) {
    const m = /^\s*[-*]\s*\[\s\]\s*(\d{4}-\d{2}-\d{2})\s*(?:\([^)]*\))?\s*:?\s*(.*)$/.exec(line)
    if (!m || !m[1] || m[1] > tomorrow) continue
    const what = (m[2] ?? '').replace(/\s*\(https?:[^)]*\)/g, '').replace(/\.\s.*$/, '').replace(/\.$/, '').trim()
    alerts.push({ id: `plan|${m[1]}|${what.toLowerCase()}`, rank: RANK.plan, date: m[1], text: `Layoff plan: ${what || 'a dated step'}, ${when(m[1], today)}.` })
  }

  // Jobs: interviews, offer answer-by dates, application deadlines, then any other next step due.
  const ownedFolders = new Set<string>()
  const tracker = table(await readText($, TRACKER), order)
  if (tracker.problem !== '') {
    alerts.push({ id: `damaged|tracker|${tracker.problem}|${today}`, rank: RANK.damaged, date: today, text: csvTrouble(tracker.problem, 'Your tracker (jobs/tracker.csv)') })
  }
  for (const { get, order: rowOrder } of tracker.rows) {
    const company = get('company')
    if (company === '') continue
    const role = get('role')
    const status = get('status').toLowerCase()
    const folder = get('folder')
    if (folder && JOB_OWNS_FOLLOWUP.includes(status)) ownedFolders.add(folder.toLowerCase())
    if (!OPEN.includes(status)) continue
    const key = `${company}|${role}|${folder || get('job_id') || get('link')}`.toLowerCase()
    const name = role ? `${company} (${role})` : company
    const next = get('next_action')
    const nextDate = toIso(get('next_action_date'), rowOrder)
    const deadline = toIso(get('deadline'), rowOrder)
    // A second commitment kept at the start of the notes ("Also: Interview 2026-10-12").
    const also = alsoOf(get('notes'), rowOrder)

    const isInterviewStep = /interview/i.test(next) && !/prep|thank/i.test(next)
    const interviewDate = isInterviewStep ? dateIn(next, today, rowOrder) || (isIso(nextDate) ? nextDate : '') : ''
    const alsoInterview = also && /interview/i.test(also.text) && !/prep|thank/i.test(also.text) ? also.date : ''
    const soonest = [interviewDate, alsoInterview].filter(d => d === today || d === tomorrow).sort()[0]
    if (soonest) {
      const day = soonest === today ? 'today' : 'tomorrow'
      alerts.push({ id: `interview|${key}|${soonest}`, rank: RANK.interview, date: soonest, text: `Interview ${day} with ${name}. Open your prep: /interview-prep ${folder || company}` })
      continue
    }
    if (status === 'offer' && isIso(deadline) && daysBetween(today, deadline) <= 3) {
      const by = deadline < today ? `overdue since ${deadline}` : deadline === today ? 'due today' : deadline === tomorrow ? `due tomorrow (${deadline})` : `due by ${deadline}`
      alerts.push({ id: `offer|${key}|${deadline}`, rank: RANK.offer, date: deadline, text: `Your answer to the ${company} offer is ${by}.` })
      continue
    }
    if (status === 'interested' && isIso(deadline) && deadline >= today && daysBetween(today, deadline) <= 3) {
      const n = daysBetween(today, deadline)
      const closes = n === 0 ? 'closes today' : n === 1 ? `closes tomorrow (${deadline})` : `closes in ${n} days (${deadline})`
      alerts.push({ id: `deadline|${key}|${deadline}`, rank: RANK.deadline, date: deadline, text: `The application for ${name} ${closes}.` })
      continue
    }
    if (isIso(nextDate) && nextDate <= today) {
      alerts.push({ id: `next|${key}|${nextDate}|${next.toLowerCase()}`, rank: RANK.followup, date: nextDate, text: `${name}: ${next || 'next step'}, ${when(nextDate, today)}.` })
    } else if (also && isIso(also.date) && also.date <= today) {
      alerts.push({ id: `also|${key}|${also.date}`, rank: RANK.followup, date: also.date, text: `${name}: ${also.text}, ${when(also.date, today)}.` })
    }
  }

  // Contacts: only pure networking follow-ups. A contact tied to a job that's applied or later is
  // followed up through that job's row, so it's skipped here and never counted twice.
  const contacts = table(await readText($, CONTACTS), order)
  if (contacts.problem !== '') {
    alerts.push({ id: `damaged|contacts|${contacts.problem}|${today}`, rank: RANK.damaged, date: today, text: csvTrouble(contacts.problem, 'Your contacts file (contacts/contacts.csv)') })
  }
  for (const { get, order: rowOrder } of contacts.rows) {
    const name = get('name')
    const date = toIso(get('next_followup'), rowOrder)
    if (name === '' || !isIso(date) || date > today) continue
    if (get('status').toLowerCase() === 'cold' || Number(get('touches') || 0) >= 2) continue
    if (get('job') && ownedFolders.has(get('job').toLowerCase())) continue
    const company = get('company')
    alerts.push({ id: `contact|${name.toLowerCase()}|${company.toLowerCase()}|${date}`, rank: RANK.followup, date, text: `Follow up with ${name}${company ? ` (${company})` : ''}, ${when(date, today)}.` })
  }

  // Outbox: Gmail drafts the user hasn't sent after more than 2 days.
  let entries: Array<{ name: string; kind: string }> = []
  try { entries = (await $.fs.exists(OUTBOX)) ? await $.fs.list(OUTBOX) : [] } catch { entries = [] }
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.md') || entry.name.startsWith('_')) continue
    const head = header(await readText($, `${OUTBOX}/${entry.name}`))
    if (!head || (head.status ?? '').toLowerCase() !== 'in-gmail-drafts') continue
    const since = toIso((head.status_at || head.created || '').slice(0, 10))
    if (!isIso(since)) continue
    const waited = daysBetween(since, today)
    if (waited <= 2) continue
    const who = (head.contact || head.to || '').split(/[;,]/)[0]?.trim() ?? ''
    alerts.push({ id: `gmail|${entry.name}`, rank: RANK.gmail, date: since, text: `Your Gmail draft${who ? ` to ${who}` : ''} has waited ${waited} days. Send it from Gmail, then press Mark sent in /outbox.` })
  }

  return alerts.sort((a, b) => a.rank - b.rank || a.date.localeCompare(b.date) || a.text.localeCompare(b.text))
}

export function message(alerts: Alert[]): string {
  const lines = alerts.slice(0, MAX_LINES).map(a => a.text)
  const more = alerts.length - lines.length
  if (more > 0) lines.push(`...and ${more} more. Type /today to see everything.`)
  return lines.join('\n')
}

// Show what's due that hasn't been shown yet today. Quiet when there's nothing new.
async function check($: any): Promise<void> {
  const today = localDate(await $.clock.now())
  const alerts = await collect($, today)
  let seen: string[] = []
  try {
    const stored = (await $.store.get('shown')) as Seen | undefined
    if (stored && stored.date === today && Array.isArray(stored.ids)) seen = stored.ids
  } catch { /* no memory available: show it anyway */ }
  const fresh = alerts.filter(a => !seen.includes(a.id))
  if (fresh.length === 0) return
  try { await $.store.set('shown', { date: today, ids: [...seen, ...fresh.map(a => a.id)] }) } catch { /* best effort */ }
  $.ui.toast(message(fresh), { timeoutMs: 15000 })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if (!e.isInteractive) return next(e)
    let day = localDate(await $.clock.now())
    await check($).catch(() => undefined)
    // Once a minute, only notice whether the date changed; read the files again only when it has.
    $.clock.every(60000, () => {
      void (async () => {
        const now = localDate(await $.clock.now())
        if (now === day) return
        day = now
        await check($)
      })().catch(() => undefined)
    })
    return next(e)
  })
}
