import type { Register } from 'claude-code'

import { addDays, alsoOf, csvTrouble, dateOrder, daysBetween, isIso, localDate, monthDay, orderFor, readCsv, toIso } from './csvdate'
import type { DateOrder } from './csvdate'

// Due alerts: one short toast when a session opens (and again if the date rolls over while it is
// open) listing what is due today or tomorrow, most urgent first. It only reads the user's files
// (jobs/tracker.csv, contacts/contacts.csv, outbox/, jobs/layoff-plan.md, profile/preferences.md). The
// startup note (.claude/hooks/summary.sh, session-start.ps1) gives Claude the same facts as context: job
// items in full, contact follow-ups and Gmail drafts left over 2 days as one short line. So this pop-up is
// for the user's eyes only and never adds anything to the chat.
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
  if (iso) { const d = `${iso[1]}-${pad(iso[2] ?? '')}-${pad(iso[3] ?? '')}`; return isIso(d) ? d : '' }
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

// The day of a booked interview from its next step and next_action_date. A slash date in the text whose order isn't
// settled by itself (both parts 12 or under, and different) was read with the row's evidence or date_order; when the
// row's next_action_date is a clear date that is one of that text's two readings, the clear column wins (a save may
// have tidied the day-first cell that proved the order: review J5-11). Otherwise the text's date, then the column.
function interviewDay(next: string, nextDate: string, today: string, order: DateOrder): string {
  const fromText = dateIn(next, today, order)
  if (isIso(nextDate) && fromText !== nextDate && !/\d{4}-\d{1,2}-\d{1,2}/.test(next)) {
    const m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/.exec(next)
    const a = Number(m?.[1]), b = Number(m?.[2])
    if (m && a !== b && a <= 12 && b <= 12 && (dateIn(next, today, 'mdy') === nextDate || dateIn(next, today, 'dmy') === nextDate)) return nextDate
  }
  return fromText || (isIso(nextDate) ? nextDate : '')
}

// A booked interview ("Interview 2026-10-07", "Onsite interview"), not a step around one: preparing,
// thanking, or the playbook's "Schedule interview" (reply with your availability) aren't interviews.
export function isBookedInterview(text: string): boolean {
  return /interview/i.test(text) && !/prep|thank|schedul|availability|arrange|\bbook/i.test(text)
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

// Whether today is the benefits certification day written in preferences: a weekday ("Tuesday",
// "every Monday") or every other weekday from a first date ("every other Monday from 2026-10-12").
// Same rules as the startup summary (.claude/hooks/summary.sh). Anything else ("UK journal: before
// each work coach appointment") is not a date and raises no alert.
export function isCertDay(raw: string, today: string): boolean {
  const cd = raw.toLowerCase().trim()
  const [y = 1970, m = 1, d = 1] = today.split('-').map(Number)
  const wd = (WEEKDAYS[new Date(y, m - 1, d).getDay()] ?? '').slice(0, 3)
  if (wd === '' || cd === '') return false
  const other = /every other ([a-z]+) from (\d{4}-\d{2}-\d{2})/.exec(cd)
  if (other) {
    const first = other[2] ?? ''
    return (other[1] ?? '').slice(0, 3) === wd && isIso(first) && first <= today && daysBetween(first, today) % 14 === 0
  }
  const weekly = /^(?:every )?(mon|tue|wed|thu|fri|sat|sun)[a-z]*(?:[ ,.;(]|$)/.exec(cd)
  return weekly !== null && weekly[1] === wd
}

// Days left on a visa unemployment clock, by the one formula in evaluate-job's visa-checks.md:
// used = visa_days_used + days from the later of visa_clock_start and the day after
// visa_days_used_as_of, through today, counting both ends. undefined when a number is missing:
// "All four numbers are needed: if any is missing, don't estimate" (a blank visa_days_used is not 0;
// /today and the startup summary name the missing number). visa_days_used_as_of may be blank.
export function visaDaysLeft(prefs: string, today: string): number | undefined {
  const start = toIso(pref(prefs, 'visa_clock_start'))
  const allowedText = pref(prefs, 'visa_days_allowed')
  const usedText = pref(prefs, 'visa_days_used')
  if (!/^\d+/.test(allowedText) || !/^\d+/.test(usedText)) return undefined
  const allowed = parseInt(allowedText, 10)
  const used = parseInt(usedText, 10)
  if (!isIso(start) || allowed <= 0) return undefined
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
  if (isCertDay(pref(prefs, 'benefits_cert_day'), today)) {
    alerts.push({ id: `benefits|${today}`, rank: RANK.benefits, date: today, text: 'Today is your benefits certification day. Type /today for this period\'s work-search count.' })
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
    // A signed contract keeps one reminder: "Decide next step" about four weeks before it ends
    // (knowledge/freelance-and-contract.md). It alerts like any next step; other closed rows never do.
    const contractReminder = status === 'accepted' && /^\s*decide next step/i.test(get('next_action'))
    if (!OPEN.includes(status) && !contractReminder) continue
    const key = `${company}|${role}|${folder || get('job_id') || get('link')}`.toLowerCase()
    const name = role ? `${company} (${role})` : company
    const next = get('next_action')
    const nextDate = toIso(get('next_action_date'), rowOrder)
    const deadline = toIso(get('deadline'), rowOrder)
    // A second commitment kept at the start of the notes ("Also: Interview 2026-10-12").
    const also = alsoOf(get('notes'), rowOrder)

    const isInterviewStep = isBookedInterview(next)
    const interviewDate = isInterviewStep ? interviewDay(next, nextDate, today, rowOrder) : ''
    const alsoInterview = also && isBookedInterview(also.text) ? also.date : ''
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
    // Not cold; not after 2 unanswered messages (the cap is for people who haven't replied: a reminder the
    // user set for someone at replied, talked or referred still counts). Same rule as the Contacts board.
    const status = get('status').toLowerCase() || 'to-contact'
    if (status === 'cold' || (['to-contact', 'contacted'].includes(status) && (parseInt(get('touches'), 10) || 0) >= 2)) continue
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

// How long the pop-up stays: long enough to read slowly (about 100 words a minute, WCAG 2.2.1),
// never under 15 seconds or over a minute. The pointer over it holds it, a click takes it off, and
// /today always shows the same list again, so nothing is lost when it goes.
export function showFor(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.min(60000, Math.max(15000, words * 600))
}

// Show what's due that hasn't been shown yet today. Quiet when there's nothing new.
async function check($: any): Promise<void> {
  const today = localDate(await $.clock.now())
  const alerts = await collect($, today)
  let seen: string[] = []
  // The plugin's store is shared by every folder on this computer, so what was shown is kept per folder.
  const root: string = await Promise.resolve().then(() => $.session.root()).catch(() => '')
  const key = `shown:${root}`
  try {
    const stored = (await $.store.get(key)) as Seen | undefined
    if (stored && stored.date === today && Array.isArray(stored.ids)) seen = stored.ids
  } catch { /* no memory available: show it anyway */ }
  const fresh = alerts.filter(a => !seen.includes(a.id))
  if (fresh.length === 0) return
  // Only the alerts the pop-up names count as shown; the ones behind "...and N more" come back next time.
  try { await $.store.set(key, { date: today, ids: [...seen, ...fresh.slice(0, MAX_LINES).map(a => a.id)] }) } catch { /* best effort */ }
  const text = message(fresh)
  $.ui.toast(text, { timeoutMs: showFor(text) })
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
