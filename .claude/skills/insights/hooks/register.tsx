import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Group, Stats, View } from '../types'
import { csvTrouble, dateOrder, localDate } from './csvdate'
import { MIN_RATE, insights, share } from './stats'

// Insights: how the search is going, read-only. From jobs/tracker.csv (and jobs/leads.csv) it shows where
// applications stall, which sources bring replies, whether higher fit scores get more replies (so the
// scores can be trusted), and why the user passed on leads. It writes nothing. The weekly review (Claude)
// turns the same numbers into next week's changes; the "Ask Claude for a weekly review" button starts it.

const PANE = 'insights'
const TRACKER = 'jobs/tracker.csv'
const LEADS = 'jobs/leads.csv'
const PREFS = 'profile/preferences.md'
const WATCHED = [TRACKER, LEADS]
// The same words, in the same place (right under the panel's first line), in every panel.
const KEYS_HINT = 'Keys: Ctrl+X then Tab moves into this panel. Tab moves between buttons, Enter presses one, Esc goes back to typing.'

const view = atom({ plugin: 'insights', key: 'view' } as const, null as View | null)
const showMore = atom({ plugin: 'insights', key: 'showMore' } as const, false)

// A file that exists but can't be read (a cloud file not downloaded, a sync lock) shows as a problem, never
// as an endless "Loading…".
async function readIf($: any, path: string): Promise<string> {
  if (!(await $.fs.exists(path))) return ''
  return String(await $.fs.read(path))
}

async function load($: any): Promise<View> {
  const today = localDate(await $.clock.now())
  try {
    const prefs = await readIf($, PREFS).catch(() => '')
    const tracker = await readIf($, TRACKER)
    const leads = await readIf($, LEADS).catch(() => '')
    const stats = insights(tracker, leads, today, dateOrder(prefs))
    return { stats, today, isClosed: /^search_status:\s*closed/m.test(prefs), unreadable: '' }
  } catch {
    return { stats: null, today, isClosed: false, unreadable: 'Your tracker (jobs/tracker.csv) couldn’t be read. If it’s in a synced folder, make sure the file is downloaded and not open elsewhere, then press Refresh.' }
  }
}

async function refresh($: any): Promise<View> {
  const next = await load($)
  const before = await read($, view)
  if (JSON.stringify(before) !== JSON.stringify(next)) await update($, view, () => next)
  return next
}

function line(v: View): string {
  const s = v.stats
  if (v.unreadable !== '' || s === null) return 'Your tracker couldn’t be read'
  if (s.problem !== '') return 'Your tracker needs fixing before it can be read'
  if (s.applied === 0) return 'No applications yet'
  return `${s.applied} applied · ${s.replied} heard back · ${s.interviews} ${s.interviews === 1 ? 'interview' : 'interviews'} · ${s.offers} ${s.offers === 1 ? 'offer' : 'offers'}`
}

// A row of the "where replies come from" tables: the counts first (screen readers and small screens).
function groupLine(g: Group): string {
  return `${g.label}: ${g.applied} applied, ${share(g.replied, g.applied)} heard back, ${g.interviews} ${g.interviews === 1 ? 'interview' : 'interviews'}`
}

const monthDay = (iso: string) => {
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(iso.slice(5, 7)) - 1] ?? ''
  return `${m} ${Number(iso.slice(8, 10))}`
}

// Whether the best-scored jobs have been getting more replies: the check that the scores mean something. Most
// applications are fit 4 or 5 (the rest are usually skipped), so it compares fit 5 with everything below it.
function fitCheck(s: Stats): string {
  const high = s.byFit.filter(g => g.label === 'fit 5')
  const low = s.byFit.filter(g => /^fit [1-4]$/.test(g.label))
  const sum = (gs: Group[], k: 'applied' | 'replied') => gs.reduce((a, g) => a + g[k], 0)
  const ha = sum(high, 'applied'), hr = sum(high, 'replied'), la = sum(low, 'applied'), lr = sum(low, 'replied')
  if (ha < MIN_RATE || la < MIN_RATE) return `Too early to tell whether fit scores predict replies (it needs about ${MIN_RATE} applications at fit 5 and ${MIN_RATE} below it).`
  const hp = hr / ha, lp = lr / la
  if (hp > lp) return `Fit 5 jobs have heard back more often (${share(hr, ha)}) than fit 1-4 (${share(lr, la)}): the scores are pointing the right way.`
  return `Fit 5 jobs haven't heard back more often (${share(hr, ha)}) than fit 1-4 (${share(lr, la)}). Ask Claude to look at how jobs are being scored.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'insights', description: 'How your search is going: where it stalls, what brings replies, and whether fit scores hold up', immediate: true })
    $.clock.every(120000, () => void refresh($).catch(() => undefined))
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

  on('command.run', { command: 'insights' }, async $ => {
    const v = await refresh($).catch(() => null)
    const opened = await $.ui.open({ id: PANE, title: 'Insights', focus: true })
    if (!opened.isPlaced) {
      return {
        text: `Insights: ${v ? line(v) : 'not loaded'}. The board can't show in this window, so ask Claude "how is my search going?" for the same numbers here in the chat.`,
        context: ['The Insights panel is not visible in this app or window. If the user asks, follow the chat version of the insights skill (.agents/skills/insights/SKILL.md).'],
      }
    }
    return { text: `Insights: ${v ? line(v) : 'loading'}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const v = await read($, view)
    const more = await read($, showMore)
    const top = (
      <Box key="top" flexDirection="row" gap={1} flexWrap="wrap">
        <Text bold>{v ? line(v) : 'Loading…'}</Text>
        <Button key="refresh" label="Refresh" autoFocus onPress={() => refresh($)} />
        <Button key="close" label="Close" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
      </Box>
    )
    if (v === null) return <Box flexDirection="column" gap={1}>{top}</Box>
    const s = v.stats
    return (
      <Box flexDirection="column" gap={1}>
        {top}
        {e.surface === 'terminal' && <Text>{KEYS_HINT}</Text>}
        <Text wrap="wrap">Counted from each job’s stage and notes in your tracker (jobs/tracker.csv). Small numbers are noise, so shares show from about 10 jobs up. This board only reads.</Text>
        {v.unreadable !== '' && <Text color="error" wrap="wrap">{`Needs fixing: ${v.unreadable}`}</Text>}
        {s !== null && s.problem !== '' && (
          <Box flexDirection="column" gap={1}>
            <Text color="error" wrap="wrap">{`Needs fixing: ${csvTrouble(s.problem, 'Your tracker (jobs/tracker.csv)')}`}</Text>
            <Button key="fix" label="Ask Claude to fix the tracker" onPress={() => $.prompt.fill({ text: 'My tracker (jobs/tracker.csv) looks damaged. Please check it and offer to repair it into a copy for me to check.' }).catch(() => undefined)} />
          </Box>
        )}
        {s !== null && s.problem === '' && s.applied === 0 && (
          <Text wrap="wrap">No applications yet. Once you’ve applied to a few jobs, this shows where things stall and what brings replies. Ask Claude to find jobs that fit you.</Text>
        )}
        {s !== null && s.problem === '' && s.applied > 0 && (
          <Box flexDirection="column" gap={1}>
            <Box key="funnel" flexDirection="column">
              <Text bold>Step by step</Text>
              {s.steps.map(st => <Text key={`step-${st.to}`}>{`From ${st.from} to ${st.to}: ${share(st.got, st.had)}`}</Text>)}
              <Text wrap="wrap">{s.lowest
                ? `Your lowest step so far: from ${s.lowest.from} to ${s.lowest.to}. A weekly review suggests what to change there.`
                : `Too early to name a weak spot: each step needs about ${MIN_RATE} jobs in it.`}</Text>
            </Box>
            <Box key="weeks" flexDirection="column">
              <Text bold>Applications per week (last 8 weeks)</Text>
              {s.weeks.map(w => <Text key={`week-${w.start}`}>{`Week of ${monthDay(w.start)}: ${w.applied}`}</Text>)}
            </Box>
            <Box key="outcomes" flexDirection="column">
              <Text bold>Outcomes so far</Text>
              <Text>{`${s.waiting} waiting to hear back · ${s.rejected} rejected (${s.rejectedAfterInterview} after an interview) · ${s.ghosted} no response · ${s.withdrawn} withdrawn`}</Text>
            </Box>
            {s.levers.length > 0 && (
              <Box key="levers" flexDirection="column">
                <Text bold>What seems to help</Text>
                {s.levers.map(g => <Text key={`lever-${g.label}`} wrap="wrap">{`${g.label}: ${share(g.replied, g.applied)} heard back`}</Text>)}
              </Box>
            )}
            <Box key="fit" flexDirection="column">
              <Text bold>Do fit scores hold up?</Text>
              <Text wrap="wrap">{fitCheck(s)}</Text>
            </Box>
            <Button key="more" label={more ? 'Show less' : 'Show by source, fit and priority'} plain onPress={() => update($, showMore, x => !x)} />
            {more && (
              <Box key="groups" flexDirection="column" gap={1}>
                <Box flexDirection="column">
                  <Text bold>Where replies come from (source)</Text>
                  {s.bySource.map(g => <Text key={`src-${g.label}`} wrap="wrap">{groupLine(g)}</Text>)}
                </Box>
                <Box flexDirection="column">
                  <Text bold>By fit score</Text>
                  {s.byFit.map(g => <Text key={`fit-${g.label}`} wrap="wrap">{groupLine(g)}</Text>)}
                </Box>
                <Box flexDirection="column">
                  <Text bold>By priority</Text>
                  {s.byPriority.map(g => <Text key={`pri-${g.label}`} wrap="wrap">{groupLine(g)}</Text>)}
                </Box>
                {s.notForMe.length > 0 && (
                  <Box flexDirection="column">
                    <Text bold>Why you passed on leads (Job Inbox)</Text>
                    {s.notForMe.map(r => <Text key={`nfm-${r.reason}`}>{`${r.reason}: ${r.count}`}</Text>)}
                  </Box>
                )}
              </Box>
            )}
            <Button key="review" label="Ask Claude for a weekly review" onPress={() => $.prompt.fill({ text: '/weekly-review' }).catch(() => undefined)} />
            <Text>That button writes a message to Claude; press Enter to send it.</Text>
          </Box>
        )}
      </Box>
    )
  })
}
