import { expect, mock, test } from 'claude-code/testing'

// Large-data check (P1-17): 500 leads against a 1000-row tracker. Numbers are printed as PERF lines.

const HEAD = 'id,found_date,company,role,location,remote,pay,posted,link,apply_link,job_id,source,fit_guess,why,concerns,status,reason,decided_date'
const PANE = { component: 'Pane', requestId: 'job-inbox', props: { title: 'Job Inbox', isFocused: true, bodyColumns: 100 } } as const

test('500 leads and a 1000-row tracker: open, draw and a choice stay quick', async ($, on) => {
  let leads = HEAD + '\n'
  for (let i = 0; i < 500; i++) leads += `L-${i},2026-10-0${(i % 5) + 1},Lead Co ${i % 400},Analyst ${i},Denver CO,hybrid,,,https://leads.example/${i},,,site,${'ABC'[i % 3]},fit ${i},,new,,\n`
  let tracker = 'company,role,status,next_action_date,next_action,link,job_id,folder\n'
  for (let j = 0; j < 1000; j++) tracker += `Company ${j},Role ${j},applied,2026-10-14,Follow up,https://jobs.example/${j},R-${j},job-${j}\n`
  const files: Record<string, string> = { 'jobs/leads.csv': leads, 'jobs/tracker.csv': tracker }
  mock.clock(on, { now: new Date(2026, 9, 6, 9, 0).getTime() } as never)
  const rel = (p: string) => p.replace(/^.*\/job-inbox\//, '')
  on('fs.exists', (_$: any, e: any) => ({ value: rel(e.path) in files }) as never)
  on('fs.read', (_$: any, e: any) => ({ value: files[rel(e.path)] ?? '' }) as never)
  on('fs.write', (_$: any, e: any) => { files[rel(e.path)] = e.text; return { value: undefined } as never })
  on('fs.list', () => ({ value: [] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  let t = Date.now()
  await $.command.run({ command: 'job-inbox', args: '' } as never)
  const openMs = Date.now() - t
  t = Date.now()
  const ui = await $.ui.mount({ plugin: 'job-inbox', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  const drawMs = Date.now() - t
  expect(drawn.length).toBeLessThan(100000)
  const id = /"key":"([^"]+):skip"/.exec(drawn)?.[1] ?? ''
  t = Date.now()
  await ui.press({ key: `${id}:skip` })
  const saveMs = Date.now() - t
  expect(files['jobs/leads.csv']).toContain(',skipped,,2026-10-06')
  console.log(`PERF job-inbox 500 leads/1000 tracker rows: open ${openMs} ms, draw ${drawMs} ms, choice ${saveMs} ms`)
  expect(openMs + drawMs + saveMs).toBeLessThan(3000)
  await ui.unmount()
})
