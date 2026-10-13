import { expect, mock, test } from 'claude-code/testing'

// Large-data check (P1-17): 2000 contacts against a 1000-row tracker. Numbers are printed as PERF lines.

const HEAD = 'name,company,title,relationship,how_we_met,last_contact,next_followup,status,touches,job,linkedin,email,notes'
const PANE = { component: 'Pane', requestId: 'contacts', props: { title: 'Contacts', isFocused: true, bodyColumns: 100 } } as const
const ST = ['to-contact', 'contacted', 'replied', 'talked', 'referred', 'cold']

test('2000 contacts and a 1000-row tracker: open, draw, page and save stay quick', async ($, on) => {
  let csv = HEAD + '\n'
  for (let i = 0; i < 2000; i++) csv += `Person ${i},"Company ${i % 300}, Inc.",Manager,alum,event,2026-09-01,2026-10-${String((i % 28) + 1).padStart(2, '0')},${ST[i % 6]},${i % 3},job-${i % 1000},,person${i}@example.com,"note ${i}"\n`
  let tracker = 'company,role,status,next_action_date,next_action,folder\n'
  for (let j = 0; j < 1000; j++) tracker += `Company ${j},Role ${j},${j % 2 ? 'applied' : 'interested'},2026-10-14,Follow up,job-${j}\n`
  const files: Record<string, string> = { 'contacts/contacts.csv': csv, 'jobs/tracker.csv': tracker }
  mock.clock(on, { now: new Date(2026, 9, 6, 9, 0).getTime() } as never)
  const rel = (p: string) => p.replace(/^.*\/contacts-board\//, '')
  on('fs.exists', (_$: any, e: any) => ({ value: rel(e.path) in files }) as never)
  on('fs.read', (_$: any, e: any) => ({ value: files[rel(e.path)] ?? '' }) as never)
  on('fs.write', (_$: any, e: any) => { files[rel(e.path)] = e.text; return { value: undefined } as never })
  on('fs.list', () => ({ value: [] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.append', () => ({ deny: 'recorded by the test' }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  let t = Date.now()
  await $.command.run({ command: 'contacts', args: '' } as never)
  const openMs = Date.now() - t
  t = Date.now()
  const ui = await $.ui.mount({ plugin: 'contacts-board', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  const drawMs = Date.now() - t
  expect(drawn.length).toBeLessThan(100000)
  const key = /"key":"([^"]+):replied"/.exec(drawn)?.[1] ?? ''
  expect(key).not.toBe('')
  t = Date.now()
  await ui.press({ key: `${key}:replied` })
  await ui.press({ key: `${key}:confirm-replied` })
  const saveMs = Date.now() - t
  expect(JSON.stringify(await ui.drawn())).toContain('Saved:')
  console.log(`PERF contacts 2000 contacts/1000 tracker rows: open ${openMs} ms, draw ${drawMs} ms, save ${saveMs} ms`)
  expect(openMs + drawMs + saveMs).toBeLessThan(3000)
  await ui.unmount()
})
