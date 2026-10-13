import { expect, mock, test } from 'claude-code/testing'

const HEAD = 'id,found_date,company,role,location,remote,pay,posted,link,apply_link,job_id,source,fit_guess,why,concerns,status,reason,decided_date'
const TRACKER_HEAD = 'company,role,status,next_action_date,next_action,deadline,priority,fit,location,date_found,date_applied,contact,salary_range,source,link,apply_link,job_id,followups,folder,notes'

const LEADS = HEAD + '\n'
  + 'L-20261005-01,2026-10-05,"Northwind Traders, Inc.",Operations Analyst,Columbus OH,onsite,$70k-$80k,2026-10-03,https://careers.northwind.example/job/123?utm_source=indeed,,R-123,company site,A,Process work matches your warehouse internship,,new,,\n'
  + 'L-20261005-02,2026-10-05,Initech,Marketing Coordinator,Austin TX,hybrid,,,https://jobs.initech.example/456,,,company site,B,Marketing role close to home,Needs 2 years,new,,\n'
  + 'L-20260820-01,2026-08-20,Acme Corp,Nurse Educator,Denver CO,,,,https://careers.acme.example/789,,,company site,B,Entry teaching role,,new,,\n'
  + 'L-20261005-03,2026-10-05,Globex,Project Manager,Denver CO,,,,https://jobs.globex.example/111,,,company site,A,Former interest,,new,,\n'
  + 'L-20261001-01,2026-10-01,Umbrella Health,Senior Data Analyst,Minneapolis MN,,,,https://umbrella.example/222,,,indeed,C,Data,,not-for-me,too-senior,2026-10-02\n'

// Globex is already in the tracker (same link with a tracking parameter), so it must not show.
const TRACKER = TRACKER_HEAD + '\n' + 'Globex,Project Manager,interested,2026-10-08,Decide: apply or skip,,A,5,Denver CO,2026-10-04,,,,,https://jobs.globex.example/111/?utm_source=linkedin,,,0,globex-pm1,\n'

const PANE = { component: 'Pane', requestId: 'job-inbox', props: { title: 'Job Inbox', isFocused: true, bodyColumns: 100 } } as const

function setup(on: any, files: Record<string, string>, opts: { lock?: boolean; notPlaced?: boolean } = {}) {
  mock.clock(on, { now: new Date(2026, 9, 6, 9, 0).getTime() } as never)
  const rel = (p: string) => p.replace(/^.*\/job-inbox\//, '')
  on('fs.exists', (_$: any, e: any) => ({ value: rel(e.path) in files }) as never)
  on('fs.read', (_$: any, e: any) => ({ value: files[rel(e.path)] ?? '' }) as never)
  on('fs.write', (_$: any, e: any) => { if (opts.lock) throw new Error('EBUSY'); files[rel(e.path)] = e.text; return { value: undefined } as never })
  on('fs.list', () => ({ value: [] }) as never)
  on('ui.open', () => ({ value: opts.notPlaced ? { isPlaced: false, reason: 'no attached surface places panes' } : { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  return { files }
}

const row = (files: Record<string, string>, id: string) => files['jobs/leads.csv'].split('\n').find(l => l.startsWith(id)) ?? ''

test('new leads show as cards, older ones at the bottom, tracked and decided ones hidden', async ($, on) => {
  setup(on, { 'jobs/leads.csv': LEADS, 'jobs/tracker.csv': TRACKER })
  await $.command.run({ command: 'job-inbox', args: '' } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'job-inbox', surface, ...PANE } as never)
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('Northwind Traders, Inc. · Operations Analyst')
    expect(drawn).toContain('Pay: $70k-$80k')
    expect(drawn).toContain('Strong fit: Process work matches your warehouse internship')
    expect(drawn).toContain('Watch out: Needs 2 years')
    expect(drawn).toContain('3 new leads (1 older)')
    expect(drawn).not.toContain('Project Manager')
    expect(drawn).not.toContain('Senior Data Analyst')
    expect(drawn).toContain('1 lead is already in your tracker')
    // Older lead comes after the "Older leads" heading.
    expect(drawn.indexOf('Older leads')).toBeLessThan(drawn.indexOf('Acme Corp · Nurse Educator'))
    expect(drawn.indexOf('Initech')).toBeLessThan(drawn.indexOf('Older leads'))
    await ui.unmount()
  }
})

test('Save marks the lead saved and tells Claude to run add-job; one activity line per sitting', async ($, on) => {
  const { files } = setup(on, { 'jobs/leads.csv': LEADS, 'jobs/tracker.csv': TRACKER, 'history/activity.md': '# Recent activity\n\n' })
  await $.command.run({ command: 'job-inbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'job-inbox', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'L-20261005-01:save' })
  expect(row(files, 'L-20261005-01')).toContain(',saved,')
  expect(row(files, 'L-20261005-01')).toContain('saved,,2026-10-06')
  expect(row(files, 'L-20261005-01')).toContain('"Northwind Traders, Inc."')
  // The note to Claude itself is checked in dedupe.test.ts (savedNote); the kit has no session to append to.
  expect(JSON.stringify(await ui.drawn())).toContain('Claude will add it to your tracker')
  await ui.press({ key: 'L-20261005-02:skip' })
  expect(row(files, 'L-20261005-02')).toContain('skipped,,2026-10-06')
  // Nothing logged per click...
  expect(files['history/activity.md']).not.toContain('Job Inbox')
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Saved, waiting to be added to your tracker (1)')
  // ...one line when the sitting ends.
  await ui.press({ key: 'close' })
  const log = files['history/activity.md'].split('\n').filter(l => l.includes('Job Inbox'))
  expect(log.length).toBe(1)
  expect(log[0]).toContain('- 2026-10-06 09:00 · Job Inbox panel (Claude) · Job leads reviewed: saved 1 (Northwind Traders, Inc. - Operations Analyst), skipped 1')
  await ui.unmount()
})

test('Not for me asks why and stores the reason; a reason of their own is typed on terminal and desktop', async ($, on) => {
  const { files } = setup(on, { 'jobs/leads.csv': LEADS, 'jobs/tracker.csv': TRACKER, 'history/activity.md': '' })
  await $.command.run({ command: 'job-inbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'job-inbox', surface: 'desktop', ...PANE } as never)
  await ui.press({ key: 'L-20261005-02:nope' })
  expect(JSON.stringify(await ui.drawn())).toContain('Why is it not for you?')
  await ui.press({ key: 'L-20261005-02:why-too-senior' })
  expect(row(files, 'L-20261005-02')).toContain('not-for-me,too-senior,2026-10-06')
  await ui.press({ key: 'L-20261005-01:nope' })
  await ui.press({ key: 'L-20261005-01:why-other' })
  await ui.input({ key: 'L-20261005-01:why-text', text: 'Needs a security clearance, sadly' })
  expect(row(files, 'L-20261005-01')).toContain('not-for-me,"other: Needs a security clearance, sadly",2026-10-06')
  await ui.press({ key: 'close' })
  expect(files['history/activity.md']).toContain('not for me 2 (too senior, Needs a security clearance, sadly)')
  await ui.unmount()
})

test('Undo puts a skipped lead back, and a locked file shows a clear message', async ($, on) => {
  const { files } = setup(on, { 'jobs/leads.csv': LEADS, 'jobs/tracker.csv': TRACKER })
  await $.command.run({ command: 'job-inbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'job-inbox', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'L-20261005-02:skip' })
  expect(row(files, 'L-20261005-02')).toContain('skipped')
  await ui.press({ key: 'undo' })
  expect(row(files, 'L-20261005-02')).toContain('Needs 2 years,new,,')
  expect(JSON.stringify(await ui.drawn())).toContain('back in your inbox')
  await ui.unmount()
})

test('a leads file open in Excel is not changed and says why', async ($, on) => {
  const { files } = setup(on, { 'jobs/leads.csv': LEADS, 'jobs/tracker.csv': TRACKER }, { lock: true })
  await $.command.run({ command: 'job-inbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'job-inbox', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'L-20261005-02:skip' })
  expect(JSON.stringify(await ui.drawn())).toContain('open in another app (like Excel)')
  expect(files['jobs/leads.csv']).toBe(LEADS)
  await ui.unmount()
})

for (const [name, files] of [['no leads file', {}], ['header only', { 'jobs/leads.csv': HEAD + '\n' }]] as [string, Record<string, string>][]) {
  test(`empty state: ${name}`, async ($, on) => {
    setup(on, files)
    const ran: any = await $.command.run({ command: 'job-inbox', args: '' } as never)
    expect(String(ran?.text ?? '')).toContain('No new leads')
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'job-inbox', surface, ...PANE } as never)
      expect(await ui.find({ type: 'Text', text: /Type \/find-jobs/ })).toBeDefined()
      await ui.unmount()
    }
  })
}

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 90 } } as const

test('no pop-up at session start; the line above the prompt counts new leads after the bands beneath', async ($, on) => {
  setup(on, { 'jobs/leads.csv': LEADS, 'jobs/tracker.csv': TRACKER })
  const toasts: string[] = []
  on('ui.toast', (_$: any, e: any) => { toasts.push(e.text); return { value: undefined } as never })
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }) as never)
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['Job search: 2 waiting to hear back'] }) as never)
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true } as never)
  expect(toasts).toEqual([])
  const band = await $.ui.mount({ plugin: 'job-inbox', surface: 'terminal', ...BAND } as never)
  const drawn = JSON.stringify(await band.drawn())
  expect(drawn).toContain('Job Inbox: 2 new leads')
  expect(drawn.indexOf('Job search')).toBeLessThan(drawn.indexOf('Job Inbox'))
  await band.unmount()
})

test('a damaged leads file is reported and nothing in it is saved', async ($, on) => {
  const broken = LEADS.replace('Process work matches your warehouse internship', '"Process work matches')
  const { files } = setup(on, { 'jobs/leads.csv': broken, 'jobs/tracker.csv': TRACKER })
  await $.command.run({ command: 'job-inbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'job-inbox', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('looks damaged')
  expect(drawn).not.toContain('L-20261005-02:save')
  expect(files['jobs/leads.csv']).toBe(broken)
  await ui.unmount()
})

test('a long inbox shows the best fits first, one page at a time', async ($, on) => {
  let csv = HEAD + '\n'
  for (let i = 0; i < 20; i++) csv += `L-${i},2026-10-05,Company ${i},Analyst,X,,,,https://c${i}.example/1,,,site,${i === 19 ? 'A' : 'C'},fit,,new,,\n`
  setup(on, { 'jobs/leads.csv': csv, 'jobs/tracker.csv': TRACKER })
  await $.command.run({ command: 'job-inbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'job-inbox', surface: 'terminal', ...PANE } as never)
  let drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Company 19 · Analyst')
  expect(drawn).toContain('Showing 1–15 of 20')
  expect((drawn.match(/:save"/g) ?? []).length).toBe(15)
  await ui.press({ key: 'leads-next' })
  drawn = JSON.stringify(await ui.drawn())
  expect((drawn.match(/:save"/g) ?? []).length).toBe(5)
  expect(drawn).not.toContain('Company 19 · Analyst')
  await ui.unmount()
})

test('a big inbox against a long tracker stays quick, and only real duplicates are hidden', async ($, on) => {
  let tracker = TRACKER_HEAD + '\n'
  for (let i = 0; i < 1000; i++) tracker += `"Northwind Traders ${i % 200}, Inc.",Operations Analyst ${i},applied,2026-10-14,Follow up,,B,3,Columbus OH,2026-09-01,2026-09-02,,,,https://www.example.com/jobs/${i}?utm_source=x,,${i % 3 ? `R-${i}` : ''},0,nw-${i},\n`
  let csv = HEAD + '\n'
  for (let j = 0; j < 300; j++) csv += `L-${j},2026-10-05,Northwind Traders ${j % 250},Operations Analyst ${j * 3},Columbus OH,,,,https://example.com/jobs/${j * 7},,,site,B,fit,,new,,\n`
  setup(on, { 'jobs/leads.csv': csv, 'jobs/tracker.csv': tracker })
  const started = Date.now()
  const out: any = await $.command.run({ command: 'job-inbox', args: '' } as never)
  expect(Date.now() - started).toBeLessThan(1500)
  // Leads whose link matches a tracker row (j * 7 < 1000) are already tracked; the rest still show.
  expect(String(out.text)).toContain('new leads')
  const ui = await $.ui.mount({ plugin: 'job-inbox', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('already in your tracker')
  expect(drawn.length).toBeLessThan(60000)
  await ui.unmount()
})

test('where panels can\'t show, /job-inbox says so; the inbox watches its files and opens ready for the keyboard', async ($, on) => {
  const files = { 'jobs/leads.csv': LEADS, 'jobs/tracker.csv': TRACKER }
  setup(on, files, { notPlaced: true })
  on('classic.SessionStart', () => ({}) as never)
  const out: any = await $.command.run({ command: 'job-inbox', args: '' } as never)
  expect(String(out.text)).toContain("can't show in this window")
  expect(JSON.stringify(out.context)).toContain('chat version of the job-inbox skill')
  const start: any = await ($ as any).classic.SessionStart({ source: 'startup', cwd: '/home/alex/job-search' })
  expect(start.watchPaths).toEqual(['/home/alex/job-search/jobs/leads.csv', '/home/alex/job-search/jobs/tracker.csv'])
})

test('accessibility: keys hint in plain text under the first line, card buttons named after the lead, the first Save takes the focus, a warning is said in words, and Cancel closes the reasons', async ($, on) => {
  const { files } = setup(on, { 'jobs/leads.csv': LEADS, 'jobs/tracker.csv': TRACKER })
  await $.command.run({ command: 'job-inbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'job-inbox', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toMatch(/"role":"dismiss"\},"press":\{[^}]*\}\}\]\},\{"type":"Text","children":\["Keys: Ctrl\+X then Tab moves into this panel\./)
  expect(drawn).toContain('"key":"L-20261005-01:save","label":"Save (Northwind Traders, Inc., Operations Analyst)","variant":"primary","autoFocus":true}')
  expect(drawn).toContain('"label":"Skip (Initech, Marketing Coordinator)"}')
  expect(drawn).toContain('"color":"warning"},"children":["Watch out: Needs 2 years"]')
  await ui.press({ key: 'L-20261005-02:nope' })
  expect(JSON.stringify(await ui.drawn())).toContain('"label":"Too senior (Initech, Marketing Coordinator)"')
  await ui.press({ key: 'L-20261005-02:cancel' })
  expect(JSON.stringify(await ui.drawn())).toContain('L-20261005-02:nope')
  expect(row(files, 'L-20261005-02')).toContain(',new,')
  await ui.unmount()
})

test('accessibility: an empty inbox says so in plain (not dim) text', async ($, on) => {
  setup(on, { 'jobs/leads.csv': HEAD + '\n', 'jobs/tracker.csv': TRACKER })
  await $.command.run({ command: 'job-inbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'job-inbox', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('{"type":"Text","children":["No new leads right now.')
  await ui.unmount()
})
