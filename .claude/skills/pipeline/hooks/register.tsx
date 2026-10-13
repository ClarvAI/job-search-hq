import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Job, Notice, Summary } from '../types'
import { activityLine, addDays, alsoOf, appendLine, colOf, columnsOf, csvTrouble, dateOrder, daysBetween, fingerprint, isIso, jobKey, localDate, orderFor, pageOf, readCsv, rowKey, saveRow, toIso } from './csvdate'
import type { DateOrder, FileIo } from './csvdate'

// Pipeline: the user's interactive job board. It reads jobs/tracker.csv (the single source of truth),
// shows a one-line band above the prompt, and lets the user change a job's stage, next step and date.
// Every change is written straight back to tracker.csv and noted for Claude.

const PANE = 'pipeline'
const TRACKER = 'jobs/tracker.csv'
const ACTIVITY = 'history/activity.md'
const BOM = String.fromCharCode(0xfeff)
// A byte-order mark only counts at the very start of a file.
const noBom = (t: string) => (t.startsWith(BOM) ? t.slice(1) : t)
const OPEN = ['interested', 'applied', 'screening', 'interviewing', 'offer']
const STAGES = [
  { value: 'interested', label: 'To apply' },
  { value: 'applied', label: 'Applied' },
  { value: 'screening', label: 'Screening' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer', label: 'Offer' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'skipped', label: 'Skipped (didn’t apply)' },
  { value: 'ghosted', label: 'No response' },
]
const stageLabel = (v: string) => STAGES.find(s => s.value === v)?.label ?? v
// The files this board reads: when one changes on disk (Claude, Codex, Excel), the board refreshes.
const WATCHED = ['jobs/tracker.csv', 'profile/preferences.md']
// The same words, in the same place (right under the panel's first line), in every panel.
const KEYS_HINT = 'Keys: Ctrl+X then Tab moves into this panel. Tab moves between buttons, Enter presses one, Esc goes back to typing.'

const summary = atom({ plugin: 'pipeline', key: 'summary' } as const, null as Summary | null)
const isHidden = atom({ plugin: 'pipeline', key: 'isHidden' } as const, false)
const editing = atom({ plugin: 'pipeline', key: 'editing' } as const, '')
const showClosed = atom({ plugin: 'pipeline', key: 'showClosed' } as const, false)
const notice = atom({ plugin: 'pipeline', key: 'notice' } as const, { text: '', isError: false } as Notice)
const page = atom({ plugin: 'pipeline', key: 'page' } as const, 0)
const closedPage = atom({ plugin: 'pipeline', key: 'closedPage' } as const, 0)

// Excel may rewrite dates as 14/10/2026, 10/14/26 or 14.10.2026. csvdate.ts reads a date only when its
// meaning is certain (the row's own dates or date_order in profile/preferences.md); anything else is
// left exactly as written and shown as "date unclear" for the user to confirm (AGENTS.md).
const DATE_COLS = ['next_action_date', 'date_found', 'date_applied', 'deadline']

function friendlyDate(iso: string, today: string): string {
  if (!iso) return ''
  if (!isIso(iso)) return `date unclear: ${iso}`
  if (iso < today) return `overdue since ${iso}`
  if (iso === today) return 'due today'
  return `by ${iso}`
}

// A booked interview, not a step around one (prep, thank-you, the playbook's "Schedule interview"). Same rule as due alerts.
const isInterview = (text: string) => /interview/i.test(text) && !/prep|thank|schedul|availability|arrange|\bbook/i.test(text)
// Cards per page: a panel draws at most 100,000 characters, so long lists are paged.
const SHOWN = 20

// The file calls the shared helpers in csvdate.ts use (the engine interface can't cross an import).
function io($: any): FileIo {
  return { exists: p => $.fs.exists(p), read: async p => String(await $.fs.read(p)), write: (p, t) => $.fs.write(p, t), list: d => $.fs.list(d) }
}

// Which Outbox files are drafts, by file name, with the size and time they had when read (a cache: a
// reload just starts it over).
const draftCache = new Map<string, { stamp: string; isDraft: boolean }>()

async function load($: any): Promise<Summary> {
  const today = localDate(await $.clock.now())
  const raw = (await $.fs.exists(TRACKER)) ? await $.fs.read(TRACKER) : ''
  const prefs: string = (await $.fs.exists('profile/preferences.md')) ? await $.fs.read('profile/preferences.md').catch(() => '') : ''
  const order = dateOrder(prefs)
  const { rows: [header = [], ...rows], problem } = readCsv(raw)
  const col = columnsOf(header)
  const at = (r: string[], name: string) => { const i = col(name); return i >= 0 ? (r[i] ?? '').trim() : '' }
  const jobs: Job[] = problem !== '' ? [] : rows.map(r => {
    const o = orderFor(r, order)
    const also = alsoOf(at(r, 'notes'), o)
    return {
      key: jobKey(c => at(r, c)),
      company: at(r, 'company'),
      role: at(r, 'role'),
      status: at(r, 'status').toLowerCase(),
      nextAction: at(r, 'next_action'),
      nextDate: toIso(at(r, 'next_action_date'), o),
      folder: at(r, 'folder'),
      location: at(r, 'location'),
      deadline: toIso(at(r, 'deadline'), o),
      also: also?.text ?? '',
      alsoDate: also?.date ?? '',
    }
  }).filter(j => j.company !== '')
  const counts: Record<string, number> = {}
  for (const j of jobs) counts[j.status] = (counts[j.status] ?? 0) + 1
  // Due: a next step (or a second commitment in the notes) dated today or earlier; an offer answer-by
  // date within 3 days (passed ones stay due: they are urgent); an application deadline within the
  // next 3 days. A passed application deadline is not "due" forever: the card says it passed.
  const isDue = (j: Job) => (isIso(j.nextDate) && j.nextDate <= today)
    || (isIso(j.alsoDate) && j.alsoDate <= today)
    || (j.status === 'offer' && isIso(j.deadline) && daysBetween(today, j.deadline) <= 3)
    || (j.status === 'interested' && isIso(j.deadline) && j.deadline >= today && daysBetween(today, j.deadline) <= 3)
  // Most urgent first: offers, interviews, application deadlines, then everything else by date.
  const rank = (j: Job) => !isDue(j) ? 9 : j.status === 'offer' ? 0 : isInterview(j.nextAction) || isInterview(j.also) ? 1 : j.status === 'interested' && isIso(j.deadline) ? 2 : 3
  const firstDate = (j: Job) => [j.nextDate, j.alsoDate].filter(isIso).sort()[0] ?? '9999'
  const byUrgency = (a: Job, b: Job) => rank(a) - rank(b) || firstDate(a).localeCompare(firstDate(b))
  const active = jobs.filter(j => OPEN.includes(j.status)).sort(byUrgency)
  const closed = jobs.filter(j => !OPEN.includes(j.status))
  const due = active.filter(isDue)
  let drafts = 0
  if (await $.fs.exists('outbox')) {
    const seen = new Set<string>()
    for (const entry of await $.fs.list('outbox')) {
      // Same reading as the Outbox panel: skip examples and README, ignore case in the status.
      if (entry.kind !== 'file' || !entry.name.endsWith('.md') || entry.name.startsWith('_') || entry.name.toLowerCase() === 'readme.md') continue
      seen.add(entry.name)
      // A file is read again only when its size or time changed (hundreds of drafts stay quick).
      const stamp = `${entry.size}|${entry.mtimeMs}`
      const known = draftCache.get(entry.name)
      if (known && known.stamp === stamp && entry.mtimeMs > 0) { if (known.isDraft) drafts++; continue }
      const text: string = noBom(String(await $.fs.read(`outbox/${entry.name}`).catch(() => ''))).replace(/\r\n?/g, '\n').replace(/^\s+(?=---)/, '')
      const status = /^---\n[\s\S]*?\n---/.test(text) ? (/^status:\s*["']?([^\s#"']+)/m.exec(text.split(/\n---/)[0] ?? '')?.[1] ?? 'draft').toLowerCase() : ''
      draftCache.set(entry.name, { stamp, isDraft: status === 'draft' })
      if (status === 'draft') drafts++
    }
    for (const name of [...draftCache.keys()]) if (!seen.has(name)) draftCache.delete(name)
  }
  const isClosed = /^search_status:\s*closed/m.test(prefs)
  return { today, active, closed, due, counts, drafts, isClosed, problem: csvTrouble(problem, 'Your tracker (jobs/tracker.csv)'), sig: fingerprint(raw) }
}

async function refresh($: any): Promise<Summary> {
  const next = await load($)
  const before = await read($, summary)
  if (JSON.stringify(before) !== JSON.stringify(next)) await update($, summary, () => next)
  return next
}

// Moves the keyboard focus onto a button the next drawing shows, after the pressed one went away.
// Refused when the panel doesn't hold the keyboard (a mouse press): then nothing happens.
function focusOn($: any, key: string): void {
  void Promise.resolve().then(() => $.ui.focus({ requestId: PANE, key })).catch(() => undefined)
}

async function say($: any, text: string, isError = false): Promise<void> {
  await update($, notice, () => ({ text, isError }))
}

// One line in history/activity.md, so Codex (or a later Claude session) knows what the user changed
// here. Only what happened goes in the log; requests for Claude go in the note to Claude.
async function logActivity($: any, what: string): Promise<void> {
  await appendLine(io($), ACTIVITY, activityLine(await $.clock.now(), 'Pipeline panel (Claude)', what))
}

async function readOrder($: any): Promise<DateOrder> {
  const prefs: string = (await $.fs.exists('profile/preferences.md').catch(() => false)) ? await $.fs.read('profile/preferences.md').catch(() => '') : ''
  return dateOrder(prefs)
}

// When a save tidies this row's dates into YYYY-MM-DD, the "Also: <step> <date>" at the start of the
// notes is tidied with the same order. Otherwise the row would lose the date that proved its order,
// and the Also: date would later be read another way (date_order) or become "date unclear".
function tidyAlso(notes: string, order: DateOrder): string {
  const m = /^(\s*Also:\s*[^;|]*?\s*)(\d{1,2}[./]\d{1,2}[./](?:\d{4}|\d{2}))\b/i.exec(notes)
  if (!m) return notes
  const iso = toIso(m[2] ?? '', order)
  return isIso(iso) ? `${m[1] ?? ''}${iso}${notes.slice(m[0].length)}` : notes
}

type Change = (get: (c: string) => string, set: (c: string, v: string) => void, today: string, order: DateOrder) => string | { what: string; forClaude?: string }

// Re-read the tracker, change one job's row, write it back, and tell Claude what changed. Refused when
// the file changed since the board read it (no file lock exists): the board then shows the new version.
async function saveJob($: any, key: string, change: Change): Promise<void> {
  const today = localDate(await $.clock.now())
  const order = await readOrder($)
  const seen = (await read($, summary))?.sig ?? ''
  const saved = await saveRow(io($), TRACKER, {
    seen,
    name: 'Your tracker',
    label: 'Your tracker (jobs/tracker.csv)',
    // Found by the cells exactly as the board read them, before any date in the row is tidied.
    find: (header, rows) => rows.find(r => rowKey(header, r, jobKey) === key),
    edit: (target, get, set, header) => {
      // Only this row's dates are tidied, and only when their meaning is certain; other rows stay as they are.
      const o = orderFor(target, order)
      for (const c of DATE_COLS) { const i = colOf(header, c); if (i >= 0 && target[i]) target[i] = toIso(target[i], o) }
      const ni = colOf(header, 'notes')
      if (ni >= 0 && target[ni]) target[ni] = tidyAlso(target[ni] ?? '', o)
      const out = change(get, set, today, o)
      return typeof out === 'string' ? { what: out } : out
    },
  })
  if (!saved.ok) {
    await refresh($).catch(() => undefined)
    await say($, saved.why === 'no-row' ? 'That job is no longer in jobs/tracker.csv. Press Refresh, or ask Claude to check the tracker.' : saved.text, true)
    return
  }
  const result = saved.result
  await logActivity($, result.what)
  await refresh($)
  await say($, `Saved: ${result.what}.`)
  const ask = result.forClaude ? ` ${result.forClaude}` : ''
  await $.session.append({
    message: { type: 'user', content: [{ type: 'text', text: `[Pipeline] The user updated jobs/tracker.csv from the board: ${result.what}.${ask} Take this into account; if the dashboard is published (profile/published-pages.md), republish it the next time the user talks to you.` }] },
  }).catch(() => undefined)
}

async function setStage($: any, job: Job, status: string): Promise<void> {
  if (status === job.status) return
  await saveJob($, job.key, (get, set, today) => {
    set('status', status)
    let extra = ''
    const asks: string[] = []
    if (status === 'applied' && get('date_applied') === '') {
      // Same as the Apply Kit's "Mark applied": follow up in 7 business days (playbook, "Follow-up cadence").
      const contact = get('contact').split(/[;,]/)[0]?.trim() ?? ''
      set('date_applied', today)
      set('next_action', contact ? `Follow up with ${contact}` : 'Follow up')
      set('next_action_date', addDays(today, 7, true))
      if (get('followups') === '') set('followups', '0')
      extra = `; follow-up set for ${get('next_action_date')}`
    }
    if (!OPEN.includes(status)) { set('next_action', ''); set('next_action_date', ''); extra = '; next step cleared' }
    else if (status === 'offer') {
      // An offer always needs an answer, whatever the next step was. The deadline column held the
      // application deadline until now; it is cleared so it is never shown as the offer's answer-by date.
      const old = get('deadline')
      set('next_action', 'Respond to offer')
      set('next_action_date', today)
      if (old !== '') set('deadline', '')
      if (old !== '') extra += `; the old application deadline ${old} was cleared`
      asks.push('Ask the user for the answer-by date and put it in the deadline column.')
    } else if (['screening', 'interviewing'].includes(status) && /^follow up/i.test(get('next_action'))) {
      // A company that's now screening or interviewing the user doesn't need a follow-up nudge.
      set('next_action', 'Decide next step')
      set('next_action_date', today)
      extra += '; next step is now "Decide next step"'
      asks.push('Ask the user for the interview date and set the next step to "Interview <date>".')
    } else if (get('next_action_date') === '') {
      set('next_action', get('next_action') || 'Decide next step')
      set('next_action_date', addDays(today, 1, true))
      extra += `; next step due ${get('next_action_date')}`
    }
    if (status === 'accepted') asks.push('The user accepted this offer: congratulate them, then offer the "closing the search" wrap-up from the offer skill (withdrawals, thank-yous, career log).')
    return { what: `${job.company} (${job.role}) moved to ${stageLabel(status)}${extra}`, forClaude: asks.join(' ') }
  })
  if (status === 'accepted') $.ui.toast(`Congratulations on the job at ${job.company}! Ask Claude to wrap up your search and refresh your dashboard for a little celebration.`, { timeoutMs: 15000 })
}

async function setDate($: any, job: Job, value: string): Promise<void> {
  const v = value.trim()
  if (!isIso(v)) { await say($, 'Type a real date as YYYY-MM-DD, for example 2026-10-14.', true); return }
  await saveJob($, job.key, (_get, set) => { set('next_action_date', v); return `${job.company}: next step date set to ${v}` })
}

async function setNext($: any, job: Job, value: string): Promise<void> {
  const v = value.trim()
  if (v === '') { await say($, 'Type what the next step is, then press Enter.', true); return }
  await saveJob($, job.key, (get, set, today) => {
    set('next_action', v)
    if (get('next_action_date') === '') set('next_action_date', addDays(today, 3, true))
    return `${job.company}: next step is "${v}" ${friendlyDate(get('next_action_date'), today)}`
  })
}

// "Also: Interview 2026-10-12" at the start of the notes: a second commitment kept there while the
// next step holds the earlier one (interview-prep, take-home assignments).
const ALSO = /^\s*Also:\s*[^;|]*?\s*(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./]\d{1,2}[./](?:\d{4}|\d{2}))\b\.?\s*[;|]?\s*/i

async function markDone($: any, job: Job): Promise<void> {
  // Open jobs always keep a next step (playbook rule). If the notes hold a second commitment, it becomes
  // the next step; otherwise "done" hands the user a decision due today. The second commitment's date
  // is read the same way the board read it (the row's own dates, then date_order).
  await saveJob($, job.key, (get, set, today, order) => {
    const also = alsoOf(get('notes'), order)
    if (also && also.date !== '') {
      set('next_action', also.text)
      // A take-home is worked on before it's due: start it 2 days ahead (never before today).
      const start = /take-?home/i.test(also.text) ? addDays(also.date, -2) : also.date
      set('next_action_date', /take-?home/i.test(also.text) && start < today ? today : start)
      set('notes', get('notes').replace(ALSO, ''))
      return `${job.company}: finished "${job.nextAction || 'next step'}"; next step is now "${also.text}"`
    }
    set('next_action', 'Decide next step'); set('next_action_date', today)
    return { what: `${job.company}: finished "${job.nextAction || 'next step'}"; next step is now "Decide next step"`, forClaude: 'Suggest the user\'s next step for this job.' }
  })
}

async function snooze($: any, job: Job, days: number): Promise<void> {
  // An unclear date is never rewritten (AGENTS.md "Reading dates"): the user says what it means first.
  if (!isIso(job.nextDate)) {
    await say($, `The next step's date for ${job.company} is unclear (${job.nextDate || 'blank'}), so it wasn't moved. Press Update… and type the date as YYYY-MM-DD, or tell Claude what it means.`, true)
    return
  }
  let unclear = ''
  await saveJob($, job.key, (get, set, today) => {
    const current = get('next_action_date')
    if (current !== '' && !isIso(current)) { unclear = current; return `${job.company}: nothing changed (date unclear)` }
    set('next_action_date', addDays(isIso(current) && current > today ? current : today, days))
    return `${job.company}: next step moved to ${get('next_action_date')}`
  })
  if (unclear !== '') await say($, `The next step's date for ${job.company} is unclear (${unclear}), so it wasn't moved. Press Update… and type the date as YYYY-MM-DD, or tell Claude what it means.`, true)
}

function line(s: Summary): string {
  if (s.isClosed) return 'Search closed. Congratulations on the new job!'
  if (s.problem !== '') return 'Your tracker needs fixing before it can be read'
  const total = Object.values(s.counts).reduce((a, b) => a + b, 0)
  if (total === 0 && s.drafts === 0) return 'Nothing tracked yet'
  const n = (k: string) => s.counts[k] ?? 0
  return [
    `${n('applied') + n('screening')} waiting to hear back`,
    `${n('interviewing')} interviewing`,
    n('offer') > 0 ? `${n('offer')} ${n('offer') === 1 ? 'offer' : 'offers'}` : '',
    `${n('interested')} to apply`,
    s.due.length > 0 ? `${s.due.length} due or overdue` : '',
    s.drafts > 0 ? `${s.drafts} in Outbox` : '',
  ].filter(Boolean).join(' · ')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pipeline', description: 'Open your job board: change a job’s stage, next step, or date' })
    // The due-alerts mod shows what's due at startup; the band carries the count.
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

  on('command.run', { command: 'pipeline' }, async $ => {
    const s = await refresh($)
    await update($, isHidden, () => false)
    await say($, '')
    const opened = await $.ui.open({ id: PANE, title: 'Pipeline', focus: true })
    if (!opened.isPlaced) {
      return {
        text: `Pipeline: ${line(s)}. The board can't show in this window, so ask Claude to "show my pipeline" and go through it here in the chat.`,
        context: ['The Pipeline panel is not visible in this app or window. If the user asks, use the chat version of the pipeline skill (.agents/skills/pipeline/SKILL.md).'],
      }
    }
    return { text: `Pipeline: ${line(s)}` }
  })

  // One line above the prompt. Other boards (Contacts, Job Inbox) add their part to the same line:
  // every band calls next(e) and puts what the bands beneath drew after its own.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, summary)
    if (e.props.hasSurvey || s === null || (await read($, isHidden))) return next(e)
    if (line(s) === 'Nothing tracked yet') return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const mine = (
      <Box key="pipeline-band" flexDirection="row" gap={1}>
        <Text color={s.due.length > 0 ? 'warning' : undefined}>{`Job search: ${line(s)}`}</Text>
        <Button key="board" label="Open pipeline" plain onPress={() => $.ui.open({ id: PANE, title: 'Pipeline', focus: true })} />
        <Button key="hide" label="Hide (job search summary)" plain dimColor onPress={() => update($, isHidden, () => true)}>Hide</Button>
      </Box>
    )
    const below: any = await next(e)
    if (below && typeof below === 'object' && typeof below.type === 'string' && below.type !== 'engine') {
      return <Box flexDirection="row" flexWrap="wrap" columnGap={2}>{mine}{below}</Box>
    }
    return mine
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e) as any
    const { Box, Text, Button } = els
    const canEdit = 'Select' in els && 'Input' in els
    const s = await read($, summary)
    const open = await read($, editing)
    const closedShown = await read($, showClosed)
    const note = await read($, notice)
    if (s === null) return <Text dimColor>Loading…</Text>
    const activePage = pageOf(s.active, await read($, page), SHOWN)
    const closedList = pageOf(s.closed, await read($, closedPage), SHOWN)
    const firstKey = activePage.items[0]?.key ?? ''

    const card = (j: Job) => {
      const isOpenJob = OPEN.includes(j.status)
      // Each card's buttons carry the job's name for screen readers (a desktop's native buttons):
      // "Update… (Globex, Data Analyst)", drawn as "Update…". The visible words start the name (WCAG 2.5.3).
      const named = (visible: string) => `${visible} (${j.company}${j.role ? `, ${j.role}` : ''})`
      // A stage change can move the card to the closed list (hidden): the focus goes to Refresh then.
      const toStage = async (v: string) => { await setStage($, j, v); focusOn($, OPEN.includes(v) ? `${j.key}:edit` : 'refresh') }
      const isDue = isOpenJob && isIso(j.nextDate) && j.nextDate <= s.today
      const isEditing = open === j.key
      return (
        <Box key={j.key} flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold>{`${j.company} · ${j.role}`}</Text>
          <Text dimColor>{`Stage: ${stageLabel(j.status)}`}</Text>
          {isOpenJob && (
            <Text color={isDue ? 'warning' : undefined}>
              {j.nextAction ? `Next: ${j.nextAction}${j.nextDate ? ` (${friendlyDate(j.nextDate, s.today)})` : ''}` : 'No next step yet. Press Update… to add one.'}
            </Text>
          )}
          {isOpenJob && j.also !== '' && (
            <Text color={isIso(j.alsoDate) && j.alsoDate <= s.today ? 'warning' : undefined}>{`Also: ${j.also}${isIso(j.alsoDate) && j.alsoDate <= s.today ? ` (${friendlyDate(j.alsoDate, s.today)})` : ''}`}</Text>
          )}
          {isOpenJob && isIso(j.deadline) && (() => {
            const left = daysBetween(s.today, j.deadline)
            const isUrgent = (j.status === 'offer' && left <= 3) || (j.status === 'interested' && left >= 0 && left <= 3)
            return (
              <Text color={isUrgent ? 'warning' : undefined}>
                {`${j.status === 'offer' ? 'Answer the offer by' : 'Application deadline'}: ${j.deadline}${left < 0 ? ' (passed)' : left === 0 ? ' (today)' : ` (in ${left} ${left === 1 ? 'day' : 'days'})`}`}
              </Text>
            )
          })()}
          {j.status === 'offer' && j.deadline === '' && (
            <Text color="warning" wrap="wrap">No answer-by date recorded for this offer. Ask the employer when they need your answer, then tell Claude.</Text>
          )}
          {isOpenJob && j.deadline !== '' && !isIso(j.deadline) && <Text>{`Deadline: date unclear: ${j.deadline}`}</Text>}
          {isEditing && canEdit && (
            <Box flexDirection="column" gap={1} marginTop={1}>
              <els.Select key={`${j.key}:stage`} label="Stage" value={j.status || 'interested'} options={STAGES} onSelect={toStage} />
              {isOpenJob && <els.Input key={`${j.key}:next`} label="Next step" value={j.nextAction} placeholder="e.g. Follow up with the recruiter" submitLabel="save" onSubmit={(v: string) => setNext($, j, v)} />}
              {isOpenJob && <els.Input key={`${j.key}:date`} label="Due date" value={j.nextDate} placeholder="YYYY-MM-DD" submitLabel="save" onSubmit={(v: string) => setDate($, j, v)} />}
              <Text dimColor>Pick a stage with the arrow keys and Enter. In a text box, type and press Enter to save.</Text>
            </Box>
          )}
          {isEditing && !canEdit && (
            <Box flexDirection="row" gap={1} flexWrap="wrap" marginTop={1}>
              {STAGES.slice(0, 5).filter(st => st.value !== j.status).map(st => <Button key={`${j.key}:to-${st.value}`} label={named(`Move to ${st.label}`)} onPress={() => toStage(st.value)}>{`Move to ${st.label}`}</Button>)}
            </Box>
          )}
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            {j.key === firstKey
              ? <Button key={`${j.key}:edit`} label={named(isEditing ? 'Done editing' : 'Update…')} autoFocus onPress={() => update($, editing, () => (isEditing ? '' : j.key))}>{isEditing ? 'Done editing' : 'Update…'}</Button>
              : <Button key={`${j.key}:edit`} label={named(isEditing ? 'Done editing' : 'Update…')} onPress={() => update($, editing, () => (isEditing ? '' : j.key))}>{isEditing ? 'Done editing' : 'Update…'}</Button>}
            {isOpenJob && j.nextAction !== '' && <Button key={`${j.key}:done`} label={named('Mark next step done')} onPress={async () => { await markDone($, j); focusOn($, `${j.key}:edit`) }}>Mark next step done</Button>}
            {isOpenJob && isIso(j.nextDate) && <Button key={`${j.key}:week`} label={named('Push back a week')} onPress={() => snooze($, j, 7)}>Push back a week</Button>}
            {j.status === 'interested' && <Button key={`${j.key}:apply`} label={named('Start application')} plain onPress={() => $.prompt.fill({ text: `/apply ${j.folder || `${j.company} ${j.role}`}` })}>Start application</Button>}
            {j.status === 'interviewing' && <Button key={`${j.key}:prep`} label={named('Prep for interview')} plain onPress={() => $.prompt.fill({ text: `/interview-prep ${j.folder || `${j.company} ${j.role}`}` })}>Prep for interview</Button>}
          </Box>
        </Box>
      )
    }

    // "Showing 21–40 of 52" with Previous / Next: one page at a time keeps the panel within what it can draw.
    const pager = (id: string, pg: ReturnType<typeof pageOf>, total: number, move: (to: number) => unknown) => pg.pages > 1 && (
      <Box key={`${id}-pager`} flexDirection="row" gap={1} flexWrap="wrap">
        <Text dimColor>{`Showing ${pg.from}–${pg.to} of ${total}`}</Text>
        {pg.page > 0 && <Button key={`${id}-prev`} label="Previous page" plain onPress={() => move(pg.page - 1)} />}
        {pg.page < pg.pages - 1 && <Button key={`${id}-next`} label="Next page" plain onPress={() => move(pg.page + 1)} />}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Text bold>{line(s)}</Text>
          <Button key="refresh" label="Refresh" onPress={() => refresh($)} />
          <Button key="close" label="Close" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
        {e.surface === 'terminal' && <Text>{KEYS_HINT}</Text>}
        <Text dimColor>Changes here save straight to your tracker (jobs/tracker.csv), and Claude is told about them. "Start application" and "Prep for interview" write a message to Claude; press Enter to send it.</Text>
        {note.text !== '' && <Text color={note.isError ? 'error' : 'success'}>{note.isError ? `Not saved: ${note.text}` : note.text}</Text>}
        {s.problem !== '' && <Text color="error" wrap="wrap">{s.problem}</Text>}
        {s.problem === '' && s.active.length === 0 && <Text>No open applications yet. Type /find-jobs, or paste a job link to Claude.</Text>}
        {activePage.items.map(card)}
        {pager('active', activePage, s.active.length, to => update($, page, () => to))}
        {s.closed.length > 0 && (
          <Button key="closed" label={closedShown ? 'Hide closed jobs' : `Show closed jobs (${s.closed.length})`} plain onPress={() => update($, showClosed, v => !v)} />
        )}
        {closedShown && closedList.items.map(card)}
        {closedShown && pager('closed', closedList, s.closed.length, to => update($, closedPage, () => to))}
      </Box>
    )
  })
}
