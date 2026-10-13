import { expect, mock, test } from 'claude-code/testing'

// Large-data check (P1-17): a 1000-row tracker. Numbers are printed as PERF lines.

const HEAD = 'company,role,status,next_action_date,next_action,deadline,priority,fit,location,date_found,date_applied,contact,salary_range,source,link,apply_link,job_id,followups,folder,notes'
const PANE = { component: 'Pane', requestId: 'apply-kit', props: { title: 'Apply Kit', isFocused: true, bodyColumns: 100 } } as const

test('a 1000-row tracker: open, draw and Mark applied stay quick', async ($, on) => {
  let csv = HEAD + '\n'
  for (let i = 0; i < 1000; i++) csv += `Company ${i},Analyst ${i},${i % 4 ? 'applied' : 'interested'},2026-10-14,${i === 4 ? 'Review package and submit' : 'Follow up'},,B,3,Denver CO,2026-09-01,,Pat Lee,,Indeed,https://example.com/${i},,R-${i},0,company-${i},\n`
  const files: Record<string, string> = { 'jobs/tracker.csv': csv, 'profile/preferences.md': 'SETUP: done\nname: Alex Rivera\ndate_order: MDY\n', 'profile/master-resume.md': '# Alex Rivera\n' }
  mock.clock(on, { now: new Date(2026, 9, 6, 9, 0).getTime() } as never)
  const rel = (p: string) => p.replace(/^.*\/apply-kit\//, '')
  on('fs.exists', (_$: any, e: any) => ({ value: rel(e.path) in files }) as never)
  on('fs.read', (_$: any, e: any) => ({ value: files[rel(e.path)] ?? '' }) as never)
  on('fs.write', (_$: any, e: any) => { files[rel(e.path)] = e.text; return { value: undefined } as never })
  on('fs.list', () => ({ value: [] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.append', () => ({ deny: 'recorded by the test' }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  let t = Date.now()
  await $.command.run({ command: 'apply-kit', args: '' } as never)
  const openMs = Date.now() - t
  t = Date.now()
  const ui = await $.ui.mount({ plugin: 'apply-kit', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  const drawMs = Date.now() - t
  expect(drawn).toContain('Company 4')
  t = Date.now()
  await ui.press({ key: 'mark-applied' })
  await ui.press({ key: 'confirm-applied' })
  const saveMs = Date.now() - t
  expect(files['jobs/tracker.csv']).toContain('Company 4,Analyst 4,applied,2026-10-15')
  console.log(`PERF apply-kit 1000 tracker rows: open ${openMs} ms, draw ${drawMs} ms, mark applied ${saveMs} ms`)
  expect(openMs + drawMs + saveMs).toBeLessThan(3000)
  await ui.unmount()
})
