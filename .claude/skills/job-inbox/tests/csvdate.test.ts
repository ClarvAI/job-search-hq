import { expect, test } from 'claude-code/testing'

// The same test file sits next to every copy of csvdate.ts (Pipeline, Contacts, Apply Kit, Job Inbox,
// Due Alerts), so all five copies are held to the same rules.
import { activityLine, addDays, alsoOf, colOf, csvTrouble, dateOrder, isExcelLock, isIso, jobKey, orderFor, pageOf, parseCsv, plain, readCsv, rowKept, rowOrder, toCsv, toIso } from '../hooks/csvdate'

test('a quote mark only opens a quoted cell at the start of the cell', async () => {
  const text = 'company,role,notes\nAcme,Analyst,Said "maybe" on the phone\nGlobex,Planner,"a, b"\nInitech,5" display tech,\n'
  const { rows, problem } = readCsv(text)
  expect(problem).toBe('')
  expect(rows.length).toBe(4)
  expect(rows[1]).toEqual(['Acme', 'Analyst', 'Said "maybe" on the phone'])
  expect(rows[2]).toEqual(['Globex', 'Planner', 'a, b'])
  expect(rows[3]).toEqual(['Initech', '5" display tech', ''])
})

test('a quoted cell that never ends, or a file saved with semicolons, is reported and not trusted', async () => {
  const open = readCsv('company,role,notes\nAcme,Analyst,"started a note\nGlobex,Planner,ok\n')
  expect(open.problem).toBe('open-quote:2')
  expect(csvTrouble(open.problem, 'Your tracker')).toContain('line 2 is never closed')
  const semi = readCsv('﻿company;role;status;next_action_date\nAcme;Analyst;applied;2026-10-14\n')
  expect(semi.problem).toBe('semicolons')
  expect(csvTrouble(semi.problem, 'Your tracker')).toContain('semicolons')
  expect(readCsv('﻿company,role\n').problem).toBe('')
  expect(csvTrouble('', 'x')).toBe('')
})

test('quoted commas, doubled quotes and line breaks round-trip', async () => {
  const rows = [['a', 'b, c', 'say "hi"', 'two\nlines']]
  expect(parseCsv(toCsv(rows))).toEqual(rows)
})

test('plain keeps accented letters and neutralizes formulas', async () => {
  expect(plain('Müller – “Zürich” café…')).toBe('Müller - "Zürich" café...')
  expect(plain('=HYPERLINK("x")')).toBe('HYPERLINK("x")')
  expect(plain('\t+1 call')).toBe('1 call')
  expect(plain('@SUM(A1)')).toBe('SUM(A1)')
})

test('date_order comes only from the preferences line, never from where the user lives', async () => {
  expect(dateOrder('home_base: Columbus, OH\n')).toBe('')
  expect(dateOrder('home_base: Leeds, UK\n')).toBe('')
  expect(dateOrder('date_order: DMY\n')).toBe('dmy')
  expect(dateOrder('- date_order: mdy   <!-- MDY, DMY or YMD -->\n')).toBe('mdy')
  expect(dateOrder('date_order: YMD\n')).toBe('ymd')
  expect(dateOrder('<!--\ndate_order: DMY\n-->\ndate_order:\n')).toBe('')
})

test('dates are read only when their meaning is certain', async () => {
  expect(toIso('2026-10-14')).toBe('2026-10-14')
  expect(toIso('14.10.2026')).toBe('2026-10-14')
  expect(toIso('6.10.26')).toBe('2026-10-06')
  expect(toIso('2026/10/14')).toBe('2026-10-14')
  expect(toIso('14/10/2026')).toBe('2026-10-14')
  expect(toIso('10/14/26')).toBe('2026-10-14')
  expect(toIso('7/7/2026')).toBe('2026-07-07')
  expect(toIso('06/10/2026')).toBe('06/10/2026')
  expect(toIso('06/10/2026', 'dmy')).toBe('2026-10-06')
  expect(toIso('06/10/2026', 'mdy')).toBe('2026-06-10')
  expect(toIso('06/10/2026', 'ymd')).toBe('06/10/2026')
  expect(toIso('13/14/2026')).toBe('13/14/2026')
  expect(toIso('next week')).toBe('next week')
})

test('another date in the same row settles the order; disagreeing rows settle nothing', async () => {
  expect(rowOrder(['Acme', '06/10/2026', '25/09/2026'])).toBe('dmy')
  expect(rowOrder(['Acme', '06/10/2026', '9/25/2026'])).toBe('mdy')
  expect(rowOrder(['25/09/2026', '9/25/2026'])).toBe('')
  expect(orderFor(['06/10/2026', '25/09/2026'], 'mdy')).toBe('dmy')
  expect(orderFor(['06/10/2026'], 'mdy')).toBe('mdy')
  expect(toIso('06/10/2026', orderFor(['06/10/2026', '25/09/2026'], ''))).toBe('2026-10-06')
})

test('a second commitment at the start of the notes is found', async () => {
  expect(alsoOf('Also: Interview 2026-10-12; recruiter is Sam')).toEqual({ text: 'Interview 2026-10-12', date: '2026-10-12' })
  expect(alsoOf('Also: Take-home due 14.10.2026')).toEqual({ text: 'Take-home due 14.10.2026', date: '2026-10-14' })
  expect(alsoOf('Recruiter said: also interview soon')).toBeUndefined()
})

test('Excel lock files are recognized', async () => {
  expect(isExcelLock('~$tracker.csv', 'tracker.csv')).toBe(true)
  expect(isExcelLock('~$acker.csv', 'tracker.csv')).toBe(true)
  expect(isExcelLock('~$leads.csv', 'tracker.csv')).toBe(false)
  expect(isExcelLock('tracker.csv', 'tracker.csv')).toBe(false)
})

test('business days skip weekends', async () => {
  expect(addDays('2026-10-09', 1, true)).toBe('2026-10-12')
  expect(addDays('2026-10-09', 3)).toBe('2026-10-12')
})

test('only real calendar days count as dates', async () => {
  expect(isIso('2026-02-28')).toBe(true)
  expect(isIso('2028-02-29')).toBe(true)
  expect(isIso('2026-02-29')).toBe(false)
  expect(isIso('2026-02-31')).toBe(false)
  expect(isIso('2026-13-01')).toBe(false)
  expect(isIso('2026-1-01')).toBe(false)
  // An impossible date is kept exactly as written (shown as "date unclear"), never turned into another day.
  expect(toIso('2026-02-31')).toBe('2026-02-31')
  expect(toIso('31/02/2026')).toBe('31/02/2026')
  expect(toIso('31.04.2026')).toBe('31.04.2026')
  expect(toIso('30.04.2026')).toBe('2026-04-30')
})

test('row identity, saved-row check, activity line and pages', async () => {
  const header = ['Company', 'role', ' folder ', 'job_id', 'link', 'date_found']
  const row = ['Globex', 'Planner', 'globex-pl', '', '', '']
  const get = (c: string) => row[colOf(header, c)] ?? ''
  expect(colOf(header, 'folder')).toBe(2)
  expect(jobKey(get)).toBe('globex|planner|globex-pl')
  expect(jobKey(c => ({ company: 'Globex', role: 'Planner', date_found: '2026-10-01' } as Record<string, string>)[c] ?? '')).toBe('globex|planner|2026-10-01')
  expect(rowKept('a,b\nx,"y, z"\n', ['x', 'y, z'])).toBe(true)
  expect(rowKept('a,b\nx,y\n', ['x', 'y, z'])).toBe(false)
  expect(activityLine(new Date(2026, 9, 6, 21, 5).getTime(), 'Pipeline panel (Claude)', 'Globex: moved\nto Offer')).toBe('- 2026-10-06 21:05 · Pipeline panel (Claude) · Globex: moved to Offer\n')
  const list = Array.from({ length: 45 }, (_, i) => i)
  expect(pageOf(list, 0, 20)).toEqual({ items: list.slice(0, 20), page: 0, pages: 3, from: 1, to: 20 })
  expect(pageOf(list, 9, 20).page).toBe(2)
  expect(pageOf(list, 9, 20).to).toBe(45)
  expect(pageOf([], 3, 20)).toEqual({ items: [], page: 0, pages: 1, from: 0, to: 0 })
})
