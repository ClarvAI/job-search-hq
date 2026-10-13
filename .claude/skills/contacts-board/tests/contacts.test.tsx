import { expect, mock, test } from 'claude-code/testing'

const HEAD = 'name,company,title,relationship,how_we_met,last_contact,next_followup,status,touches,job,linkedin,email,notes'
const CSV = HEAD + '\n'
  + 'Jane Doe,Globex,Project Manager,alum,college alumni list,,,to-contact,0,,,jane.doe@globex.example,\n'
  + 'Pat Lee,"Northwind Traders, Inc.",Data Analyst,former-colleague,Initech internship,2026-09-20,,replied,0,,,,"said ""reach out anytime"", nice"\n'
  + 'Sam Roe,Acme Corp,Recruiter,recruiter,career fair,2026-09-29,,contacted,1,acme-sma,,,\n'
  + 'Alex Kim,Initech,Operations Manager,former-manager,internship,2026-09-28,2026-10-05,contacted,1,,,,\n'
  + 'Chris Wu,Umbrella Health,Nurse Educator,met-at-event,industry meetup,2026-09-15,,talked,0,umbrella-ne,,,\n'
  + 'Dana Ortiz,Contoso,Marketing Director,former-manager,internship,2026-09-01,,referred,0,,,,\n'
  + 'Lee Park,Bluth & Sons,Analyst,cold,,2026-08-01,,cold,2,,,,\n'
const TRACKER = 'company,role,status,next_action_date,next_action,folder\n'
  + 'Acme Corp,Sales & Marketing Associate,applied,2026-10-14,Follow up,acme-sma\n'
  + 'Umbrella Health,Nurse Educator,interested,2026-10-09,Apply,umbrella-ne\n'

const PANE = { component: 'Pane', requestId: 'contacts', props: { title: 'Contacts', isFocused: true, bodyColumns: 90 } } as const
const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 90 } } as const
const K = {
  jane: 'jane doe|globex|jane.doe@globex.example',
  pat: 'pat lee|northwind traders, inc.',
  sam: 'sam roe|acme corp',
  alex: 'alex kim|initech',
  chris: 'chris wu|umbrella health',
  dana: 'dana ortiz|contoso',
  lee: 'lee park|bluth & sons',
}

function setup(on: any, csv: string | null = CSV, opts: { lock?: boolean; notPlaced?: boolean; opens?: any[] } = {}) {
  const files: Record<string, string> = { 'jobs/tracker.csv': TRACKER }
  if (csv !== null) files['contacts/contacts.csv'] = csv
  // Tuesday 2026-10-06, 9:00 local.
  mock.clock(on, { now: new Date(2026, 9, 6, 9, 0).getTime() } as never)
  const rel = (p: string) => p.replace(/^.*\/contacts-board\//, '')
  const notes: string[] = []
  const filled: string[] = []
  on('fs.exists', (_$: any, e: any) => ({ value: rel(e.path) in files }) as never)
  on('fs.read', (_$: any, e: any) => ({ value: files[rel(e.path)] ?? '' }) as never)
  on('fs.write', (_$: any, e: any) => { if (opts.lock && rel(e.path).endsWith('.csv')) throw new Error('EBUSY: resource busy or locked'); files[rel(e.path)] = e.text; return { value: undefined } as never })
  on('fs.list', () => ({ value: [] }) as never)
  on('ui.open', (_$: any, e: any) => { opts.opens?.push(e); return { value: opts.notPlaced ? { isPlaced: false, reason: 'no attached surface places panes' } : { isPlaced: true } } as never })
  on('ui.close', () => ({ value: undefined }) as never)
  // The [Contacts] note to Claude goes through $.session.append, which this test kit does not route to a
  // test's hooks (the call resolves to an error the plugin ignores), so the notes are not asserted here.
  on('session.append', (_$: any, e: any) => { notes.push(JSON.stringify(e.message)); return { deny: 'recorded by the test' } as never })
  on('prompt.fill', (_$: any, e: any) => { filled.push(e.text); return { isFilled: true } as never })
  on('command.register', () => ({ value: undefined }) as never)
  return { files, notes, filled }
}

const row = (files: Record<string, string>, name: string) => (files['contacts/contacts.csv'].split('\n').find(l => l.startsWith(name)) ?? '')

async function open($: any, surface: 'terminal' | 'desktop') {
  await $.command.run({ command: 'contacts', args: '' } as never)
  return $.ui.mount({ plugin: 'contacts-board', surface, ...PANE } as never)
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`an empty or missing contacts file draws a friendly board on ${surface}`, async ($, on) => {
    setup(on, HEAD + '\n')
    const ui = await open($, surface)
    expect(JSON.stringify(await ui.drawn())).toContain('No one here yet')
    await ui.unmount()
  })

  test(`a missing contacts file says so on ${surface}`, async ($, on) => {
    setup(on, null)
    const ui = await open($, surface)
    expect(JSON.stringify(await ui.drawn())).toContain('No contacts file yet')
    await ui.unmount()
  })

  test(`the board groups people by status and keeps cold ones collapsed on ${surface}`, async ($, on) => {
    setup(on)
    const ui = await open($, surface)
    const drawn = JSON.stringify(await ui.drawn())
    for (const col of ['To contact (1)', 'Contacted, waiting (2)', 'Replied (1)', 'Talked (1)', 'Referred me (1)']) expect(drawn).toContain(col)
    expect(drawn).toContain('Pat Lee · Northwind Traders, Inc.')
    expect(drawn).toContain('Last contact: 2026-09-28 (8 days ago)')
    expect(drawn).toContain('Next follow-up: overdue since 2026-10-05')
    expect(drawn).toContain('Follow-up: handled by your application (acme-sma)')
    expect(drawn).toContain('Job: umbrella-ne (interested)')
    expect(drawn).not.toContain('Lee Park')
    await ui.press({ key: 'cold-toggle' })
    expect(JSON.stringify(await ui.drawn())).toContain('Lee Park · Bluth & Sons')
    await ui.unmount()
  })
}

test('the band shows only when a follow-up is due', async ($, on) => {
  const { files } = setup(on)
  // The engine (and any band beneath this one) draws nothing of its own here.
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  await $.command.run({ command: 'contacts', args: '' } as never)
  const band = await $.ui.mount({ plugin: 'contacts-board', surface: 'terminal', ...BAND } as never)
  expect(JSON.stringify(await band.drawn())).toContain('Contacts: 1 follow-up due')
  await band.unmount()
  // Nothing due: the band stays quiet.
  files['contacts/contacts.csv'] = HEAD + '\nJane Doe,Globex,,alum,,,,to-contact,0,,,,\n'
  await $.command.run({ command: 'contacts', args: '' } as never)
  const band2 = await $.ui.mount({ plugin: 'contacts-board', surface: 'terminal', ...BAND } as never)
  expect(JSON.stringify(await band2.drawn() ?? '')).not.toContain('Contacts:')
  await band2.unmount()
})

test('another band beneath (the Pipeline\'s) is kept, with this one after it on the same line', async ($, on) => {
  setup(on)
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['Job search: 2 waiting to hear back'] }) as never)
  await $.command.run({ command: 'contacts', args: '' } as never)
  const band = await $.ui.mount({ plugin: 'contacts-board', surface: 'desktop', ...BAND } as never)
  const drawn = JSON.stringify(await band.drawn())
  expect(drawn).toContain('Job search: 2 waiting to hear back')
  expect(drawn).toContain('Contacts: 1 follow-up due')
  expect(drawn.indexOf('Job search')).toBeLessThan(drawn.indexOf('Contacts:'))
  await band.unmount()
})

test('Message sent today: last contact, touches +1, to-contact becomes contacted, follow-up in 5 business days, activity line', async ($, on) => {
  const { files } = setup(on)
  const ui = await open($, 'terminal')
  await ui.press({ key: `${K.jane}:sent` })
  await ui.press({ key: `${K.jane}:sent-today` })
  expect(row(files, 'Jane Doe')).toBe('Jane Doe,Globex,Project Manager,alum,college alumni list,2026-10-06,2026-10-13,contacted,1,,,jane.doe@globex.example,')
  // Other rows, quoting and embedded quotes survive the rewrite.
  expect(files['contacts/contacts.csv']).toContain('Pat Lee,"Northwind Traders, Inc.",Data Analyst,former-colleague,Initech internship,2026-09-20,,replied,0,,,,"said ""reach out anytime"", nice"')
  expect(files['history/activity.md']).toContain('- 2026-10-06 09:00 · Contacts panel (Claude) · Jane Doe (Globex): message sent 2026-10-06, now Contacted; 1 with no reply; follow up on 2026-10-13 if no reply')
  expect(JSON.stringify(await ui.drawn())).toContain('Saved:')
  await ui.unmount()
})

test('Message sent never moves someone backwards from replied, and a thank-you to them is not counted or chased', async ($, on) => {
  const { files } = setup(on)
  const ui = await open($, 'desktop')
  await ui.press({ key: `${K.pat}:sent` })
  await ui.press({ key: `${K.pat}:sent-yesterday` })
  // Pat already replied: the message updates last_contact only (no unanswered count, no 5-day nudge).
  expect(row(files, 'Pat Lee')).toContain('Initech internship,2026-10-05,,replied,0,')
  await ui.press({ key: `${K.chris}:sent` })
  await ui.press({ key: `${K.chris}:sent-today` })
  expect(row(files, 'Chris Wu')).toContain('industry meetup,2026-10-06,,talked,0,')
  await ui.unmount()
})

test('once the linked job is applied, a message clears the stale networking date and the board stops counting it', async ($, on) => {
  const csv = HEAD + '\n' + 'Sam Roe,Acme Corp,Recruiter,recruiter,career fair,2026-09-29,2026-10-05,contacted,1,acme-sma,,,\n'
  const { files } = setup(on, csv)
  const ui = await open($, 'terminal')
  let drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('nothing due')
  expect(drawn).toContain('handled by your application (acme-sma)')
  await ui.press({ key: `${K.sam}:sent` })
  await ui.press({ key: `${K.sam}:sent-today` })
  expect(row(files, 'Sam Roe')).toContain('career fair,2026-10-06,,contacted,2,acme-sma')
  drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('old contact follow-up date cleared')
  await ui.unmount()
})

test('a damaged contacts file is reported and never written; a stray quote no longer swallows rows', async ($, on) => {
  const { files } = setup(on, HEAD + '\n' + 'Jane Doe,Globex,"Project Manager,alum,,,,to-contact,0,,,,\nPat Lee,Initech,Analyst,alum,,,,to-contact,0,,,,\n')
  const ui = await open($, 'terminal')
  expect(JSON.stringify(await ui.drawn())).toContain('looks damaged')
  files['contacts/contacts.csv'] = HEAD + '\n' + 'Jane Doe,Globex,Project "PM" Manager,alum,,,,to-contact,0,,,,\nPat Lee,Initech,Analyst,alum,,,,to-contact,0,,,,\n'
  await ui.press({ key: 'refresh' })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Pat Lee')
  expect(drawn).not.toContain('looks damaged')
  await ui.unmount()
})

test('Message sent on a typed date; a bad or future date is refused', async ($, on) => {
  const { files } = setup(on)
  const ui = await open($, 'terminal')
  await ui.press({ key: `${K.jane}:sent` })
  await ui.input({ key: `${K.jane}:sent-date`, text: '2026-10-09' })
  expect(JSON.stringify(await ui.drawn())).toContain('in the future')
  await ui.input({ key: `${K.jane}:sent-date`, text: 'Oct 2' })
  expect(JSON.stringify(await ui.drawn())).toContain('YYYY-MM-DD')
  expect(row(files, 'Jane Doe')).toContain(',,,to-contact,0,')
  await ui.input({ key: `${K.jane}:sent-date`, text: '2026-10-02' })
  // Friday 10-02 + 5 business days = Friday 10-09.
  expect(row(files, 'Jane Doe')).toContain('2026-10-02,2026-10-09,contacted,1,')
  await ui.unmount()
})

test('a job that is applied owns the follow-up: Message sent leaves next_followup alone and tells Claude', async ($, on) => {
  const { files } = setup(on)
  const ui = await open($, 'terminal')
  await ui.press({ key: `${K.sam}:sent` })
  await ui.press({ key: `${K.sam}:sent-today` })
  expect(row(files, 'Sam Roe')).toBe('Sam Roe,Acme Corp,Recruiter,recruiter,career fair,2026-10-06,,contacted,2,acme-sma,,,')
  // Setting a contact follow-up for an applied job is refused.
  await ui.press({ key: `${K.sam}:followup` })
  expect(JSON.stringify(await ui.drawn())).toContain('owns this follow-up')
  await ui.unmount()
})

test('the second unanswered message hits the cap: no new follow-up, "stop here", then Mark cold', async ($, on) => {
  const { files } = setup(on)
  const ui = await open($, 'terminal')
  await ui.press({ key: `${K.alex}:sent` })
  await ui.press({ key: `${K.alex}:sent-today` })
  expect(row(files, 'Alex Kim')).toBe('Alex Kim,Initech,Operations Manager,former-manager,internship,2026-10-06,,contacted,2,,,,')
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Stop here: mark them cold')
  // No more "Message sent" or "Draft a message" for this person.
  expect(await ui.find({ key: `${K.alex}:sent` })).toBeUndefined()
  expect(await ui.find({ key: `${K.alex}:draft` })).toBeUndefined()
  await ui.press({ key: `${K.alex}:cold` })
  await ui.press({ key: `${K.alex}:confirm-cold` })
  expect(row(files, 'Alex Kim')).toContain(',2026-10-06,,cold,2,')
  expect(files['history/activity.md']).toContain('Alex Kim (Initech): no reply after 2 messages, now Cold')
  await ui.unmount()
})

test('They replied: status replied, touches back to 0, follow-up cleared', async ($, on) => {
  const { files } = setup(on)
  const ui = await open($, 'terminal')
  await ui.press({ key: `${K.alex}:replied` })
  await ui.press({ key: `${K.alex}:confirm-replied` })
  expect(row(files, 'Alex Kim')).toBe('Alex Kim,Initech,Operations Manager,former-manager,internship,2026-09-28,,replied,0,,,,')
  // "They replied" is not offered for people already past that stage.
  expect(await ui.find({ key: `${K.chris}:replied` })).toBeUndefined()
  await ui.unmount()
})

test('We talked: status talked and a prompt to draft a thank-you; never moves referred backwards', async ($, on) => {
  const { files, filled } = setup(on)
  const ui = await open($, 'desktop')
  await ui.press({ key: `${K.pat}:talked` })
  await ui.press({ key: `${K.pat}:confirm-talked` })
  // The talk is the newest contact: last_contact moves to today (J3-08).
  expect(row(files, 'Pat Lee')).toContain('2026-10-06,,talked,0,')
  expect(filled.join('\n')).toContain('I just talked with Pat Lee (Northwind Traders, Inc.)')
  await ui.press({ key: `${K.dana}:talked` })
  await ui.press({ key: `${K.dana}:confirm-talked` })
  expect(row(files, 'Dana Ortiz')).toContain(',referred,0,')
  await ui.unmount()
})

test('Referred me: status referred and a note to update the linked job row', async ($, on) => {
  const { files } = setup(on)
  const ui = await open($, 'terminal')
  await ui.press({ key: `${K.chris}:referred` })
  await ui.press({ key: `${K.chris}:confirm-referred` })
  expect(row(files, 'Chris Wu')).toBe('Chris Wu,Umbrella Health,Nurse Educator,met-at-event,industry meetup,2026-09-15,,referred,0,umbrella-ne,,,')
  expect(files['history/activity.md']).toContain('Chris Wu (Umbrella Health) referred the user (job: umbrella-ne)')
  await ui.unmount()
})

test('Draft a message fills a request for Claude; Set follow-up date saves', async ($, on) => {
  const { files, filled } = setup(on)
  const ui = await open($, 'terminal')
  await ui.press({ key: `${K.jane}:draft` })
  expect(filled.join('\n')).toContain('/network Draft a first message to Jane Doe, Project Manager at Globex')
  await ui.press({ key: `${K.alex}:draft` })
  expect(filled.join('\n')).toContain('/follow-up Draft a follow-up to Alex Kim')
  await ui.press({ key: `${K.jane}:followup` })
  await ui.press({ key: `${K.jane}:fu-week` })
  expect(row(files, 'Jane Doe')).toContain(',,2026-10-13,to-contact,0,')
  await ui.press({ key: `${K.pat}:followup` })
  await ui.input({ key: `${K.pat}:fu-date`, text: '2026-11-02' })
  expect(row(files, 'Pat Lee')).toContain('2026-09-20,2026-11-02,replied')
  await ui.unmount()
})

test('Excel files (byte-order mark, CRLF, M/D/YY dates) read and save cleanly', async ($, on) => {
  const excel = '﻿' + HEAD + '\r\n' + 'Alex Kim,Initech,Operations Manager,former-manager,internship,9/28/26,10/5/2026,contacted,1,,,,\r\n'
  const { files } = setup(on, excel)
  files['profile/preferences.md'] = 'home_base: Columbus, OH\n'
  const ui = await open($, 'terminal')
  expect(JSON.stringify(await ui.drawn())).toContain('overdue since 2026-10-05')
  await ui.press({ key: `${K.alex}:replied` })
  await ui.press({ key: `${K.alex}:confirm-replied` })
  expect(files['contacts/contacts.csv'].startsWith('﻿')).toBe(true)
  expect(files['contacts/contacts.csv']).toContain('Alex Kim,Initech,Operations Manager,former-manager,internship,2026-09-28,,replied,0')
  await ui.unmount()
})

test('an ambiguous slash date is not guessed, and other rows are left exactly as written', async ($, on) => {
  const csv = HEAD + '\n' + 'Alex Kim,Initech,Operations Manager,former-manager,internship,2026-09-28,06/10/2026,contacted,1,,,,\n'
    + 'Jane Doe,Globex,Project Manager,alum,college alumni list,05/09/2026,,to-contact,0,,,jane.doe@globex.example,\n'
  const { files } = setup(on, csv)
  const ui = await open($, 'terminal')
  expect(JSON.stringify(await ui.drawn())).toContain('date unclear: 06/10/2026')
  await ui.press({ key: `${K.alex}:replied` })
  await ui.press({ key: `${K.alex}:confirm-replied` })
  expect(files['contacts/contacts.csv']).toContain('Jane Doe,Globex,Project Manager,alum,college alumni list,05/09/2026,,to-contact')
  await ui.unmount()
})

test('a contacts file locked by Excel shows a clear message', async ($, on) => {
  setup(on, CSV, { lock: true })
  const ui = await open($, 'terminal')
  await ui.press({ key: `${K.jane}:sent` })
  await ui.press({ key: `${K.jane}:sent-today` })
  expect(JSON.stringify(await ui.drawn())).toContain('open in another app (like Excel)')
  await ui.unmount()
})

test('2000 contacts stay within what a panel can draw: each group is paged, cold ones too', async ($, on) => {
  let csv = HEAD + '\n'
  for (let i = 0; i < 2000; i++) csv += `Person ${i},Company ${i % 300},Manager,alum,event,2026-09-01,,${i % 4 === 0 ? 'cold' : 'contacted'},1,,,person${i}@example.com,\n`
  setup(on, csv)
  const ui = await open($, 'terminal')
  let drawn = JSON.stringify(await ui.drawn())
  expect(drawn.length).toBeLessThan(60000)
  expect(drawn).toContain('Showing 1–10 of 1500')
  expect(drawn.indexOf('"refresh"')).toBeLessThan(drawn.indexOf('Person 1 '))
  await ui.press({ key: 'contacted-next' })
  drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Showing 11–20 of 1500')
  await ui.press({ key: 'cold-toggle' })
  drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Showing 1–10 of 500')
  expect(drawn.length).toBeLessThan(60000)
  await ui.unmount()
})

test('an impossible message date is refused and nothing is saved', async ($, on) => {
  const { files } = setup(on)
  const before = files['contacts/contacts.csv']
  const ui = await open($, 'terminal')
  await ui.press({ key: `${K.jane}:sent` })
  await ui.input({ key: `${K.jane}:sent-date`, text: '2026-09-31' } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('Type a real date')
  expect(files['contacts/contacts.csv']).toBe(before)
  await ui.unmount()
})

test('where panels can\'t show, /contacts says so', async ($, on) => {
  setup(on, CSV, { notPlaced: true })
  const out: any = await $.command.run({ command: 'contacts', args: '' } as never)
  expect(String(out.text)).toContain("can't show in this window")
  expect(JSON.stringify(out.context)).toContain('chat version of the contacts skill')
})

test('the board opens ready for the keyboard, watches its files and refreshes when one changes', async ($, on) => {
  const opens: any[] = []
  const { files } = setup(on, CSV, { opens })
  on('classic.SessionStart', () => ({}) as never)
  on('classic.FileChanged', () => ({}) as never)
  const out: any = await ($ as any).classic.SessionStart({ source: 'startup', cwd: 'C:\\Users\\alex\\job-search' })
  expect(out.watchPaths).toContain('C:\\Users\\alex\\job-search\\contacts\\contacts.csv')
  const ui = await open($, 'terminal')
  expect(opens[0].focus).toBe(true)
  expect(JSON.stringify(await ui.drawn())).toContain('Tab moves between buttons')
  files['contacts/contacts.csv'] += 'Rae Fox,Initech,Engineer,alum,,,,to-contact,0,,,,\n'
  await ($ as any).classic.FileChanged({ file_path: 'C:\\Users\\alex\\job-search\\contacts\\contacts.csv', event: 'change' })
  expect(JSON.stringify(await ui.drawn())).toContain('Rae Fox')
  await ui.unmount()
})

test('accessibility: keys hint in plain text under the first line, buttons named after the person, follow-ups due said in words, Cancel puts the card back', async ($, on) => {
  const { files } = setup(on)
  await $.command.run({ command: 'contacts', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'contacts-board', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toMatch(/"role":"dismiss"\},"press":\{[^}]*\}\}\]\},\{"type":"Text","children":\["Keys: Ctrl\+X then Tab moves into this panel\./)
  expect(drawn).toContain('"label":"We talked… (Jane Doe)"},"press"')
  expect(drawn).toContain('"children":["We talked…"]')
  expect(drawn).toContain('"color":"warning"},"children":["Next follow-up: overdue since 2026-10-05"]')
  await ui.press({ key: `${K.jane}:talked` })
  expect(JSON.stringify(await ui.drawn())).toContain(`${K.jane}:confirm-talked`)
  await ui.press({ key: `${K.jane}:cancel` })
  const back = JSON.stringify(await ui.drawn())
  expect(back).not.toContain(`${K.jane}:confirm-talked`)
  expect(files['contacts/contacts.csv']).toContain('Jane Doe,Globex,Project Manager,alum,college alumni list,,,to-contact,0')
  await ui.unmount()
})

test('"We talked" sets last_contact to today (a later date stays; an unclear one is never rewritten)', async ($, on) => {
  const csv = HEAD + '\n'
    + 'Jane Doe,Globex,Project Manager,alum,college alumni list,2026-09-20,,replied,0,,,jane.doe@globex.example,\n'
    + 'Pat Lee,Initech,Analyst,alum,meetup,03/04/2026,,contacted,1,,,,\n'
  const { files } = setup(on, csv)
  await $.command.run({ command: 'contacts', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'contacts-board', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'jane doe|globex|jane.doe@globex.example:talked' })
  await ui.press({ key: 'jane doe|globex|jane.doe@globex.example:confirm-talked' })
  expect(files['contacts/contacts.csv']).toContain('Jane Doe,Globex,Project Manager,alum,college alumni list,2026-10-06,,talked,0')
  await ui.press({ key: 'pat lee|initech:talked' })
  await ui.press({ key: 'pat lee|initech:confirm-talked' })
  expect(files['contacts/contacts.csv']).toContain('Pat Lee,Initech,Analyst,alum,meetup,03/04/2026,,talked,0')
  await ui.unmount()
})

test('a save is refused when contacts.csv changed in another app since the board read it; the board shows the new version and the next press saves', async ($, on) => {
  const { files } = setup(on)
  const ui = await open($, 'terminal')
  await ui.press({ key: `${K.alex}:replied` })
  // Codex adds a person while the confirm row is open.
  const changed = CSV + 'Robin Fox,Globex,Recruiter,recruiter,career fair,,,to-contact,0,,,,\n'
  files['contacts/contacts.csv'] = changed
  await ui.press({ key: `${K.alex}:confirm-replied` })
  expect(files['contacts/contacts.csv']).toBe(changed)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Your contacts file changed in another app since this panel read it, so nothing was saved')
  expect(drawn).toContain('Robin Fox')
  await ui.press({ key: `${K.alex}:replied` })
  await ui.press({ key: `${K.alex}:confirm-replied` })
  expect(row(files, 'Alex Kim')).toBe('Alex Kim,Initech,Operations Manager,former-manager,internship,2026-09-28,,replied,0,,,,')
  expect(row(files, 'Robin Fox')).toContain('Robin Fox,Globex')
  await ui.unmount()
})

test('Message sent never rewrites an unclear last-contact date, and an older message never moves a clear one back (review J5-12)', async ($, on) => {
  // 03/04/2026 has two readings and nothing settles it (no date_order, no other date in the row).
  const csv = CSV.replace('Jane Doe,Globex,Project Manager,alum,college alumni list,,,to-contact', 'Jane Doe,Globex,Project Manager,alum,college alumni list,03/04/2026,,to-contact')
  const { files } = setup(on, csv)
  const ui = await open($, 'terminal')
  await ui.press({ key: `${K.jane}:sent` })
  await ui.input({ key: `${K.jane}:sent-date`, text: '2026-10-02' })
  expect(row(files, 'Jane Doe')).toContain(',03/04/2026,2026-10-09,contacted,1,')
  expect(files['history/activity.md']).toContain('last contact left as written (03/04/2026, date unclear)')
  // A clear, newer last contact stays; the older message still counts as a touch.
  await ui.press({ key: `${K.alex}:sent` })
  await ui.input({ key: `${K.alex}:sent-date`, text: '2026-09-25' })
  expect(row(files, 'Alex Kim')).toContain(',2026-09-28,')
  await ui.unmount()
})
