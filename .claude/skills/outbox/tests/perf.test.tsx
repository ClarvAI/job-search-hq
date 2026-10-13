import { expect, mock, test } from 'claude-code/testing'

// Large-data check (P1-17): 300 Outbox drafts. Numbers are printed as PERF lines.

const PANE = { component: 'Pane', requestId: 'outbox', props: { title: 'Outbox', isFocused: true, bodyColumns: 100 } } as const

test('300 drafts: open, draw a page, page on and discard one stay quick', async ($, on) => {
  const files: Record<string, string> = { 'profile/signature.txt': 'Alex Rivera' }
  for (let d = 0; d < 300; d++) files[`outbox/2026-10-${String((d % 28) + 1).padStart(2, '0')}-note-${String(d).padStart(3, '0')}.md`] = `---\nchannel: email\nto: p${d}@example.com\nsubject: Note ${d}\nstatus: ${d % 3 ? 'draft' : 'in-gmail-drafts'}\n---\n${'A paragraph of the message. '.repeat(20)}\n`
  mock.clock(on, { now: new Date(2026, 9, 6, 9, 0).getTime() } as never)
  mock.store(on, {})
  const rel = (p: string) => p.replace(/^.*\/skills\/outbox\//, '')
  on('fs.exists', (_$: any, e: any) => ({ value: rel(e.path) === 'outbox' || rel(e.path) in files }) as never)
  on('fs.list', () => ({ value: Object.keys(files).filter(f => f.startsWith('outbox/')).map(f => ({ name: f.slice(7), kind: 'file', size: 1, mtimeMs: 0, isLink: false })) }) as never)
  on('fs.read', (_$: any, e: any) => ({ value: files[rel(e.path)] ?? '' }) as never)
  on('fs.write', (_$: any, e: any) => { files[rel(e.path)] = e.text; return { value: undefined } as never })
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.root', () => ({ value: '/project' }) as never)
  on('tool.list', () => ({ value: [{ name: 'mcp__claude_ai_Gmail__create_draft', description: '', mcp: true }] }) as never)
  on('session.append', () => ({ deny: 'recorded by the test' }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  let t = Date.now()
  await $.command.run({ command: 'outbox', args: '' } as never)
  const openMs = Date.now() - t
  t = Date.now()
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  const drawMs = Date.now() - t
  expect(drawn.length).toBeLessThan(100000)
  expect(drawn).toContain('Showing 1–8 of 200')
  t = Date.now()
  await ui.press({ key: 'drafts-next' })
  const pageMs = Date.now() - t
  const file = /"key":"([^"]+\.md):discard"/.exec(JSON.stringify(await ui.drawn()))?.[1] ?? ''
  t = Date.now()
  await ui.press({ key: `${file}:discard` })
  await ui.press({ key: `${file}:confirm-discard` })
  const saveMs = Date.now() - t
  expect(files[`outbox/${file}`]).toContain('status: discarded')
  console.log(`PERF outbox 300 drafts: open ${openMs} ms, draw ${drawMs} ms, next page ${pageMs} ms, discard ${saveMs} ms`)
  expect(openMs + drawMs + pageMs + saveMs).toBeLessThan(3000)
  await ui.unmount()
})
