import { expect, mock, test } from 'claude-code/testing'

// Large-data check (P1-17): 1000 tracker rows and 300 Outbox drafts. Opening the board, drawing a page
// and saving one change each stay well under a second on a laptop; the numbers are printed as PERF lines.

const HEAD = 'company,role,status,next_action_date,next_action,deadline,priority,fit,location,date_found,date_applied,contact,salary_range,source,link,apply_link,job_id,followups,folder,notes'
const PANE = { component: 'Pane', requestId: 'pipeline', props: { title: 'Pipeline', isFocused: true, bodyColumns: 100 } } as const
const STATUSES = ['interested', 'applied', 'screening', 'interviewing', 'offer', 'rejected', 'withdrawn']

test('1000 tracker rows and 300 drafts: open, draw, page and save stay quick', async ($, on) => {
  let csv = HEAD + '\n'
  for (let i = 0; i < 1000; i++) csv += `"Company ${i}, Inc.",Analyst ${i},${STATUSES[i % 7]},2026-10-${String((i % 28) + 1).padStart(2, '0')},Follow up,,B,3,Denver CO,2026-09-01,2026-09-02,Pat Lee,,Indeed,https://example.com/${i},,R-${i},0,company-${i},"Also: Interview 2026-11-0${(i % 9) + 1}; note ${i}"\n`
  const files: Record<string, string> = { 'jobs/tracker.csv': csv }
  for (let d = 0; d < 300; d++) files[`outbox/2026-10-${String((d % 28) + 1).padStart(2, '0')}-note-${d}.md`] = `---\nchannel: email\nto: p${d}@example.com\nsubject: Note ${d}\nstatus: ${d % 3 ? 'draft' : 'in-gmail-drafts'}\n---\nHello ${d}\n`
  mock.clock(on, { now: new Date(2026, 9, 6, 9, 0).getTime() } as never)
  const rel = (p: string) => p.replace(/^.*\/pipeline\//, '')
  on('fs.exists', (_$: any, e: any) => ({ value: rel(e.path) in files || rel(e.path) === 'outbox' }) as never)
  on('fs.read', (_$: any, e: any) => ({ value: files[rel(e.path)] ?? '' }) as never)
  on('fs.write', (_$: any, e: any) => { files[rel(e.path)] = e.text; return { value: undefined } as never })
  on('fs.list', (_$: any, e: any) => ({ value: rel(e.path) === 'outbox' ? Object.keys(files).filter(f => f.startsWith('outbox/')).map(f => ({ name: f.slice(7), kind: "file", size: files[f].length, mtimeMs: 1000, isLink: false })) : [] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.append', () => ({ deny: 'recorded by the test' }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  let t = Date.now()
  await $.command.run({ command: 'pipeline', args: '' } as never)
  const openMs = Date.now() - t
  t = Date.now()
  const ui = await $.ui.mount({ plugin: 'pipeline', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  const drawMs = Date.now() - t
  expect(drawn.length).toBeLessThan(100000)
  expect(drawn).toContain('Showing 1–20 of')
  t = Date.now()
  await ui.press({ key: 'active-next' })
  const pageMs = Date.now() - t
  const key = /"key":"([^"]+):done"/.exec(JSON.stringify(await ui.drawn()))?.[1] ?? ''
  const before = files['jobs/tracker.csv']
  t = Date.now()
  await ui.press({ key: `${key}:done` })
  const saveMs = Date.now() - t
  expect(files['jobs/tracker.csv']).not.toBe(before)
  expect(JSON.stringify(await ui.drawn())).toContain('Saved:')
  console.log(`PERF pipeline 1000 rows/300 drafts: open ${openMs} ms, draw ${drawMs} ms, next page ${pageMs} ms, save ${saveMs} ms`)
  expect(openMs + drawMs + pageMs + saveMs).toBeLessThan(3000)
  await ui.unmount()
})
