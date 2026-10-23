import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Moment } from '../types'
import { columnsOf, daysBetween, isIso, jobKey, localDate, orderFor, dateOrder, readCsv, toIso } from './csvdate'

// Celebration: a one-time surprise. The first time a job in jobs/tracker.csv becomes `accepted` (from the
// Pipeline board, the chat or Codex), a congratulations pane opens by itself, without taking the keyboard,
// with the search in numbers, a button to wrap the search up, and an optional "share what worked" for
// future job seekers (the share-lessons skill drafts anonymous notes the user posts themselves, if at all).
// Which jobs were already celebrated is kept in the plugin's store, per folder. On the first run in a folder
// the jobs already accepted are only noted, so an old offer never pops up. It reads files and writes none.

const PANE = 'celebration'
const TRACKER = 'jobs/tracker.csv'
const PREFS = 'profile/preferences.md'
const SAMPLE = '.sample-workspace'
const WATCHED = [TRACKER]
const KEYS_HINT = 'Keys: Ctrl+X then Tab moves into this panel. Tab moves between buttons, Enter presses one, Esc goes back to typing.'

const moment = atom({ plugin: 'celebration', key: 'moment' } as const, null as Moment | null)
const isThanked = atom({ plugin: 'celebration', key: 'isThanked' } as const, false)

// Only clear evidence in a closed job's notes counts, read one clause at a time (split at . ; and line breaks):
// an interview that happened ("Interview 2026-10-10", "interviewed", "interview went well") or an offer this
// employer made ("declined the offer", "offer received"). A clause with a negation or a cancellation ("rejected
// before interview", "interview cancelled", "no offer received", "accepting another offer") says the opposite.
const clauses = (said: string) => said.split(/[.;\n]+/)
const NOT = /\b(no|not|never|without|before|instead|cancel+ed|cancel+ation|another|other)\b/i
const hadInterview = (said: string) => clauses(said).some(c => !NOT.test(c)
  && (/\binterviewed\b/i.test(c) || /\binterview(s)?\b[^.;]*?(\d{4}-\d{2}-\d{2}|completed|done|went|happened|held|finished)/i.test(c) || /\b(had|after|did)\s+(an?\s+|the\s+|my\s+)?(final\s+|second\s+|first\s+)?interview/i.test(c)))
const hadOffer = (said: string) => clauses(said).some(c => !NOT.test(c)
  && /\b(declined|turned down|said no to)\s+(the\s+|their\s+|an?\s+|this\s+)?offer\b|\boffer\s+(received|made|extended)\b|\b(got|received)\s+(an?\s+)?offer\b/i.test(c))

type Seen = { keys: string[] }
type Accepted = { key: string; company: string; role: string }

const INTERVIEWED = ['interviewing', 'offer', 'accepted']
const AFTER_APPLY = ['applied', 'screening', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn', 'ghosted']

async function readIf($: any, path: string): Promise<string> {
  return (await $.fs.exists(path).catch(() => false)) ? String(await $.fs.read(path).catch(() => '')) : ''
}

// The accepted jobs, and the moment to show: for the job named by `pick` (a key), else the last accepted row.
async function scan($: any, pick = ''): Promise<{ accepted: Accepted[]; moment: Moment | null }> {
  const today = localDate(await $.clock.now())
  const prefs = await readIf($, PREFS)
  const order = dateOrder(prefs)
  const { rows: [header = [], ...rows], problem } = readCsv(await readIf($, TRACKER))
  if (problem !== '') return { accepted: [], moment: null }
  const col = columnsOf(header)
  const at = (r: string[], n: string) => { const i = col(n); return i >= 0 ? (r[i] ?? '').trim() : '' }
  const jobs = rows.filter(r => at(r, 'company') !== '')
  const accepted = jobs.filter(r => at(r, 'status').toLowerCase() === 'accepted')
    .map(r => ({ key: jobKey(c => at(r, c)), company: at(r, 'company'), role: at(r, 'role') }))
  const last = (pick !== '' ? accepted.find(a => a.key === pick) : undefined) ?? accepted[accepted.length - 1]
  if (!last) return { accepted, moment: null }
  const status = (r: string[]) => at(r, 'status').toLowerCase()
  const said = (r: string[]) => `${at(r, 'notes')} ${at(r, 'next_action')}`
  const applied = jobs.filter(r => AFTER_APPLY.includes(status(r)) || isIso(toIso(at(r, 'date_applied'), orderFor(r, order))))
  const firstApplied = applied.map(r => toIso(at(r, 'date_applied'), orderFor(r, order))).filter(isIso).sort()[0] ?? ''
  const name = (/^name:[ \t]*(\S[^\n]*)$/m.exec(prefs)?.[1] ?? '').trim().split(/\s+/)[0] ?? ''
  return {
    accepted,
    moment: {
      company: last.company, role: last.role, name,
      applied: applied.length,
      interviews: jobs.filter(r => INTERVIEWED.includes(status(r)) || (['rejected', 'withdrawn', 'ghosted'].includes(status(r)) && hadInterview(said(r)))).length,
      offers: jobs.filter(r => ['offer', 'accepted'].includes(status(r)) || (status(r) === 'withdrawn' && hadOffer(said(r)))).length,
      days: firstApplied !== '' && firstApplied <= today ? daysBetween(firstApplied, today) : 0,
    },
  }
}

// Open the pane once for each job newly accepted since the folder was last looked at.
async function check($: any): Promise<void> {
  if (await $.fs.exists(SAMPLE).catch(() => false)) return
  const { accepted } = await scan($)
  const root: string = await Promise.resolve().then(() => $.session.root()).catch(() => '')
  const key = `celebrated:${root}`
  let stored: Seen | undefined
  try { stored = (await $.store.get(key)) as Seen | undefined } catch { return }
  const keys = accepted.map(a => a.key)
  if (!stored || !Array.isArray(stored.keys)) {
    // First look at this folder: what's already accepted was celebrated before (or long ago).
    await $.store.set(key, { keys }).catch(() => undefined)
    return
  }
  const fresh = keys.filter(k => !stored?.keys.includes(k))
  if (fresh.length === 0) return
  // The newly accepted job (the last one, if several), never an older accepted row.
  const { moment: m } = await scan($, fresh[fresh.length - 1] ?? '')
  if (m === null) return
  // Counted as celebrated only once the pane is really drawn (see the Pane hook): a pane a panel opens by
  // itself shows only in a wide enough window, and the moment must not be spent unseen.
  pending = { key, keys: [...stored.keys, ...fresh] }
  await update($, moment, () => m)
  await update($, isThanked, () => false)
  // No focus: the user may be typing. The pane says how to move into it.
  const opened = await $.ui.open({ id: PANE, title: 'Congratulations', holdToasts: true, closeOnEscape: true }).catch(() => ({ isPlaced: false }))
  if (!opened.isPlaced && !toasted) {
    toasted = true
    $.ui.toast(`Congratulations on the job at ${m.company}! Type /celebrate when you have a moment.`, { timeoutMs: 15000 })
  }
}

// What check() found new and not yet shown, and whether this session already said so in a pop-up.
let pending: { key: string; keys: string[] } | null = null
let toasted = false
async function markShown($: any): Promise<void> {
  const p = pending
  if (p === null) return
  pending = null
  await $.store.set(p.key, { keys: p.keys }).catch(() => undefined)
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function numbers(m: Moment): string {
  const parts = [plural(m.applied, 'application', 'applications'), plural(m.interviews, 'interview', 'interviews'), plural(m.offers, 'offer', 'offers')]
  const span = m.days >= 14 ? `, over about ${Math.round(m.days / 7)} weeks` : m.days > 0 ? `, over ${plural(m.days, 'day', 'days')}` : ''
  return `Your search in numbers: ${parts.join(', ')}${span}.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'celebrate', description: 'Open the congratulations for the job you accepted', immediate: true })
    // The tracker is watched (below) and checked after every turn, so no timer is needed.
    await check($).catch(() => undefined)
    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    const out = await next(e)
    const root = String(e.cwd ?? '').replace(/[\\/]+$/, '')
    if (root === '') return out
    const sep = /^[A-Za-z]:\\/.test(root) ? '\\' : '/'
    return { ...out, watchPaths: [...(out.watchPaths ?? []), ...WATCHED.map(p => root + sep + p.split('/').join(sep))] }
  }).catch(($, e, next) => next(e))

  on('classic.FileChanged', async ($, e, next) => {
    const path = String(e.file_path ?? '').replace(/\\/g, '/')
    if (WATCHED.some(p => path.endsWith(`/${p}`))) await check($).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    await check($).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'celebrate' }, async $ => {
    // The job waiting to be shown, else the one celebrated last that is still accepted, else the last accepted row.
    const root: string = await Promise.resolve().then(() => $.session.root()).catch(() => '')
    const stored = (await Promise.resolve().then(() => $.store.get(`celebrated:${root}`)).catch(() => undefined)) as Seen | undefined
    const { accepted } = await scan($).catch(() => ({ accepted: [] as Accepted[] }))
    const known = [...(pending?.keys ?? []), ...(stored?.keys ?? [])].reverse().find(k => accepted.some(a => a.key === k)) ?? ''
    const { moment: m } = await scan($, known).catch(() => ({ moment: null }))
    await update($, moment, () => m)
    const opened = await $.ui.open({ id: PANE, title: 'Congratulations', focus: true, holdToasts: true, closeOnEscape: true })
    if (!opened.isPlaced) {
      return m
        ? { text: `Congratulations on the job at ${m.company}! ${numbers(m)} Ask Claude to wrap up your search, and, if you'd like to help future job seekers, say "share what worked".` }
        : { text: 'Nothing to celebrate yet. When you accept an offer, this opens by itself.' }
    }
    return { text: m ? `Congratulations on the job at ${m.company}!` : 'Nothing to celebrate yet.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const m = await read($, moment)
    const thanked = await read($, isThanked)
    if (m !== null) await markShown($)
    const close = <Button key="close" label="Close" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
    if (m === null) {
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>Nothing to celebrate yet</Text>
          <Text wrap="wrap">When you accept an offer (on your Pipeline board or by telling Claude), this opens by itself. Until then: one tailored application at a time.</Text>
          <Box flexDirection="row" gap={1}>{close}</Box>
        </Box>
      )
    }
    const fill = (text: string) => $.prompt.fill({ text }).catch(() => undefined)
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold color="success">{`You got the job${m.name ? `, ${m.name}` : ''}! Congratulations.`}</Text>
        {e.surface === 'terminal' && <Text>{KEYS_HINT}</Text>}
        <Text wrap="wrap">{`${m.role ? `${m.role} at ` : ''}${m.company}. Take a moment: every application, conversation and interview got you here.`}</Text>
        <Text wrap="wrap">{numbers(m)}</Text>
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold>When you’re ready (once any background check or references have cleared)</Text>
          <Text wrap="wrap">Claude can close out your search: thank the people who helped, withdraw from other applications politely, and save a career log for your next resume.</Text>
          <Button key="wrap-up" label="Wrap up my search" onPress={() => fill(`I accepted the job${m.role ? ` (${m.role})` : ''} at ${m.company}. Help me close out my search.`)} />
        </Box>
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold>Help the next job seeker (optional, about 2 minutes)</Text>
          <Text wrap="wrap">Claude asks a few quick questions about what worked, then drafts short notes with no names, companies, pay or contact details. You read them, and only if you want, post them on the project’s GitHub page yourself (it shows your GitHub username). They help improve this workspace for everyone.</Text>
          {thanked
            ? <Text>Thanks! It’s in the chat box now: press Enter to start, or delete it if you changed your mind.</Text>
            : <Button key="share" label="Share what worked" onPress={async () => { await fill('/share-lessons'); await update($, isThanked, () => true); void Promise.resolve().then(() => $.ui.focus({ requestId: PANE, key: 'close' })).catch(() => undefined) }} />}
        </Box>
        <Text>Those buttons write a message to Claude; press Enter to send it.</Text>
        <Box flexDirection="row" gap={1}>{close}</Box>
      </Box>
    )
  })
}
