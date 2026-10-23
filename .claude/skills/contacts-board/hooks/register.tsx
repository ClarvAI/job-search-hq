import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Contact, Notice, Summary } from '../types'
import type { DateOrder, FileIo } from './csvdate'
import { activityLine, addDays, appendLine, colOf, columnsOf, csvTrouble, dateOrder, daysBetween, fingerprint, isIso, localDate, orderFor, pageOf, plain, readCsv, rowKey, saveRow, toIso } from './csvdate'

// Contacts board: the user's networking board over contacts/contacts.csv (the single source of truth).
// The user records what actually happened (a message sent, a reply, a conversation, a referral);
// each change follows the playbook rules in knowledge/job-search-playbook.md, is written straight
// back to contacts.csv, logged in history/activity.md, and noted for Claude as a [Contacts] note.

const PANE = 'contacts'
const CONTACTS = 'contacts/contacts.csv'
const TRACKER = 'jobs/tracker.csv'
const ACTIVITY = 'history/activity.md'
// The files this board reads: when one changes on disk (Claude, Codex, Excel), the board refreshes.
const WATCHED = ['contacts/contacts.csv', 'jobs/tracker.csv', 'profile/preferences.md']
// The same words, in the same place (right under the panel's first line), in every panel.
const KEYS_HINT = 'Keys: Ctrl+X then Tab moves into this panel. Tab moves between buttons, Enter presses one, Esc goes back to typing.'
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
// Which page each group is on (by status, plus 'cold' and 'other'): long groups are paged, because a
// panel draws at most 100,000 characters. Due follow-ups come first.
const pages = atom({ plugin: 'contacts-board', key: 'pages' } as const, {} as Record<string, number>)
const SHOWN = 10

const parts = (iso: string): [number, number, number] => { const [y = 0, m = 1, d = 1] = iso.split('-').map(Number); return [y, m, d] }

function minusDays(iso: string, days: number): string {
  const [y, m, d] = parts(iso)
  return localDate(new Date(y, m - 1, d - days).getTime())
}

// Excel may rewrite dates as 14/10/2026, 10/14/26 or 14.10.2026. Same rules as the Pipeline panel
// (csvdate.ts): a date is read only when its meaning is certain (the row's own dates, or date_order in
// profile/preferences.md); otherwise it stays exactly as written for the user to confirm.
const DATE_COLS = ['last_contact', 'next_followup']
async function readOrder($: any): Promise<DateOrder> {
  const prefs: string = (await $.fs.exists('profile/preferences.md').catch(() => false)) ? await $.fs.read('profile/preferences.md').catch(() => '') : ''
  return dateOrder(prefs)
}
const safeCell = plain

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

// A networking follow-up that's due: same rule as the due alerts. Not for cold contacts, not after 2
// unanswered messages, and not when the linked job is applied or later (its row owns the follow-up).
function isDueContact(c: Contact, today: string): boolean {
  if (c.status === 'cold' || c.jobOwnsFollowup) return false
  if (['to-contact', 'contacted'].includes(c.status) && c.touches >= MAX_TOUCHES) return false
  return isIso(c.nextFollowup) && c.nextFollowup <= today
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
  const raw: string = (await $.fs.exists(TRACKER)) ? await $.fs.read(TRACKER).catch(() => '') : ''
  const { rows: [header = [], ...rows] } = readCsv(raw)
  const fi = colOf(header, 'folder')
  const si = colOf(header, 'status')
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
  // A file that exists but can't be read is a problem to show, never an endless "Loading…".
  let unreadable = ''
  const raw: string = hasFile ? await $.fs.read(CONTACTS).then(String, () => { unreadable = 'Your contacts file (contacts/contacts.csv) couldn’t be read. If it’s in a synced folder (OneDrive, iCloud, Dropbox), make sure the file is downloaded and not open in another app, then press Refresh.'; return '' }) : ''
  const { rows: [header = [], ...all], problem } = readCsv(raw)
  // A damaged file shows nothing but the message: its rows can't be trusted.
  const rows = problem === '' ? all : []
  const col = columnsOf(header)
  const at = (r: string[], name: string) => { const i = col(name); return i >= 0 ? (r[i] ?? '').trim() : '' }
  const jobs = await jobStatuses($)
  const order = await readOrder($)
  const contacts: Contact[] = rows.map(r => {
    const o = orderFor(r, order)
    const job = at(r, 'job')
    const jobStatus = job ? jobs[job.toLowerCase()] ?? '' : ''
    return {
      key: keyOf(c => at(r, c)),
      name: at(r, 'name'),
      company: at(r, 'company'),
      title: at(r, 'title'),
      relationship: at(r, 'relationship').toLowerCase(),
      lastContact: toIso(at(r, 'last_contact'), o),
      nextFollowup: toIso(at(r, 'next_followup'), o),
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
  const due = contacts.filter(c => isDueContact(c, today))
  return { today, contacts, due, counts, hasFile, problem: unreadable || csvTrouble(problem, 'Your contacts file (contacts/contacts.csv)'), sig: fingerprint(raw) }
}

async function refresh($: any): Promise<Summary> {
  const next = await load($)
  const before = await read($, summary)
  if (JSON.stringify(before) !== JSON.stringify(next)) await update($, summary, () => next)
  return next
}

// Moves the keyboard focus onto a button the next drawing shows, after the pressed one went away
// (a confirm row opened or closed). Refused when the panel doesn't hold the keyboard (a mouse press).
function focusOn($: any, key: string): void {
  void Promise.resolve().then(() => $.ui.focus({ requestId: PANE, key })).catch(() => undefined)
}

// Where the focus goes when a confirm row opens: the first answer, or Cancel for "Mark cold".
const FIRST_IN_ROW: Record<string, string> = { sent: 'sent-today', replied: 'confirm-replied', talked: 'confirm-talked', referred: 'confirm-referred', cold: 'cancel', followup: 'fu-week' }

async function say($: any, text: string, isError = false): Promise<void> {
  await update($, notice, () => ({ text, isError }))
}

async function tellClaude($: any, text: string): Promise<void> {
  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } }).catch(() => undefined)
}

// One line in history/activity.md, so Codex (or a later Claude session) knows what the user changed here.
async function logActivity($: any, what: string): Promise<void> {
  await appendLine(io($), ACTIVITY, activityLine(await $.clock.now(), 'Contacts panel (Claude)', what))
}

// The file calls the shared helpers in csvdate.ts use (the engine interface can't cross an import).
function io($: any): FileIo {
  return { exists: p => $.fs.exists(p), read: async p => String(await $.fs.read(p)), write: (p, t) => $.fs.write(p, t), list: d => $.fs.list(d) }
}

type Change = (get: (c: string) => string, set: (c: string, v: string) => void, today: string) => { what: string; forClaude?: string } | string

// Re-read contacts.csv, change one person's row, write it back, log it, and tell Claude. Refused when
// the file changed since the board read it (no file lock exists): the board then shows the new version.
// Returns false when nothing was saved (the pane already says why).
async function saveContact($: any, key: string, change: Change): Promise<boolean> {
  const today = localDate(await $.clock.now())
  const order = await readOrder($)
  const seen = (await read($, summary))?.sig ?? ''
  const saved = await saveRow(io($), CONTACTS, {
    seen,
    name: 'Your contacts file',
    label: 'Your contacts file (contacts/contacts.csv)',
    blank: HEADER,
    clean: safeCell,
    find: (header, rows) => rows.find(r => rowKey(header, r, keyOf) === key),
    edit: (target, get, set, header) => {
      // Only this person's dates are tidied, and only when their order is certain; other rows stay as they are.
      const o = orderFor(target, order)
      for (const c of DATE_COLS) { const i = colOf(header, c); if (i >= 0 && target[i]) target[i] = toIso(target[i], o) }
      const out = change(get, set, today)
      const result = typeof out === 'string' ? { what: out } : out
      return result.what === '' ? undefined : result
    },
  })
  if (!saved.ok) {
    if (saved.why === 'refused') return false
    await update($, armed, () => '')
    await refresh($).catch(() => undefined)
    await say($, saved.why === 'no-row' ? 'That person is no longer in your contacts file. Press Refresh, or ask Claude to check it.'
      : saved.why === 'missing' ? 'Your contacts file (contacts/contacts.csv) is missing. Ask Claude to check it.' : saved.text, true)
    return false
  }
  const result = saved.result
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
  if (!isIso(date)) { await say($, 'Type a real date as YYYY-MM-DD, for example 2026-10-06.', true); return }
  if (date > today) { await say($, 'That date is in the future. Record a message once you have sent it.', true); return }
  // The linked job's status is read fresh, so a just-submitted application takes over the follow-up.
  const jobs = await jobStatuses($)
  await saveContact($, c.key, (get, set) => {
    const status = normStatus(get('status'))
    // The unanswered count and the 5-day nudge are for people who haven't replied yet. A thank-you or
    // update to someone who replied, talked or referred the user is not chasing them: no count, no nag.
    const waiting = get('status') === '' || status === 'to-contact' || status === 'contacted'
    const touches = waiting ? toNumber(get('touches')) + 1 : toNumber(get('touches'))
    const job = get('job')
    const jobStatus = job ? jobs[job.toLowerCase()] ?? '' : ''
    const owned = APPLIED_OR_LATER.includes(jobStatus)
    const last = get('last_contact')
    // last_contact is the newest message; recording an older one doesn't move it back. A date that is unclear
    // (even after this save tidied the row's dates) is never rewritten: the user says what it means first.
    const lastUnclear = last !== '' && !isIso(last)
    if (last === '' || (isIso(last) && date >= last)) set('last_contact', date)
    if (waiting) set('touches', String(touches))
    // Status moves to contacted only from to-contact or blank: never backwards from replied, talked or referred (or out of cold).
    const moved = waiting && status !== 'contacted'
    if (moved) set('status', 'contacted')
    let extra = ''
    let forClaude = ''
    if (owned) {
      // The job row owns the follow-up date: any old networking date on this person is cleared.
      const hadDate = get('next_followup') !== ''
      set('next_followup', '')
      forClaude = `${c.name}'s job (${job}) is ${jobStatus}, so the job row owns the follow-up date and next_followup stays empty on the contact. Only if this message was an actual follow-up about the application, add 1 to that job's followups in jobs/tracker.csv and set its next_action_date per the follow-up cadence. A thank-you note, a scheduling reply or other correspondence does not count as a follow-up and must not replace an interview or offer next step; ask the user if you can't tell which it was.`
      extra = `; follow-up date stays with the job${hadDate ? ' (old contact follow-up date cleared)' : ''}`
    } else if (!waiting) {
      extra = ''
    } else if (touches >= MAX_TOUCHES) {
      set('next_followup', '')
      extra = `; ${touches} messages with no reply, so no more follow-ups (stop here)`
      forClaude = `That is ${touches} messages with no reply: per the playbook, stop here. Do not draft another follow-up; suggest marking them cold if nothing comes back.`
    } else {
      set('next_followup', addDays(date, 5, true))
      extra = `; follow up on ${get('next_followup')} if no reply`
    }
    forClaude += ' If an Outbox draft to this person matches this message, set it to sent (sent: ' + date + ') and move it to outbox/sent/.'
    if (lastUnclear) {
      extra += `; last contact left as written (${last}, date unclear)`
      forClaude += ` Their last_contact (${last}) is unclear, so it was left as written: ask the user what it means, then set it to the newer of that date and ${date}.`
    }
    return {
      what: `${who(c)}: message sent ${date}${moved ? ', now Contacted' : ''}${waiting ? `; ${touches} with no reply` : ''}${extra}`,
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
  const ok = await saveContact($, c.key, (get, set, today) => {
    const status = normStatus(get('status'))
    const moved = status !== 'referred'
    if (moved) set('status', 'talked')
    // The talk is the newest contact (recorded the day it happened): last_contact moves to today unless
    // a later date is already there. An unclear date is left for the user to confirm, never rewritten.
    const last = get('last_contact')
    if (last === '' || (isIso(last) && today > last)) set('last_contact', today)
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
  if (v !== '' && !isIso(v)) { await say($, 'Type a real date as YYYY-MM-DD, for example 2026-10-14.', true); return }
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
    await $.command.register({ name: 'contacts', description: 'Open your networking board: record messages, replies, conversations and referrals', immediate: true })
    await refresh($).catch(() => null)
    // A slow poll as a backstop; changed files also refresh the board at once (classic.FileChanged below).
    $.clock.every(30000, () => void refresh($).catch(() => undefined))
    return next(e)
  })

  // Ask Claude Code to watch the files this board reads, so an edit made anywhere (Claude, Codex,
  // Excel) shows at once. The paths must be absolute: they are built from the session's folder.
  on('classic.SessionStart', async ($, e, next) => {
    const out = await next(e)
    const root = String(e.cwd ?? '').replace(/[\\/]+$/, '')
    if (root === '') return out
    const sep = /^[A-Za-z]:\\/.test(root) ? '\\' : '/'
    return { ...out, watchPaths: [...(out.watchPaths ?? []), ...WATCHED.map(p => root + sep + p.split('/').join(sep))] }
  }).catch(($, e, next) => next(e))

  on('classic.FileChanged', async ($, e, next) => {
    const path = String(e.file_path ?? '').replace(/\\/g, '/')
    if (WATCHED.some(p => path.endsWith(`/${p}`))) await refresh($).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    await refresh($).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'contacts' }, async $ => {
    const s = await refresh($).catch(() => null)
    if (s === null) { await $.ui.open({ id: PANE, title: 'Contacts', focus: true }).catch(() => undefined); return { text: 'Contacts: your contacts file couldn’t be read; the board says why.' } }
    await update($, isHidden, () => false)
    await update($, armed, () => '')
    await say($, '')
    const opened = await $.ui.open({ id: PANE, title: 'Contacts', focus: true })
    const total = s.contacts.length
    if (!opened.isPlaced) {
      return {
        text: `Contacts: ${total} ${total === 1 ? 'person' : 'people'}${s.due.length ? `, ${s.due.length} follow-up${s.due.length === 1 ? '' : 's'} due` : ''}. The board can't show in this window, so ask Claude to "show my contacts" and go through them here in the chat.`,
        context: ['The Contacts panel is not visible in this app or window. If the user asks, use the chat version of the contacts skill (.agents/skills/contacts/SKILL.md).'],
      }
    }
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
        <Button key="contacts-open" label="Open contacts" plain onPress={() => $.ui.open({ id: PANE, title: 'Contacts', focus: true })} />
        <Button key="contacts-hide" label="Hide (contacts follow-ups)" plain dimColor onPress={() => update($, isHidden, () => true)}>Hide</Button>
      </Box>
    )
    const below: any = await next(e)
    if (below && typeof below === 'object' && typeof below.type === 'string' && below.type !== 'engine') {
      return <Box flexDirection="row" flexWrap="wrap" columnGap={2}>{below}{mine}</Box>
    }
    return mine
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const els = $.ui.resolve(e) as any
    const { Box, Text, Button } = els
    const hasInput = 'Input' in els
    const s = await read($, summary)
    const target = await read($, armed)
    const coldShown = await read($, showCold)
    const pageAt = await read($, pages)
    const note = await read($, notice)
    if (s === null) return (
      <Box flexDirection="column" gap={1}>
        <Text>Loading… If this doesn’t change, press Refresh.</Text>
        <Box flexDirection="row" gap={1}>
          <Button key="refresh" label="Refresh" autoFocus onPress={() => void refresh($).catch(() => undefined)} />
          <Button key="close" label="Close" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )

    let firstKey = ''
    const card = (c: Contact) => {
      if (firstKey === '') firstKey = c.key
      const isFirst = firstKey === c.key
      const action = target.startsWith(`${c.key}#`) ? target.slice(c.key.length + 1) : ''
      const arm = (a: string) => async () => {
        await say($, '')
        await update($, armed, () => `${c.key}#${a}`)
        focusOn($, `${c.key}:${a === 'followup' && c.jobOwnsFollowup ? 'cancel' : FIRST_IN_ROW[a] ?? 'cancel'}`)
      }
      // Cancel puts the focus back on the button that opened the row; a finished action, on this card.
      const cancel = <Button key={`${c.key}:cancel`} label="Cancel" onPress={async () => { await update($, armed, () => ''); focusOn($, `${c.key}:${action}`) }} />
      const then = (run: Promise<unknown>) => run.then(() => focusOn($, `${c.key}:talked`))
      // Each card's buttons carry the person's name for screen readers (a desktop's native buttons):
      // "We talked… (Jane Doe)", drawn as "We talked…". The visible words start the name (WCAG 2.5.3).
      const named = (visible: string) => `${visible} (${c.name})`
      const isDue = isDueContact(c, s.today)
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
                <Button key={`${c.key}:sent-today`} label={`Today (${s.today})`} variant="primary" onPress={() => then(messageSent($, c, s.today))} />
                <Button key={`${c.key}:sent-yesterday`} label={`Yesterday (${yesterday})`} onPress={() => then(messageSent($, c, yesterday))} />
                {cancel}
              </Box>
              {hasInput && <els.Input key={`${c.key}:sent-date`} label="Another day" value="" placeholder="YYYY-MM-DD" submitLabel="save" onSubmit={(v: string) => then(messageSent($, c, v))} />}
            </Box>
          )}
          {action === 'replied' && (
            <Box flexDirection="column">
              <Text bold wrap="wrap">{`Record that ${c.name} replied? Your unanswered count goes back to 0${c.nextFollowup ? ' and the follow-up date is cleared' : ''}.`}</Text>
              <Box flexDirection="row" gap={1}>
                <Button key={`${c.key}:confirm-replied`} label="Yes, they replied" variant="primary" onPress={() => then(theyReplied($, c))} />
                {cancel}
              </Box>
            </Box>
          )}
          {action === 'talked' && (
            <Box flexDirection="column">
              <Text bold wrap="wrap">{`Record that you talked with ${c.name} today? Claude will offer to draft a thank-you note and log what you learned.`}</Text>
              <Box flexDirection="row" gap={1}>
                <Button key={`${c.key}:confirm-talked`} label="Yes, we talked" variant="primary" onPress={() => then(weTalked($, c))} />
                {cancel}
              </Box>
            </Box>
          )}
          {action === 'referred' && (
            <Box flexDirection="column">
              <Text bold wrap="wrap">{`Record that ${c.name} referred you${c.job ? ` for ${c.job}` : ''}? Claude will update the job and help you thank them.`}</Text>
              <Box flexDirection="row" gap={1}>
                <Button key={`${c.key}:confirm-referred`} label="Yes, they referred me" variant="primary" onPress={() => then(referredMe($, c))} />
                {cancel}
              </Box>
            </Box>
          )}
          {action === 'cold' && (
            <Box flexDirection="column">
              <Text bold wrap="wrap">{`Mark ${c.name} as cold? They move to the Cold list and drop off your follow-ups. You can still record a reply later.`}</Text>
              <Box flexDirection="row" gap={1}>
                <Button key={`${c.key}:confirm-cold`} label="Mark cold" variant="primary" onPress={() => then(markCold($, c))} />
                {cancel}
              </Box>
            </Box>
          )}
          {action === 'followup' && (
            <Box flexDirection="column" gap={1}>
              <Text bold wrap="wrap">{c.jobOwnsFollowup ? `Your application (${c.job}) owns this follow-up. Change it on the job board (/pipeline).` : `When should you follow up with ${c.name}?`}</Text>
              {!c.jobOwnsFollowup && (
                <Box flexDirection="row" gap={1} flexWrap="wrap">
                  <Button key={`${c.key}:fu-week`} label={`In a week (${addDays(s.today, 7)})`} onPress={() => then(setFollowup($, c, addDays(s.today, 7)))} />
                  <Button key={`${c.key}:fu-2weeks`} label={`In 2 weeks (${addDays(s.today, 14)})`} onPress={() => then(setFollowup($, c, addDays(s.today, 14)))} />
                  {c.nextFollowup !== '' && <Button key={`${c.key}:fu-clear`} label="No follow-up" dimColor onPress={() => then(setFollowup($, c, ''))} />}
                  {cancel}
                </Box>
              )}
              {!c.jobOwnsFollowup && hasInput && <els.Input key={`${c.key}:fu-date`} label="Another day" value={c.nextFollowup} placeholder="YYYY-MM-DD" submitLabel="save" onSubmit={(v: string) => then(setFollowup($, c, v))} />}
              {c.jobOwnsFollowup && cancel}
            </Box>
          )}

          {action === '' && (
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              {!atCap && c.status !== 'cold' && (isFirst
                ? <Button key={`${c.key}:sent`} label={named('Message sent…')} autoFocus onPress={arm('sent')}>Message sent…</Button>
                : <Button key={`${c.key}:sent`} label={named('Message sent…')} onPress={arm('sent')}>Message sent…</Button>)}
              {['to-contact', 'contacted', 'cold'].includes(c.status) && <Button key={`${c.key}:replied`} label={named('They replied…')} onPress={arm('replied')}>They replied…</Button>}
              <Button key={`${c.key}:talked`} label={named('We talked…')} onPress={arm('talked')}>We talked…</Button>
              {c.status !== 'referred' && <Button key={`${c.key}:referred`} label={named('Referred me…')} onPress={arm('referred')}>Referred me…</Button>}
              {!atCap && c.status !== 'cold' && <Button key={`${c.key}:draft`} label={named('Draft a message')} plain onPress={() => $.prompt.fill({ text: draftPrompt(c) })}>Draft a message</Button>}
              {atCap && <Button key={`${c.key}:cold`} label={named('Mark cold…')} onPress={arm('cold')}>Mark cold…</Button>}
              {c.status !== 'cold' && <Button key={`${c.key}:followup`} label={named('Set follow-up date…')} plain dimColor onPress={arm('followup')}>Set follow-up date…</Button>}
            </Box>
          )}
        </Box>
      )
    }

    const cold = s.contacts.filter(c => c.status === 'cold')
    const other = s.contacts.filter(c => !STATUSES.includes(c.status))
    // One page of a group, with "Showing 11–20 of 340" and Previous / Next when it is long.
    const group = (id: string, list: Contact[]) => {
      const pg = pageOf(list, pageAt[id] ?? 0, SHOWN)
      const move = (to: number) => update($, pages, v => ({ ...v, [id]: to }))
      return (
        <Box key={`page:${id}`} flexDirection="column" gap={1}>
          {pg.items.map(card)}
          {pg.pages > 1 && (
            <Box key={`${id}-pager`} flexDirection="row" gap={1} flexWrap="wrap">
              <Text dimColor>{`Showing ${pg.from}–${pg.to} of ${list.length}`}</Text>
              {pg.page > 0 && <Button key={`${id}-prev`} label="Previous page" plain onPress={() => move(pg.page - 1)} />}
              {pg.page < pg.pages - 1 && <Button key={`${id}-next`} label="Next page" plain onPress={() => move(pg.page + 1)} />}
            </Box>
          )}
        </Box>
      )
    }
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Text bold>{s.contacts.length === 0 ? 'No contacts yet' : [`${s.contacts.length} ${s.contacts.length === 1 ? 'person' : 'people'}`, s.due.length ? `${s.due.length} follow-up${s.due.length === 1 ? '' : 's'} due` : 'nothing due'].join(' · ')}</Text>
          <Button key="refresh" label="Refresh" onPress={() => refresh($)} />
          <Button key="close" label="Close" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
        {e.surface === 'terminal' && <Text>{KEYS_HINT}</Text>}
        <Text dimColor>Changes here save straight to your contacts list (contacts/contacts.csv), and Claude is told about them. Record a message only after you've sent it. "Draft a message" writes a request to Claude; press Enter to send it.</Text>
        {note.text !== '' && <Text color={note.isError ? 'error' : 'success'}>{note.isError ? `Not done: ${note.text}` : note.text}</Text>}
        {!s.hasFile && <Text>No contacts file yet. Ask Claude to set one up, or type /network to find people to talk to.</Text>}
        {s.hasFile && s.problem === '' && s.contacts.length === 0 && <Text>No one here yet. Ask Claude to find people at a company you like, or to bring in your LinkedIn connections.</Text>}
        {s.problem !== '' && <Text color="error" wrap="wrap">{s.problem}</Text>}
        {COLUMNS.map(col => {
          // Due follow-ups first, then by date; long groups are shown a page at a time.
          const list = s.contacts.filter(c => c.status === col.value)
            .sort((a, b) => Number(isDueContact(b, s.today)) - Number(isDueContact(a, s.today)))
          if (list.length === 0) return null
          return (
            <Box key={`col:${col.value}`} flexDirection="column" gap={1}>
              <Text bold underline>{`${col.label} (${list.length})`}</Text>
              {group(col.value, list)}
            </Box>
          )
        })}
        {other.length > 0 && (
          <Box key="col:other" flexDirection="column" gap={1}>
            <Text bold underline>{`Status not recognized (${other.length})`}</Text>
            <Text>Ask Claude to fix the status of these (to-contact, contacted, replied, talked, referred or cold).</Text>
            {group('other', other)}
          </Box>
        )}
        {cold.length > 0 && (
          <Button key="cold-toggle" label={coldShown ? 'Hide cold contacts' : `Show cold contacts (${cold.length})`} plain onPress={() => update($, showCold, v => !v)} />
        )}
        {coldShown && group('cold', cold)}
      </Box>
    )
  })
}
