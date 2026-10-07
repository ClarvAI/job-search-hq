import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Contact, Notice, Summary } from '../types'

// Contacts board: the user's networking board over contacts/contacts.csv (the single source of truth).
// The user records what actually happened (a message sent, a reply, a conversation, a referral);
// each change follows the playbook rules in knowledge/job-search-playbook.md, is written straight
// back to contacts.csv, logged in history/activity.md, and noted for Claude as a [Contacts] note.

const PANE = 'contacts'
const CONTACTS = 'contacts/contacts.csv'
const TRACKER = 'jobs/tracker.csv'
const ACTIVITY = 'history/activity.md'
const HEADER = ['name', 'company', 'title', 'relationship', 'how_we_met', 'last_contact', 'next_followup', 'status', 'touches', 'job', 'linkedin', 'email', 'notes']
const MAX_TOUCHES = 2
const COLUMNS = [
  { value: 'to-contact', label: 'To contact' },
  { value: 'contacted', label: 'Contacted, waiting' },
  { value: 'replied', label: 'Replied' },
  { value: 'talked', label: 'Talked' },
  { value: 'referred', label: 'Referred me' },
]
const STATUSES = [...COLUMNS.map(c => c.value), 'cold']
const statusLabel = (v: string) => COLUMNS.find(c => c.value === v)?.label ?? (v === 'cold' ? 'Cold' : v)
// Once a job is applied or later, its tracker row owns the follow-up date (playbook, "Who owns the follow-up date").
const APPLIED_OR_LATER = ['applied', 'screening', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn', 'ghosted']
const RELATIONSHIPS: Record<string, string> = {
  'family-intro': 'family intro', 'former-manager': 'former manager', 'former-colleague': 'former colleague',
  alum: 'alum', 'linkedin-connection': 'LinkedIn connection', recruiter: 'recruiter', 'hiring-manager': 'hiring manager',
  interviewer: 'interviewer', 'met-at-event': 'met at an event', cold: 'cold outreach',
}

const summary = atom({ plugin: 'contacts-board', key: 'summary' } as const, null as Summary | null)
const isHidden = atom({ plugin: 'contacts-board', key: 'isHidden' } as const, false)
const armed = atom({ plugin: 'contacts-board', key: 'armed' } as const, '')
const showCold = atom({ plugin: 'contacts-board', key: 'showCold' } as const, false)
const notice = atom({ plugin: 'contacts-board', key: 'notice' } as const, { text: '', isError: false } as Notice)

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

function toCsv(rows: string[][]): string {
  const q = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return rows.map(r => r.map(q).join(',')).join('\n') + '\n'
}

function localDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const parts = (iso: string): [number, number, number] => { const [y = 0, m = 1, d = 1] = iso.split('-').map(Number); return [y, m, d] }

function addDays(iso: string, days: number, businessOnly = false): string {
  const [y, m, d] = parts(iso)
  const date = new Date(y, m - 1, d)
  let left = days
  while (left > 0) {
    date.setDate(date.getDate() + 1)
    const wd = date.getDay()
    if (!businessOnly || (wd !== 0 && wd !== 6)) left--
  }
  return localDate(date.getTime())
}

function minusDays(iso: string, days: number): string {
  const [y, m, d] = parts(iso)
  return localDate(new Date(y, m - 1, d - days).getTime())
}

// Excel may rewrite dates as 14/10/2026 or 10/14/26, in the order of the user's region. Same rules as
// the Pipeline panel: a slash date is read only when its order is certain (a part over 12, both parts
// the same, or a US or day-first home_base); otherwise it stays as written for the user to confirm.
const DATE_COLS = ['last_contact', 'next_followup']
type DateOrder = 'mdy' | 'dmy' | ''
const US_STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY'
function dateOrder(prefs: string): DateOrder {
  const home = /^[ \t]*home_base:[ \t]*(.*)$/m.exec(prefs)?.[1]?.trim() ?? ''
  if (/\b(USA|U\.S\.A?\.?|United States)\b/i.test(home) || new RegExp(`,\\s*(${US_STATES})\\b`).test(home)) return 'mdy'
  if (/\b(UK|U\.K\.|United Kingdom|Britain|England|Scotland|Wales|Ireland|Australia|New Zealand|India|South Africa|Singapore|Germany|France|Spain|Italy|Portugal|Netherlands|Belgium|Brazil|Mexico)\b/i.test(home)) return 'dmy'
  return ''
}
async function readOrder($: any): Promise<DateOrder> {
  const prefs: string = (await $.fs.exists('profile/preferences.md').catch(() => false)) ? await $.fs.read('profile/preferences.md').catch(() => '') : ''
  return dateOrder(prefs)
}
function toIso(v: string, order: DateOrder = ''): string {
  const t = v.trim()
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t)
  if (!m || !m[3]) return t
  const a = Number(m[1]), b = Number(m[2])
  const [mo = 0, da = 0] = a === b ? [a, b] : a > 12 ? [b, a] : b > 12 ? [a, b] : order === 'mdy' ? [a, b] : order === 'dmy' ? [b, a] : [0, 0]
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return t
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${pad(mo)}-${pad(da)}`
}
// A cell never starts with = + - @ or a tab: Excel would run it as a formula, so those are dropped.
const safeCell = (v: string) => v.replace(/[\r\n]+/g, ' ').replace(/^[\s=+\-@]+/, '')
const isIso = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = parts(a), [y2, m2, d2] = parts(b)
  return Math.round((new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) / 86400000)
}

function ago(iso: string, today: string): string {
  if (!isIso(iso)) return iso
  const n = daysBetween(iso, today)
  return n <= 0 ? `${iso} (today)` : n === 1 ? `${iso} (yesterday)` : `${iso} (${n} days ago)`
}

function friendlyDate(iso: string, today: string): string {
  if (!isIso(iso)) return `date unclear: ${iso}`
  if (iso < today) return `overdue since ${iso}`
  if (iso === today) return 'due today'
  return `${iso} (in ${daysBetween(today, iso)} days)`
}

const toNumber = (v: string) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : 0 }
const normStatus = (v: string) => { const s = v.trim().toLowerCase(); return s === '' ? 'to-contact' : s }

// A contact's identity: name + company, plus email or LinkedIn when there is one, so two people
// with the same name at the same company stay apart.
function keyOf(get: (c: string) => string): string {
  const extra = (get('email') || get('linkedin')).trim().toLowerCase()
  return [get('name').trim().toLowerCase(), get('company').trim().toLowerCase(), extra].filter(Boolean).join('|')
}

async function jobStatuses($: any): Promise<Record<string, string>> {
  const raw: string = ((await $.fs.exists(TRACKER)) ? await $.fs.read(TRACKER).catch(() => '') : '').replace(/^\uFEFF/, '')
  const [header = [], ...rows] = parseCsv(raw)
  const fi = header.findIndex(h => h.trim().toLowerCase() === 'folder')
  const si = header.findIndex(h => h.trim().toLowerCase() === 'status')
  const out: Record<string, string> = {}
  if (fi < 0 || si < 0) return out
  for (const r of rows) {
    const folder = (r[fi] ?? '').trim().toLowerCase()
    if (folder) out[folder] = (r[si] ?? '').trim().toLowerCase()
  }
  return out
}

async function load($: any): Promise<Summary> {
  const today = localDate(await $.clock.now())
  const hasFile: boolean = await $.fs.exists(CONTACTS)
  const raw = (hasFile ? await $.fs.read(CONTACTS) : '').replace(/^\uFEFF/, '')
  const [header = [], ...rows] = parseCsv(raw)
  const col = (name: string) => header.findIndex(h => h.trim().toLowerCase() === name)
  const at = (r: string[], name: string) => (col(name) >= 0 ? (r[col(name)] ?? '').trim() : '')
  const jobs = await jobStatuses($)
  const order = await readOrder($)
  const contacts: Contact[] = rows.map(r => {
    const job = at(r, 'job')
    const jobStatus = job ? jobs[job.toLowerCase()] ?? '' : ''
    return {
      key: keyOf(c => at(r, c)),
      name: at(r, 'name'),
      company: at(r, 'company'),
      title: at(r, 'title'),
      relationship: at(r, 'relationship').toLowerCase(),
      lastContact: toIso(at(r, 'last_contact'), order),
      nextFollowup: toIso(at(r, 'next_followup'), order),
      status: normStatus(at(r, 'status')),
      touches: toNumber(at(r, 'touches')),
      job,
      jobStatus,
      jobOwnsFollowup: APPLIED_OR_LATER.includes(jobStatus),
    }
  }).filter(c => c.name !== '')
  const counts: Record<string, number> = {}
  for (const c of contacts) counts[c.status] = (counts[c.status] ?? 0) + 1
  const byDate = (a: Contact, b: Contact) => (a.nextFollowup || '9999').localeCompare(b.nextFollowup || '9999') || a.name.localeCompare(b.name)
  contacts.sort(byDate)
  const due = contacts.filter(c => c.status !== 'cold' && isIso(c.nextFollowup) && c.nextFollowup <= today)
  return { today, contacts, due, counts, hasFile }
}

async function refresh($: any): Promise<Summary> {
  const next = await load($)
  const before = await read($, summary)
  if (JSON.stringify(before) !== JSON.stringify(next)) await update($, summary, () => next)
  return next
}

async function say($: any, text: string, isError = false): Promise<void> {
  await update($, notice, () => ({ text, isError }))
}

async function tellClaude($: any, text: string): Promise<void> {
  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } }).catch(() => undefined)
}

// One line in history/activity.md, so Codex (or a later Claude session) knows what the user changed here.
async function logActivity($: any, what: string): Promise<void> {
  const d = new Date(await $.clock.now())
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${localDate(d.getTime())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  const lineOut = `- ${stamp} · Contacts panel (Claude) · ${what.replace(/[\r\n]+/g, ' ')}\n`
  try {
    const before: string = (await $.fs.exists(ACTIVITY)) ? await $.fs.read(ACTIVITY) : '# Recent activity\n\n'
    await $.fs.write(ACTIVITY, before.replace(/\n*$/, '\n') + lineOut)
    const after: string = await $.fs.read(ACTIVITY)
    if (!after.includes(lineOut)) await $.fs.write(ACTIVITY, after.replace(/\n*$/, '\n') + lineOut)
  } catch { /* the log is a convenience; never block a contacts save on it */ }
}

type Change = (get: (c: string) => string, set: (c: string, v: string) => void, today: string) => { what: string; forClaude?: string } | string

// Read contacts.csv fresh, change one person's row, write it back, log it, and tell Claude.
// Returns false when nothing was saved (the pane already says why).
async function saveContact($: any, key: string, change: Change): Promise<boolean> {
  const today = localDate(await $.clock.now())
  let result: { what: string; forClaude?: string } = { what: '' }
  const order = await readOrder($)
  for (let attempt = 0; ; attempt++) {
    if (!(await $.fs.exists(CONTACTS))) { await say($, 'Your contacts file (contacts/contacts.csv) is missing. Ask Claude to check it.', true); return false }
    const original: string = await $.fs.read(CONTACTS)
    const rows = parseCsv(original.replace(/^\uFEFF/, ''))
    if (rows.length === 0) rows.push([...HEADER])
    const header = rows[0] ?? []
    const find = (c: string) => header.findIndex(h => h.trim().toLowerCase() === c)
    const idx = (c: string) => {
      let i = find(c)
      if (i < 0) { header.push(c); i = header.length - 1 }
      return i
    }
    const target = rows.slice(1).find(r => keyOf(c => (find(c) >= 0 ? (r[find(c)] ?? '') : '')) === key)
    if (!target) { await say($, 'That person is no longer in your contacts file. Press Refresh, or ask Claude to check it.', true); return false }
    // Only this person's dates are tidied, and only when their order is certain; other rows stay as they are.
    for (const c of DATE_COLS) { const i = find(c); if (i >= 0 && target[i]) target[i] = toIso(target[i], order) }
    const get = (c: string) => (find(c) >= 0 ? (target[find(c)] ?? '') : '').trim()
    const set = (c: string, v: string) => { const i = idx(c); while (target.length <= i) target.push(''); target[i] = safeCell(v) }
    const out = change(get, set, today)
    result = typeof out === 'string' ? { what: out } : out
    if (result.what === '') return false
    for (const r of rows) while (r.length < header.length) r.push('')
    const next = (original.startsWith('\uFEFF') ? '\uFEFF' : '') + toCsv(rows)
    try {
      // Re-read right before writing: if Claude, Codex or Excel changed the file meanwhile, redo the change on the new version.
      if ((await $.fs.read(CONTACTS)) !== original) {
        if (attempt < 3) continue
        await say($, 'Your contacts file kept changing while saving (another app may be editing it). Try again in a moment.', true)
        return false
      }
      await $.fs.write(CONTACTS, next)
    } catch {
      await say($, 'Your contacts file is open in another app (like Excel). Save and close it there, then try again.', true)
      return false
    }
    // If another app saved at the same instant, never redo the change (it would count a message twice);
    // check that the saved row is still there instead.
    const back: string = await $.fs.read(CONTACTS).catch(() => next)
    if (back !== next && !parseCsv(back.replace(/^\uFEFF/, '')).some(r => r.length >= target.length && target.every((v, i) => (r[i] ?? '') === v))) {
      await update($, armed, () => '')
      await refresh($).catch(() => undefined)
      await say($, 'Another app saved your contacts file at the same moment, so this change may not have stuck. Check the person below and try again if needed.', true)
      return false
    }
    break
  }
  await logActivity($, result.what)
  await update($, armed, () => '')
  await refresh($)
  await say($, `Saved: ${result.what}.`)
  await tellClaude($, `[Contacts] The user updated contacts/contacts.csv from the contacts board: ${result.what}.${result.forClaude ? ` ${result.forClaude}` : ''} Re-read the row before describing it to the user.`)
  return true
}

const who = (c: Contact) => `${c.name}${c.company ? ` (${c.company})` : ''}`

async function messageSent($: any, c: Contact, value: string): Promise<void> {
  const date = value.trim()
  const today = localDate(await $.clock.now())
  if (!isIso(date)) { await say($, 'Type the date as YYYY-MM-DD, for example 2026-10-06.', true); return }
  if (date > today) { await say($, 'That date is in the future. Record a message once you have sent it.', true); return }
  // The linked job's status is read fresh, so a just-submitted application takes over the follow-up.
  const jobs = await jobStatuses($)
  await saveContact($, c.key, (get, set) => {
    const status = normStatus(get('status'))
    const touches = toNumber(get('touches')) + 1
    const job = get('job')
    const jobStatus = job ? jobs[job.toLowerCase()] ?? '' : ''
    const owned = APPLIED_OR_LATER.includes(jobStatus)
    const last = get('last_contact')
    // last_contact is the newest message; recording an older one doesn't move it back.
    if (!isIso(last) || date >= last) set('last_contact', date)
    set('touches', String(touches))
    // Status moves to contacted only from to-contact or blank: never backwards from replied, talked or referred (or out of cold).
    const moved = get('status') === '' || status === 'to-contact'
    if (moved) set('status', 'contacted')
    let extra = ''
    let forClaude = ''
    if (owned) {
      forClaude = `${c.name}'s job (${job}) is ${jobStatus}, so the job row owns the follow-up date and next_followup stays empty on the contact. Only if this message was an actual follow-up about the application, add 1 to that job's followups in jobs/tracker.csv and set its next_action_date per the follow-up cadence. A thank-you note, a scheduling reply or other correspondence does not count as a follow-up and must not replace an interview or offer next step; ask the user if you can't tell which it was.`
      extra = '; follow-up date stays with the job'
    } else if (touches >= MAX_TOUCHES) {
      set('next_followup', '')
      extra = `; ${touches} messages with no reply, so no more follow-ups (stop here)`
      forClaude = `That is ${touches} messages with no reply: per the playbook, stop here. Do not draft another follow-up; suggest marking them cold if nothing comes back.`
    } else {
      set('next_followup', addDays(date, 5, true))
      extra = `; follow up on ${get('next_followup')} if no reply`
    }
    forClaude += ' If an Outbox draft to this person matches this message, set it to sent (sent: ' + date + ') and move it to outbox/sent/.'
    return {
      what: `${who(c)}: message sent ${date}${moved ? ', now Contacted' : ''}; ${touches} with no reply${extra}`,
      forClaude: forClaude.trim(),
    }
  })
}

async function theyReplied($: any, c: Contact): Promise<void> {
  await saveContact($, c.key, (get, set) => {
    const status = normStatus(get('status'))
    const moved = ['to-contact', 'contacted', 'cold'].includes(status)
    if (moved) set('status', 'replied')
    set('touches', '0')
    const hadDate = get('next_followup') !== ''
    set('next_followup', '')
    return {
      what: `${who(c)} replied${moved ? ', now Replied' : ''}; unanswered count back to 0${hadDate ? '; follow-up date cleared' : ''}`,
      forClaude: `Offer to draft a reply to ${c.name} into the Outbox (network skill). If the reply is about a job (${c.job || 'none linked'}), update jobs/tracker.csv too.`,
    }
  })
}

async function weTalked($: any, c: Contact): Promise<void> {
  const ok = await saveContact($, c.key, (get, set) => {
    const status = normStatus(get('status'))
    const moved = status !== 'referred'
    if (moved) set('status', 'talked')
    set('touches', '0')
    set('next_followup', '')
    return {
      what: `${who(c)}: talked${moved ? ', now Talked' : ''}`,
      forClaude: `Follow the network skill's "After a conversation" steps: offer to draft a thank-you note within 24 hours that mentions one specific thing ${c.name} said (into the Outbox), log what the user learned in the contact's notes, and ask "who else should I talk to?".`,
    }
  })
  if (ok) await $.prompt.fill({ text: `I just talked with ${who(c)}. Help me draft a thank-you note and log what I learned: ` })
}

async function referredMe($: any, c: Contact): Promise<void> {
  const ok = await saveContact($, c.key, (get, set) => {
    set('status', 'referred')
    set('touches', '0')
    set('next_followup', '')
    return {
      what: `${who(c)} referred the user${c.job ? ` (job: ${c.job})` : ''}`,
      forClaude: c.job
        ? `Update the job row for ${c.job} in jobs/tracker.csv: put ${c.name} in its contact column and note the referral in its notes (ask before changing its status). Offer a thank-you note to ${c.name} in the Outbox, and remind the user to send ${c.name} an update when they hear back.`
        : `No job is linked to ${c.name}: ask the user which job the referral is for, then put ${c.name} in that job row's contact column, note the referral, and set the contact's job column. Offer a thank-you note to ${c.name} in the Outbox.`,
    }
  })
  if (ok) await $.prompt.fill({ text: `${who(c)} referred me. Update my tracker and help me thank them: ` })
}

async function markCold($: any, c: Contact): Promise<void> {
  await saveContact($, c.key, (_get, set) => {
    set('status', 'cold')
    set('next_followup', '')
    return { what: `${who(c)}: no reply after ${c.touches} messages, now Cold` }
  })
}

async function setFollowup($: any, c: Contact, value: string): Promise<void> {
  const v = value.trim()
  if (v !== '' && !isIso(v)) { await say($, 'Type the date as YYYY-MM-DD, for example 2026-10-14.', true); return }
  const jobs = await jobStatuses($)
  const jobStatus = c.job ? jobs[c.job.toLowerCase()] ?? '' : ''
  if (v !== '' && APPLIED_OR_LATER.includes(jobStatus)) {
    await say($, `Your application for ${c.job} owns this follow-up date. Change it on the job board (/pipeline) instead.`, true)
    return
  }
  await saveContact($, c.key, (_get, set) => {
    set('next_followup', v)
    return v === '' ? `${who(c)}: follow-up date cleared` : `${who(c)}: follow-up set for ${v}`
  })
}

function draftPrompt(c: Contact): string {
  const person = `${c.name}${c.title ? `, ${c.title}` : ''}${c.company ? ` at ${c.company}` : ''}`
  if (c.status === 'to-contact') return `/network Draft a first message to ${person} (from my contacts) and put it in my Outbox.`
  if (c.status === 'contacted') return `/follow-up Draft a follow-up to ${person} (from my contacts) and put it in my Outbox.`
  if (c.status === 'referred') return `/network Draft a thank-you and update to ${person}, who referred me, and put it in my Outbox.`
  if (c.status === 'talked') return `/network Draft my next message to ${person} (we talked) and put it in my Outbox.`
  if (c.status === 'replied') return `/network Draft a reply to ${person}, who replied to me, and put it in my Outbox.`
  return `/network Draft a message to ${person} and put it in my Outbox.`
}

function line(s: Summary): string {
  const n = s.due.length
  return n === 0 ? '' : `Contacts: ${n} ${n === 1 ? 'follow-up' : 'follow-ups'} due`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'contacts', description: 'Open your networking board: record messages, replies, conversations and referrals' })
    await refresh($).catch(() => null)
    $.clock.every(30000, () => void refresh($).catch(() => undefined))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await refresh($).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'contacts' }, async $ => {
    const s = await refresh($)
    await update($, isHidden, () => false)
    await update($, armed, () => '')
    await say($, '')
    await $.ui.open({ id: PANE, title: 'Contacts' })
    const total = s.contacts.length
    return { text: total === 0 ? 'Contacts board opened. No contacts yet.' : `Contacts board opened: ${total} ${total === 1 ? 'person' : 'people'}${s.due.length ? `, ${s.due.length} follow-up${s.due.length === 1 ? '' : 's'} due` : ''}.` }
  })

  // A quiet part of the line above the prompt, only when a follow-up is due. Whatever the bands
  // beneath drew (the Pipeline's summary, the Job Inbox count) comes first, on the same line.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, summary)
    if (e.props.hasSurvey || s === null || line(s) === '' || (await read($, isHidden))) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const mine = (
      <Box key="contacts-band" flexDirection="row" gap={1}>
        <Text color="warning">{line(s)}</Text>
        <Button key="contacts-open" label="Open contacts" plain onPress={() => $.ui.open({ id: PANE, title: 'Contacts' })} />
        <Button key="contacts-hide" label="Hide" plain dimColor onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
    const below: any = await next(e)
    if (below && typeof below === 'object' && typeof below.type === 'string' && below.type !== 'engine') {
      return <Box flexDirection="row" flexWrap="wrap" columnGap={2}>{below}{mine}</Box>
    }
    return mine
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e) as any
    const { Box, Text, Button } = els
    const hasInput = 'Input' in els
    const s = await read($, summary)
    const target = await read($, armed)
    const coldShown = await read($, showCold)
    const note = await read($, notice)
    if (s === null) return <Text dimColor>Loading…</Text>

    const card = (c: Contact) => {
      const action = target.startsWith(`${c.key}#`) ? target.slice(c.key.length + 1) : ''
      const arm = (a: string) => async () => { await say($, ''); await update($, armed, () => `${c.key}#${a}`) }
      const cancel = <Button key={`${c.key}:cancel`} label="Cancel" onPress={() => update($, armed, () => '')} />
      const isDue = c.status !== 'cold' && isIso(c.nextFollowup) && c.nextFollowup <= s.today
      const waiting = ['to-contact', 'contacted'].includes(c.status)
      const atCap = waiting && c.touches >= MAX_TOUCHES
      const yesterday = minusDays(s.today, 1)
      const rel = RELATIONSHIPS[c.relationship] ?? c.relationship
      return (
        <Box key={c.key} flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold>{`${c.name}${c.company ? ` · ${c.company}` : ''}`}</Text>
          {(c.title || rel) && <Text dimColor>{[c.title, rel].filter(Boolean).join(' · ')}</Text>}
          <Text>{c.lastContact ? `Last contact: ${ago(c.lastContact, s.today)}` : 'Not contacted yet'}</Text>
          {c.touches > 0 && <Text dimColor={!atCap}>{`Messages with no reply: ${c.touches} of ${MAX_TOUCHES}`}</Text>}
          {atCap && <Text color="warning">{`${c.touches} messages with no reply. Stop here: mark them cold and move on, no hard feelings.`}</Text>}
          {c.jobOwnsFollowup
            ? <Text dimColor>{`Follow-up: handled by your application (${c.job}) on the job board`}</Text>
            : c.nextFollowup !== '' && c.status !== 'cold' && <Text color={isDue ? 'warning' : undefined}>{`Next follow-up: ${friendlyDate(c.nextFollowup, s.today)}`}</Text>}
          {c.job !== '' && <Text dimColor>{`Job: ${c.job}${c.jobStatus ? ` (${c.jobStatus})` : ' (not on your tracker)'}`}</Text>}

          {action === 'sent' && (
            <Box flexDirection="column" gap={1}>
              <Text bold wrap="wrap">{`When did you send your message to ${c.name}? Only record it once you have sent it yourself.`}</Text>
              <Box flexDirection="row" gap={1} flexWrap="wrap">
                <Button key={`${c.key}:sent-today`} label={`Today (${s.today})`} variant="primary" onPress={() => messageSent($, c, s.today)} />
                <Button key={`${c.key}:sent-yesterday`} label={`Yesterday (${yesterday})`} onPress={() => messageSent($, c, yesterday)} />
                {cancel}
              </Box>
              {hasInput && <els.Input key={`${c.key}:sent-date`} label="Another day" value="" placeholder="YYYY-MM-DD" submitLabel="save" onSubmit={(v: string) => messageSent($, c, v)} />}
            </Box>
          )}
          {action === 'replied' && (
            <Box flexDirection="column">
              <Text bold wrap="wrap">{`Record that ${c.name} replied? Your unanswered count goes back to 0${c.nextFollowup ? ' and the follow-up date is cleared' : ''}.`}</Text>
              <Box flexDirection="row" gap={1}>
                <Button key={`${c.key}:confirm-replied`} label="Yes, they replied" variant="primary" onPress={() => theyReplied($, c)} />
                {cancel}
              </Box>
            </Box>
          )}
          {action === 'talked' && (
            <Box flexDirection="column">
              <Text bold wrap="wrap">{`Record that you talked with ${c.name}? Claude will offer to draft a thank-you note and log what you learned.`}</Text>
              <Box flexDirection="row" gap={1}>
                <Button key={`${c.key}:confirm-talked`} label="Yes, we talked" variant="primary" onPress={() => weTalked($, c)} />
                {cancel}
              </Box>
            </Box>
          )}
          {action === 'referred' && (
            <Box flexDirection="column">
              <Text bold wrap="wrap">{`Record that ${c.name} referred you${c.job ? ` for ${c.job}` : ''}? Claude will update the job and help you thank them.`}</Text>
              <Box flexDirection="row" gap={1}>
                <Button key={`${c.key}:confirm-referred`} label="Yes, they referred me" variant="primary" onPress={() => referredMe($, c)} />
                {cancel}
              </Box>
            </Box>
          )}
          {action === 'cold' && (
            <Box flexDirection="column">
              <Text bold wrap="wrap">{`Mark ${c.name} as cold? They move to the Cold list and drop off your follow-ups. You can still record a reply later.`}</Text>
              <Box flexDirection="row" gap={1}>
                <Button key={`${c.key}:confirm-cold`} label="Mark cold" variant="primary" onPress={() => markCold($, c)} />
                {cancel}
              </Box>
            </Box>
          )}
          {action === 'followup' && (
            <Box flexDirection="column" gap={1}>
              <Text bold wrap="wrap">{c.jobOwnsFollowup ? `Your application (${c.job}) owns this follow-up. Change it on the job board (/pipeline).` : `When should you follow up with ${c.name}?`}</Text>
              {!c.jobOwnsFollowup && (
                <Box flexDirection="row" gap={1} flexWrap="wrap">
                  <Button key={`${c.key}:fu-week`} label={`In a week (${addDays(s.today, 7)})`} onPress={() => setFollowup($, c, addDays(s.today, 7))} />
                  <Button key={`${c.key}:fu-2weeks`} label={`In 2 weeks (${addDays(s.today, 14)})`} onPress={() => setFollowup($, c, addDays(s.today, 14))} />
                  {c.nextFollowup !== '' && <Button key={`${c.key}:fu-clear`} label="No follow-up" dimColor onPress={() => setFollowup($, c, '')} />}
                  {cancel}
                </Box>
              )}
              {!c.jobOwnsFollowup && hasInput && <els.Input key={`${c.key}:fu-date`} label="Another day" value={c.nextFollowup} placeholder="YYYY-MM-DD" submitLabel="save" onSubmit={(v: string) => setFollowup($, c, v)} />}
              {c.jobOwnsFollowup && cancel}
            </Box>
          )}

          {action === '' && (
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              {!atCap && c.status !== 'cold' && <Button key={`${c.key}:sent`} label="Message sent…" onPress={arm('sent')} />}
              {['to-contact', 'contacted', 'cold'].includes(c.status) && <Button key={`${c.key}:replied`} label="They replied…" onPress={arm('replied')} />}
              <Button key={`${c.key}:talked`} label="We talked…" onPress={arm('talked')} />
              {c.status !== 'referred' && <Button key={`${c.key}:referred`} label="Referred me…" onPress={arm('referred')} />}
              {!atCap && c.status !== 'cold' && <Button key={`${c.key}:draft`} label="Draft a message" plain onPress={() => $.prompt.fill({ text: draftPrompt(c) })} />}
              {atCap && <Button key={`${c.key}:cold`} label="Mark cold…" onPress={arm('cold')} />}
              {c.status !== 'cold' && <Button key={`${c.key}:followup`} label="Set follow-up date…" plain dimColor onPress={arm('followup')} />}
            </Box>
          )}
        </Box>
      )
    }

    const cold = s.contacts.filter(c => c.status === 'cold')
    const other = s.contacts.filter(c => !STATUSES.includes(c.status))
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{s.contacts.length === 0 ? 'No contacts yet' : [`${s.contacts.length} ${s.contacts.length === 1 ? 'person' : 'people'}`, s.due.length ? `${s.due.length} follow-up${s.due.length === 1 ? '' : 's'} due` : 'nothing due'].join(' · ')}</Text>
        <Text dimColor>Changes here save straight to your contacts list (contacts/contacts.csv), and Claude is told about them. Record a message only after you've sent it. "Draft a message" writes a request to Claude; press Enter to send it.</Text>
        {note.text !== '' && <Text color={note.isError ? 'error' : 'success'}>{note.isError ? `Not saved: ${note.text}` : note.text}</Text>}
        {!s.hasFile && <Text dimColor>No contacts file yet. Ask Claude to set one up, or type /network to find people to talk to.</Text>}
        {s.hasFile && s.contacts.length === 0 && <Text dimColor>No one here yet. Type /network to find people at a company you like, or /import-linkedin to bring in your connections.</Text>}
        {COLUMNS.map(col => {
          const list = s.contacts.filter(c => c.status === col.value)
          if (list.length === 0) return null
          return (
            <Box key={`col:${col.value}`} flexDirection="column" gap={1}>
              <Text bold underline>{`${col.label} (${list.length})`}</Text>
              {list.map(card)}
            </Box>
          )
        })}
        {other.length > 0 && (
          <Box key="col:other" flexDirection="column" gap={1}>
            <Text bold underline>{`Status not recognized (${other.length})`}</Text>
            <Text dimColor>Ask Claude to fix the status of these (to-contact, contacted, replied, talked, referred or cold).</Text>
            {other.map(card)}
          </Box>
        )}
        {cold.length > 0 && (
          <Button key="cold-toggle" label={coldShown ? 'Hide cold contacts' : `Show cold contacts (${cold.length})`} plain onPress={() => update($, showCold, v => !v)} />
        )}
        {coldShown && cold.map(card)}
        <Box flexDirection="row" gap={1}>
          <Button key="refresh" label="Refresh" onPress={() => refresh($)} />
          <Button key="close" label="Close" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
