import { expect, mock, test } from 'claude-code/testing'

// All dates are local. "Today" in these tests is Tuesday 2026-10-06, 9:00 in the morning.
const NOW = new Date(2026, 9, 6, 9, 0).getTime()
const HEAD = 'company,role,status,next_action_date,next_action,deadline,priority,fit,location,date_found,date_applied,contact,salary_range,source,link,apply_link,job_id,followups,folder,notes'
const CHEAD = 'name,company,title,relationship,how_we_met,last_contact,next_followup,status,touches,job,linkedin,email,notes'
const START = { cwd: '/project', surface: 'terminal', isInteractive: true } as const

type Files = Record<string, string>

function setup(on: any, files: Files, opts: { now?: number; store?: Record<string, unknown> } = {}) {
  const toasts: string[] = []
  const time = mock.clock(on, { now: opts.now ?? NOW } as never)
  mock.store(on, opts.store ?? {})
  const rel = (p: string) => p.replace(/^.*\/due-alerts\//, '')
  on('fs.exists', (_$: any, e: any) => ({ value: rel(e.path) in files || Object.keys(files).some(f => f.startsWith(`${rel(e.path)}/`)) }) as never)
  on('fs.read', (_$: any, e: any) => ({ value: files[rel(e.path)] ?? '' }) as never)
  on('fs.list', (_$: any, e: any) => {
    const dir = `${rel(e.path)}/`
    const names = Object.keys(files).filter(f => f.startsWith(dir) && !f.slice(dir.length).includes('/')).map(f => f.slice(dir.length))
    return { value: names.map(name => ({ name, kind: 'file' })) } as never
  })
  on('ui.toast', (_$: any, e: any) => { toasts.push(e.text); return { value: undefined } as never })
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }) as never)
  return { toasts, time }
}

const tracker = (...rows: string[]) => ({ 'jobs/tracker.csv': [HEAD, ...rows].join('\n') + '\n' })
const contacts = (...rows: string[]) => ({ 'contacts/contacts.csv': [CHEAD, ...rows].join('\n') + '\n' })
// A US home base: month-first slash dates like 10/7 are read as October 7.
const US = { 'profile/preferences.md': 'home_base: Denver, CO\n' }

test('an ambiguous slash date raises no alert unless the home base settles its order', async ($, on) => {
  const row = 'Umbrella Health,Nurse Educator,interviewing,,Interview 10/7 10am,,B,4,Leeds,2026-09-15,2026-09-16,,,,,,,0,umbrella-ne,'
  const quiet = setup(on, tracker(row))
  await $.session.start(START as never)
  expect(quiet.toasts).toEqual([])
})

test('a day-first home base reads 7/10 as 7 October', async ($, on) => {
  const { toasts } = setup(on, { 'profile/preferences.md': 'home_base: Leeds, UK\n', ...tracker('Umbrella Health,Nurse Educator,interviewing,,Interview 7/10 10am,,B,4,Leeds,2026-09-15,2026-09-16,,,,,,,0,umbrella-ne,') })
  await $.session.start(START as never)
  expect(toasts[0]).toBe('Interview tomorrow with Umbrella Health (Nurse Educator). Open your prep: /interview-prep umbrella-ne')
})

test('quiet when nothing is due', async ($, on) => {
  const { toasts } = setup(on, {
    ...tracker('Acme Corp,Sales & Marketing Associate,applied,2026-10-14,Follow up,,A,5,Austin TX,2026-09-01,2026-10-01,,,,,,,0,acme-sma,'),
    ...contacts('Pat Lee,Bluth & Sons,Analyst,alum,college,2026-10-01,2026-10-20,contacted,1,,,,'),
  })
  await $.session.start(START as never)
  expect(toasts).toEqual([])
})

test('quiet with no tracker at all (new user)', async ($, on) => {
  const { toasts } = setup(on, {})
  await $.session.start(START as never)
  expect(toasts).toEqual([])
})

test('an interview today or tomorrow, with a prep hint', async ($, on) => {
  const { toasts } = setup(on, { ...US, ...tracker(
    'Globex,Project Manager,interviewing,2026-10-06,Interview 2026-10-06 2pm,,A,5,CO,2026-09-15,2026-09-16,,,,,,,0,globex-pm1,',
    'Umbrella Health,Nurse Educator,interviewing,2026-10-05,Interview 10/7 10am,,B,4,Denver CO,2026-09-15,2026-09-16,,,,,,,0,umbrella-ne,',
    'Initech,Data Analyst,interviewing,2026-10-07,Onsite interview,,B,4,Columbus OH,2026-09-15,2026-09-16,,,,,,,0,initech-da,',
    'Contoso,Marketing Coordinator,interviewing,2026-10-07,Prep for interview,,B,4,Austin TX,2026-09-15,2026-09-16,,,,,,,0,contoso-mc,',
  ) })
  await $.session.start(START as never)
  expect(toasts.length).toBe(1)
  const lines = (toasts[0] ?? '').split('\n')
  expect(lines[0]).toBe('Interview today with Globex (Project Manager). Open your prep: /interview-prep globex-pm1')
  expect(lines[1]).toBe('Interview tomorrow with Initech (Data Analyst). Open your prep: /interview-prep initech-da')
  expect(lines[2]).toBe('Interview tomorrow with Umbrella Health (Nurse Educator). Open your prep: /interview-prep umbrella-ne')
  // "Prep for interview" due tomorrow is a prep task, not an interview, and not yet due.
  expect(toasts[0]).not.toContain('Contoso')
  // The Umbrella Health row's own next_action_date (10-05) is not reported again as an overdue step.
  expect(toasts[0]).not.toContain('overdue')
})

test('offer answer-by dates within 3 days, overdue ones say since when', async ($, on) => {
  const { toasts } = setup(on, tracker(
    'Acme Corp,Sales & Marketing Associate,offer,2026-10-20,Respond to offer,2026-10-08,A,5,Austin TX,2026-09-01,2026-09-05,,,,,,,0,acme-sma,',
    'Northwind,Operations Analyst,offer,2026-10-20,Respond to offer,2026-10-05,A,5,Columbus OH,2026-09-01,2026-09-05,,,,,,,0,northwind-oa1,',
    'Vandelay Industries,Purchasing Agent,offer,2026-10-20,Respond to offer,2026-10-15,A,5,CO,2026-09-01,2026-09-05,,,,,,,0,vandelay-pa,',
  ))
  await $.session.start(START as never)
  expect(toasts[0]).toBe('Your answer to the Northwind offer is overdue since 2026-10-05.\nYour answer to the Acme Corp offer is due by 2026-10-08.')
})

test('application deadlines within 3 days only for jobs not yet applied', async ($, on) => {
  const { toasts } = setup(on, { ...US, ...tracker(
    '"Northwind Traders, Inc.",Logistics Coordinator,interested,2026-10-12,Review package and submit,2026-10-08,A,4,Columbus OH,2026-10-05,,,,,,,,0,northwind-lc,',
    'Umbrella Health,Nurse Educator,interested,2026-10-12,Review package and submit,10/7/2026,B,4,Denver CO,2026-10-05,,,,,,,,0,umbrella-ne,',
    'Globex,Project Manager,applied,2026-10-12,Follow up,2026-10-07,A,5,CO,2026-09-15,2026-09-16,,,,,,,0,globex-pm1,',
    'Contoso,Marketing Coordinator,interested,2026-10-12,Review package and submit,2026-10-20,B,4,Austin TX,2026-10-05,,,,,,,,0,contoso-mc,',
  ) })
  await $.session.start(START as never)
  expect(toasts[0]).toBe('The application for Umbrella Health (Nurse Educator) closes tomorrow (2026-10-07).\nThe application for Northwind Traders, Inc. (Logistics Coordinator) closes in 2 days (2026-10-08).')
})

test('follow-ups: job rows own them once applied, contacts only for pure networking', async ($, on) => {
  const { toasts } = setup(on, {
    ...tracker(
      'Globex,Project Manager,applied,2026-10-02,Follow up with Jane,,A,5,CO,2026-09-15,2026-09-16,Jane Doe,,,,,,0,globex-pm1,',
      'Acme Corp,Sales & Marketing Associate,applied,2026-10-06,Follow up,,A,5,TX,2026-09-15,2026-09-16,,,,,,,0,acme-sma,',
    ),
    ...contacts(
      // Tied to an applied job: the Globex row owns this follow-up, so it isn't counted twice.
      'Jane Doe,Globex,Recruiter,recruiter,career fair,2026-09-20,2026-10-02,contacted,1,globex-pm1,,,',
      // Pure networking: shown.
      'Pat Lee,Bluth & Sons,Analyst,alum,college,2026-09-28,2026-10-05,contacted,1,,,,',
      // Two messages with no reply: stop following up.
      'Sam Ray,Umbrella Health,Nurse Manager,cold,,2026-09-20,2026-10-01,contacted,2,,,,',
    ),
  })
  await $.session.start(START as never)
  expect(toasts[0]).toBe('Globex (Project Manager): Follow up with Jane, overdue since 2026-10-02.\nFollow up with Pat Lee (Bluth & Sons), overdue since 2026-10-05.\nAcme Corp (Sales & Marketing Associate): Follow up, due today.')
})

test('a Gmail draft waiting more than 2 days gets a gentle nudge', async ($, on) => {
  const draft = (status: string, extra: string) => `---\nchannel: email\nkind: email\nto: jane.doe@globex.example\nsubject: Thank you\njob: globex-pm1\ncontact: Jane Doe\ncreated: 2026-10-01\nstatus: ${status}\n${extra}---\nHi Jane,\n`
  const { toasts } = setup(on, {
    'outbox/2026-10-01-thanks-jane.md': draft('in-gmail-drafts', 'status_at: 2026-10-02 14:05\n'),
    'outbox/2026-10-05-note-pat.md': draft('in-gmail-drafts', 'status_at: 2026-10-05 10:00\n').replace('Jane Doe', 'Pat Lee'),
    'outbox/2026-10-01-plain-draft.md': draft('draft', ''),
    'outbox/_example.md': draft('in-gmail-drafts', ''),
  })
  await $.session.start(START as never)
  expect(toasts).toEqual(['Your Gmail draft to Jane Doe has waited 4 days. Send it from Gmail, then press Mark sent in /outbox.'])
})

test('most urgent first, at most 3 lines, then a pointer to /today', async ($, on) => {
  const { toasts } = setup(on, {
    ...tracker(
      'Acme Corp,Sales & Marketing Associate,applied,2026-10-01,Follow up,,A,5,TX,2026-09-15,2026-09-16,,,,,,,0,acme-sma,',
      'Umbrella Health,Nurse Educator,interested,2026-10-12,Review package and submit,2026-10-06,B,4,Denver CO,2026-10-05,,,,,,,,0,umbrella-ne,',
      'Northwind,Operations Analyst,offer,2026-10-20,Respond to offer,2026-10-09,A,5,Columbus OH,2026-09-01,2026-09-05,,,,,,,0,northwind-oa1,',
      'Globex,Project Manager,interviewing,2026-10-07,Interview 2026-10-07,,A,5,CO,2026-09-15,2026-09-16,,,,,,,0,globex-pm1,',
    ),
    ...contacts('Pat Lee,Bluth & Sons,Analyst,alum,college,2026-09-28,2026-10-05,contacted,1,,,,'),
  })
  await $.session.start(START as never)
  expect(toasts.length).toBe(1)
  expect((toasts[0] ?? '').split('\n')).toEqual([
    'Interview tomorrow with Globex (Project Manager). Open your prep: /interview-prep globex-pm1',
    'Your answer to the Northwind offer is due by 2026-10-09.',
    'The application for Umbrella Health (Nurse Educator) closes today.',
    '...and 2 more. Type /today to see everything.',
  ])
})

test('an alert already shown today is not shown again', async ($, on) => {
  const files = tracker('Acme Corp,Sales & Marketing Associate,applied,2026-10-01,Follow up,,A,5,TX,2026-09-15,2026-09-16,,,,,,,0,acme-sma,')
  const { toasts } = setup(on, files, { store: { shown: { date: '2026-10-06', ids: ['next|acme corp|sales & marketing associate|acme-sma|2026-10-01|follow up'] } } })
  await $.session.start(START as never)
  expect(toasts).toEqual([])
})

test('a stale memory from yesterday does not hide today\'s alerts', async ($, on) => {
  const files = tracker('Acme Corp,Sales & Marketing Associate,applied,2026-10-01,Follow up,,A,5,TX,2026-09-15,2026-09-16,,,,,,,0,acme-sma,')
  const { toasts } = setup(on, files, { store: { shown: { date: '2026-10-05', ids: ['next|acme corp|sales & marketing associate|acme-sma|2026-10-01|follow up'] } } })
  await $.session.start(START as never)
  expect(toasts).toEqual(['Acme Corp (Sales & Marketing Associate): Follow up, overdue since 2026-10-01.'])
})

test('a second session the same day stays quiet; past midnight it shows what is newly due', async ($, on) => {
  const files = tracker(
    'Acme Corp,Sales & Marketing Associate,applied,2026-10-06,Follow up,,A,5,TX,2026-09-15,2026-09-16,,,,,,,0,acme-sma,',
    'Globex,Project Manager,applied,2026-10-07,Follow up,,A,5,CO,2026-09-15,2026-09-16,,,,,,,0,globex-pm1,',
  )
  const { toasts, time } = setup(on, files, { now: new Date(2026, 9, 6, 23, 58).getTime() })
  await $.session.start(START as never)
  expect(toasts).toEqual(['Acme Corp (Sales & Marketing Associate): Follow up, due today.'])
  // A hot reload or a new session the same day: nothing new, so nothing shown.
  await $.session.start(START as never)
  expect(toasts.length).toBe(1)
  // The session stays open past midnight: the next day's alerts show once.
  await time.advance(5 * 60000)
  expect(toasts.length).toBe(2)
  expect(toasts[1]).toBe('Acme Corp (Sales & Marketing Associate): Follow up, overdue since 2026-10-06.\nGlobex (Project Manager): Follow up, due today.')
  await time.advance(5 * 60000)
  expect(toasts.length).toBe(2)
})

test('a closed search stays quiet', async ($, on) => {
  const { toasts } = setup(on, {
    'profile/preferences.md': 'search_status: closed\n',
    ...tracker('Acme Corp,Sales & Marketing Associate,applied,2026-10-01,Follow up,,A,5,TX,2026-09-15,2026-09-16,,,,,,,0,acme-sma,'),
  })
  await $.session.start(START as never)
  expect(toasts).toEqual([])
})

test('a contact tied to a closed job is not followed up here (the job row owns it, as on the Contacts board)', async ($, on) => {
  const { toasts } = setup(on, {
    ...tracker('Globex,Project Manager,rejected,,,,A,5,CO,2026-09-15,2026-09-16,Jane Doe,,,,,,1,globex-pm1,'),
    ...contacts('Jane Doe,Globex,Recruiter,recruiter,career fair,2026-09-20,2026-10-02,contacted,1,globex-pm1,,,'),
  })
  await $.session.start(START as never)
  expect(toasts).toEqual([])
})
