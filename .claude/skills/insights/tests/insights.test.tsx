import { expect, mock, test } from 'claude-code/testing'

import { insights, share } from '../hooks/stats'

const HEAD = 'company,role,status,next_action_date,next_action,deadline,priority,fit,location,date_found,date_applied,contact,salary_range,source,link,apply_link,job_id,followups,folder,notes'
const PANE = { component: 'Pane', requestId: 'insights', props: { title: 'Insights', isFocused: true, bodyColumns: 90 } } as const
// Thursday 2026-10-22.
const TODAY = '2026-10-22'

// n rows of one kind: company i, the given status, fit, priority, source, applied date and notes.
function rows(n: number, status: string, fit: string, pri: string, source: string, applied: string, notes = ''): string {
  let out = ''
  for (let i = 0; i < n; i++) out += `Acme ${status} ${fit} ${source} ${i},Analyst,${status},,,,${pri},${fit},Austin TX,2026-09-01,${applied},,,${source},,,,0,,${notes}\n`
  return out
}

const TRACKER = HEAD + '\n'
  + rows(8, 'applied', '4', 'B', 'Indeed', '2026-10-20')
  + rows(4, 'rejected', '3', 'C', 'Indeed', '2026-10-06')
  + rows(2, 'rejected', '5', 'A', 'referral', '2026-10-01', 'Interview 2026-10-10 went fine')
  + rows(3, 'interviewing', '5', 'A', 'referral', '2026-09-29')
  + rows(1, 'offer', '5', 'A', 'referral', '2026-09-22')
  + rows(2, 'ghosted', '3', 'C', 'LinkedIn', '9/1/2026')
  + rows(3, 'interested', '4', 'B', 'Indeed', '')
  + rows(1, 'skipped', '2', 'C', 'Indeed', '')
const LEADS = 'id,found_date,company,role,location,remote,pay,posted,link,apply_link,job_id,source,fit_guess,why,concerns,status,reason,decided_date\n'
  + 'L-1,2026-10-01,Globex,Clerk,X,,,,,,,,C,,,not-for-me,too-junior,2026-10-02\n'
  + 'L-2,2026-10-01,Initech,Clerk,X,,,,,,,,C,,,not-for-me,too-junior,2026-10-02\n'
  + 'L-3,2026-10-01,Northwind,Lead,X,,,,,,,,C,,,not-for-me,other: night shifts,2026-10-02\n'
  + 'L-4,2026-10-01,Umbrella,Lead,X,,,,,,,,C,,,saved,,2026-10-02\n'

test('the numbers: applied, replies, interviews and offers, counting closed jobs for how far they got', () => {
  const s = insights(TRACKER, LEADS, TODAY, 'mdy')
  expect(s.total).toBe(24)
  expect(s.applied).toBe(20)
  expect(s.replied).toBe(10)      // 4 + 2 rejected, 3 interviewing, 1 offer
  expect(s.interviews).toBe(6)    // 2 rejected after an interview (their notes say so), 3 interviewing, 1 offer
  expect(s.offers).toBe(1)
  expect(s.rejectedAfterInterview).toBe(2)
  expect(s.ghosted).toBe(2)
  expect(s.waiting).toBe(8)
  expect(s.lowest?.to).toBe('heard back')   // 10 of 20; the later steps have fewer than 10 jobs in them
  expect(s.weeks.map(w => w.start)).toEqual(['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'])
  expect(s.weeks.map(w => w.applied)).toEqual([2, 0, 0, 1, 5, 4, 0, 8])   // 9/1/2026 read month first (date_order MDY)
  expect(s.bySource[0]).toEqual({ label: 'Indeed', applied: 12, replied: 4, interviews: 0 })
  expect(s.byFit.map(g => g.label)).toEqual(['fit 5', 'fit 4', 'fit 3'])
  expect(s.levers.map(g => `${g.label} ${g.replied}/${g.applied}`)).toEqual(['without a contact 10/20', 'applied within 3 days of finding it 0/2', 'applied after more than 3 days 10/18'])
  expect(s.notForMe).toEqual([{ reason: 'too-junior', count: 2 }, { reason: 'other', count: 1 }])
  expect(share(4, 12)).toBe('4 of 12 (33%)')
  expect(share(1, 4)).toBe('1 of 4')
})

test('only clear evidence counts a closed job as interviewed or offered', () => {
  const s = insights(HEAD + '\n'
    + rows(1, 'rejected', '4', 'B', 'Indeed', '2026-10-01', 'Rejected before interview')
    + rows(1, 'withdrawn', '4', 'B', 'Indeed', '2026-10-01', 'Withdrew after accepting another offer')
    + rows(1, 'rejected', '4', 'B', 'Indeed', '2026-10-01', 'Interviewed with the team lead')
    + rows(1, 'withdrawn', '4', 'B', 'Indeed', '2026-10-01', 'Declined the offer: pay too low'), '', TODAY, '')
  expect(s.interviews).toBe(1)
  expect(s.offers).toBe(1)
})

test('an unclear slash date is not counted in any week', () => {
  const s = insights(HEAD + '\n' + rows(1, 'applied', '4', 'B', 'Indeed', '03/04/2026'), '', TODAY, '')
  expect(s.applied).toBe(1)
  expect(s.weeks.every(w => w.applied === 0)).toBe(true)
})

function setup(on: any, files: Record<string, string>, opts: { fills?: string[]; readFails?: boolean } = {}) {
  mock.clock(on, { now: new Date(2026, 9, 22, 9, 0).getTime() } as never)
  const rel = (p: string) => p.replace(/^.*\/insights\//, '')
  const writes: string[] = []
  on('fs.exists', (_$: any, e: any) => ({ value: rel(e.path) in files }) as never)
  on('fs.read', (_$: any, e: any) => { if (opts.readFails && rel(e.path) === 'jobs/tracker.csv') throw new Error('EAGAIN: resource temporarily unavailable'); return { value: files[rel(e.path)] ?? '' } as never })
  on('fs.write', (_$: any, e: any) => { writes.push(e.path); return { value: undefined } as never })
  on('fs.list', () => ({ value: [] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('prompt.fill', (_$: any, e: any) => { opts.fills?.push(e.text); return { isFilled: true } as never })
  on('command.register', () => ({ value: undefined }) as never)
  return { writes }
}

test('the pane shows the steps, the weekly counts and the fit check, and writes nothing', async ($, on) => {
  const fills: string[] = []
  const { writes } = setup(on, { 'jobs/tracker.csv': TRACKER, 'jobs/leads.csv': LEADS, 'profile/preferences.md': '- date_order: MDY\n' }, { fills })
  await $.command.run({ command: 'insights', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'insights', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('20 applied · 10 heard back · 6 interviews · 1 offer')
  expect(drawn).toContain('From applied to heard back: 10 of 20 (50%)')
  expect(drawn).toContain('Your lowest step so far: from applied to heard back')
  expect(drawn).toContain('Week of Oct 19: 8')
  expect(drawn).toContain('Too early to tell whether fit scores predict replies')
  expect(drawn).toContain('without a contact: 10 of 20 (50%) heard back')
  expect(drawn).not.toContain('Indeed: 12 applied')
  await ui.press({ key: 'more' })
  const more = JSON.stringify(await ui.drawn())
  expect(more).toContain('Indeed: 12 applied, 4 of 12 (33%) heard back, 0 interviews')
  expect(more).toContain('too-junior: 2')
  await ui.press({ key: 'review' })
  expect(fills).toEqual(['/weekly-review'])
  expect(writes).toEqual([])
  await ui.unmount()
})

test('a tracker that can’t be read says so instead of loading forever', async ($, on) => {
  setup(on, { 'jobs/tracker.csv': TRACKER }, { readFails: true })
  await $.command.run({ command: 'insights', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'insights', surface: 'desktop', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Needs fixing: Your tracker (jobs/tracker.csv) couldn’t be read')
  expect(drawn).not.toContain('Loading')
  await ui.unmount()
})

test('a damaged tracker is named, with a one-press fix, and no empty-state text', async ($, on) => {
  const fills: string[] = []
  setup(on, { 'jobs/tracker.csv': 'company;role;status\nAcme;Analyst;applied\n' }, { fills })
  await $.command.run({ command: 'insights', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'insights', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Needs fixing:')
  expect(drawn).not.toContain('No applications yet. Once')
  await ui.press({ key: 'fix' })
  expect(fills[0]).toContain('looks damaged')
  await ui.unmount()
})
