import { expect, test } from 'claude-code/testing'

// The same test file sits next to every copy of csvdate.ts (Pipeline, Contacts, Apply Kit, Job Inbox,
// Due Alerts), so all five copies are held to the same rules.
import { activityLine, addDays, alsoOf, appendLine, colOf, columnsOf, csvTrouble, dateOrder, fingerprint, isExcelLock, isIso, jobKey, openInExcel, orderFor, pageOf, parseCsv, plain, readCsv, rowKept, rowKey, rowOrder, saveRow, tidyTextDates, toCsv, toIso } from '../hooks/csvdate'
import type { FileIo } from '../hooks/csvdate'

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

// An in-memory folder standing in for the engine's file calls. `onRead` runs before each read (another
// app saving at that moment); `failWrite` makes the write throw (a file held open elsewhere).
function memory(files: Record<string, string>, opts: { onRead?: (n: number) => void; failWrite?: boolean; afterWrite?: () => void } = {}): FileIo {
  let reads = 0
  return {
    exists: async p => p in files,
    read: async p => { opts.onRead?.(++reads); if (!(p in files)) throw new Error('ENOENT'); return files[p] ?? '' },
    write: async (p, t) => { if (opts.failWrite) throw new Error('EBUSY'); files[p] = t; opts.afterWrite?.() },
    list: async d => Object.keys(files).filter(f => f.startsWith(`${d}/`)).map(f => ({ name: f.slice(d.length + 1) })),
  }
}

const SAVE = (seen: string, extra: Partial<Parameters<typeof saveRow>[2]> = {}) => ({
  seen,
  name: 'Your tracker',
  label: 'Your tracker (jobs/tracker.csv)',
  find: (header: string[], rows: string[][]) => rows.find(r => rowKey(header, r, jobKey) === 'globex|planner|globex-pl'),
  edit: (_row: string[], _get: (c: string) => string, set: (c: string, v: string) => void) => { set('status', 'applied'); return 'ok' },
  ...extra,
})

test('fingerprints tell file versions apart', async () => {
  expect(fingerprint('a,b\n')).toBe(fingerprint('a,b\n'))
  expect(fingerprint('a,b\n')).not.toBe(fingerprint('a,c\n'))
  expect(fingerprint('')).not.toBe(fingerprint('\uFEFF'))
})

test('a save changes one row of the version the panel read, keeps the byte-order mark, and logs nothing itself', async () => {
  const csv = '\uFEFFcompany,role,status,folder\nGlobex,Planner,interested,globex-pl\nAcme,Analyst,applied,acme-an\n'
  const files: Record<string, string> = { 'jobs/tracker.csv': csv }
  const out = await saveRow(memory(files), 'jobs/tracker.csv', SAVE(fingerprint(csv)))
  expect(out.ok).toBe(true)
  expect(files['jobs/tracker.csv']).toBe('\uFEFFcompany,role,status,folder\nGlobex,Planner,applied,globex-pl\nAcme,Analyst,applied,acme-an\n')
  expect(Object.keys(files)).toEqual(['jobs/tracker.csv'])
})

test('a save is refused when the file changed since the panel read it, or changes between the last check and the write', async () => {
  const csv = 'company,role,status,folder\nGlobex,Planner,interested,globex-pl\n'
  const seen = fingerprint(csv)
  const files: Record<string, string> = { 'jobs/tracker.csv': csv + 'Initech,Clerk,interested,initech-cl\n' }
  const before = await saveRow(memory(files), 'jobs/tracker.csv', SAVE(seen))
  expect(before).toEqual({ ok: false, why: 'changed', text: 'Your tracker changed in another app since this panel read it, so nothing was saved. The panel now shows the latest version: check it and try again.' })
  expect(files['jobs/tracker.csv']).toContain('Globex,Planner,interested')
  const files2: Record<string, string> = { 'jobs/tracker.csv': csv }
  const racing = memory(files2, { onRead: n => { if (n === 2) files2['jobs/tracker.csv'] = csv + 'Initech,Clerk,interested,initech-cl\n' } })
  const mid = await saveRow(racing, 'jobs/tracker.csv', SAVE(seen))
  expect(mid.ok ? '' : mid.why).toBe('changed')
  expect(files2['jobs/tracker.csv']).toContain('Globex,Planner,interested')
})

test('a damaged file, an Excel lock, a missing row, a refusal, a held file and a lost save each say why and change nothing', async () => {
  const csv = 'company,role,status,folder\nGlobex,Planner,interested,globex-pl\n'
  const semi = 'company;role;status;folder\nGlobex;Planner;interested;globex-pl\n'
  const why = async (files: Record<string, string>, opts: Parameters<typeof memory>[1] = {}, extra: Partial<Parameters<typeof saveRow>[2]> = {}) => {
    const out = await saveRow(memory(files, opts), 'jobs/tracker.csv', SAVE(fingerprint(files['jobs/tracker.csv'] ?? ''), extra))
    return out.ok ? 'ok' : `${out.why}: ${out.text}`
  }
  expect(await why({ 'jobs/tracker.csv': semi })).toContain('damaged: Your tracker (jobs/tracker.csv) was saved with semicolons')
  expect(await why({ 'jobs/tracker.csv': csv, 'jobs/~$tracker.csv': '' })).toContain('excel: Your tracker is open in Excel')
  expect(await why({ 'jobs/tracker.csv': csv.replace('globex-pl', 'other') })).toContain('no-row: That row is no longer in your tracker')
  expect(await why({ 'jobs/tracker.csv': csv }, {}, { edit: () => undefined })).toBe('refused: ')
  expect(await why({ 'jobs/tracker.csv': csv }, { failWrite: true })).toContain('locked: Your tracker is open in another app')
  expect(await why({})).toContain('missing: Your tracker is missing')
  const files: Record<string, string> = { 'jobs/tracker.csv': csv }
  expect(await why(files, { afterWrite: () => { files['jobs/tracker.csv'] = csv } })).toContain('lost: Another app saved your tracker at the same moment')
})

test('an empty contacts file starts from its header; the Excel lock check and the activity log use the same file calls', async () => {
  const files: Record<string, string> = { 'contacts/contacts.csv': '' }
  const out = await saveRow(memory(files), 'contacts/contacts.csv', {
    seen: fingerprint(''), name: 'Your contacts file', label: 'Your contacts file', blank: ['name', 'company'],
    find: (_h, rows) => rows[0], edit: () => 'never',
  })
  expect(out.ok ? '' : out.why).toBe('no-row')
  expect(await openInExcel(memory({ 'jobs/~$acker.csv': '' }), 'jobs/tracker.csv')).toBe(true)
  expect(await openInExcel(memory({ 'jobs/tracker.csv': '' }), 'jobs/tracker.csv')).toBe(false)
  const log: Record<string, string> = {}
  expect(await appendLine(memory(log), 'history/activity.md', '- line one\n')).toBe(true)
  expect(log['history/activity.md']).toBe('# Recent activity\n- line one\n')
  expect(await appendLine(memory(log, { onRead: n => { if (n === 1) log['history/activity.md'] += '- from Codex\n' } }), 'history/activity.md', '- line two\n')).toBe(true)
  expect(log['history/activity.md']).toBe('# Recent activity\n- line one\n- from Codex\n- line two\n')
})
test('columnsOf finds columns like colOf', async () => { const col = columnsOf([' Company ', 'role', 'role']); expect(col('company')).toBe(0); expect(col('role')).toBe(1); expect(col('x')).toBe(-1) })

test('a date inside free text is tidied only when the order is known and needed; an unclear one stays as written', async () => {
  expect(tidyTextDates('Interview 11/12/2026 2pm', 'dmy')).toBe('Interview 2026-12-11 2pm')
  expect(tidyTextDates('Interview 11/12/2026 2pm', 'mdy')).toBe('Interview 2026-11-12 2pm')
  expect(tidyTextDates('Call 3/4 at noon', 'dmy')).toBe('Call Apr 3 at noon')
  expect(tidyTextDates('Interview 11/12/2026', '')).toBe('Interview 11/12/2026')
  // Already certain by itself (a part over 12, both parts equal, dotted, ISO): left alone.
  expect(tidyTextDates('Interview 25/10/2026', 'mdy')).toBe('Interview 25/10/2026')
  expect(tidyTextDates('Interview 3/3/2026', 'dmy')).toBe('Interview 3/3/2026')
  expect(tidyTextDates('Interview 11.12.2026 and 2026-11-12', 'mdy')).toBe('Interview 11.12.2026 and 2026-11-12')
  // Not a real day, or part of a longer number or path: left alone.
  expect(tidyTextDates('Interview 2/30/2026', 'mdy')).toBe('Interview 2/30/2026')
  expect(tidyTextDates('Room 1/2/3/4', 'mdy')).toBe('Room 1/2/3/4')
  expect(tidyTextDates('Two dates 1/2/2026 and 3/4/2026', 'dmy')).toBe('Two dates 2026-02-01 and 2026-04-03')
})

test('two saves to the same file from one panel run one after the other: the second sees the first and is refused, never interleaved (review J5-01)', async () => {
  const csv = 'company,role,status,folder\nGlobex,Planner,interested,globex-pl\nInitech,Clerk,interested,initech-cl\n'
  const files: Record<string, string> = { 'jobs/tracker.csv': csv }
  // A slow disk: every read and write waits a little, so unqueued saves would overlap.
  const slow = memory(files)
  const io: FileIo = { ...slow, read: async p => { await new Promise(r => setTimeout(r, 5)); return slow.read(p) }, write: async (p, t) => { await new Promise(r => setTimeout(r, 5)); return slow.write(p, t) } }
  const initech = SAVE(fingerprint(csv), { find: (header: string[], rows: string[][]) => rows.find(r => rowKey(header, r, jobKey) === 'initech|clerk|initech-cl') })
  const [a, b] = await Promise.all([saveRow(io, 'jobs/tracker.csv', SAVE(fingerprint(csv))), saveRow(io, 'jobs/tracker.csv', initech)])
  expect(a.ok).toBe(true)
  expect(b.ok ? 'ok' : b.why).toBe('changed')
  expect(files['jobs/tracker.csv']).toContain('Globex,Planner,applied')
  expect(files['jobs/tracker.csv']).toContain('Initech,Clerk,interested')
  // Log lines added at the same moment are all kept, in order.
  const lines = ['- a\n', '- b\n', '- c\n']
  await Promise.all(lines.map(l => appendLine(io, 'history/activity.md', l)))
  expect(files['history/activity.md']).toBe('# Recent activity\n- a\n- b\n- c\n')
})
