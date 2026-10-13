import { expect, mock, test } from 'claude-code/testing'

const PANE = { component: 'Pane', requestId: 'apply-kit', props: { title: 'Apply Kit', isFocused: true, bodyColumns: 100 } } as const

const HEAD = 'company,role,status,next_action_date,next_action,deadline,priority,fit,location,date_found,date_applied,contact,salary_range,source,link,apply_link,job_id,followups,folder,notes'
const TRACKER = HEAD + '\n'
  + '"Northwind Traders, Inc.",Operations Analyst,interested,2026-10-08,Decide: apply or skip,,B,3,Columbus OH,2026-10-01,,,,,,,,,northwind-oa1,"note, with comma"\n'
  + 'Globex,Project Manager,interested,2026-10-07,Review package and submit,2026-10-20,A,5,Denver CO,2026-10-02,,Jane Doe,,Indeed,https://indeed.example/1,https://globex.example/apply,R-123,,globex-pm1,\n'

const PREFS = `# Job Search Preferences

SETUP: done 2026-10-01

## About you

name: Alex Rivera
home_base: Austin, TX
date_order: MDY

## What you want

- Locations: Austin, Dallas, NYC; open to relocating anywhere in the US
- Salary floor: not set; use market range
- Work authorization: Yes, authorized to work in the US; no sponsorship needed
- Earliest start date: 2026-11-02
- Willing to travel for work: up to 25%

## Voluntary self-identification (application EEO questions)

- Use these on applications: decide each time
- Race/ethnicity: **[ASK]**
`

const RESUME = `# Master Resume

## Contact

- Name: Alex Rivera (goes by Alex)
- Email: alex.rivera@example.com
- Phone: 512-555-0100
- Location (city, state/region): Austin, TX
- LinkedIn: [linkedin.com/in/alexrivera](https://linkedin.com/in/alexrivera)
- Portfolio / GitHub / website (optional): **[ASK]**

## Experience

<!-- ### Company, City, ST: Job Title (Mon YYYY – Mon YYYY) -->

### Acme Corp, Round Rock, TX: Sales & Operations Intern (Jan 2025 – Jun 2025)
- Built a scheduling tracker that cut setup time 30%.
- **[ASK: team size]**

### Initech, San Antonio, TX: Project Coordination Intern (Jul 2024 – Dec 2024)
- Wrote process guides for a new team.

## Education

**University of Texas at Austin**, Austin, TX
- BA Communications (May 2018)
- Minor in Business & Analytics
`

const POSTING = `---
company: Globex
title: Project Manager
job_id: R-123
apply_link: https://globex.example/apply
deadline: 2026-10-20
documents: resume, cover letter (optional), transcript (required)
questions:
  - Are you legally authorized to work in the US?
  - Why do you want to work at Globex?
  - What is your desired salary?
saved: 2026-10-02
---
Posting text.
`

const ANSWERS = `# Application answers: Globex

## Why do you want to work at Globex?
I want to run projects that reach a lot of people, and my internships were on the operations side.

## How did you hear about us?
Indeed.

## Date of birth
01/02/2003
`

function setup(on: any, files: Record<string, string>, opts: { lock?: boolean; list?: (path: string) => unknown[]; onRead?: (path: string, files: Record<string, string>) => void; notPlaced?: boolean; reads?: string[] } = {}) {
  mock.clock(on, { now: new Date(2026, 9, 6, 9, 0).getTime() } as never)
  const rel = (p: string) => p.replace(/^.*\/skills\/apply-kit\//, '')
  const copies: string[] = []
  const fills: string[] = []
  on('fs.exists', (_$: any, e: any) => ({ value: rel(e.path) in files }) as never)
  on('fs.read', (_$: any, e: any) => { opts.reads?.push(rel(e.path)); opts.onRead?.(rel(e.path), files); return { value: files[rel(e.path)] ?? '' } as never })
  on('fs.write', (_$: any, e: any) => { if (opts.lock) throw new Error('EBUSY: resource busy or locked'); files[rel(e.path)] = e.text; return { value: undefined } as never })
  on('fs.list', (_$: any, e: any) => ({ value: opts.list?.(rel(e.path)) ?? [] }) as never)
  on('ui.open', () => ({ value: opts.notPlaced ? { isPlaced: false, reason: 'no attached surface places panes' } : { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.copy', (_$: any, e: any) => { copies.push(e.text); return { value: { isCopied: true } } as never })
  on('prompt.fill', (_$: any, e: any) => { fills.push(e.text); return { isFilled: true } as never })
  // The test kit keeps no transcript, so the [Apply Kit] note can't be stored or observed here; the panel ignores that failure.
  on('session.append', () => ({ deny: 'recorded by the test' }) as never)  // newer test kits require next() for a value answer; a deny is ignored by the panels
  on('command.register', () => ({ value: undefined }) as never)
  return { files, copies, fills }
}

const FULL = () => ({
  'jobs/tracker.csv': TRACKER,
  'profile/preferences.md': PREFS,
  'profile/master-resume.md': RESUME,
  'jobs/globex-pm1/posting.md': POSTING,
  'jobs/globex-pm1/application-answers.md': ANSWERS,
  'jobs/globex-pm1/resume.html': '<html></html>',
  // Written by tailor-resume only after the checks: the sign that resume.html may be printed.
  'jobs/globex-pm1/resume-notes.md': '# Resume notes\n\n## Requirement coverage\n- Project scheduling: Met\n- PMP: Not met\n',
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the kit for the job ready to submit draws every section (${surface})`, async ($, on) => {
    setup(on, FULL())
    await $.command.run({ command: 'apply-kit', args: '' } as never)
    const ui = await $.ui.mount({ plugin: 'apply-kit', surface, ...PANE } as never)
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('Globex · Project Manager')
    expect(drawn).toContain('Email: alex.rivera@example.com')
    expect(drawn).toContain('Full name: Alex Rivera')
    expect(drawn).toContain('LinkedIn: https://linkedin.com/in/alexrivera')
    expect(drawn).toContain('Work authorization: Yes, authorized to work in the US; no sponsorship needed')
    expect(drawn).toContain('Willing to relocate: Austin, Dallas, NYC; open to relocating anywhere in the US')
    expect(drawn).toContain('Leave it blank if the field is optional, or type')
    expect(drawn).toContain('You chose to decide each time')
    expect(drawn).not.toContain('Race/ethnicity')
    expect(drawn).toContain('Employer: Acme Corp')
    expect(drawn).toContain('Job title: Sales & Operations Intern')
    expect(drawn).toContain('Start: Jan 2025')
    expect(drawn).toContain('End: Jun 2025')
    expect(drawn).toContain('Location: Round Rock, TX')
    expect(drawn).not.toContain('team size')
    expect(drawn).toContain('School: University of Texas at Austin')
    expect(drawn).toContain('Dates: May 2018')
    expect(drawn).toContain('my internships were on the operations side')
    expect(drawn).toContain('What is your desired salary?')
    expect(drawn).toContain('Not drafted yet')
    expect(drawn).toContain('Alex-Rivera-Resume-Globex.pdf')
    expect(drawn).toContain('open resume.html in your browser')
    expect(drawn).toContain('Not made yet (optional for this job)')
    expect(drawn).toContain('transcript (required)')
    expect(drawn).toContain('Job ID: R-123')
    expect(drawn).toContain('mark-applied')
    // Never shows sensitive data, even if a file holds it.
    expect(drawn).not.toContain('01/02/2003')
    expect(drawn).toContain('sensitive information')
    await ui.unmount()
  })
}

test('Copy puts exactly the answer on the clipboard', async ($, on) => {
  const { copies } = setup(on, FULL())
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'copy:email' })
  await ui.press({ key: 'copy:answer0' })
  await ui.press({ key: 'copy:file:Resume' })
  expect(copies).toEqual([
    'alex.rivera@example.com',
    'I want to run projects that reach a lot of people, and my internships were on the operations side.',
    'Alex-Rivera-Resume-Globex.pdf',
  ])
  expect(JSON.stringify(await ui.drawn())).toContain('Copied')
  expect(await ui.find({ key: 'copy:answer2' } as never)).toBeUndefined()
  await ui.unmount()
})

test('Mark applied saves the row and logs it', async ($, on) => {
  const { files } = setup(on, FULL())
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'mark-applied' })
  expect(files['jobs/tracker.csv']).toBe(TRACKER)
  expect(JSON.stringify(await ui.drawn())).toContain('sets a follow-up for 2026-10-15')
  await ui.press({ key: 'confirm-applied' })
  const csv = files['jobs/tracker.csv']
  expect(csv).toContain('Globex,Project Manager,applied,2026-10-15,Follow up with Jane Doe,2026-10-20,A,5,Denver CO,2026-10-02,2026-10-06,Jane Doe,,Indeed,https://indeed.example/1,https://globex.example/apply,R-123,0,globex-pm1,')
  expect(csv).toContain('"Northwind Traders, Inc.",Operations Analyst,interested,2026-10-08,Decide: apply or skip,,B,3,Columbus OH,2026-10-01,,,,,,,,,northwind-oa1,"note, with comma"')
  expect(files['history/activity.md']).toContain('- 2026-10-06 09:00 · Apply Kit panel (Claude) · Globex (Project Manager): marked applied on 2026-10-06; follow-up set for 2026-10-15')
  const after = JSON.stringify(await ui.drawn())
  expect(after).toContain('Marked applied today (2026-10-06)')
  expect(after).not.toContain('mark-applied')
  await ui.unmount()
})

test('Mark applied changes nothing if another app changed the tracker since the kit read it (e.g. moved the job on)', async ($, on) => {
  const { files } = setup(on, FULL())
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'desktop', ...PANE } as never)
  await ui.press({ key: 'mark-applied' })
  const moved = TRACKER.replace('Globex,Project Manager,interested', 'Globex,Project Manager,screening')
  files['jobs/tracker.csv'] = moved
  await ui.press({ key: 'confirm-applied' })
  expect(files['jobs/tracker.csv']).toBe(moved)
  expect(files['history/activity.md']).toBeUndefined()
  expect(JSON.stringify(await ui.drawn())).toContain('Your tracker changed in another app since this kit read it, so nothing was saved')
  await ui.unmount()
})

test('an Excel-saved tracker changed by another app mid-save is refused, saves once the kit shows the new version, and Excel quirks are kept clean', async ($, on) => {
  const excel = '﻿' + HEAD + '\r\n' + 'Globex,Project Manager,interested,10/7/26,Review package and submit,10/20/2026,A,5,Denver CO,10/2/2026,,,,,,,,,globex-pm1,\r\n'
  let saving = false
  let reads = 0
  const { files } = setup(on, { ...FULL(), 'jobs/tracker.csv': excel }, {
    onRead: (p, f) => { if (p === 'jobs/tracker.csv' && saving && ++reads === 1) f[p] = f[p] + 'Umbrella Health,Nurse Educator,interested,2026-10-09,Apply,,B,4,Denver CO,2026-10-06,,,,,,,,,umbrella-ne,\r\n' },
  })
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'mark-applied' })
  saving = true
  await ui.press({ key: 'confirm-applied' })
  expect(files['jobs/tracker.csv']).toContain('Globex,Project Manager,interested,10/7/26')
  expect(JSON.stringify(await ui.drawn())).toContain('changed in another app since this kit read it')
  await ui.press({ key: 'mark-applied' })
  await ui.press({ key: 'confirm-applied' })
  const csv = files['jobs/tracker.csv']
  expect((csv ?? '').charCodeAt(0)).toBe(0xfeff)
  expect(csv).toContain('Globex,Project Manager,applied,2026-10-15,Follow up,2026-10-20,A,5,Denver CO,2026-10-02,2026-10-06,')
  expect(csv).toContain('Umbrella Health,Nurse Educator,interested')
  await ui.unmount()
})

test('a cover letter drafted only as text is not called ready to print', async ($, on) => {
  const { fills } = setup(on, { ...FULL(), 'jobs/globex-pm1/cover-letter.md': 'Dear team,\n\nLetter text.\n' })
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).not.toContain('open cover-letter.md')
  expect(drawn).toContain('The cover letter text is drafted. Ask Claude to finish its checks, build the formatted cover letter, and create the PDF.')
  await ui.press({ key: 'fix:Cover letter' })
  expect(fills[0]).toBe('/cover-letter globex-pm1')
  await ui.unmount()
})

test('a hand-typed row with no folder, job ID or link and an Excel date_found can still be marked applied', async ($, on) => {
  const head = 'company,role,status,next_action_date,next_action,deadline,date_found,date_applied,contact,followups,folder'
  const csv = head + '\n' + 'Initech,Analyst,interested,2026-10-08,Review package and submit,,10/2/26,,,,\n'
  const { files } = setup(on, { ...FULL(), 'jobs/tracker.csv': csv })
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'mark-applied' })
  await ui.press({ key: 'confirm-applied' })
  expect(files['jobs/tracker.csv']).toContain('Initech,Analyst,applied,2026-10-15,Follow up,,2026-10-02,2026-10-06,,0,')
  expect(JSON.stringify(await ui.drawn())).not.toContain('no longer in your tracker')
  await ui.unmount()
})

test('a tracker locked by Excel shows a clear message', async ($, on) => {
  setup(on, FULL(), { lock: true })
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'mark-applied' })
  await ui.press({ key: 'confirm-applied' })
  expect(JSON.stringify(await ui.drawn())).toContain('open in another app (like Excel)')
  await ui.unmount()
})

test('a blank profile and a job with no answers show what is missing, never blanks', async ($, on) => {
  const blankPrefs = '# Job Search Preferences\n\n## About you\n\nname:\nhome_base:\n\n## What you want\n\n- Salary floor: **[ASK]**\n- Work authorization: **[ASK]** (the answers)\n- Earliest start date: **[ASK]**\n- SSN: 123-45-6789\n\n## Voluntary self-identification\n\n- Use these on applications: **[ASK]**\n'
  const blankResume = '# Master Resume\n\n## Contact\n\n- Name: **[ASK]** (and the name you go by)\n- Email: **[ASK]**\n\n## Experience\n\n<!-- ### Company, City, ST: Job Title (Mon YYYY – Mon YYYY) -->\n\n## Education\n\n<!-- **School**, City, ST -->\n'
  const { fills } = setup(on, {
    'jobs/tracker.csv': TRACKER,
    'profile/preferences.md': blankPrefs,
    'profile/master-resume.md': blankResume,
    'jobs/globex-pm1/posting.md': POSTING.replace('cover letter (optional)', 'cover letter'),
  })
  await $.command.run({ command: 'apply-kit', args: 'globex-pm1' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Email: [not set] — ask Claude')
  expect(drawn).toContain('Earliest start date: [not set] — ask Claude')
  expect(drawn).toContain('Work history: [not set] — ask Claude')
  expect(drawn).toContain('Education: [not set] — ask Claude')
  expect(drawn).toContain('You haven\'t chosen how to answer these yet')
  expect(drawn).not.toContain('123-45-6789')
  expect(drawn).not.toContain('Company, City, ST')
  expect(drawn).toContain('No answers have been drafted for this job yet')
  expect(drawn).toContain('Are you legally authorized to work in the US?')
  expect(drawn).toContain('Not made yet, and this job needs one')
  expect(await ui.find({ key: 'copy:email' } as never)).toBeUndefined()
  await ui.press({ key: 'draft-answers' })
  await ui.press({ key: 'fix:Resume' })
  await ui.press({ key: 'fill-gaps' })
  expect(fills[0]).toContain('Draft my application answers for Globex Project Manager (jobs/globex-pm1/application-answers.md)')
  expect(fills[1]).toBe('/tailor-resume globex-pm1')
  expect(fills[2]).toContain('Email')
  await ui.unmount()
})

test('with no job ready to submit, a picker of open jobs shows', async ($, on) => {
  const csv = TRACKER.replace('Review package and submit', 'Find a contact')
  setup(on, { ...FULL(), 'jobs/tracker.csv': csv })
  const ran: any = await $.command.run({ command: 'apply-kit', args: '' } as never)
  expect(JSON.stringify(ran)).toContain('pick the job')
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'desktop', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Which job are you applying to?')
  expect(drawn).not.toContain('mark-applied')
  await ui.press({ key: 'pick:globex|project manager|globex-pm1' })
  const after = JSON.stringify(await ui.drawn())
  expect(after).toContain('Globex · Project Manager')
  expect(after).toContain('mark-applied')
  await ui.unmount()
})

const drawnKit = async ($: any, ui?: any) => JSON.stringify(await ui.drawn())

test('the salary floor is never offered as an expectation; the posted range or the job\'s answer is', async ($, on) => {
  const prefs = PREFS.replace('- Salary floor: not set; use market range', '- Salary floor: $60,000')
  const posting = POSTING.replace('deadline: 2026-10-20', 'deadline: 2026-10-20\npay_range: $70,000-$85,000')
  const { copies } = setup(on, { ...FULL(), 'profile/preferences.md': prefs, 'jobs/globex-pm1/posting.md': posting })
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  let ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  let drawn = await drawnKit($, ui)
  expect(drawn).toContain('Salary expectation: $70,000-$85,000')
  expect(drawn).toContain('Your minimum — don\'t type this: $60,000')
  expect(await ui.find({ key: 'copy:salary-floor' } as never)).toBeUndefined()
  await ui.press({ key: 'copy:salary' })
  expect(copies).toEqual(['$70,000-$85,000'])
  await ui.unmount()
})

test('a salary answer drafted for this job wins over the posted range', async ($, on) => {
  const answers = ANSWERS + '\n## What is your desired salary?\n$75,000 to $80,000, depending on the full package.\n'
  setup(on, { ...FULL(), 'jobs/globex-pm1/application-answers.md': answers })
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  expect(await drawnKit($, ui)).toContain('Salary expectation: $75,000 to $80,000, depending on the full package.')
  await ui.unmount()
})

test('work authorization is read per country, and "Not sure" is left to the user', async ($, on) => {
  const prefs = PREFS.replace('- Work authorization: Yes, authorized to work in the US; no sponsorship needed', '- Work authorization (US): Yes\n- Needs sponsorship (US): No\n- Work authorization (UK): Not sure\n- Needs sponsorship (<country>): **[ASK]**')
  setup(on, { ...FULL(), 'profile/preferences.md': prefs })
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  const drawn = await drawnKit($, ui)
  expect(drawn).toContain('Authorized to work in US: Yes')
  expect(drawn).toContain('Needs sponsorship (US): No')
  expect(drawn).toContain('"Authorized to work in UK"]},{"type":"Text","props":{"wrap":"wrap","color":"warning"},"children":["Only you can answer this')
  expect(drawn).toContain('Use the answers for the country this job is in.')
  expect(drawn).not.toContain('<country>')
  expect(await ui.find({ key: 'copy:auth-UK' } as never)).toBeUndefined()
  expect(await ui.find({ key: 'copy:auth-US' } as never)).toBeDefined()
  await ui.unmount()
})

test('sensitive data is judged by the answer, and certifications are left to the user', async ($, on) => {
  const answers = ANSWERS
    + "\n## Do you have a valid driver's license?\nYes, a full license.\n"
    + '\n## Why Bank of America?\nI like their community lending work.\n'
    + "\n## Driver's license number\nD1234567\n"
    + '\n## I certify that the information in this application is true and complete\nYes\n'
    + '\n## Are you willing to relocate to Denver?\n[ASK: relocation]\n'
  setup(on, { ...FULL(), 'jobs/globex-pm1/application-answers.md': answers })
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  const drawn = await drawnKit($, ui)
  expect(drawn).toContain('Yes, a full license.')
  expect(drawn).toContain('I like their community lending work.')
  expect(drawn).not.toContain('D1234567')
  expect(drawn).toContain('Only you can answer this')
  expect(await ui.find({ key: 'copy:answer5' } as never)).toBeUndefined()
  expect(await ui.find({ key: 'copy:answer3' } as never)).toBeDefined()
  await ui.unmount()
})

test('a PDF counts as ready only when it is real and newer than its page', async ($, on) => {
  const pdf = (size: number, mtimeMs: number, name = 'Alex-Rivera-Resume-Globex.pdf') => ({ name, kind: 'file', size, mtimeMs, isLink: false })
  let listing: unknown[] = [pdf(48000, 100), { name: 'resume.html', kind: 'file', size: 9000, mtimeMs: 200, isLink: false }]
  setup(on, FULL(), { list: p => (p === 'jobs/globex-pm1' ? listing : []) })
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  expect(await drawnKit($, ui)).toContain('This PDF is older than your latest resume')
  listing = [pdf(800, 300), { name: 'resume.html', kind: 'file', size: 9000, mtimeMs: 200, isLink: false }]
  await ui.press({ key: 'refresh' })
  expect(await drawnKit($, ui)).toContain('looks empty or broken')
  listing = [pdf(48000, 300, 'Alex-Rivera-Resume-Globex-CHECK.pdf'), { name: 'resume.html', kind: 'file', size: 9000, mtimeMs: 200, isLink: false }]
  await ui.press({ key: 'refresh' })
  expect(await drawnKit($, ui)).toContain('Alex-Rivera-Resume-Globex-CHECK.pdf needs a look first')
  listing = [pdf(48000, 300), { name: 'resume.html', kind: 'file', size: 9000, mtimeMs: 200, isLink: false }]
  await ui.press({ key: 'refresh' })
  expect(await drawnKit($, ui)).toContain('Upload this file')
  await ui.unmount()
})

test('a damaged tracker is reported and nothing is marked applied', async ($, on) => {
  const broken = HEAD + '\n' + 'Globex,Project Manager,interested,2026-10-07,Review package and submit,2026-10-20,A,5,"Denver CO,2026-10-02,,,,,,,,,globex-pm1,\n'
  const { files } = setup(on, { ...FULL(), 'jobs/tracker.csv': broken })
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  const drawn = await drawnKit($, ui)
  expect(drawn).toContain('looks damaged')
  expect(drawn).not.toContain('mark-applied')
  expect(files['jobs/tracker.csv']).toBe(broken)
  await ui.unmount()
})

test('Mark applied never rewrites a date whose order is unclear', async ($, on) => {
  const head = 'company,role,status,next_action_date,next_action,deadline,date_found,date_applied,contact,followups,folder'
  const csv = head + '\n' + 'Initech,Analyst,interested,2026-10-08,Review package and submit,,03/04/2026,,,,\n'
  const prefs = PREFS.replace('date_order: MDY\n', '')
  const { files } = setup(on, { ...FULL(), 'jobs/tracker.csv': csv, 'profile/preferences.md': prefs })
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'mark-applied' })
  await ui.press({ key: 'confirm-applied' })
  expect(files['jobs/tracker.csv']).toContain('Initech,Analyst,applied,2026-10-15,Follow up,,03/04/2026,2026-10-06,,0,')
  await ui.unmount()
})

test('a long list of jobs to apply to is paged in the picker', async ($, on) => {
  let csv = HEAD + '\n'
  for (let i = 0; i < 40; i++) csv += `Company ${i},Analyst,interested,2026-10-20,Find a contact,,B,3,X,2026-10-01,,,,,,,,,c${i},\n`
  setup(on, { ...FULL(), 'jobs/tracker.csv': csv })
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  let drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Showing 1–15 of 40')
  expect(drawn).toContain('Tab moves between buttons')
  await ui.press({ key: 'picker-next' })
  drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Showing 16–30 of 40')
  await ui.unmount()
})

test('where panels can\'t show, /apply-kit says so and points to the chat', async ($, on) => {
  setup(on, FULL(), { notPlaced: true })
  const out: any = await $.command.run({ command: 'apply-kit', args: '' } as never)
  expect(String(out.text)).toContain("can't show in this window")
  expect(JSON.stringify(out.context)).toContain('chat version of the apply-kit skill')
})

test('the kit stops re-reading files after its pane is closed', async ($, on) => {
  const reads: string[] = []
  setup(on, FULL(), { reads })
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  const turn = { answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'end_turn', text: '' }
  reads.length = 0
  await ($ as any).turn.complete(turn).catch(() => undefined)
  expect(reads).toContain('profile/master-resume.md')
  await ui.press({ key: 'close' })
  reads.length = 0
  await ($ as any).turn.complete({ ...turn, turnId: 't2' }).catch(() => undefined)
  expect(reads).not.toContain('profile/master-resume.md')
  await ui.unmount()
})

test('Mark applied with the tracker gone says so plainly and writes nothing', async ($, on) => {
  const { files } = setup(on, FULL())
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  delete files['jobs/tracker.csv']
  await ui.press({ key: 'mark-applied' })
  await ui.press({ key: 'confirm-applied' })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Not done: Your tracker is missing')
  expect(files['jobs/tracker.csv']).toBeUndefined()
  await ui.unmount()
})

test('accessibility: keys hint in plain text right under Refresh and Close; every Copy button is named after its answer; Cancel leaves the tracker alone', async ($, on) => {
  const { files } = setup(on, FULL())
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toMatch(/"role":"dismiss"\},"press":\{[^}]*\}\}\]\},\{"type":"Text","children":\["Keys: Ctrl\+X then Tab moves into this panel\./)
  expect(drawn).toContain('"key":"copy:email","label":"Copy (Email)"')
  expect(drawn).toContain('"label":"Copy name (Resume file)"')
  expect(drawn).not.toContain('"label":"Copy"}')
  await ui.press({ key: 'mark-applied' })
  expect(JSON.stringify(await ui.drawn())).toContain('confirm-applied')
  await ui.press({ key: 'cancel-applied' })
  expect(JSON.stringify(await ui.drawn())).not.toContain('confirm-applied')
  expect(files['jobs/tracker.csv']).toBe(TRACKER)
  await ui.unmount()
})

test('a -CHECK PDF is never to be renamed: the kit says so and offers to make it again; a newer RenderCV file makes a PDF out of date', async ($, on) => {
  const pdf = (size: number, mtimeMs: number, name = 'Alex-Rivera-Resume-Globex.pdf') => ({ name, kind: 'file', size, mtimeMs, isLink: false })
  let listing: unknown[] = [pdf(48000, 300, 'Alex-Rivera-Resume-Globex-CHECK.pdf'), { name: 'resume.html', kind: 'file', size: 9000, mtimeMs: 200, isLink: false }]
  const { fills } = setup(on, FULL(), { list: p => (p === 'jobs/globex-pm1' ? listing : []) })
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  let drawn = await drawnKit($, ui)
  expect(drawn).toContain("Don't rename it: ask Claude to make it again")
  expect(drawn).not.toContain('rename it to')
  await ui.press({ key: 'fix:Resume' })
  expect(fills[0]).toContain('/tailor-resume globex-pm1')
  listing = [pdf(48000, 300), { name: 'resume.html', kind: 'file', size: 9000, mtimeMs: 200, isLink: false }, { name: 'resume.rendercv.yaml', kind: 'file', size: 900, mtimeMs: 400, isLink: false }]
  await ui.press({ key: 'refresh' })
  drawn = await drawnKit($, ui)
  expect(drawn).toContain('older than your latest resume text (resume.rendercv.yaml)')
  expect(drawn).not.toContain('Upload this file')
  await ui.unmount()
})

test('self-ID answers follow the current choice; a current-salary answer is not the salary expectation; a date of birth is always hidden', async ($, on) => {
  const answers = ANSWERS.replace('## Date of birth\n01/02/2003\n', '## Date of birth\nMay 5, 1995\n## What is your current salary?\n$61,000\n## Gender\nWoman\n## Describe a project that improved gender balance on a team\nI ran a mentoring pilot.\n')
  const { copies } = setup(on, { ...FULL(), 'jobs/globex-pm1/application-answers.md': answers })
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  const drawn = await drawnKit($, ui)
  expect(drawn).not.toContain('May 5, 1995')
  expect(drawn).not.toContain('Salary expectation: $61,000')
  expect(drawn).toContain('You chose to answer these yourself each time')
  expect(drawn).not.toContain('"children":["Woman"]')
  // An essay that only mentions one of those words keeps its Copy button.
  expect(drawn).toContain('I ran a mentoring pilot.')
  const essay = drawn.match(/"key":"copy:(answer\d+)","label":"Copy \(Describe a project/)
  expect(essay).not.toBeNull()
  await ui.press({ key: `copy:${essay?.[1]}` })
  expect(copies).toEqual(['I ran a mentoring pilot.'])
  await ui.unmount()
})

test('Mark applied keeps the row\'s Also: date readable (it is tidied together with the date that proved the order)', async ($, on) => {
  const row = 'Globex,Project Manager,interested,25/10/2026,Review package and submit,,A,5,Denver CO,2026-10-02,,,,Indeed,https://indeed.example/1,,R-123,,globex-pm1,Also: Interview 04/11/2026\n'
  const prefs = PREFS.replace('date_order: MDY\n', '')
  const { files } = setup(on, { ...FULL(), 'profile/preferences.md': prefs, 'jobs/tracker.csv': HEAD + '\n' + row })
  await $.command.run({ command: 'apply-kit', args: 'globex-pm1' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'mark-applied' })
  await ui.press({ key: 'confirm-applied' })
  expect(files['jobs/tracker.csv']).toContain('Also: Interview 2026-11-04')
  await ui.unmount()
})

test('availability, hours and shifts are copyable when filled in, and left out when blank', async ($, on) => {
  const prefs = PREFS.replace('- Willing to travel for work: up to 25%', '- Willing to travel for work: up to 25%\n- Availability: weekdays after 3pm, all day weekends\n- Hours wanted: 25-30 a week\n- Shifts: [ASK]')
  setup(on, { ...FULL(), 'profile/preferences.md': prefs })
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('weekdays after 3pm, all day weekends')
  expect(drawn).toContain('25-30 a week')
  expect(drawn).toContain('"key":"copy:availability"')
  expect(drawn).not.toContain('"key":"copy:shifts"')
  await ui.unmount()
})

for (const [label, line] of [['part-time', 'employment: part-time'], ['seasonal', 'employment: seasonal'], ['paid per hour', 'pay_range: $18/hour']]) {
  test(`Mark applied on an hourly or shift job (${label}) sets the follow-up 4 business days out (playbook), not 7`, async ($, on) => {
    const { files } = setup(on, { ...FULL(), 'jobs/globex-pm1/posting.md': POSTING.replace('saved: 2026-10-02', `${line}\nsaved: 2026-10-02`) })
    await $.command.run({ command: 'apply-kit', args: '' } as never)
    const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
    await ui.press({ key: 'mark-applied' })
    expect(JSON.stringify(await ui.drawn())).toContain('sets a follow-up for 2026-10-12')
    await ui.press({ key: 'confirm-applied' })
    expect(files['jobs/tracker.csv']).toContain('Globex,Project Manager,applied,2026-10-12,Follow up with Jane Doe,')
    await ui.unmount()
  })
}

test('a full-time salaried job keeps the 7-business-day follow-up', async ($, on) => {
  const { files } = setup(on, { ...FULL(), 'jobs/globex-pm1/posting.md': POSTING.replace('saved: 2026-10-02', 'employment: full-time\npay_range: $70,000-$85,000 a year\nsaved: 2026-10-02') })
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'mark-applied' })
  await ui.press({ key: 'confirm-applied' })
  expect(files['jobs/tracker.csv']).toContain('Globex,Project Manager,applied,2026-10-15,')
  await ui.unmount()
})

test('a resume page is offered for printing only after its checks (requirement coverage in resume-notes.md)', async ($, on) => {
  const files = FULL() as Record<string, string>
  delete files['jobs/globex-pm1/resume-notes.md']
  setup(on, files)
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  let drawn = await drawnKit($, ui)
  expect(drawn).not.toContain('open resume.html in your browser')
  expect(drawn).toContain("its checks aren't finished yet")
  // Notes without the coverage (a stop before step 7) still don't count.
  files['jobs/globex-pm1/resume-notes.md'] = '# Resume notes\n\nWhat changed: reordered bullets.\n'
  await ui.press({ key: 'refresh' })
  drawn = await drawnKit($, ui)
  expect(drawn).toContain("its checks aren't finished yet")
  files['jobs/globex-pm1/resume-notes.md'] = '## Requirement coverage\n- Budgeting: Partly met\n'
  await ui.press({ key: 'refresh' })
  expect(await drawnKit($, ui)).toContain('open resume.html in your browser')
  await ui.unmount()
})

test('an academic or Europass CV (cv.html) is found, and a PDF must be newer than every source that exists', async ($, on) => {
  const files = FULL() as Record<string, string>
  delete files['jobs/globex-pm1/resume.html']
  files['jobs/globex-pm1/cv.html'] = '<html></html>'
  files['jobs/globex-pm1/resume.md'] = '# Alex Rivera'
  const pdf = (mtimeMs: number) => ({ name: 'Alex-Rivera-Resume-Globex.pdf', kind: 'file', size: 48000, mtimeMs, isLink: false })
  const f = (name: string, mtimeMs: number) => ({ name, kind: 'file', size: 900, mtimeMs, isLink: false })
  let listing: unknown[] = []
  setup(on, files, { list: p => (p === 'jobs/globex-pm1' ? listing : []) })
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  expect(await drawnKit($, ui)).toContain('open cv.html in your browser')
  listing = [pdf(300), f('cv.html', 400), f('resume.md', 100)]
  await ui.press({ key: 'refresh' })
  expect(await drawnKit($, ui)).toContain('This PDF is older than your latest resume (cv.html)')
  listing = [pdf(300), f('cv.html', 200), f('resume.md', 400)]
  await ui.press({ key: 'refresh' })
  expect(await drawnKit($, ui)).toContain('older than your latest resume text (resume.md)')
  // Both pages exist: the PDF is out of date if either one is newer.
  files['jobs/globex-pm1/resume.html'] = '<html></html>'
  listing = [pdf(300), f('resume.html', 200), f('cv.html', 400), f('resume.md', 100)]
  await ui.press({ key: 'refresh' })
  let drawn = await drawnKit($, ui)
  expect(drawn).toContain('(cv.html)')
  expect(drawn).not.toContain('Upload this file')
  listing = [pdf(500), f('resume.html', 200), f('cv.html', 400), f('resume.md', 100), f('resume.rendercv.yaml', 450)]
  await ui.press({ key: 'refresh' })
  drawn = await drawnKit($, ui)
  expect(drawn).toContain('Upload this file')
  await ui.unmount()
})
