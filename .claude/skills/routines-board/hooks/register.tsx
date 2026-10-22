import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Board, Notice, Routine } from '../types'
import { activityLine, addDays, appendLine, localDate, stamp } from './csvdate'
import type { FileIo } from './csvdate'
import { routineStatus, runLines } from './status'

// Routines: the user's automatic checks (the routines skill) at a glance. It reads history/routines.md,
// where every run writes a line, and shows each routine's last result and whether it seems to have
// stopped running, by the same rules as the startup note and /health (hooks/status.ts). The only thing
// it writes is a line in that log when the user says they paused, deleted or resumed a routine in the app,
// so it isn't flagged. Routines themselves are managed in the Claude or ChatGPT desktop app, never here.

const PANE = 'routines-board'
const LOG = 'history/routines.md'
const ACTIVITY = 'history/activity.md'
const WATCHED = [LOG]
// The same words, in the same place (right under the panel's first line), in every panel.
const KEYS_HINT = 'Keys: Ctrl+X then Tab moves into this panel. Tab moves between buttons, Enter presses one, Esc goes back to typing.'
const SHOWN_RUNS = 10

const board = atom({ plugin: 'routines-board', key: 'board' } as const, null as Board | null)
const isHidden = atom({ plugin: 'routines-board', key: 'isHidden' } as const, false)
const notice = atom({ plugin: 'routines-board', key: 'notice' } as const, { text: '', isError: false } as Notice)
const showRuns = atom({ plugin: 'routines-board', key: 'showRuns' } as const, false)

// The first card's main button takes the keyboard when the board opens (autoFocus is true or left out, never false).
const focusIf = (yes: boolean): { autoFocus?: true } => (yes ? { autoFocus: true } : {})

const CADENCE: Record<string, string> = { daily: 'every day', weekdays: 'weekdays', weekly: 'weekly', fortnightly: 'every other week' }

// The file calls the shared helpers in csvdate.ts use (the engine interface can't cross an import).
function io($: any): FileIo {
  return { exists: p => $.fs.exists(p), read: async p => String(await $.fs.read(p)), write: (p, t) => $.fs.write(p, t), list: d => $.fs.list(d) }
}

async function load($: any): Promise<Board> {
  const today = localDate(await $.clock.now())
  const hasLog = await $.fs.exists(LOG).catch(() => false)
  const text: string = hasLog ? String(await $.fs.read(LOG).catch(() => '')) : ''
  return { today, hasLog, routines: routineStatus(text, today), recent: runLines(text).slice(-SHOWN_RUNS).reverse() }
}

async function refresh($: any): Promise<Board> {
  const next = await load($)
  const before = await read($, board)
  if (JSON.stringify(before) !== JSON.stringify(next)) await update($, board, () => next)
  return next
}

async function say($: any, text: string, isError = false): Promise<void> {
  await update($, notice, () => ({ text, isError }))
}

const stalled = (b: Board) => b.routines.filter(r => r.state === 'stalled')

function line(b: Board): string {
  const running = b.routines.filter(r => r.state === 'ok').length
  const stopped = stalled(b).length
  if (b.routines.length === 0) return 'No automatic checks set up yet'
  return [
    `${running} running`,
    stopped > 0 ? `${stopped} ${stopped === 1 ? 'seems' : 'seem'} to have stopped` : '',
  ].filter(Boolean).join(' · ')
}

function stateText(r: Routine): string {
  if (r.state === 'stalled') return r.last === 'run' ? `Seems to have stopped: last ran ${r.date}` : `Seems to have stopped: set up ${r.date}, hasn't run yet`
  if (r.state === 'stopped') return 'Paused or deleted (as you said)'
  if (r.state === 'inactive') return 'Nothing logged for over 45 days'
  return r.last === 'run' ? `Running: last ran ${r.date}` : `Set up ${r.date}: waiting for its first run`
}

// "paused", "deleted" or "resumed", logged the way the routines skill logs it, plus one activity line and a
// note to Claude (the change is already logged: Claude must not log it again).
async function mark($: any, r: Routine, what: 'paused' | 'deleted' | 'resumed'): Promise<void> {
  try {
    const now = await $.clock.now()
    if (!(await $.fs.exists(LOG))) { await say($, 'The routine log (history/routines.md) is missing. Press Refresh, or ask Claude about your routines.', true); return }
    const ok = await appendLine(io($), LOG, `- ${stamp(now)} · ${r.name} · ${what}\n`)
    if (!ok) { await say($, 'The routine log couldn’t be saved (it may be open in another app). Try again in a moment.', true); return }
    await appendLine(io($), ACTIVITY, activityLine(now, 'Routines panel (Claude)', `${r.name}: marked ${what}`))
    await refresh($)
    await say($, `Saved: ${r.name} marked ${what}.`)
    await $.session.append({
      message: { type: 'user', content: [{ type: 'text', text: `[Routines] The user marked their "${r.name}" routine ${what} on the Routines board; history/routines.md already has the line, so don't log it again. The board doesn't change the routine itself: if they haven't yet, it is ${what === 'resumed' ? 'turned back on' : what} in the Claude desktop app (Routines) or the ChatGPT desktop app (Scheduled).` }] },
    }).catch(() => undefined)
  } catch {
    await say($, 'That didn’t save. Press Refresh and try again, or tell Claude.', true)
  }
}

async function ask($: any, text: string): Promise<void> {
  await $.prompt.fill({ text }).catch(() => undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'routines-board', description: 'See your automatic checks: when each last ran, and any that stopped', immediate: true })
    await refresh($).catch(() => null)
    // A slow poll as a backstop (and for the day rolling over); a changed log refreshes at once.
    $.clock.every(60000, () => void refresh($).catch(() => undefined))
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
    if (WATCHED.some(p => path.endsWith(`/${p}`))) await refresh($).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    await refresh($).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'routines-board' }, async $ => {
    const b = await refresh($)
    await update($, isHidden, () => false)
    await say($, '')
    const opened = await $.ui.open({ id: PANE, title: 'Routines', focus: true })
    if (!opened.isPlaced) {
      return {
        text: `Routines: ${line(b)}. The board can't show in this window, so ask Claude to "show my routines" and go through them here in the chat.`,
        context: ['The Routines panel is not visible in this app or window. If the user asks, follow the routines skill ("Show the routines") in the chat.'],
      }
    }
    return { text: `Routines: ${line(b)}` }
  })

  // Part of the one line above the prompt, only while a routine seems to have stopped running. Like the
  // other bands, it draws its part and puts what the bands beneath drew after it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const b = await read($, board)
    if (e.props.hasSurvey || b === null || stalled(b).length === 0 || (await read($, isHidden))) return next(e)
    const n = stalled(b).length
    const { Box, Text, Button } = $.ui.resolve(e)
    const mine = (
      <Box key="routines-band" flexDirection="row" gap={1}>
        <Text color="warning">{`Routines: ${n} ${n === 1 ? 'seems' : 'seem'} to have stopped running`}</Text>
        <Button key="open-routines" label="Open routines" plain onPress={() => $.ui.open({ id: PANE, title: 'Routines', focus: true })} />
        <Button key="hide-routines" label="Hide (routines note)" plain dimColor onPress={() => update($, isHidden, () => true)}>Hide</Button>
      </Box>
    )
    const below: any = await next(e)
    if (below && typeof below === 'object' && typeof below.type === 'string' && below.type !== 'engine') {
      return <Box flexDirection="row" flexWrap="wrap" columnGap={2}>{mine}{below}</Box>
    }
    return mine
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const b = await read($, board)
    const note = await read($, notice)
    const runsShown = await read($, showRuns)
    if (b === null) return <Text dimColor>Loading…</Text>
    // Stopped ones first, then running, then paused or unused.
    const rank = (r: Routine) => (r.state === 'stalled' ? 0 : r.state === 'ok' ? 1 : 2)
    const list = [...b.routines].sort((x, y) => rank(x) - rank(y))
    const firstKey = list[0]?.key ?? ''

    const card = (r: Routine) => {
      // Each card's buttons carry the routine's name for screen readers; the visible words start the name.
      const named = (visible: string) => `${visible} (${r.name})`
      const isFirst = r.key === firstKey
      return (
        <Box key={r.key} flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold>{`${r.name} · ${CADENCE[r.cadence] ?? r.cadence}`}</Text>
          <Text color={r.state === 'stalled' ? 'warning' : undefined} dimColor={r.state === 'stopped' || r.state === 'inactive'}>{stateText(r)}</Text>
          {r.result !== '' && <Text wrap="wrap">{`Last result: ${r.result}`}</Text>}
          {r.state === 'ok' && <Text dimColor>{`Flagged if nothing runs by ${addDays(r.ref, r.limit + 1)}`}</Text>}
          {r.state === 'stalled' && <Text dimColor wrap="wrap">Usual causes: the app wasn’t open or the computer was asleep; the routine uses another folder or an isolated worktree; a run is waiting for a permission answer; or this folder was moved.</Text>}
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            {r.state === 'stalled' && <Button key={`${r.key}:help`} label={named('Help me fix it')} {...focusIf(isFirst)} onPress={() => ask($, `My ${r.name} routine seems to have stopped running. Help me find out why.`)}>Help me fix it</Button>}
            {(r.state === 'ok' || r.state === 'stalled' || r.state === 'inactive') && <Button key={`${r.key}:paused`} label={named('I paused it')} {...focusIf(isFirst && r.state !== 'stalled')} onPress={() => mark($, r, 'paused')}>I paused it</Button>}
            {(r.state === 'ok' || r.state === 'stalled' || r.state === 'inactive') && <Button key={`${r.key}:deleted`} label={named('I deleted it')} onPress={() => mark($, r, 'deleted')}>I deleted it</Button>}
            {r.state === 'stopped' && <Button key={`${r.key}:resumed`} label={named('I turned it back on')} {...focusIf(isFirst)} onPress={() => mark($, r, 'resumed')}>I turned it back on</Button>}
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Text bold>{line(b)}</Text>
          <Button key="refresh" label="Refresh" onPress={() => refresh($)} />
          <Button key="close" label="Close" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
        {e.surface === 'terminal' && <Text>{KEYS_HINT}</Text>}
        <Text dimColor wrap="wrap">Each automatic check writes a line in your routine log (history/routines.md) when it runs. This board only reads that log. To pause, change or delete a routine, use the Claude desktop app (Routines) or the ChatGPT desktop app (Scheduled), then press the matching button here so it isn’t flagged.</Text>
        {note.text !== '' && <Text color={note.isError ? 'error' : 'success'}>{note.isError ? `Not done: ${note.text}` : note.text}</Text>}
        {list.length === 0 && (
          <Box flexDirection="column" gap={1}>
            <Text wrap="wrap">No automatic checks yet. They can scan for new jobs every weekday morning, check your inbox, draft follow-ups, or check that saved postings are still open. They only read, draft and track.</Text>
            <Button key="setup" label="Set up automatic checks" autoFocus onPress={() => ask($, 'Set up automatic checks')} />
          </Box>
        )}
        {list.map(card)}
        {b.recent.length > 0 && <Button key="runs" label={runsShown ? 'Hide recent runs' : `Show recent runs (${b.recent.length})`} plain onPress={() => update($, showRuns, v => !v)} />}
        {runsShown && b.recent.map((l, i) => <Text key={`run-${i}`} wrap="wrap">{`${l.date} ${l.time} · ${l.name}${l.result ? ` · ${l.result}` : ''}`}</Text>)}
      </Box>
    )
  })
}
