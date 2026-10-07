import { expect, test } from 'claude-code/testing'

import { dateOrder, isSamePosting, normCompany, normLink, parseCsv, plain, records, savedNote, toCsv, toIso } from '../hooks/leads'

test('slash dates are read only when the day/month order is certain', async () => {
  expect(toIso('06/10/2026')).toBe('06/10/2026')
  expect(toIso('14/10/2026')).toBe('2026-10-14')
  expect(toIso('10/14/26')).toBe('2026-10-14')
  expect(toIso('7/7/2026')).toBe('2026-07-07')
  expect(toIso('06/10/2026', dateOrder('home_base: Leeds, UK\n'))).toBe('2026-10-06')
  expect(toIso('06/10/2026', dateOrder('home_base: Columbus, OH\n'))).toBe('2026-06-10')
  expect(dateOrder('home_base:\n<!-- city / region -->\n')).toBe('')
  expect(toIso('13/14/2026')).toBe('13/14/2026')
})

test('a written cell never starts with a formula character', async () => {
  expect(plain('=HYPERLINK("http://x.example")')).toBe('HYPERLINK("http://x.example")')
  expect(plain('\t+1 call')).toBe('1 call')
  expect(plain('@SUM(A1)')).toBe('SUM(A1)')
  expect(plain('Senior - remote')).toBe('Senior - remote')
})

test('links match without scheme, www, tracking parameters or trailing slash', async () => {
  expect(normLink('https://www.Jobs.Globex.example/111/?utm_source=linkedin&gh_src=abc')).toBe('jobs.globex.example/111')
  expect(normLink('http://boards.greenhouse.io/acme/jobs/42?gh_jid=42')).toBe('boards.greenhouse.io/acme/jobs/42?gh_jid=42')
  expect(isSamePosting({ company: 'Globex', role: 'X', link: 'https://jobs.globex.example/111' }, { company: 'Globex Holdings', role: 'Y', applyLink: 'jobs.globex.example/111/' })).toBe(true)
})

test('company + role match ignores punctuation and legal suffixes; location and job ID keep openings apart', async () => {
  expect(normCompany('Northwind Traders, Inc.')).toBe('northwind traders')
  const a = { company: 'Northwind Traders, Inc.', role: 'Operations Analyst', location: 'Columbus OH' }
  expect(isSamePosting(a, { company: 'northwind traders', role: 'Operations Analyst', location: '' })).toBe(true)
  expect(isSamePosting(a, { company: 'Northwind Traders', role: 'Operations Analyst', location: 'Denver CO' })).toBe(false)
  expect(isSamePosting({ ...a, jobId: 'R-1' }, { ...a, jobId: 'R-2' })).toBe(false)
  expect(isSamePosting({ ...a, jobId: 'R-1' }, { company: 'Northwind', role: 'OA', jobId: 'r-1' })).toBe(false)
  expect(isSamePosting({ ...a, jobId: 'R-1' }, { company: 'Northwind Traders', role: 'Ops Analyst', jobId: 'r-1' })).toBe(true)
  expect(isSamePosting(a, { company: 'Initech', role: 'Operations Analyst' })).toBe(false)
})

test('CSV round-trips quoted commas and Excel quirks; plain() strips fancy characters', async () => {
  const text = '﻿id,company,why\r\nL-1,"Acme, Inc.","says ""hi"""\r\n'
  const recs = records(text)
  expect(recs[0].company).toBe('Acme, Inc.')
  expect(recs[0].why).toBe('says "hi"')
  expect(toCsv(parseCsv(text.slice(1)))).toBe('id,company,why\nL-1,"Acme, Inc.","says ""hi"""\n')
  expect(plain('R&D – “new grad”')).toBe('R&D - "new grad"')
})

test('the note Claude gets on Save names the job, the lead and add-job', async () => {
  const note = savedNote({ id: 'L-20261005-01', company: 'Northwind Traders, Inc.', role: 'Operations Analyst', location: 'Columbus OH', link: 'https://x.com/1', applyLink: '' })
  expect(note).toBe('[Job Inbox] The user saved Northwind Traders, Inc. - Operations Analyst (Columbus OH) from jobs/leads.csv (lead L-20261005-01, https://x.com/1). Run add-job on it when the user next talks to you (together with any other saved leads); add-job marks the lead added.')
})
