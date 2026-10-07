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

## What you want

- Locations: Austin, Dallas, NYC; open to relocating anywhere in the US
- Salary floor: not set; use market range
- Work authorization: Yes, authorized to work in the US; no sponsorship needed
- Earliest start date: 2027-07-06
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
- BS Industrial Engineering (expected Jun 2027)
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

function setup(on: any, files: Record<string, string>, opts: { lock?: boolean; onRead?: (path: string, files: Record<string, string>) => void } = {}) {
  mock.clock(on, { now: new Date(2026, 9, 6, 9, 0).getTime() } as never)
  const rel = (p: string) => p.replace(/^.*\/skills\/apply-kit\//, '')
  const copies: string[] = []
  const fills: string[] = []
  on('fs.exists', (_$: any, e: any) => ({ value: rel(e.path) in files }) as never)
  on('fs.read', (_$: any, e: any) => { opts.onRead?.(rel(e.path), files); return { value: files[rel(e.path)] ?? '' } as never })
  on('fs.write', (_$: any, e: any) => { if (opts.lock) throw new Error('EBUSY: resource busy or locked'); files[rel(e.path)] = e.text; return { value: undefined } as never })
  on('fs.list', () => ({ value: [] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.copy', (_$: any, e: any) => { copies.push(e.text); return { value: { isCopied: true } } as never })
  on('prompt.fill', (_$: any, e: any) => { fills.push(e.text); return { isFilled: true } as never })
  // The test kit keeps no transcript, so the [Apply Kit] note can't be stored or observed here; the panel ignores that failure.
  on('session.append', () => ({ value: { uuid: 'x' } }) as never)
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
    expect(drawn).toContain('Dates: Expected Jun 2027')
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

test('Mark applied changes nothing if another app already moved the job on', async ($, on) => {
  const { files } = setup(on, FULL())
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'desktop', ...PANE } as never)
  await ui.press({ key: 'mark-applied' })
  const moved = TRACKER.replace('Globex,Project Manager,interested', 'Globex,Project Manager,screening')
  files['jobs/tracker.csv'] = moved
  await ui.press({ key: 'confirm-applied' })
  expect(files['jobs/tracker.csv']).toBe(moved)
  expect(files['history/activity.md']).toBeUndefined()
  expect(JSON.stringify(await ui.drawn())).toContain('already marked')
  await ui.unmount()
})

test('an Excel-saved tracker changed by another app mid-save is re-read, and Excel quirks are kept clean', async ($, on) => {
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
