import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Job, Notice, Summary } from '../types'
import { addDays, alsoOf, csvTrouble, dateOrder, daysBetween, isExcelLock, isIso, localDate, orderFor, plain, readCsv, toCsv, toIso } from './csvdate'

// Pipeline: the user's interactive job board. It reads jobs/tracker.csv (the single source of truth),
// shows a one-line band above the prompt, and lets the user change a job's stage, next step and date.
// Every change is written straight back to tracker.csv and noted for Claude.

const PANE = 'pipeline'
const TRACKER = 'jobs/tracker.csv'
const ACTIVITY = 'history/activity.md'
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

const summary = atom({ plugin: 'pipeline', key: 'summary' } as const, null as Summary | null)
const isHidden = atom({ plugin: 'pipeline', key: 'isHidden' } as const, false)
const editing = atom({ plugin: 'pipeline', key: 'editing' } as const, '')
const showClosed = atom({ plugin: 'pipeline', key: 'showClosed' } as const, false)
const notice = atom({ plugin: 'pipeline', key: 'notice' } as const, { text: '', isError: false } as Notice)
const showAll = atom({ plugin: 'pipeline', key: 'showAll' } as const, false)

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

const isInterview = (text: string) => /interview/i.test(text) && !/prep|thank/i.test(text)
const SHOWN = 20

// Folder is part of the key so two postings with the same company and title stay separate.
// A row's identity: company + role + folder. Rows typed in by hand may have no folder, so fall
// back to the job ID, link or date found to keep two postings with the same title apart.
function keyOf(company: string, role: string, folder = ''): string {
  const base = `${company.trim().toLowerCase()}|${role.trim().toLowerCase()}`
  return folder.trim() ? `${base}|${folder.trim().toLowerCase()}` : base
}
function rowKey(get: (c: string) => string): string {
  return keyOf(get('company'), get('role'), get('folder') || get('job_id') || get('link') || get('date_found'))
}

// True when Excel seems to have the file open (its "~$" lock file is next to it). Without a lock file
// it may still be open, so a failed save also asks the user to save and close Excel.
async function openInExcel($: any, path: string): Promise<boolean> {
  const at = path.lastIndexOf('/')
  try {
    const entries: Array<{ name: string }> = await $.fs.list(at < 0 ? '.' : path.slice(0, at))
    return entries.some(e => isExcelLock(String(e.name), path.slice(at + 1)))
  } catch { return false }
}

// One line added to the end of history/activity.md. The file is re-read right before the write and
// checked afterwards, so a line another app added meanwhile is kept and this one is not lost.
async function appendLine($: any, path: string, lineOut: string): Promise<boolean> {
  const readNow = async (): Promise<string> => ((await $.fs.exists(path)) ? String(await $.fs.read(path)) : '# Recent activity\n\n')
  let wrote = false
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const before = await readNow()
      if (wrote && before.includes(lineOut)) return true
      if ((await readNow()) !== before) continue
      await $.fs.write(path, before.replace(/\n*$/, '\n') + lineOut)
      wrote = true
      if ((await readNow()).includes(lineOut)) return true
    }
  } catch { /* the log is a convenience; never block a save on it */ }
  return false
}

async function load($: any): Promise<Summary> {
  const today = localDate(await $.clock.now())
  const raw = (await $.fs.exists(TRACKER)) ? await $.fs.read(TRACKER) : ''
  const prefs: string = (await $.fs.exists('profile/preferences.md')) ? await $.fs.read('profile/preferences.md').catch(() => '') : ''
  const order = dateOrder(prefs)
  const { rows: [header = [], ...rows], problem } = readCsv(raw)
  const col = (name: string) => header.findIndex(h => h.trim().toLowerCase() === name)
  const at = (r: string[], name: string) => (col(name) >= 0 ? (r[col(name)] ?? '').trim() : '')
  const jobs: Job[] = problem !== '' ? [] : rows.map(r => {
    const o = orderFor(r, order)
    const also = alsoOf(at(r, 'notes'), o)
    return {
      key: rowKey(c => at(r, c)),
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
    for (const entry of await $.fs.list('outbox')) {
      // Same reading as the Outbox panel: skip examples and README, ignore case in the status.
      if (entry.kind !== 'file' || !entry.name.endsWith('.md') || entry.name.startsWith('_') || entry.name.toLowerCase() === 'readme.md') continue
      const text: string = (await $.fs.read(`outbox/${entry.name}`).catch(() => '')).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/^\s+(?=---)/, '')
      if (!/^---\n[\s\S]*?\n---/.test(text)) continue
      const status = (/^status:\s*["']?([^\s#"']+)/m.exec(text.split(/\n---/)[0] ?? '')?.[1] ?? 'draft').toLowerCase()
      if (status === 'draft') drafts++
    }
  }
  const isClosed = /^search_status:\s*closed/m.test(prefs)
  return { today, active, closed, due, counts, drafts, isClosed, problem: csvTrouble(problem, 'Your tracker (jobs/tracker.csv)') }
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

// One line in history/activity.md, so Codex (or a later Claude session) knows what the user changed here.
async function logActivity($: any, what: string): Promise<void> {
  const d = new Date(await $.clock.now())
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${localDate(d.getTime())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  const text = what.replace(/\. The user accepted this offer.*$/, '. The user accepted this offer')
  const lineOut = `- ${stamp} · Pipeline panel (Claude) · ${text.replace(/[\r\n]+/g, ' ')}\n`
  await appendLine($, ACTIVITY, lineOut)
}

// Read the tracker fresh, change one job's row, write it back, and tell Claude what changed.
async function saveJob($: any, key: string, change: (get: (c: string) => string, set: (c: string, v: string) => void, today: string) => string): Promise<void> {
  const today = localDate(await $.clock.now())
  const prefs: string = (await $.fs.exists('profile/preferences.md').catch(() => false)) ? await $.fs.read('profile/preferences.md').catch(() => '') : ''
  const order = dateOrder(prefs)
  let what = ''
  // Optimistic save: if the file changes (Claude, Codex, Excel) between our read and our write, start over from the new version.
  for (let attempt = 0; ; attempt++) {
  const original: string = await $.fs.read(TRACKER)
  const { rows, problem } = readCsv(original)
  // A damaged file (an unclosed quote, or saved with semicolons) is never written back: that would spread the damage.
  if (problem !== '') { await refresh($).catch(() => undefined); await say($, csvTrouble(problem, 'Your tracker (jobs/tracker.csv)'), true); return }
  const header = rows[0] ?? []
  const find = (c: string) => header.findIndex(h => h.trim().toLowerCase() === c)
  const idx = (c: string) => {
    let i = find(c)
    if (i < 0) { header.push(c); i = header.length - 1 }
    return i
  }
  // Find the row by the cells exactly as the board read them, before any date in it is tidied.
  const target = rows.slice(1).find(r => rowKey(c => (find(c) >= 0 ? (r[find(c)] ?? '') : '').trim()) === key)
  if (!target) { await say($, 'That job is no longer in jobs/tracker.csv. Press Refresh, or ask Claude to check the tracker.', true); return }
  // Only this row's dates are tidied, and only when their meaning is certain; other rows stay as they are.
  const o = orderFor(target, order)
  for (const c of DATE_COLS) { const i = find(c); if (i >= 0 && target[i]) target[i] = toIso(target[i], o) }
  const get = (c: string) => (target[idx(c)] ?? '').trim()
  const set = (c: string, v: string) => { const i = idx(c); while (target.length <= i) target.push(''); target[i] = plain(v) }
  what = change(get, set, today)
  for (const r of rows) while (r.length < header.length) r.push('')
  const next = (original.startsWith('\uFEFF') ? '\uFEFF' : '') + toCsv(rows)
  if (await openInExcel($, TRACKER)) {
    await say($, 'Your tracker is open in Excel. Save and close it there, then try again (otherwise Excel would later put back its older copy).', true)
    return
  }
  try {
    // Compare and write back to back, so the window for another app's save to slip in stays as small as it can.
    if ((await $.fs.read(TRACKER)) !== original) {
      if (attempt < 3) continue
      await say($, 'Your tracker kept changing while saving (another app may be editing it). Try again in a moment.', true)
      return
    }
    await $.fs.write(TRACKER, next)
  } catch {
    await say($, 'Your tracker is open in another app (like Excel). Close it there, then try again.', true)
    return
  }
  // Another app may have saved at the same instant. The change is never applied a second time (that
  // could push a date back twice); instead, check that the row as saved is still there.
  const back: string = await $.fs.read(TRACKER).catch(() => next)
  if (back !== next && !readCsv(back).rows.some(r => r.length >= target.length && target.every((v, i) => (r[i] ?? '') === v))) {
    await refresh($).catch(() => undefined)
    await say($, 'Another app saved your tracker at the same moment, so this change may not have stuck. Check the job below and try again if needed.', true)
    return
  }
  await logActivity($, what)
  break
  }
  await refresh($)
  await say($, `Saved: ${what}.`)
  await $.session.append({
    message: { type: 'user', content: [{ type: 'text', text: `[Pipeline] The user updated jobs/tracker.csv from the board: ${what}. Take this into account; if the dashboard is published (profile/published-pages.md), republish it the next time the user talks to you.` }] },
  }).catch(() => undefined)
}

async function setStage($: any, job: Job, status: string): Promise<void> {
  if (status === job.status) return
  await saveJob($, job.key, (get, set, today) => {
    set('status', status)
    let extra = ''
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
      extra += `; ask the user for the answer-by date and put it in deadline${old !== '' ? ` (the old application deadline ${old} was cleared)` : ''}`
    } else if (['screening', 'interviewing'].includes(status) && /^follow up/i.test(get('next_action'))) {
      // A company that's now screening or interviewing the user doesn't need a follow-up nudge.
      set('next_action', 'Decide next step')
      set('next_action_date', today)
      extra += '; ask the user for the interview date and set the next step to "Interview <date>"'
    } else if (get('next_action_date') === '') {
      set('next_action', get('next_action') || 'Decide next step')
      set('next_action_date', addDays(today, 1, true))
      extra += `; next step due ${get('next_action_date')}`
    }
    if (status === 'accepted') extra += '. The user accepted this offer: congratulate them, then offer the "closing the search" wrap-up from the offer skill (withdrawals, thank-yous, career log)'
    return `${job.company} (${job.role}) moved to ${stageLabel(status)}${extra}`
  })
  if (status === 'accepted') $.ui.toast(`Congratulations on the job at ${job.company}! Ask Claude to wrap up your search and refresh your dashboard for a little celebration.`, { timeoutMs: 15000 })
}

async function setDate($: any, job: Job, value: string): Promise<void> {
  const v = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { await say($, 'Type the date as YYYY-MM-DD, for example 2026-10-14.', true); return }
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
  // the next step; otherwise "done" hands the user a decision due today.
  await saveJob($, job.key, (get, set, today) => {
    const also = alsoOf(get('notes'))
    if (also && also.date !== '') {
      set('next_action', also.text)
      set('next_action_date', also.date)
      set('notes', get('notes').replace(ALSO, ''))
      return `${job.company}: finished "${job.nextAction || 'next step'}"; next step is now "${also.text}"`
    }
    set('next_action', 'Decide next step'); set('next_action_date', today)
    return `${job.company}: finished "${job.nextAction || 'next step'}"; suggest the user's next step`
  })
}

async function snooze($: any, job: Job, days: number): Promise<void> {
  await saveJob($, job.key, (get, set, today) => {
    const current = get('next_action_date')
    set('next_action_date', addDays(isIso(current) && current > today ? current : today, days))
    return `${job.company}: next step moved to ${get('next_action_date')}`
  })
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
    $.clock.every(30000, () => void refresh($).catch(() => undefined))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await refresh($).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'pipeline' }, async $ => {
    const s = await refresh($)
    await update($, isHidden, () => false)
    await say($, '')
    await $.ui.open({ id: PANE, title: 'Pipeline' })
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
        <Button key="board" label="Open pipeline" plain onPress={() => $.ui.open({ id: PANE, title: 'Pipeline' })} />
        <Button key="hide" label="Hide" plain dimColor onPress={() => update($, isHidden, () => true)} />
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
    const allShown = await read($, showAll)
    if (s === null) return <Text dimColor>Loading…</Text>

    const card = (j: Job) => {
      const isOpenJob = OPEN.includes(j.status)
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
              <Text color={isUrgent ? 'warning' : undefined} dimColor={!isUrgent}>
                {`${j.status === 'offer' ? 'Answer the offer by' : 'Application deadline'}: ${j.deadline}${left < 0 ? ' (passed)' : left === 0 ? ' (today)' : ` (in ${left} ${left === 1 ? 'day' : 'days'})`}`}
              </Text>
            )
          })()}
          {j.status === 'offer' && j.deadline === '' && (
            <Text color="warning" wrap="wrap">No answer-by date recorded for this offer. Ask the employer when they need your answer, then tell Claude.</Text>
          )}
          {isOpenJob && j.deadline !== '' && !isIso(j.deadline) && <Text dimColor>{`Deadline: date unclear: ${j.deadline}`}</Text>}
          {isEditing && canEdit && (
            <Box flexDirection="column" gap={1} marginTop={1}>
              <els.Select key={`${j.key}:stage`} label="Stage" value={j.status || 'interested'} options={STAGES} onSelect={(v: string) => setStage($, j, v)} />
              {isOpenJob && <els.Input key={`${j.key}:next`} label="Next step" value={j.nextAction} placeholder="e.g. Follow up with the recruiter" submitLabel="save" onSubmit={(v: string) => setNext($, j, v)} />}
              {isOpenJob && <els.Input key={`${j.key}:date`} label="Due date" value={j.nextDate} placeholder="YYYY-MM-DD" submitLabel="save" onSubmit={(v: string) => setDate($, j, v)} />}
              <Text dimColor>Pick a stage with the arrow keys and Enter. In a text box, type and press Enter to save.</Text>
            </Box>
          )}
          {isEditing && !canEdit && (
            <Box flexDirection="row" gap={1} flexWrap="wrap" marginTop={1}>
              {STAGES.slice(0, 5).filter(st => st.value !== j.status).map(st => <Button key={`${j.key}:to-${st.value}`} label={`Move to ${st.label}`} onPress={() => setStage($, j, st.value)} />)}
            </Box>
          )}
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            <Button key={`${j.key}:edit`} label={isEditing ? 'Done editing' : 'Update…'} onPress={() => update($, editing, () => (isEditing ? '' : j.key))} />
            {isOpenJob && j.nextAction !== '' && <Button key={`${j.key}:done`} label="Mark next step done" onPress={() => markDone($, j)} />}
            {isOpenJob && j.nextDate !== '' && <Button key={`${j.key}:week`} label="Push back a week" onPress={() => snooze($, j, 7)} />}
            {j.status === 'interested' && <Button key={`${j.key}:apply`} label="Start application" plain onPress={() => $.prompt.fill({ text: `/apply ${j.folder || `${j.company} ${j.role}`}` })} />}
            {j.status === 'interviewing' && <Button key={`${j.key}:prep`} label="Prep for interview" plain onPress={() => $.prompt.fill({ text: `/interview-prep ${j.folder || `${j.company} ${j.role}`}` })} />}
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{line(s)}</Text>
        <Text dimColor>Changes here save straight to your tracker (jobs/tracker.csv), and Claude is told about them. "Start application" and "Prep for interview" write a message to Claude; press Enter to send it.</Text>
        {note.text !== '' && <Text color={note.isError ? 'error' : 'success'}>{note.isError ? `Not saved: ${note.text}` : note.text}</Text>}
        {s.problem !== '' && <Text color="error" wrap="wrap">{s.problem}</Text>}
        {s.problem === '' && s.active.length === 0 && <Text dimColor>No open applications yet. Type /find-jobs, or paste a job link to Claude.</Text>}
        {(allShown ? s.active : s.active.slice(0, SHOWN)).map(card)}
        {s.active.length > SHOWN && (
          <Button key="show-all" label={allShown ? `Show only the first ${SHOWN}` : `Show all ${s.active.length} open jobs`} plain onPress={() => update($, showAll, v => !v)} />
        )}
        {s.closed.length > 0 && (
          <Button key="closed" label={closedShown ? 'Hide closed jobs' : `Show closed jobs (${s.closed.length})`} plain onPress={() => update($, showClosed, v => !v)} />
        )}
        {closedShown && s.closed.map(card)}
        <Box flexDirection="row" gap={1}>
          <Button key="refresh" label="Refresh" onPress={() => refresh($)} />
          <Button key="close" label="Close" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
