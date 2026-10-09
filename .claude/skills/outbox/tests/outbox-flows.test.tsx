import { expect, mock, test } from 'claude-code/testing'

const PANE = { component: 'Pane', requestId: 'outbox', props: { title: 'Outbox', isFocused: true, bodyColumns: 100 } } as const

function setup(on: any, files: Record<string, string>, opts: { failWrites?: boolean; unreadable?: () => string; duringCall?: () => void } = {}) {
  mock.clock(on, { now: new Date(2026, 9, 6, 9, 0).getTime() } as never)
  mock.store(on, {})
  const rel = (p: string) => p.replace(/^.*\/outbox\/(?=outbox\/|profile\/)|^.*\/skills\/outbox\//, '')
  const calls: any[] = []
  on('fs.exists', (_$: any, e: any) => ({ value: rel(e.path) === 'outbox' || rel(e.path) in files }) as never)
  on('fs.list', () => ({ value: Object.keys(files).filter(f => f.startsWith('outbox/')).map(f => ({ name: f.slice(7), kind: 'file', size: 1, mtimeMs: 0, isLink: false })) }) as never)
  on('fs.read', (_$: any, e: any) => { if (opts.unreadable?.() === rel(e.path)) throw new Error('EBUSY: syncing'); return { value: files[rel(e.path)] ?? '' } as never })
  on('fs.write', (_$: any, e: any) => { if (opts.failWrites) throw new Error('EBUSY'); files[rel(e.path)] = e.text; return { value: undefined } as never })
  on('mcp.call', (_$: any, e: any) => { calls.push(e); opts.duringCall?.(); return { value: { content: [{ type: 'text', text: 'ok' }], isError: false } } as never })
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.append', () => ({ deny: 'recorded by the test' }) as never)  // newer test kits require next() for a value answer; a deny is ignored by the panels
  on('command.register', () => ({ value: undefined }) as never)
  return { files, calls }
}

const DRAFT = '﻿---\r\nchannel: Email\r\nto: Jane Doe <jane@globex.example>\r\nsubject: "Marketing Coordinator (Req #R-123456) follow-up"\r\nstatus: Draft\r\n---\r\nHi Jane,\r\nThanks!\r\n'

test('messy but valid drafts are shown, and a double press sends only one Gmail draft', async ($, on) => {
  const { files, calls } = setup(on, { 'outbox/2026-10-06-jane.md': DRAFT, 'profile/signature.txt': 'Alex Rivera' })
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Marketing Coordinator (Req #R-123456) follow-up')
  await ui.press({ key: '2026-10-06-jane.md:approve' })
  await Promise.all([ui.press({ key: '2026-10-06-jane.md:confirm' }), ui.press({ key: '2026-10-06-jane.md:confirm' }).catch(() => undefined)])
  expect(calls.length).toBe(1)
  expect(JSON.stringify(calls[0])).toContain('jane@globex.example')
  expect(JSON.stringify(calls[0])).toContain('create_draft')
  expect(files['outbox/2026-10-06-jane.md']).toContain('status: in-gmail-drafts')
  const after = JSON.stringify(await ui.drawn())
  expect(after).toContain('Waiting in Gmail')
  expect(after).toContain('2026-10-06-jane.md:marksent')
  await ui.unmount()
})

test('an email with no subject is held back, a broken file is listed, a long LinkedIn note is flagged', async ($, on) => {
  const files = {
    'outbox/a.md': '---\nchannel: email\nto: a@b.co\nsubject:\n---\nHello\n',
    'outbox/b.md': 'no header here',
    'outbox/c.md': '---\nchannel: linkedin\nto: Dave Kim\n---\n' + 'x'.repeat(240) + '\n',
  }
  const { calls } = setup(on, files)
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'desktop', ...PANE } as never)
  await ui.press({ key: 'a.md:approve' })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('no subject')
  expect(calls.length).toBe(0)
  expect(drawn).toContain('Needs fixing')
  expect(drawn).toContain('b.md')
  expect(drawn).toContain('240 / 200 characters')
  await ui.unmount()
})

test('Claude cannot trash, label or archive mail either', async $ => {
  for (const tool of ['mcp__claude_ai_Gmail__trash_thread', 'mcp__claude_ai_Gmail__label_message', 'mcp__claude_ai_Gmail__mark_thread_spam']) {
    const ran = await $.tool.call({ tool } as never)
    expect(ran.deny ?? '').toContain('The user sends and manages their mail themselves')
  }
})

test('drafts with placeholders like [Name] cannot be approved or copied', async ($, on) => {
  const { calls } = setup(on, { 'outbox/p.md': '---\nchannel: email\nto: pat@drummond.com\nsubject: Checking in\n---\nHi [Name],\nJust checking in.\n' })
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'p.md:approve' })
  expect(JSON.stringify(await ui.drawn())).toContain('still has a placeholder ([Name])')
  expect(calls.length).toBe(0)
  await ui.unmount()
})

test('a draft changed in another app is not sent as the old version, and a sent file is never re-marked', async ($, on) => {
  const { files, calls } = setup(on, { 'outbox/2026-10-06-jane.md': DRAFT, 'profile/signature.txt': 'Alex Rivera' })
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: '2026-10-06-jane.md:approve' })
  files['outbox/2026-10-06-jane.md'] = DRAFT.replace('Thanks!', 'Thanks so much!')
  await ui.press({ key: '2026-10-06-jane.md:confirm' })
  expect(calls.length).toBe(0)
  expect(JSON.stringify(await ui.drawn())).toContain('changed since you opened it')
  files['outbox/2026-10-06-jane.md'] = DRAFT.replace('status: Draft', 'status: sent')
  await ui.press({ key: '2026-10-06-jane.md:discard' })
  await ui.press({ key: '2026-10-06-jane.md:confirm-discard' }).catch(() => undefined)
  expect(files['outbox/2026-10-06-jane.md']).toContain('status: sent')
  expect(files['outbox/2026-10-06-jane.md']).not.toContain('discarded')
  await ui.unmount()
})

test('Mark sent refuses a draft whose text changed since the user looked at it', async ($, on) => {
  const waiting = DRAFT.replace('status: Draft', 'status: in-gmail-drafts')
  const { files } = setup(on, { 'outbox/2026-10-06-jane.md': waiting, 'profile/signature.txt': 'Alex Rivera' })
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: '2026-10-06-jane.md:marksent' })
  files['outbox/2026-10-06-jane.md'] = waiting.replace('Thanks!', 'Thanks, and one more thing.')
  await ui.press({ key: '2026-10-06-jane.md:confirm-sent' })
  expect(files['outbox/2026-10-06-jane.md']).toContain('status: in-gmail-drafts')
  expect(files['outbox/2026-10-06-jane.md']).not.toContain('status: sent')
  await ui.unmount()
})

test('if saving the file fails after Gmail succeeded, the card recovers and warns not to approve again', async ($, on) => {
  const { calls } = setup(on, { 'outbox/2026-10-06-jane.md': DRAFT, 'profile/signature.txt': 'Alex Rivera' }, { failWrites: true })
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: '2026-10-06-jane.md:approve' })
  await ui.press({ key: '2026-10-06-jane.md:confirm' })
  expect(calls.length).toBe(1)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain("don't approve it again")
  expect(drawn).not.toContain('Creating the Gmail draft')
  await ui.unmount()
})

const SEND_PREFS = 'outbox_mode: send\n'

test('send mode fails closed when the Outbox setting cannot be read at confirm time', async ($, on) => {
  let syncing = false
  const { calls, files } = setup(on, { 'outbox/2026-10-06-jane.md': DRAFT, 'profile/signature.txt': 'Alex Rivera', 'profile/preferences.md': SEND_PREFS }, { unreadable: () => (syncing ? 'profile/preferences.md' : '') })
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: '2026-10-06-jane.md:approve' })
  syncing = true
  await ui.press({ key: '2026-10-06-jane.md:confirm' })
  expect(calls.length).toBe(0)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Unable to verify your current Outbox setting')
  expect(drawn).toContain('Mode: draft only')
  expect(files['outbox/2026-10-06-jane.md']).toContain('status: Draft')
  await ui.unmount()
})

test('a send recorded while the draft was edited elsewhere is still filed as sent, and is never sent twice', async ($, on) => {
  let edit = false
  const files: Record<string, string> = { 'outbox/2026-10-06-jane.md': DRAFT, 'profile/signature.txt': 'Alex Rivera', 'profile/preferences.md': SEND_PREFS }
  const { calls } = setup(on, files, { duringCall: () => { if (edit) files['outbox/2026-10-06-jane.md'] = DRAFT.replace('Thanks!', 'Thanks, edited in Codex!') } })
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: '2026-10-06-jane.md:approve' })
  edit = true
  await ui.press({ key: '2026-10-06-jane.md:confirm' })
  expect(calls.length).toBe(1)
  expect(JSON.stringify(calls[0])).toContain('send_message')
  expect(files['outbox/2026-10-06-jane.md']).toContain('status: sent')
  expect(files['outbox/2026-10-06-jane.md']).toContain('sent: 2026-10-06')
  // Another app puts the old draft back: the panel still refuses to send it again.
  files['outbox/2026-10-06-jane.md'] = DRAFT
  await ui.press({ key: 'refresh' })
  await ui.press({ key: '2026-10-06-jane.md:approve' }).catch(() => undefined)
  await ui.press({ key: '2026-10-06-jane.md:confirm' }).catch(() => undefined)
  expect(calls.length).toBe(1)
  await ui.unmount()
})

test('if the file cannot be updated after a send, the draft cannot be sent again', async ($, on) => {
  const { calls } = setup(on, { 'outbox/2026-10-06-jane.md': DRAFT, 'profile/signature.txt': 'Alex Rivera', 'profile/preferences.md': SEND_PREFS }, { failWrites: true })
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: '2026-10-06-jane.md:approve' })
  await ui.press({ key: '2026-10-06-jane.md:confirm' })
  expect(calls.length).toBe(1)
  expect(JSON.stringify(await ui.drawn())).toContain("don't approve it again")
  await ui.press({ key: '2026-10-06-jane.md:approve' })
  await ui.press({ key: '2026-10-06-jane.md:confirm' }).catch(() => undefined)
  expect(calls.length).toBe(1)
  expect(JSON.stringify(await ui.drawn())).toContain('already sent from the Outbox')
  await ui.unmount()
})

test('the example signature is never added to a real email', async ($, on) => {
  const { calls } = setup(on, { 'outbox/2026-10-06-jane.md': DRAFT, 'profile/signature.example.txt': 'Your Name\n(555) 555-0100 | linkedin.com/in/your-name' })
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await ui.drawn())).toContain("Your signature isn't set up")
  await ui.press({ key: '2026-10-06-jane.md:approve' })
  await ui.press({ key: '2026-10-06-jane.md:confirm' })
  expect(calls.length).toBe(1)
  expect(JSON.stringify(calls[0])).not.toContain('555')
  expect(JSON.stringify(calls[0])).not.toContain('Your Name')
  await ui.unmount()
})

test('no pop-up at session start, and Mark sent adds the panel line to history/activity.md', async ($, on) => {
  const { files } = setup(on, { 'outbox/2026-10-06-jane.md': DRAFT })
  const toasts: string[] = []
  on('ui.toast', (_$: any, e: any) => { toasts.push(e.text); return { value: undefined } as never })
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true } as never)
  expect(toasts).toEqual([])
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: '2026-10-06-jane.md:marksent' })
  await ui.press({ key: '2026-10-06-jane.md:confirm-sent' })
  expect(files['outbox/2026-10-06-jane.md']).toContain('sent: 2026-10-06')
  expect(files['history/activity.md']).toContain('- 2026-10-06 09:00 · Outbox panel (Claude) · Marketing Coordinator (Req #R-123456) follow-up: sent')
  await ui.unmount()
})
