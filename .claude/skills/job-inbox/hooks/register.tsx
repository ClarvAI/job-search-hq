import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Decision, Inbox, Lead, Notice } from '../types'
import { dateOrder, daysBetween, isIso, isTracked, localDate, orderFor, plain, readCsv, records, savedNote, toCsv, toIso, trackerIndex, trackerRefs } from './leads'
import { activityLine, colOf, csvTrouble, isExcelLock, pageOf, rowKept } from './csvdate'
import type { DateOrder, TrackerIndex } from './leads'

// Job Inbox: /find-jobs writes new leads to jobs/leads.csv; the user goes through them here.
// Save hands the lead to Claude for add-job; Skip and Not for me keep it from being suggested again,
// and the reasons tune the next search. Decisions are logged to history/activity.md once per sitting.

const PANE = 'job-inbox'
const LEADS = 'jobs/leads.csv'
const TRACKER = 'jobs/tracker.csv'
const ACTIVITY = 'history/activity.md'
const BOM = String.fromCharCode(0xfeff)
// A byte-order mark only counts at the very start of a file.
const noBom = (t: string) => (t.startsWith(BOM) ? t.slice(1) : t)
// The files this inbox reads: when one changes on disk (find-jobs, Codex, Excel), it refreshes.
const WATCHED = ['jobs/leads.csv', 'jobs/tracker.csv']
// The same words, in the same place (right under the panel's first line), in every panel.
const KEYS_HINT = 'Keys: Ctrl+X then Tab moves into this panel. Tab moves between buttons, Enter presses one, Esc goes back to typing.'
const OLDER_THAN_DAYS = 30
const LOG_AFTER_MS = 5 * 60 * 1000

const REASONS = [
  { value: 'too-senior', label: 'Too senior' },
  { value: 'too-junior', label: 'Too junior' },
  { value: 'wrong-location', label: 'Wrong location' },
  { value: 'not-my-field', label: 'Not my field' },
  { value: 'company', label: 'Not this company' },
  { value: 'pay', label: 'Pay too low' },
  { value: 'other', label: 'Something else' },
]
const reasonLabel = (v: string) => REASONS.find(r => r.value === v)?.label.toLowerCase() ?? v.replace(/^other:\s*/, '')
const FIT = { A: 'Strong fit', B: 'Good fit', C: 'Worth a look' } as Record<string, string>

const inbox = atom({ plugin: 'job-inbox', key: 'inbox' } as const, null as Inbox | null)
// The lead whose "Not for me" reasons are showing; "<id>|other" while typing a reason of their own.
const asking = atom({ plugin: 'job-inbox', key: 'asking' } as const, '')
const notice = atom({ plugin: 'job-inbox', key: 'notice' } as const, { text: '', isError: false, undoId: '', undoStatus: '' } as Notice)
const pending = atom({ plugin: 'job-inbox', key: 'pending' } as const, [] as Decision[])
// Which page of lead cards is showing (best fits first, older leads after): a panel draws at most
// 100,000 characters, so a long inbox is shown a page at a time.
const page = atom({ plugin: 'job-inbox', key: 'page' } as const, 0)
const SHOWN = 15
// Saved leads listed by name before "and N more".
const SAVED_SHOWN = 10

// The quiet-time timer for the activity line (a module variable: a reload just drops it, and the
// pending decisions in $.state are written at the next prompt, close, or session start instead).
let logTimer: { cancel: () => void } | undefined

const labelOf = (l: { company: string; role: string }) => `${l.company} - ${l.role}`

function toLead(r: Record<string, string>, tracked: TrackerIndex, order: DateOrder): Lead {
  const g = (k: string) => r[k] ?? ''
  order = orderFor(Object.values(r), order)
  const lead = {
    id: g('id'), foundDate: toIso(g('found_date'), order), company: g('company'), role: g('role'), location: g('location'),
    remote: g('remote').toLowerCase(), pay: g('pay'), posted: g('posted'), link: g('link'), applyLink: g('apply_link'),
    jobId: g('job_id'), source: g('source'), fitGuess: g('fit_guess').toUpperCase(), why: g('why'), concerns: g('concerns'),
    status: (g('status') || 'new').toLowerCase(), reason: g('reason'), decidedDate: toIso(g('decided_date'), order), isTracked: false,
  }
  lead.isTracked = isTracked(tracked, lead)
  return lead
}

async function readText($: any, path: string): Promise<string> {
  return (await $.fs.exists(path)) ? noBom(String(await $.fs.read(path))) : ''
}

async function load($: any): Promise<Inbox> {
  const today = localDate(await $.clock.now())
  const hasFile = await $.fs.exists(LEADS)
  const tracked = trackerIndex(trackerRefs(await readText($, TRACKER).catch(() => '')))
  const order = dateOrder(await readText($, 'profile/preferences.md').catch(() => ''))
  const leadsText = await readText($, LEADS)
  const problem = readCsv(leadsText).problem
  const leads = (problem !== '' ? [] : records(leadsText)).filter(r => (r.company ?? '') !== '').map(r => toLead(r, tracked, order))
  const counts: Record<string, number> = {}
  for (const l of leads) counts[l.status] = (counts[l.status] ?? 0) + 1
  const rank = (l: Lead) => ({ A: 0, B: 1, C: 2 } as Record<string, number>)[l.fitGuess] ?? 3
  const byFit = (a: Lead, b: Lead) => rank(a) - rank(b) || b.foundDate.localeCompare(a.foundDate) || a.company.localeCompare(b.company)
  const open = leads.filter(l => l.status === 'new' && !l.isTracked)
  const isOld = (l: Lead) => isIso(l.foundDate) && daysBetween(l.foundDate, today) > OLDER_THAN_DAYS
  counts.tracked = leads.filter(l => l.status === 'new' && l.isTracked).length
  return {
    today,
    fresh: open.filter(l => !isOld(l)).sort(byFit),
    older: open.filter(isOld).sort((a, b) => b.foundDate.localeCompare(a.foundDate)),
    saved: leads.filter(l => l.status === 'saved' && !l.isTracked),
    counts,
    hasFile,
    problem: csvTrouble(problem, 'Your leads file (jobs/leads.csv)'),
  }
}

async function refresh($: any): Promise<Inbox> {
  const next = await load($)
  if (JSON.stringify(await read($, inbox)) !== JSON.stringify(next)) await update($, inbox, () => next)
  return next
}

// Moves the keyboard focus onto a button the next drawing shows, after the pressed one went away
// (a card left, a row of reasons opened or closed). Refused when the panel doesn't hold the keyboard.
function focusOn($: any, key: string): void {
  void Promise.resolve().then(() => $.ui.focus({ requestId: PANE, key })).catch(() => undefined)
}

async function say($: any, text: string, isError = false, undoId = '', undoStatus = ''): Promise<void> {
  await update($, notice, () => ({ text, isError, undoId, undoStatus }))
}

async function tellClaude($: any, text: string): Promise<void> {
  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } }).catch(() => undefined)
}

// Write the decisions made since the last line as ONE line in history/activity.md.
async function flushLog($: any): Promise<void> {
  logTimer?.cancel()
  logTimer = undefined
  const list = await read($, pending)
  if (list.length === 0) return
  await update($, pending, () => [])
  const of = (s: string) => list.filter(d => d.status === s)
  const saved = of('saved'), skipped = of('skipped'), nope = of('not-for-me')
  const why: Record<string, number> = {}
  for (const d of nope) why[reasonLabel(d.reason)] = (why[reasonLabel(d.reason)] ?? 0) + 1
  const parts = [
    saved.length > 0 ? `saved ${saved.length} (${saved.map(d => d.label).join('; ')})` : '',
    skipped.length > 0 ? `skipped ${skipped.length}` : '',
    nope.length > 0 ? `not for me ${nope.length} (${Object.entries(why).map(([k, n]) => (n > 1 ? `${k} x${n}` : k)).join(', ')})` : '',
  ].filter(Boolean)
  await appendLine($, ACTIVITY, activityLine(await $.clock.now(), 'Job Inbox panel (Claude)', `Job leads reviewed: ${parts.join(', ')}`))
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
  } catch { /* the log is a convenience; the decisions are already saved in leads.csv */ }
  return false
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

function scheduleLog($: any): void {
  logTimer?.cancel()
  logTimer = $.clock.after(LOG_AFTER_MS, () => void flushLog($).catch(() => undefined))
}

// Read leads.csv fresh, change one lead's row, write it back. Retries if another app changed the file meanwhile.
async function saveLead($: any, id: string, change: (get: (c: string) => string, set: (c: string, v: string) => void, today: string) => boolean): Promise<boolean> {
  const today = localDate(await $.clock.now())
  for (let attempt = 0; ; attempt++) {
    const original: string = await $.fs.read(LEADS).catch(() => '')
    const { rows, problem } = readCsv(original)
    // A damaged file is never written back: that would spread the damage.
    if (problem !== '') { await refresh($).catch(() => undefined); await say($, csvTrouble(problem, 'Your leads file (jobs/leads.csv)'), true); return false }
    const header = rows[0] ?? []
    const idx = (c: string) => {
      let i = colOf(header, c)
      if (i < 0) { header.push(c); i = header.length - 1 }
      return i
    }
    const idCol = colOf(header, 'id')
    const target = idCol < 0 ? undefined : rows.slice(1).find(r => (r[idCol] ?? '').trim() === id)
    if (!target) { await say($, 'That lead is no longer in jobs/leads.csv. Press Refresh.', true); return false }
    const get = (c: string) => (target[idx(c)] ?? '').trim()
    const set = (c: string, v: string) => { const i = idx(c); while (target.length <= i) target.push(''); target[i] = plain(v) }
    if (!change(get, set, today)) { await refresh($); return false }
    for (const r of rows) while (r.length < header.length) r.push('')
    const next = (original.startsWith(BOM) ? BOM : '') + toCsv(rows)
    if (await openInExcel($, LEADS)) {
      await say($, 'Your leads file is open in Excel. Save and close it there, then try again (otherwise Excel would later put back its older copy).', true)
      return false
    }
    try {
      // Compare and write back to back, so another app's save has the smallest window to slip in.
      if ((await $.fs.read(LEADS)) !== original) {
        if (attempt < 3) continue
        await say($, 'Your leads file kept changing while saving (another app may be editing it). Try again in a moment.', true)
        return false
      }
      await $.fs.write(LEADS, next)
    } catch {
      await say($, 'Your leads file is open in another app (like Excel). Close it there, then try again.', true)
      return false
    }
    // If another app saved at the same instant, don't redo the change; check the saved row is still there.
    const back: string = await $.fs.read(LEADS).catch(() => next)
    if (back !== next && !rowKept(back, target)) {
      await say($, 'Another app saved your leads file at the same moment, so this choice may not have stuck. Press Refresh and check.', true)
      return false
    }
    return true
  }
}

async function decide($: any, lead: Lead, status: 'saved' | 'skipped' | 'not-for-me', reason = ''): Promise<void> {
  const ok = await saveLead($, lead.id, (get, set, today) => {
    if (get('status').toLowerCase() !== 'new' && get('status') !== '') return false
    set('status', status); set('reason', reason); set('decided_date', today)
    return true
  })
  await update($, asking, () => '')
  if (!ok) { await refresh($); return }
  await update($, pending, list => [...list.filter(d => d.id !== lead.id), { id: lead.id, label: labelOf(lead), status, reason }])
  scheduleLog($)
  await refresh($)
  if (status === 'saved') {
    await say($, `Saved ${labelOf(lead)}. Claude will add it to your tracker next time you chat (or press "Add saved jobs now").`)
    await tellClaude($, savedNote(lead))
  } else {
    await say($, status === 'skipped' ? `Skipped ${labelOf(lead)}.` : `Not for you: ${labelOf(lead)} (${reasonLabel(reason)}). The next search will take that into account.`, false, lead.id, status)
  }
}

async function undo($: any, id: string, was: string): Promise<void> {
  const ok = await saveLead($, id, (get, set) => {
    if (get('status').toLowerCase() !== was) return false
    set('status', 'new'); set('reason', ''); set('decided_date', '')
    return true
  })
  await update($, pending, list => list.filter(d => d.id !== id))
  await refresh($)
  if (ok) await say($, 'Undone. The lead is back in your inbox.')
}

function headline(s: Inbox): string {
  const n = s.fresh.length + s.older.length
  if (n === 0) return 'No new leads'
  return `${n} new ${n === 1 ? 'lead' : 'leads'}${s.older.length > 0 ? ` (${s.older.length} older)` : ''}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'job-inbox', description: 'Go through new job leads from /find-jobs: save, skip, or not for me' })
    await flushLog($).catch(() => undefined)
    // No toast here: the due-alerts mod is the one pop-up at session start; the line above the prompt shows the count.
    await refresh($).catch(() => null)
    // A slow poll as a backstop; changed files also refresh the inbox at once (classic.FileChanged below).
    $.clock.every(30000, () => void refresh($).catch(() => undefined))
    return next(e)
  })

  // Ask Claude Code to watch the files this inbox reads, so new leads show at once. The paths must be
  // absolute: they are built from the session's folder.
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

  on('session.end', async ($, e, next) => {
    await flushLog($).catch(() => undefined)
    return next(e)
  })

  // Back at the prompt means this sitting is over: write its one activity line now.
  on('prompt.submit', async ($, e, next) => {
    if ((await read($, pending)).length > 0) await flushLog($).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    await refresh($).catch(() => undefined)
    return next(e)
  })

  // When Claude (find-jobs) writes new leads, say so once.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const path = String((e as any).file_path ?? '')
    if (/^(Write|Edit|MultiEdit)$/.test(String(e.tool)) && /(^|[\\/])jobs[\\/]leads\.csv$/.test(path)) {
      const before = (await read($, inbox))?.fresh.length ?? 0
      const s = await refresh($).catch(() => null)
      if (s && s.fresh.length > before) {
        const added = s.fresh.length - before
        $.ui.toast(`${added} new job ${added === 1 ? 'lead' : 'leads'} in your Job Inbox. Type /job-inbox to go through them.`)
      }
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'job-inbox' }, async $ => {
    const s = await refresh($)
    await update($, asking, () => '')
    await say($, '')
    const opened = await $.ui.open({ id: PANE, title: 'Job Inbox', focus: true })
    if (!opened.isPlaced) {
      return {
        text: `Job Inbox: ${headline(s)}. The inbox can't show in this window, so ask Claude to "go through my job leads" here in the chat.`,
        context: ['The Job Inbox panel is not visible in this app or window. If the user asks, use the chat version of the job-inbox skill (.agents/skills/job-inbox/SKILL.md).'],
      }
    }
    return { text: `Job Inbox: ${headline(s)}.` }
  })

  // Part of the line above the prompt, only while new leads are waiting. Whatever the bands beneath
  // drew (the Pipeline's summary, Contacts follow-ups) comes first, on the same line.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, inbox)
    if (e.props.hasSurvey || s === null || s.fresh.length === 0) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const n = s.fresh.length
    const mine = (
      <Box key="job-inbox-band" flexDirection="row" gap={1}>
        <Text>{`Job Inbox: ${n} new ${n === 1 ? 'lead' : 'leads'}`}</Text>
        <Button key="job-inbox-open" label="Open job inbox" plain onPress={() => $.ui.open({ id: PANE, title: 'Job Inbox', focus: true })} />
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
    const { Box, Text, Button, Link } = els
    const canType = 'Input' in els
    const s = await read($, inbox)
    const open = await read($, asking)
    const note = await read($, notice)
    if (s === null) return <Text dimColor>Loading…</Text>
    // Best fits first, then older leads; one page at a time.
    const all = [...s.fresh.map(l => ({ l, isOld: false })), ...s.older.map(l => ({ l, isOld: true }))]
    const pg = pageOf(all, await read($, page), SHOWN)
    const firstOld = pg.items.findIndex(x => x.isOld)

    // After a decision the card leaves: the focus moves to the next card's Save (or the one before, or Refresh).
    const ids = pg.items.map(x => x.l.id)
    const after = (id: string) => { const i = ids.indexOf(id); return ids[i + 1] ?? ids[i - 1] ?? '' }
    const decided = (l: Lead, run: Promise<unknown>) => { const to = after(l.id); return run.then(() => focusOn($, to ? `${to}:save` : 'refresh')) }

    const card = (l: Lead, isOld: boolean) => {
      // Each card's buttons carry the lead's name for screen readers (a desktop's native buttons):
      // "Save (Globex, Data Analyst)", drawn as "Save". The visible words start the name (WCAG 2.5.3).
      const named = (visible: string) => `${visible} (${l.company}${l.role ? `, ${l.role}` : ''})`
      const where = [l.location, l.remote && !l.location.toLowerCase().includes(l.remote) ? l.remote : ''].filter(Boolean).join(' · ')
      const meta = [where, l.pay && `Pay: ${l.pay}`, l.posted && `Posted ${l.posted}`].filter(Boolean).join('  ·  ')
      const isAsking = open === l.id || open === `${l.id}|other`
      const url = l.applyLink || l.link
      return (
        <Box key={l.id} flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold>{`${l.company} · ${l.role}`}</Text>
          {meta !== '' && <Text dimColor>{meta}</Text>}
          <Text>{[FIT[l.fitGuess], l.why].filter(Boolean).join(': ') || 'No notes on fit yet.'}</Text>
          {l.concerns !== '' && <Text color="warning">{`Watch out: ${l.concerns}`}</Text>}
          {isOld && <Text dimColor>{`Found ${l.foundDate}. It may be filled by now.`}</Text>}
          {url !== '' && <Link key={`${l.id}:link`} href={url} label="Open the posting" />}
          {isAsking && open !== `${l.id}|other` && (
            <Box flexDirection="column">
              <Text bold>Why is it not for you? This helps the next search.</Text>
              <Box flexDirection="row" gap={1} flexWrap="wrap">
                {REASONS.map(r => (
                  <Button key={`${l.id}:why-${r.value}`} label={named(r.label)} onPress={() => (r.value === 'other' && canType ? update($, asking, () => `${l.id}|other`).then(() => focusOn($, `${l.id}:why-text`)) : decided(l, decide($, l, 'not-for-me', r.value)))}>{r.label}</Button>
                ))}
                <Button key={`${l.id}:cancel`} label="Cancel" dimColor onPress={async () => { await update($, asking, () => ''); focusOn($, `${l.id}:nope`) }} />
              </Box>
            </Box>
          )}
          {open === `${l.id}|other` && canType && (
            <Box flexDirection="column">
              <els.Input key={`${l.id}:why-text`} label="In a few words" placeholder="e.g. needs a security clearance" submitLabel="save" autoFocus onSubmit={(v: string) => decided(l, decide($, l, 'not-for-me', v.trim() ? `other: ${v.trim()}` : 'other'))} />
              <Button key={`${l.id}:cancel`} label="Cancel" dimColor onPress={async () => { await update($, asking, () => ''); focusOn($, `${l.id}:nope`) }} />
            </Box>
          )}
          {!isAsking && (
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              <Button key={`${l.id}:save`} label={named('Save')} variant="primary" autoFocus={l.id === ids[0] ? true : undefined} onPress={() => decided(l, decide($, l, 'saved'))}>Save</Button>
              <Button key={`${l.id}:skip`} label={named('Skip')} onPress={() => decided(l, decide($, l, 'skipped'))}>Skip</Button>
              <Button key={`${l.id}:nope`} label={named('Not for me…')} onPress={async () => { await say($, ''); await update($, asking, () => l.id); focusOn($, `${l.id}:why-${REASONS[0]?.value ?? 'other'}`) }}>Not for me…</Button>
            </Box>
          )}
        </Box>
      )
    }

    const savedLinks = s.saved.map(l => l.applyLink || l.link || `${l.company} ${l.role}`)
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Text bold>{headline(s)}</Text>
          <Button key="refresh" label="Refresh" onPress={() => refresh($)} />
          <Button key="close" label="Close" role="dismiss" onPress={async () => { await flushLog($).catch(() => undefined); await $.ui.close({ id: PANE }) }} />
        </Box>
        {e.surface === 'terminal' && <Text>{KEYS_HINT}</Text>}
        <Text dimColor>Save sends a lead to Claude to add to your tracker. Skip or Not for me hides it, and it won't be suggested again.</Text>
        {note.text !== '' && (
          <Box flexDirection="row" gap={1}>
            <Text color={note.isError ? 'error' : 'success'}>{note.isError ? `Not saved: ${note.text}` : note.text}</Text>
            {note.undoId !== '' && <Button key="undo" label="Undo" plain onPress={async () => { const id = note.undoId; await undo($, id, note.undoStatus); focusOn($, `${id}:save`) }} />}
          </Box>
        )}
        {s.fresh.length === 0 && s.older.length === 0 && (
          <Box flexDirection="column">
            <Text>{s.hasFile ? 'No new leads right now. Type /find-jobs and Claude will look for openings that fit you.' : 'No leads yet. Type /find-jobs and Claude will look for openings that fit you.'}</Text>
            <Button key="find" label="Find jobs" plain onPress={() => $.prompt.fill({ text: '/find-jobs' })} />
          </Box>
        )}
        {s.problem !== '' && <Text color="error" wrap="wrap">{s.problem}</Text>}
        {pg.items.map((x, i) => (i === firstOld
          ? [<Text key="older-heading" bold>{`Older leads (found more than ${OLDER_THAN_DAYS} days ago)`}</Text>, card(x.l, true)]
          : card(x.l, x.isOld)))}
        {pg.pages > 1 && (
          <Box key="leads-pager" flexDirection="row" gap={1} flexWrap="wrap">
            <Text dimColor>{`Showing ${pg.from}–${pg.to} of ${all.length}`}</Text>
            {pg.page > 0 && <Button key="leads-prev" label="Previous page" plain onPress={() => update($, page, () => pg.page - 1)} />}
            {pg.page < pg.pages - 1 && <Button key="leads-next" label="Next page" plain onPress={() => update($, page, () => pg.page + 1)} />}
          </Box>
        )}
        {s.saved.length > 0 && (
          <Box flexDirection="column">
            <Text bold>{`Saved, waiting to be added to your tracker (${s.saved.length})`}</Text>
            {s.saved.slice(0, SAVED_SHOWN).map(l => <Text key={`${l.id}:saved`} dimColor>{`${labelOf(l)}${l.location ? ` · ${l.location}` : ''}`}</Text>)}
            {s.saved.length > SAVED_SHOWN && <Text dimColor>{`and ${s.saved.length - SAVED_SHOWN} more`}</Text>}
            <Button key="add-saved" label="Add saved jobs now" plain onPress={() => $.prompt.fill({ text: `/add-job ${savedLinks.join(' ')}` })} />
          </Box>
        )}
        {(s.counts.tracked ?? 0) > 0 && <Text dimColor>{`${s.counts.tracked} ${s.counts.tracked === 1 ? 'lead is' : 'leads are'} already in your tracker, so not shown.`}</Text>}
      </Box>
    )
  })
}
