import { expect, mock, test } from 'claude-code/testing'

const CSV = 'company,role,status,next_action_date,next_action,priority,fit,location,date_found,date_applied,contact,salary_range,source,link,folder,notes\n'
  + '"Northwind Traders, Inc.",Operations Analyst,interested,2026-10-06,Tailor resume,A,4,Columbus OH,2026-10-01,,,,,,northwind-oa1,"note, with comma"\n'
  + 'Globex,Project Manager,interviewing,2026-10-09,Onsite interview,A,5,Denver CO,2026-09-15,2026-09-16,,,,,globex-pm1,\n'

const PANE = { component: 'Pane', requestId: 'pipeline', props: { title: 'Pipeline', isFocused: true, bodyColumns: 90 } } as const

function setup(on: any, csv = CSV, opts: { lock?: boolean; onRead?: (path: string, files: Record<string, string>) => void; afterWrite?: (path: string, files: Record<string, string>) => void } = {}) {
  const files: Record<string, string> = { 'jobs/tracker.csv': csv }
  const time = mock.clock(on, { now: new Date(2026, 9, 6, 9, 0).getTime() } as never)
  const rel = (p: string) => p.replace(/^.*\/pipeline\//, '')
  on('fs.exists', (_$: any, e: any) => ({ value: rel(e.path) in files }) as never)
  on('fs.read', (_$: any, e: any) => { opts.onRead?.(rel(e.path), files); return { value: files[rel(e.path)] ?? '' } as never })
  on('fs.write', (_$: any, e: any) => { if (opts.lock) throw new Error('EBUSY: resource busy or locked'); files[rel(e.path)] = e.text; opts.afterWrite?.(rel(e.path), files); return { value: undefined } as never })
  on('fs.list', () => ({ value: [] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.append', () => ({ deny: 'recorded by the test' }) as never)  // newer test kits require next() for a value answer; a deny is ignored by the panels
  on('command.register', () => ({ value: undefined }) as never)
  return { files, time }
}

test('moving a job to Applied saves the tracker and sets a follow-up', async ($, on) => {
  const { files } = setup(on)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('Northwind Traders, Inc. · Operations Analyst')
  await ui.press({ key: 'northwind traders, inc.|operations analyst|northwind-oa1:edit' })
  await (ui as any).select({ key: 'northwind traders, inc.|operations analyst|northwind-oa1:stage', value: 'applied' } as never)
  const saved = files['jobs/tracker.csv']
  expect(saved).toContain('"Northwind Traders, Inc.",Operations Analyst,applied,2026-10-15,Follow up')
  expect(saved).toContain('2026-10-06,,,,,northwind-oa1,"note, with comma"')
  expect(JSON.stringify(await ui.drawn())).toContain('Saved:')
  await ui.unmount()
})

test('on desktop, finishing and pushing back next steps save to the tracker', async ($, on) => {
  const { files } = setup(on)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'desktop', ...PANE } as never)
  await ui.press({ key: 'globex|project manager|globex-pm1:week' })
  expect(files['jobs/tracker.csv']).toContain('Globex,Project Manager,interviewing,2026-10-16,Onsite interview')
  await ui.press({ key: 'globex|project manager|globex-pm1:done' })
  expect(files['jobs/tracker.csv']).toContain('Globex,Project Manager,interviewing,2026-10-06,Decide next step')
  expect(files['history/activity.md']).toContain('- 2026-10-06 09:00 · Pipeline panel (Claude) · Globex: next step moved to 2026-10-16')
  expect(files['history/activity.md']).toContain('Globex: finished "Onsite interview"')
  await ui.unmount()
})

const HEAD = 'company,role,status,next_action_date,next_action,deadline,priority,fit,location,date_found,date_applied,folder,notes'

test('Excel saves (byte-order mark, CRLF, M/D/YYYY dates) still read and save correctly', async ($, on) => {
  const excel = '﻿' + HEAD + '\r\n' + 'Acme Corp,Sales & Marketing Associate,applied,10/14/26,Follow up,,B,4,Austin TX,9/10/2026,9/20/2026,acme-sma,\r\n'
  const { files } = setup(on, excel)
  // A US home base settles the order of 9/10/2026 (September 10).
  files['profile/preferences.md'] = 'home_base: Austin, TX\n<!-- city / region -->\n'
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('by 2026-10-14')
  expect(drawn).not.toContain('overdue')
  await ui.press({ key: 'acme corp|sales & marketing associate|acme-sma:week' })
  expect(files['jobs/tracker.csv']).toContain('Acme Corp,Sales & Marketing Associate,applied,2026-10-21,Follow up')
  expect(files['jobs/tracker.csv']).toContain('2026-09-10,2026-09-20')
  await ui.unmount()
})

test('two postings with the same company and title stay separate', async ($, on) => {
  const csv = HEAD + '\n' + 'Globex,Project Manager,rejected,,,,A,5,CO,2026-03-01,2026-03-02,globex-pm1-spring,\n' + 'Globex,Project Manager,interested,2026-10-08,Apply,,A,5,CO,2026-10-01,,globex-pm1,\n'
  const { files } = setup(on, csv)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'globex|project manager|globex-pm1:week' })
  expect(files['jobs/tracker.csv']).toContain('Globex,Project Manager,rejected,,,,A,5,CO,2026-03-01,2026-03-02,globex-pm1-spring')
  expect(files['jobs/tracker.csv']).toContain('Globex,Project Manager,interested,2026-10-15,Apply')
  await ui.unmount()
})

test('a tracker locked by Excel shows a clear message instead of failing silently', async ($, on) => {
  setup(on, CSV, { lock: true })
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'globex|project manager|globex-pm1:week' })
  expect(JSON.stringify(await ui.drawn())).toContain('open in another app (like Excel)')
  await ui.unmount()
})

test('an application deadline within 3 days is shown and counted as due', async ($, on) => {
  const csv = HEAD + '\n' + 'Initech,Marketing Coordinator,interested,2026-10-12,Review package and submit,2026-10-08,A,4,Columbus OH,2026-10-05,,initech-mc,\n'
  setup(on, csv)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'desktop', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Application deadline: 2026-10-08 (in 2 days)')
  expect(drawn).toContain('1 due or overdue')
  await ui.unmount()
})

test('an offer answer-by date within 3 days is due, and a save retries when another app changed the file', async ($, on) => {
  const csv = HEAD + '\n' + 'Acme Corp,Sales & Marketing Associate,offer,2026-10-20,Decide on offer,2026-10-07,A,5,Austin TX,2026-09-01,2026-09-05,acme-sma,\n'
  let reads = 0
  // Simulate Codex adding a row right after the panel's save reads the tracker.
  const { files } = setup(on, csv, { onRead: (p, f) => { if (p === 'jobs/tracker.csv' && saving && ++reads === 1) f[p] = f[p] + 'Umbrella Health,Nurse Educator,interested,2026-10-09,Apply,,B,4,Denver CO,2026-10-06,,umbrella-ne,\n' } })
  let saving = false
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Answer the offer by: 2026-10-07')
  saving = true
  await ui.press({ key: 'acme corp|sales & marketing associate|acme-sma:week' })
  expect(files['jobs/tracker.csv']).toContain('Acme Corp,Sales & Marketing Associate,offer,2026-10-27')
  expect(files['jobs/tracker.csv']).toContain('Umbrella Health,Nurse Educator,interested')
  await ui.unmount()
})

test('moving an applied job to Screening replaces the follow-up nudge', async ($, on) => {
  const csv = HEAD + '\n' + 'Acme Corp,Sales & Marketing Associate,applied,2026-10-14,Follow up,,A,5,Austin TX,2026-09-01,2026-10-01,acme-sma,\n'
  const { files } = setup(on, csv)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'acme corp|sales & marketing associate|acme-sma:edit' })
  await (ui as any).select({ key: 'acme corp|sales & marketing associate|acme-sma:stage', value: 'screening' } as never)
  expect(files['jobs/tracker.csv']).toContain('Acme Corp,Sales & Marketing Associate,screening,2026-10-06,Decide next step')
  await ui.unmount()
})

test('two rows with the same company and role but no folder stay separate', async ($, on) => {
  const head = 'company,role,status,next_action_date,next_action,deadline,priority,fit,location,date_found,date_applied,job_id,folder,notes'
  const csv = head + '\n' + 'Globex,Project Manager,rejected,,,,A,5,CO,2026-03-01,2026-03-02,R-100,,\n' + 'Globex,Project Manager,interested,2026-10-08,Apply,,A,5,CO,2026-10-01,,R-200,,\n'
  const { files } = setup(on, csv)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'globex|project manager|r-200:week' })
  expect(files['jobs/tracker.csv']).toContain('Globex,Project Manager,rejected,,,,A,5,CO,2026-03-01,2026-03-02,R-100')
  expect(files['jobs/tracker.csv']).toContain('Globex,Project Manager,interested,2026-10-15,Apply')
  await ui.unmount()
})

test('an ambiguous slash date is never guessed: shown as unclear and left exactly as written', async ($, on) => {
  const csv = HEAD + '\n' + 'Acme Corp,Analyst,applied,06/10/2026,Follow up,,B,4,Leeds,05/09/2026,,acme-an,\n' + 'Globex,Planner,interested,14/10/2026,Apply,,B,4,Leeds,2026-10-01,,globex-pl,\n'
  const { files } = setup(on, csv)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('date unclear: 06/10/2026')
  expect(drawn).toContain('by 2026-10-14')
  await ui.press({ key: 'globex|planner|globex-pl:week' })
  // The other row's dates are not touched by a save of this one.
  expect(files['jobs/tracker.csv']).toContain('Acme Corp,Analyst,applied,06/10/2026,Follow up,,B,4,Leeds,05/09/2026')
  expect(files['jobs/tracker.csv']).toContain('Globex,Planner,interested,2026-10-21,Apply')
  await ui.unmount()
})

test('with a day-first home base, 06/10/2026 is read as 6 October', async ($, on) => {
  const csv = HEAD + '\n' + 'Acme Corp,Analyst,applied,07/10/2026,Follow up,,B,4,Leeds,05/09/2026,,acme-an,\n'
  const { files } = setup(on, csv)
  files['profile/preferences.md'] = 'home_base: Leeds, UK\n'
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('by 2026-10-07')
  await ui.press({ key: 'acme corp|analyst|acme-an:week' })
  expect(files['jobs/tracker.csv']).toContain('Acme Corp,Analyst,applied,2026-10-14,Follow up,,B,4,Leeds,2026-09-05')
  await ui.unmount()
})

test('a hand-typed row found by its Excel date_found is still found when saving', async ($, on) => {
  const csv = 'company,role,status,next_action_date,next_action,date_found,folder\n' + 'Initech,Analyst,interested,2026-10-08,Apply,10/2/26,\n'
  const { files } = setup(on, csv)
  files['profile/preferences.md'] = 'home_base: Columbus, OH\n'
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'initech|analyst|10/2/26:week' })
  expect(files['jobs/tracker.csv']).toContain('Initech,Analyst,interested,2026-10-15,Apply,2026-10-02')
  expect(JSON.stringify(await ui.drawn())).not.toContain('no longer in')
  await ui.unmount()
})

test('a typed next step that would run as an Excel formula is saved as plain text', async ($, on) => {
  const { files } = setup(on)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'globex|project manager|globex-pm1:edit' })
  await (ui as any).input({ key: 'globex|project manager|globex-pm1:next', text: '=HYPERLINK("http://x.example","hi")' } as never)
  expect(files['jobs/tracker.csv']).toContain('Globex,Project Manager,interviewing,2026-10-09,"HYPERLINK(""http://x.example"",""hi"")"')
  expect(files['jobs/tracker.csv']).not.toContain(',=')
  await ui.unmount()
})

test('a save that another app overwrites at the same instant is reported, never applied twice', async ($, on) => {
  let writes = 0
  // Another app saves its own older copy right after the panel's write.
  setup(on, CSV, { afterWrite: (p, f) => { if (p === 'jobs/tracker.csv') { writes++; f[p] = CSV + 'Umbrella,Nurse,interested,2026-10-09,Apply,,,,,,,,,,umbrella-n,\n' } } })
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'globex|project manager|globex-pm1:week' })
  expect(writes).toBe(1)
  expect(JSON.stringify(await ui.drawn())).toContain('may not have stuck')
  await ui.unmount()
})

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 90 } } as const

test('the band puts its summary first and keeps the bands beneath (Contacts, Job Inbox) on the same line', async ($, on) => {
  setup(on)
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['Contacts: 1 follow-up due'] }) as never)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ plugin: 'pipeline', surface, ...BAND } as never)
    const drawn = JSON.stringify(await band.drawn())
    expect(drawn).toContain('Job search: 0 waiting to hear back · 1 interviewing · 1 to apply · 1 due or overdue')
    expect(drawn).toContain('Contacts: 1 follow-up due')
    expect(drawn.indexOf('Job search')).toBeLessThan(drawn.indexOf('Contacts:'))
    await band.unmount()
  }
})

test('the band alone, and quiet with nothing tracked', async ($, on) => {
  const { files } = setup(on)
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const band = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...BAND } as never)
  expect(JSON.stringify(await band.drawn())).toContain('Job search:')
  await band.unmount()
  files['jobs/tracker.csv'] = HEAD + '\n'
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const band2 = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...BAND } as never)
  expect(JSON.stringify(await band2.drawn() ?? '')).not.toContain('Job search:')
  await band2.unmount()
})

test('a typed next step is saved with plain characters only, so Excel opens it cleanly', async ($, on) => {
  const { files } = setup(on)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'globex|project manager|globex-pm1:edit' })
  await (ui as any).input({ key: 'globex|project manager|globex-pm1:next', text: 'Email Pat – “thanks”' } as never)
  expect(files['jobs/tracker.csv']).toContain('Globex,Project Manager,interviewing,2026-10-09,"Email Pat - ""thanks"""')
  await ui.unmount()
})
