import type { Register } from 'claude-code'

// Due alerts: one short toast when a session opens (and again if the date rolls over while it is
// open) listing what is due today or tomorrow, most urgent first. It only reads the user's files
// (jobs/tracker.csv, contacts/contacts.csv, outbox/); the session-start hook already gives Claude the
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
const RANK = { interview: 0, offer: 1, deadline: 2, followup: 3, gmail: 4 }

// Same CSV reader as the Pipeline mod: quoted cells, doubled quotes, line breaks inside quotes, CRLF.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(v => v.trim() !== ''))
}

// Rows as lookups by lower-case column name, so column order and extra columns don't matter.
function table(text: string): Array<(col: string) => string> {
  const [header = [], ...rows] = parseCsv(text)
  const names = header.map(h => h.trim().toLowerCase())
  return rows.map(r => (col: string) => {
    const i = names.indexOf(col)
    return i >= 0 ? (r[i] ?? '').trim() : ''
  })
}

const pad = (n: number | string) => String(n).padStart(2, '0')

// Local calendar date (never UTC), so "today" flips at the user's midnight.
function localDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Midnight local time of a YYYY-MM-DD date, plus some days.
function dayOf(iso: string, days = 0): Date {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number)
  return new Date(y, m - 1, d + days)
}

const addDays = (iso: string, days: number) => localDate(dayOf(iso, days).getTime())

const daysBetween = (a: string, b: string) => Math.round((dayOf(b).getTime() - dayOf(a).getTime()) / 86400000)

const isIso = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

// Excel may rewrite dates as 14/10/2026 or 10/14/26, in the order of the user's region. Same rules as
// the Pipeline panel: a slash date is read only when its order is certain (a part over 12, both parts
// the same, or a US or day-first home_base); otherwise it is not read at all, so no alert is guessed.
type DateOrder = 'mdy' | 'dmy' | ''
const US_STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY'
function dateOrder(prefs: string): DateOrder {
  const home = /^[ \t]*home_base:[ \t]*(.*)$/m.exec(prefs)?.[1]?.trim() ?? ''
  if (/\b(USA|U\.S\.A?\.?|United States)\b/i.test(home) || new RegExp(`,\\s*(${US_STATES})\\b`).test(home)) return 'mdy'
  if (/\b(UK|U\.K\.|United Kingdom|Britain|England|Scotland|Wales|Ireland|Australia|New Zealand|India|South Africa|Singapore|Germany|France|Spain|Italy|Portugal|Netherlands|Belgium|Brazil|Mexico)\b/i.test(home)) return 'dmy'
  return ''
}

// [month, day] of two slash-separated numbers, or undefined when the order can't be known.
function monthDay(a: number, b: number, order: DateOrder): [number, number] | undefined {
  const [mo, da] = a === b ? [a, b] : a > 12 ? [b, a] : b > 12 ? [a, b] : order === 'mdy' ? [a, b] : order === 'dmy' ? [b, a] : [0, 0]
  return mo >= 1 && mo <= 12 && da >= 1 && da <= 31 ? [mo, da] : undefined
}

function toIso(v: string, order: DateOrder = ''): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(v.trim())
  if (!m) return v.trim()
  const [, a = '', b = '', year = ''] = m
  const md = monthDay(Number(a), Number(b), order)
  return md ? `${year.length === 2 ? `20${year}` : year}-${pad(md[0])}-${pad(md[1])}` : v.trim()
}

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

export async function collect($: any, today: string): Promise<Alert[]> {
  const prefs = await readText($, 'profile/preferences.md')
  if (/^search_status:\s*closed/m.test(prefs)) return []
  const order = dateOrder(prefs)
  const tomorrow = addDays(today, 1)
  const alerts: Alert[] = []

  // Jobs: interviews, offer answer-by dates, application deadlines, then any other next step due.
  const ownedFolders = new Set<string>()
  for (const get of table(await readText($, TRACKER))) {
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
    const nextDate = toIso(get('next_action_date'), order)
    const deadline = toIso(get('deadline'), order)

    const isInterviewStep = /interview/i.test(next) && !/prep|thank/i.test(next)
    const interviewDate = isInterviewStep ? dateIn(next, today, order) || (isIso(nextDate) ? nextDate : '') : ''
    if (interviewDate === today || interviewDate === tomorrow) {
      const day = interviewDate === today ? 'today' : 'tomorrow'
      alerts.push({ id: `interview|${key}|${interviewDate}`, rank: RANK.interview, date: interviewDate, text: `Interview ${day} with ${name}. Open your prep: /interview-prep ${folder || company}` })
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
    }
  }

  // Contacts: only pure networking follow-ups. A contact tied to a job that's applied or later is
  // followed up through that job's row, so it's skipped here and never counted twice.
  for (const get of table(await readText($, CONTACTS))) {
    const name = get('name')
    const date = toIso(get('next_followup'), order)
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
