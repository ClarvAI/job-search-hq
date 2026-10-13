import { expect, mock, test } from 'claude-code/testing'

// Large-data check (P1-17): 1000 tracker rows, 2000 contacts and 300 Outbox drafts read at session start.

test('1000 jobs, 2000 contacts and 300 drafts: the startup check stays quick', async ($, on) => {
  const files: Record<string, string> = { 'profile/preferences.md': 'date_order: MDY\n' }
  let tracker = 'company,role,status,next_action_date,next_action,deadline,folder,notes\n'
  for (let i = 0; i < 1000; i++) tracker += `Company ${i},Role ${i},${i % 2 ? 'applied' : 'interested'},2026-10-${String((i % 28) + 1).padStart(2, '0')},Follow up,,job-${i},\n`
  let contacts = 'name,company,next_followup,status,touches,job\n'
  for (let j = 0; j < 2000; j++) contacts += `Person ${j},Co ${j},2026-10-${String((j % 28) + 1).padStart(2, '0')},contacted,1,job-${j % 1000}\n`
  files['jobs/tracker.csv'] = tracker
  files['contacts/contacts.csv'] = contacts
  for (let d = 0; d < 300; d++) files[`outbox/n-${d}.md`] = `---\nto: p${d}@example.com\nstatus: in-gmail-drafts\nstatus_at: 2026-10-01 09:00\n---\nhi\n`
  const toasts: string[] = []
  mock.clock(on, { now: new Date(2026, 9, 6, 9, 0).getTime() } as never)
  mock.store(on, {})
  const rel = (p: string) => p.replace(/^.*\/due-alerts\//, '')
  on('fs.exists', (_$: any, e: any) => ({ value: rel(e.path) in files || rel(e.path) === 'outbox' }) as never)
  on('fs.read', (_$: any, e: any) => ({ value: files[rel(e.path)] ?? '' }) as never)
  on('fs.list', () => ({ value: Object.keys(files).filter(f => f.startsWith('outbox/')).map(f => ({ name: f.slice(7), kind: 'file' })) }) as never)
  on('ui.toast', (_$: any, e: any) => { toasts.push(e.text); return { value: undefined } as never })
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }) as never)
  on('session.root', () => ({ value: '/project' }) as never)
  const t = Date.now()
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true } as never)
  const ms = Date.now() - t
  expect(toasts[0]).toContain('more. Type /today to see everything.')
  console.log(`PERF due-alerts 1000 jobs/2000 contacts/300 drafts: startup check ${ms} ms`)
  expect(ms).toBeLessThan(3000)
})
