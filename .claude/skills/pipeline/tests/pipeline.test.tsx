import { expect, mock, test } from 'claude-code/testing'

const CSV = 'company,role,status,next_action_date,next_action,priority,fit,location,date_found,date_applied,contact,salary_range,source,link,folder,notes\n'
  + '"Northwind Traders, Inc.",Operations Analyst,interested,2026-10-06,Tailor resume,A,4,Columbus OH,2026-10-01,,,,,,northwind-oa1,"note, with comma"\n'
  + 'Globex,Project Manager,interviewing,2026-10-09,Onsite interview,A,5,Denver CO,2026-09-15,2026-09-16,,,,,globex-pm1,\n'

const PANE = { component: 'Pane', requestId: 'pipeline', props: { title: 'Pipeline', isFocused: true, bodyColumns: 90 } } as const

function setup(on: any, csv = CSV, opts: { lock?: boolean; list?: (path: string) => unknown[]; onRead?: (path: string, files: Record<string, string>) => void; afterWrite?: (path: string, files: Record<string, string>) => void; notes?: string[]; opens?: any[]; notPlaced?: boolean } = {}) {
  const files: Record<string, string> = { 'jobs/tracker.csv': csv }
  const time = mock.clock(on, { now: new Date(2026, 9, 6, 9, 0).getTime() } as never)
  const rel = (p: string) => p.replace(/^.*\/pipeline\//, '')
  on('fs.exists', (_$: any, e: any) => ({ value: rel(e.path) in files }) as never)
  on('fs.read', (_$: any, e: any) => { opts.onRead?.(rel(e.path), files); return { value: files[rel(e.path)] ?? '' } as never })
  on('fs.write', (_$: any, e: any) => { if (opts.lock) throw new Error('EBUSY: resource busy or locked'); files[rel(e.path)] = e.text; opts.afterWrite?.(rel(e.path), files); return { value: undefined } as never })
  on('fs.list', (_$: any, e: any) => ({ value: opts.list?.(e.path) ?? [] }) as never)
  on('ui.open', (_$: any, e: any) => { opts.opens?.push(e); return { value: opts.notPlaced ? { isPlaced: false, reason: 'no attached surface places panes' } : { isPlaced: true } } as never })
  on('session.append', (_$: any, e: any) => { opts.notes?.push(JSON.stringify(e.message)); return { deny: 'recorded by the test' } as never })  // newer test kits require next() for a value answer; a deny is ignored by the panels
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
  // 10/14/26 in the same row proves month-first, which settles 9/10/2026 (September 10). Where the user lives is never used.
  files['profile/preferences.md'] = 'home_base: Leeds, UK\n<!-- city / region -->\n'
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

test('an offer answer-by date within 3 days is due; a save is refused when another app changed the file since the board read it, and works once the board shows the new version', async ($, on) => {
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
  // Refused: the file is not the version the board was drawn from (there is no file lock to hold).
  expect(files['jobs/tracker.csv']).toContain('Acme Corp,Sales & Marketing Associate,offer,2026-10-20')
  const after = JSON.stringify(await ui.drawn())
  expect(after).toContain('Your tracker changed in another app since this panel read it, so nothing was saved')
  expect(after).toContain('Umbrella Health')
  // The board now shows the new version: pressing again saves, and the other app's row is kept.
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

test('with date_order: DMY, 07/10/2026 is read as 7 October', async ($, on) => {
  const csv = HEAD + '\n' + 'Acme Corp,Analyst,applied,07/10/2026,Follow up,,B,4,Leeds,05/09/2026,,acme-an,\n'
  const { files } = setup(on, csv)
  files['profile/preferences.md'] = 'home_base: Columbus, OH\ndate_order: DMY   <!-- MDY, DMY or YMD -->\n'
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
  files['profile/preferences.md'] = '<!-- date_order: DMY is only an example -->\ndate_order: MDY\n'
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

test('a stray quote mid-cell no longer swallows the rows after it', async ($, on) => {
  const csv = HEAD + '\n' + 'Acme Corp,Analyst,applied,2026-10-14,Follow up,,B,4,Austin TX,2026-10-01,2026-10-02,acme-an,Said "maybe\n' + 'Globex,Planner,interested,2026-10-08,Apply,,B,4,CO,2026-10-01,,globex-pl,\n'
  const { files } = setup(on, csv)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('Globex · Planner')
  await ui.press({ key: 'globex|planner|globex-pl:week' })
  expect(files['jobs/tracker.csv']).toContain('acme-an,"Said ""maybe"\nGlobex,Planner,interested,2026-10-15')
  await ui.unmount()
})

test('a tracker with an unclosed quote or semicolons is shown as damaged and never written', async ($, on) => {
  const broken = HEAD + '\n' + 'Acme Corp,Analyst,applied,2026-10-14,Follow up,,B,4,Austin TX,2026-10-01,2026-10-02,acme-an,"note never closed\n' + 'Globex,Planner,interested,2026-10-08,Apply,,B,4,CO,2026-10-01,,globex-pl,\n'
  const { files } = setup(on, broken)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  let drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('looks damaged')
  expect(drawn).not.toContain('Globex · Planner')
  files['jobs/tracker.csv'] = 'company;role;status;next_action_date;next_action\nAcme;Analyst;applied;2026-10-14;Follow up\n'
  await ui.press({ key: 'refresh' })
  drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('semicolons')
  expect(files['jobs/tracker.csv']).toBe('company;role;status;next_action_date;next_action\nAcme;Analyst;applied;2026-10-14;Follow up\n')
  await ui.unmount()
})

test('dotted dates are day first; another date in the row settles an ambiguous one', async ($, on) => {
  const csv = HEAD + '\n' + 'Acme Corp,Analyst,applied,14.10.2026,Follow up,,B,4,Berlin,05/09/2026,25/09/2026,acme-an,\n'
  const { files } = setup(on, csv)
  files['profile/preferences.md'] = 'home_base: Berlin, DE\n'
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('by 2026-10-14')
  await ui.press({ key: 'acme corp|analyst|acme-an:week' })
  expect(files['jobs/tracker.csv']).toContain('Acme Corp,Analyst,applied,2026-10-21,Follow up,,B,4,Berlin,2026-09-05,2026-09-25')
  await ui.unmount()
})

test('moving to Offer always asks for the answer-by date and clears the old application deadline', async ($, on) => {
  const csv = HEAD + '\n' + 'Acme Corp,Analyst,interviewing,2026-10-20,Wait for decision,2026-09-01,A,5,Austin TX,2026-08-20,2026-08-25,acme-an,\n'
  const { files } = setup(on, csv)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'acme corp|analyst|acme-an:edit' })
  await (ui as any).select({ key: 'acme corp|analyst|acme-an:stage', value: 'offer' } as never)
  expect(files['jobs/tracker.csv']).toContain('Acme Corp,Analyst,offer,2026-10-06,Respond to offer,,A,5')
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('No answer-by date recorded')
  expect(drawn).not.toContain('Answer the offer by: 2026-09-01')
  expect(files['history/activity.md']).toContain('old application deadline 2026-09-01 was cleared')
  await ui.unmount()
})

test('a passed application deadline is shown as passed but not counted as due forever', async ($, on) => {
  const csv = HEAD + '\n' + 'Initech,Coordinator,interested,2026-10-20,Decide whether to apply,2026-09-15,B,3,Columbus OH,2026-09-01,,initech-c,\n'
  setup(on, csv)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Application deadline: 2026-09-15 (passed)')
  expect(drawn).not.toContain('due or overdue')
  await ui.unmount()
})

test('a second commitment in the notes is shown, and becomes the next step when the first is done', async ($, on) => {
  const csv = HEAD + '\n' + 'Globex,Planner,interviewing,2026-10-08,Take-home due,,A,5,CO,2026-09-01,2026-09-02,globex-pl,Also: Interview 2026-10-12; panel of three\n'
  const { files } = setup(on, csv)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('Also: Interview 2026-10-12')
  await ui.press({ key: 'globex|planner|globex-pl:done' })
  expect(files['jobs/tracker.csv']).toContain('Globex,Planner,interviewing,2026-10-12,Interview 2026-10-12,')
  expect(files['jobs/tracker.csv']).toContain('globex-pl,panel of three')
  await ui.unmount()
})

test('a save is refused while Excel has the tracker open (its lock file is there)', async ($, on) => {
  const { files } = setup(on, CSV, { list: p => (/jobs$/.test(p) ? [{ name: '~$tracker.csv', kind: 'file', size: 165, mtimeMs: 0, isLink: false }] : []) })
  const before = files['jobs/tracker.csv']
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'globex|project manager|globex-pm1:week' })
  expect(JSON.stringify(await ui.drawn())).toContain('open in Excel')
  expect(files['jobs/tracker.csv']).toBe(before)
  await ui.unmount()
})

test('a long board shows what is due first, one page at a time', async ($, on) => {
  let csv = HEAD + '\n'
  for (let i = 0; i < 30; i++) csv += `Company ${i},Role,applied,2026-11-${String(i + 1).padStart(2, '0')},Follow up,,B,3,X,2026-09-01,2026-09-02,c${i},\n`
  csv += 'Late Co,Role,offer,2026-11-30,Respond to offer,2026-10-07,A,5,X,2026-09-01,2026-09-02,late,\n'
  setup(on, csv)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  let drawn = JSON.stringify(await ui.drawn())
  expect(drawn.indexOf('Late Co')).toBeLessThan(drawn.indexOf('Company 0 '))
  expect(drawn).not.toContain('Company 29 ')
  expect(drawn).toContain('Showing 1–20 of 31')
  await ui.press({ key: 'active-next' })
  drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Company 29 ')
  expect(drawn).not.toContain('Late Co')
  expect(drawn).toContain('Showing 21–31 of 31')
  await ui.press({ key: 'active-prev' })
  expect(JSON.stringify(await ui.drawn())).toContain('Late Co')
  await ui.unmount()
})

test('a very large tracker stays within what a panel can draw, closed jobs included', async ($, on) => {
  let csv = HEAD + '\n'
  for (let i = 0; i < 1000; i++) csv += `Company ${i},Analyst ${i},${i % 2 ? 'rejected' : 'applied'},2026-11-01,Follow up with the recruiter about the next round,,B,3,Columbus OH,2026-09-01,2026-09-02,c${i},a note\n`
  setup(on, csv)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'closed' })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn.length).toBeLessThan(60000)
  expect(drawn).toContain('Showing 1–20 of 500')
  // Refresh and Close sit at the top, so they are never the part that gets cut.
  expect(drawn.indexOf('"refresh"')).toBeLessThan(drawn.indexOf('Company 0 '))
  await ui.press({ key: 'closed-next' })
  expect(JSON.stringify(await ui.drawn())).toContain('Showing 21–40 of 500')
  await ui.unmount()
})

test('an impossible date is refused, and the activity log holds what happened, not requests for Claude', async ($, on) => {
  const notes: string[] = []
  const { files } = setup(on, CSV, { notes })
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  const before = files['jobs/tracker.csv']
  await ui.press({ key: 'globex|project manager|globex-pm1:edit' })
  await ui.input({ key: 'globex|project manager|globex-pm1:date', text: '2026-02-31' } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('Type a real date')
  expect(files['jobs/tracker.csv']).toBe(before)
  await (ui as any).select({ key: 'globex|project manager|globex-pm1:stage', value: 'offer' } as never)
  expect(files['history/activity.md']).toContain('Globex (Project Manager) moved to Offer')
  expect(files['history/activity.md']).not.toMatch(/ask the user/i)
  expect(notes.join('\n')).toContain('Ask the user for the answer-by date')
  await ui.unmount()
})

test('"Mark next step done" reads a second commitment with date_order, as the board does', async ($, on) => {
  const csv = HEAD + '\n' + 'Globex,Planner,interviewing,2026-10-08,Take-home due,,A,5,CO,2026-09-01,2026-09-02,globex-pl,Also: Interview 12/10/2026\n'
  const { files } = setup(on, csv)
  files['profile/preferences.md'] = 'date_order: DMY\n'
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('Also: Interview 12/10/2026')
  await ui.press({ key: 'globex|planner|globex-pl:done' })
  // The save tidies the row's dates to YYYY-MM-DD and the Also: date with them (same order, same meaning).
  expect(files['jobs/tracker.csv']).toContain('Globex,Planner,interviewing,2026-10-12,Interview 2026-10-12,')
  await ui.unmount()
})

test('where panels can\'t show, /pipeline says so and points to the chat', async ($, on) => {
  setup(on, CSV, { notPlaced: true })
  const out: any = await $.command.run({ command: 'pipeline', args: '' } as never)
  expect(String(out.text)).toContain("can't show in this window")
  expect(JSON.stringify(out.context)).toContain('chat version of the pipeline skill')
})

test('the board asks to watch its files and refreshes when one changes on disk', async ($, on) => {
  const opens: any[] = []
  const { files } = setup(on, CSV, { opens })
  on('classic.SessionStart', () => ({}) as never)  // the settings hooks beneath (none in a test)
  on('classic.FileChanged', () => ({}) as never)
  const out: any = await ($ as any).classic.SessionStart({ source: 'startup', cwd: '/home/alex/job-search' })
  expect(out.watchPaths).toContain('/home/alex/job-search/jobs/tracker.csv')
  expect(out.watchPaths).toContain('/home/alex/job-search/profile/preferences.md')
  await $.command.run({ command: 'pipeline', args: '' } as never)
  expect(opens[0].focus).toBe(true)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('Tab moves between buttons')
  files['jobs/tracker.csv'] += 'Initech,Data Analyst,interested,2026-10-20,Apply,,B,3,Remote,2026-10-06,,,,,initech-da,\n'
  await ($ as any).classic.FileChanged({ file_path: '/home/alex/job-search/jobs/tracker.csv', event: 'change', cwd: '/home/alex/job-search' })
  expect(JSON.stringify(await ui.drawn())).toContain('Initech · Data Analyst')
  await ui.unmount()
})

test('a line another app adds to the activity log while saving is kept', async ($, on) => {
  let n = 0
  const { files } = setup(on, CSV, { onRead: (p, f) => { if (p === 'history/activity.md' && ++n === 1) f[p] = (f[p] ?? '# Recent activity\n\n') + '- 2026-10-06 08:59 · Codex · Initech: applied\n' } })
  files['history/activity.md'] = '# Recent activity\n\n'
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'globex|project manager|globex-pm1:week' })
  expect(files['history/activity.md']).toContain('Codex · Initech: applied')
  expect(files['history/activity.md']).toContain('Pipeline panel (Claude) · Globex: next step moved to 2026-10-16')
  await ui.unmount()
})

test('accessibility: the keys hint comes right under the first line in plain text, card buttons are named after the job, due words never rely on color, and the empty board is plain text', async ($, on) => {
  setup(on)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('"key":"close","label":"Close","role":"dismiss"},"press":{"plugin":"pipeline","handle":')
  expect(drawn).toMatch(/"role":"dismiss"\},"press":\{[^}]*\}\}\]\},\{"type":"Text","children":\["Keys: Ctrl\+X then Tab moves into this panel\./)
  expect(drawn).toContain('"label":"Update… (Globex, Project Manager)"},"press"')
  expect(drawn).toContain('"children":["Update…"]')
  // The overdue/due step says so in words, beside the warning color.
  expect(drawn).toContain('"color":"warning"},"children":["Next: Tailor resume (due today)"]')
  await ui.unmount()
})

test('accessibility: an empty tracker says so in plain (not dim) text', async ($, on) => {
  setup(on, 'company,role,status,next_action_date,next_action\n')
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('{"type":"Text","children":["No open applications yet.')
  await ui.unmount()
})

test('an unclear next-step date is never pushed back: no button, and the save refuses if it became unclear meanwhile', async ($, on) => {
  const csv = HEAD + '\n' + 'Globex,Planner,interviewing,03/04/2026,Follow up,,A,5,CO,,,globex-pl,\n'
  const { files } = setup(on, csv)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('date unclear: 03/04/2026')
  expect(drawn).not.toContain('globex|planner|globex-pl:week')
  expect(files['jobs/tracker.csv']).toBe(csv)
  await ui.unmount()
})

test('a clear date shown on the board but changed to an unclear one in the file is left alone by "Push back a week"', async ($, on) => {
  const csv = HEAD + '\n' + 'Globex,Planner,interviewing,2026-10-08,Follow up,,A,5,CO,,,globex-pl,\n'
  const { files } = setup(on, csv)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  files['jobs/tracker.csv'] = csv.replace('2026-10-08', '03/04/2026')
  await ui.press({ key: 'globex|planner|globex-pl:week' })
  expect(files['jobs/tracker.csv']).toContain('Globex,Planner,interviewing,03/04/2026,Follow up')
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('changed in another app since this panel read it')
  // The board shows the file as it is now: the date is unclear, so the button is gone.
  expect(drawn).toContain('date unclear: 03/04/2026')
  expect(drawn).not.toContain('globex|planner|globex-pl:week')
  await ui.unmount()
})

test('saving a row keeps its Also: date readable: the date that proved the row\'s order is tidied together with it', async ($, on) => {
  // 25/10/2026 proves day-first for this row; date_order is not set.
  const csv = HEAD + '\n' + 'Globex,Planner,interviewing,25/10/2026,Follow up,,A,5,CO,,,globex-pl,Also: Interview 04/11/2026\n'
  const { files } = setup(on, csv)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'globex|planner|globex-pl:week' })
  const saved = files['jobs/tracker.csv']
  expect(saved).toContain('Globex,Planner,interviewing,2026-11-01,Follow up')
  expect(saved).toContain('Also: Interview 2026-11-04')
  await ui.unmount()
})

test('a take-home promoted to the next step starts 2 days before it is due (never before today)', async ($, on) => {
  const csv = HEAD + '\n'
    + 'Globex,Planner,interviewing,2026-10-06,Phone screen,,A,5,CO,,,globex-pl,Also: Take-home due 2026-10-12\n'
    + 'Initech,Analyst,interviewing,2026-10-06,Phone screen,,A,5,CO,,,initech-an,Also: Take-home due 2026-10-07\n'
  const { files } = setup(on, csv)
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'globex|planner|globex-pl:done' })
  await ui.press({ key: 'initech|analyst|initech-an:done' })
  expect(files['jobs/tracker.csv']).toContain('Globex,Planner,interviewing,2026-10-10,Take-home due 2026-10-12,')
  expect(files['jobs/tracker.csv']).toContain('Initech,Analyst,interviewing,2026-10-06,Take-home due 2026-10-07,')
  await ui.unmount()
})
