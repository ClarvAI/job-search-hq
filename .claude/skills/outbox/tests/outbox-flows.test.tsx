import { expect, mock, test } from 'claude-code/testing'

const PANE = { component: 'Pane', requestId: 'outbox', props: { title: 'Outbox', isFocused: true, bodyColumns: 100 } } as const

function setup(on: any, files: Record<string, string>, opts: { failWrites?: boolean; unreadable?: () => string; duringCall?: () => void; store?: Record<string, unknown>; mcpError?: boolean; root?: string; tools?: string[]; notPlaced?: boolean; opens?: any[] } = {}) {
  mock.clock(on, { now: new Date(2026, 9, 6, 9, 0).getTime() } as never)
  mock.store(on, opts.store ?? {})
  const rel = (p: string) => p.replace(/^.*\/outbox\/(?=outbox\/|profile\/)|^.*\/skills\/outbox\//, '')
  const calls: any[] = []
  on('fs.exists', (_$: any, e: any) => ({ value: rel(e.path) === 'outbox' || rel(e.path) in files }) as never)
  on('fs.list', () => ({ value: Object.keys(files).filter(f => f.startsWith('outbox/')).map(f => ({ name: f.slice(7), kind: 'file', size: 1, mtimeMs: 0, isLink: false })) }) as never)
  on('fs.read', (_$: any, e: any) => { if (opts.unreadable?.() === rel(e.path)) throw new Error('EBUSY: syncing'); return { value: files[rel(e.path)] ?? '' } as never })
  on('fs.write', (_$: any, e: any) => { if (opts.failWrites) throw new Error('EBUSY'); files[rel(e.path)] = e.text; return { value: undefined } as never })
  on('mcp.call', (_$: any, e: any) => { calls.push(e); opts.duringCall?.(); if (opts.mcpError) throw new Error('timeout waiting for Gmail'); return { value: { content: [{ type: 'text', text: 'ok' }], isError: false } } as never })
  on('ui.open', (_$: any, e: any) => { opts.opens?.push(e); return { value: opts.notPlaced ? { isPlaced: false, reason: 'no attached surface places panes' } : { isPlaced: true } } as never })
  on('session.root', () => ({ value: opts.root ?? '/project' }) as never)
  on('tool.list', () => ({ value: (opts.tools ?? ['Read', 'mcp__claude_ai_Gmail__create_draft', 'mcp__claude_ai_Gmail__send_message']).map(name => ({ name, description: '', mcp: name.startsWith('mcp__') })) }) as never)
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
// The user turned send mode on in the panel once (remembered in the plugin's store).
// Kept per project folder, with the preferences lines that turned it on.
const SEND_OK = { 'send-mode:/project': { value: 'send', at: 0, mark: 'outbox_mode: send' } }

test('send mode fails closed when the Outbox setting cannot be read at confirm time', async ($, on) => {
  let syncing = false
  const { calls, files } = setup(on, { 'outbox/2026-10-06-jane.md': DRAFT, 'profile/signature.txt': 'Alex Rivera', 'profile/preferences.md': SEND_PREFS }, { unreadable: () => (syncing ? 'profile/preferences.md' : ''), store: SEND_OK })
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
  const { calls } = setup(on, files, { duringCall: () => { if (edit) files['outbox/2026-10-06-jane.md'] = DRAFT.replace('Thanks!', 'Thanks, edited in Codex!') }, store: SEND_OK })
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
  const { calls } = setup(on, { 'outbox/2026-10-06-jane.md': DRAFT, 'profile/signature.txt': 'Alex Rivera', 'profile/preferences.md': SEND_PREFS }, { failWrites: true, store: SEND_OK })
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

test('send mode needs a one-time confirmation in the panel; an example inside a comment never turns it on', async ($, on) => {
  const files: Record<string, string> = { 'outbox/2026-10-06-jane.md': DRAFT, 'profile/signature.txt': 'Alex Rivera', 'profile/preferences.md': '<!-- outbox_mode: send lets the panel send -->\noutbox_mode: draft-only\n' }
  const { calls } = setup(on, files)
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('Mode: draft only')
  files['profile/preferences.md'] = SEND_PREFS
  await ui.press({ key: 'refresh' })
  let drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Mode: draft only')
  expect(drawn).toContain("send mode isn't on yet")
  await ui.press({ key: 'mode-on' })
  await ui.press({ key: 'mode-confirm' })
  drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Mode: send')
  await ui.press({ key: '2026-10-06-jane.md:approve' })
  await ui.press({ key: '2026-10-06-jane.md:confirm' })
  expect(JSON.stringify(calls[0])).toContain('send_message')
  // Switching back to draft-only forgets the confirmation.
  files['profile/preferences.md'] = 'outbox_mode: draft-only\n'
  await ui.press({ key: 'refresh' })
  files['profile/preferences.md'] = SEND_PREFS
  await ui.press({ key: 'refresh' })
  expect(JSON.stringify(await ui.drawn())).toContain("send mode isn't on yet")
  await ui.unmount()
})

test('an uncertain send is never retried by itself, even from a renamed copy, until the user checks Sent', async ($, on) => {
  const files: Record<string, string> = { 'outbox/2026-10-06-jane.md': DRAFT, 'profile/signature.txt': 'Alex Rivera', 'profile/preferences.md': SEND_PREFS }
  const opts = { store: SEND_OK, mcpError: true }
  const { calls } = setup(on, files, opts)
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: '2026-10-06-jane.md:approve' })
  await ui.press({ key: '2026-10-06-jane.md:confirm' })
  expect(calls.length).toBe(1)
  let drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain("couldn't confirm whether it sent")
  expect(drawn).toContain('never confirmed')
  // The same message under another file name is held too.
  files['outbox/2026-10-07-jane-copy.md'] = files['outbox/2026-10-06-jane.md'] ?? ''
  delete files['outbox/2026-10-06-jane.md']
  await ui.press({ key: 'refresh' })
  await ui.press({ key: '2026-10-07-jane-copy.md:approve' })
  expect(JSON.stringify(await ui.drawn())).toContain('was never confirmed')
  expect(calls.length).toBe(1)
  // The user checked Sent and it isn't there: sending is allowed again.
  opts.mcpError = false
  await ui.press({ key: '2026-10-07-jane-copy.md:unstick' })
  await ui.press({ key: '2026-10-07-jane-copy.md:confirm-unstick' })
  await ui.press({ key: '2026-10-07-jane-copy.md:approve' })
  await ui.press({ key: '2026-10-07-jane-copy.md:confirm' })
  expect(calls.length).toBe(2)
  drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('to Jane Doe <jane@globex.example>.')
  await ui.unmount()
})

test('other placeholder styles are caught, the card shows the signature that will be added, and a message with an attachment is never sent from here', async ($, on) => {
  const files: Record<string, string> = {
    'outbox/a.md': '---\nchannel: email\nto: pat@drummond.com\nsubject: Hi\n---\nHi {First name},\nThanks.\n',
    'outbox/b.md': '---\nchannel: email\nto: pat@drummond.com\nsubject: Hi\n---\nHi <Name>, thanks.\n',
    'outbox/c.md': '---\nchannel: email\nto: pat@drummond.com\nsubject: Hi\n---\nHi Pat, I start on ___.\n',
    'outbox/d.md': '---\nchannel: email\nto: pat@drummond.com\nsubject: Referral\n---\nHi Pat, my resume is attached.\n',
    'profile/signature.txt': 'Alex Rivera\n512-867-0142',
    'profile/preferences.md': SEND_PREFS,
  }
  const { calls } = setup(on, files, { store: SEND_OK })
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('Hi Pat, my resume is attached.\\n\\nAlex Rivera\\n512-867-0142')
  await ui.press({ key: 'a.md:approve' })
  expect(JSON.stringify(await ui.drawn())).toContain('placeholder ({First name})')
  await ui.press({ key: 'b.md:approve' })
  expect(JSON.stringify(await ui.drawn())).toContain('placeholder (<Name>)')
  await ui.press({ key: 'c.md:approve' })
  expect(JSON.stringify(await ui.drawn())).toContain('placeholder (___)')
  expect(calls.length).toBe(0)
  // Send mode, but the message mentions an attachment: it goes to Gmail drafts, never out from here.
  expect(JSON.stringify(await ui.drawn())).toContain('The Outbox never sends attachments itself')
  await ui.press({ key: 'd.md:approve' })
  const confirm = JSON.stringify(await ui.drawn())
  expect(confirm).toContain('Create a Gmail draft to pat@drummond.com')
  expect(confirm).toContain("the draft doesn't say which job folder the file is in")
  await ui.press({ key: 'd.md:confirm' })
  expect(calls.length).toBe(1)
  expect(calls[0].tool).toBe('create_draft')
  expect(JSON.stringify(calls[0])).not.toContain('attachments')
  await ui.unmount()
})

test('send mode confirmed in one folder does not count in another, and a new "turned on" note asks again', async ($, on) => {
  const files: Record<string, string> = { 'outbox/2026-10-06-jane.md': DRAFT, 'profile/signature.txt': 'Alex Rivera', 'profile/preferences.md': SEND_PREFS }
  const { calls } = setup(on, files, { store: SEND_OK, root: '/another-copy' })
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  let drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Mode: draft only')
  expect(drawn).toContain("send mode isn't on yet")
  await ui.press({ key: 'mode-on' })
  await ui.press({ key: 'mode-confirm' })
  expect(JSON.stringify(await ui.drawn())).toContain('Mode: send')
  // Turned off and back on while the panel wasn't looking: the dated note changed, so it asks again.
  files['profile/preferences.md'] = SEND_PREFS + '\n## Notes from conversations\n- 2026-10-12: turned send mode on again\n'
  await ui.press({ key: 'refresh' })
  drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Mode: draft only')
  expect(drawn).toContain("send mode isn't on yet")
  await ui.press({ key: '2026-10-06-jane.md:approve' })
  await ui.press({ key: '2026-10-06-jane.md:confirm' })
  expect(JSON.stringify(calls[0])).toContain('create_draft')
  await ui.unmount()
})

test('Gmail that is not connected is named plainly; a Gmail connector under another name is found', async ($, on) => {
  const files: Record<string, string> = { 'outbox/2026-10-06-jane.md': DRAFT, 'profile/signature.txt': 'Alex Rivera' }
  const { calls } = setup(on, files, { tools: ['Read', 'Write'], mcpError: true })
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await ui.drawn())).toContain("Gmail doesn't look connected")
  await ui.press({ key: '2026-10-06-jane.md:approve' })
  await ui.press({ key: '2026-10-06-jane.md:confirm' })
  expect(calls.length).toBe(1)
  expect(JSON.stringify(await ui.drawn())).toContain("Gmail didn't answer, and it doesn't look connected")
  await ui.unmount()
})

test('a Gmail connector with its own name is used for drafts', async ($, on) => {
  const files: Record<string, string> = { 'outbox/2026-10-06-jane.md': DRAFT, 'profile/signature.txt': 'Alex Rivera' }
  const { calls } = setup(on, files, { tools: ['mcp__Gmail_work__create_draft', 'mcp__Gmail_work__search_threads'] })
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await ui.drawn())).not.toContain("doesn't look connected")
  await ui.press({ key: '2026-10-06-jane.md:approve' })
  await ui.press({ key: '2026-10-06-jane.md:confirm' })
  expect(calls[0].server).toBe('Gmail_work')
  await ui.unmount()
})

test('waiting Gmail drafts can be marked sent or recorded as deleted; a draft can be discarded; LinkedIn notes copy', async ($, on) => {
  const files: Record<string, string> = {
    'outbox/a.md': '---\nchannel: email\nto: pat@northwind.example\nsubject: Thanks\nstatus: in-gmail-drafts\n---\nThanks, Pat.\n',
    'outbox/b.md': '---\nchannel: email\nto: dana@contoso.example\nsubject: Hello\nstatus: in-gmail-drafts\n---\nHi Dana.\n',
    'outbox/c.md': '---\nchannel: email\nto: lee@initech.example\nsubject: Quick question\n---\nHi Lee.\n',
    'outbox/d.md': '---\nchannel: linkedin\nkind: connection-note\nto: Sam Roe\n---\nHi Sam, we met at the career fair. Glad to connect.\n',
  }
  setup(on, files)
  const copied: string[] = []
  on('ui.copy', (_$: any, e: any) => { copied.push(e.text); return { value: { isCopied: true } } as never })
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'a.md:marksent' })
  await ui.press({ key: 'a.md:confirm-sent' })
  expect(files['outbox/a.md']).toContain('status: sent')
  expect(files['outbox/a.md']).toContain('sent: 2026-10-06')
  await ui.press({ key: 'b.md:discard' })
  await ui.press({ key: 'b.md:confirm-discard' })
  expect(files['outbox/b.md']).toContain('status: discarded')
  await ui.press({ key: 'c.md:discard' })
  await ui.press({ key: 'c.md:confirm-discard' })
  expect(files['outbox/c.md']).toContain('status: discarded')
  await ui.press({ key: 'd.md:copy' })
  expect(copied[0]).toBe('Hi Sam, we met at the career fair. Glad to connect.')
  expect(JSON.stringify(await ui.drawn())).toContain('Paste it into LinkedIn')
  await ui.unmount()
})

test('a message for another platform (channel: other) copies with wording that names no particular site', async ($, on) => {
  const files: Record<string, string> = {
    'outbox/e.md': '---\nchannel: other\nkind: message\nto: Jordan Lee\n---\nHi Jordan, I found you through our alumni network.\n',
  }
  setup(on, files)
  const copied: string[] = []
  on('ui.copy', (_$: any, e: any) => { copied.push(e.text); return { value: { isCopied: true } } as never })
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  const before = JSON.stringify(await ui.drawn())
  expect(before).toContain('Message to Jordan Lee')
  expect(before).not.toContain('other to')
  await ui.press({ key: 'e.md:copy' })
  expect(copied[0]).toBe('Hi Jordan, I found you through our alumni network.')
  const after = JSON.stringify(await ui.drawn())
  expect(after).toContain('Paste it where you send it')
  expect(after).not.toContain('Paste it into LinkedIn')
  await ui.unmount()
})

test('many drafts are shown a page at a time; where panels can\'t show, /outbox points to the chat', async ($, on) => {
  const files: Record<string, string> = { 'profile/signature.txt': 'Alex Rivera' }
  for (let i = 0; i < 20; i++) files[`outbox/2026-10-${String(i + 10).padStart(2, '0')}-note.md`] = `---\nchannel: email\nto: person${i}@example.com\nsubject: Note ${i}\n---\n${'A long paragraph of text. '.repeat(40)}\n`
  const opens: any[] = []
  setup(on, files, { opens })
  on('classic.SessionStart', () => ({}) as never)
  await $.command.run({ command: 'outbox', args: '' } as never)
  expect(opens[0].focus).toBe(true)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  let drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Showing 1–8 of 20')
  expect(drawn).toContain('Tab moves between buttons')
  expect(drawn).not.toContain('Note 19')
  await ui.press({ key: 'drafts-next' })
  await ui.press({ key: 'drafts-next' })
  drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Note 19')
  expect(drawn).toContain('Showing 17–20 of 20')
  await ui.unmount()
  const start: any = await ($ as any).classic.SessionStart({ source: 'startup', cwd: '/home/alex/job-search' })
  expect(start.watchPaths).toEqual(['/home/alex/job-search/profile/preferences.md', '/home/alex/job-search/profile/signature.txt'])
})

test('where panels can\'t show, /outbox says so and points to the chat', async ($, on) => {
  setup(on, { 'outbox/2026-10-06-jane.md': DRAFT }, { notPlaced: true })
  const out: any = await $.command.run({ command: 'outbox', args: '' } as never)
  expect(String(out.text)).toContain("can't show in this window")
  expect(JSON.stringify(out.context)).toContain('chat version of the outbox skill')
})

test('accessibility: the keys hint and the empty state are plain text, each card\'s buttons are named after the draft, a LinkedIn draft is named in words, and Cancel keeps the panel usable', async ($, on) => {
  const files: Record<string, string> = {
    'outbox/c.md': '---\nchannel: email\nto: lee@initech.example\nsubject: Quick question\n---\nHi Lee.\n',
    'outbox/d.md': '---\nchannel: linkedin\nkind: connection-note\nto: Sam Roe\n---\nHi Sam, glad to connect.\n',
  }
  setup(on, files)
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('{"type":"Text","children":["Keys: Ctrl+X then Tab moves into this panel.')
  // Accessible name = visible words + the draft's name; the drawn text stays short.
  expect(drawn).toContain('"label":"Copy (Quick question)"},"press"')
  expect(drawn).toContain('"label":"Discard… (Quick question)"')
  expect(drawn).toContain('LinkedIn message to Sam Roe')
  expect(drawn).not.toContain('→')
  await ui.press({ key: 'c.md:discard' })
  expect(JSON.stringify(await ui.drawn())).toContain('c.md:confirm-discard')
  await ui.press({ key: 'c.md:cancel' })
  const back = JSON.stringify(await ui.drawn())
  expect(back).not.toContain('c.md:confirm-discard')
  expect(back).toContain('"key":"c.md:discard"')
  expect(files['outbox/c.md']).not.toContain('discarded')
  await ui.unmount()

  for (const f of Object.keys(files)) delete files[f]
  await $.command.run({ command: 'outbox', args: '' } as never)
  const empty = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await empty.drawn())).toContain('{"type":"Text","children":["No drafts waiting.')
  await empty.unmount()
})

test('two Gmail connections and neither configured: nothing is drafted or sent, and the panel says why; one connection is named in the confirmation', async ($, on) => {
  const files: Record<string, string> = { 'outbox/c.md': '---\nchannel: email\nto: lee@initech.example\nsubject: Quick question\n---\nHi Lee.\n', 'profile/signature.txt': 'Alex Rivera' }
  const { calls } = setup(on, files, { tools: ['mcp__Gmail_work__create_draft', 'mcp__Gmail_home__create_draft'] })
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('Needs fixing: more than one Gmail connection is set up (Gmail_work, Gmail_home)')
  await ui.press({ key: 'c.md:approve' })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain("the Outbox won't guess which account to use")
  expect(drawn).not.toContain('c.md:confirm')
  expect(calls.length).toBe(0)
  await ui.unmount()
})

test('one other Gmail connection is used, and the confirmation names it', async ($, on) => {
  const files: Record<string, string> = { 'outbox/c.md': '---\nchannel: email\nto: lee@initech.example\nsubject: Quick question\n---\nHi Lee.\n', 'profile/signature.txt': 'Alex Rivera' }
  const { calls } = setup(on, files, { tools: ['mcp__Gmail_work__create_draft'] })
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'c.md:approve' })
  expect(JSON.stringify(await ui.drawn())).toContain('in your Gmail (connection: Gmail_work)')
  await ui.press({ key: 'c.md:confirm' })
  expect(calls.length).toBe(1)
  expect(JSON.stringify(calls[0])).toContain('Gmail_work')
  await ui.unmount()
})

test('Mark sent asks which day: yesterday is recorded as yesterday, a typed day as that day, a future day is refused', async ($, on) => {
  const files: Record<string, string> = {
    'outbox/a.md': '---\nchannel: email\nto: pat@northwind.example\nsubject: Thanks\nstatus: in-gmail-drafts\n---\nThanks, Pat.\n',
    'outbox/b.md': '---\nchannel: email\nto: dana@contoso.example\nsubject: Hello\nstatus: in-gmail-drafts\n---\nHi Dana.\n',
  }
  setup(on, files)
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'a.md:marksent' })
  expect(JSON.stringify(await ui.drawn())).toContain('Sent today (2026-10-06)')
  await ui.press({ key: 'a.md:confirm-sent-yesterday' })
  expect(files['outbox/a.md']).toContain('sent: 2026-10-05')
  await ui.press({ key: 'b.md:marksent' })
  await ui.input({ key: 'b.md:sent-date', text: '2026-10-09' } as never)
  expect(files['outbox/b.md']).not.toContain('status: sent')
  expect(JSON.stringify(await ui.drawn())).toContain('not a future date')
  await ui.input({ key: 'b.md:sent-date', text: '2026-10-02' } as never)
  expect(files['outbox/b.md']).toContain('sent: 2026-10-02')
  await ui.unmount()
})

test('send receipts are kept per folder: the same message in another folder is not blocked, an old folder-less receipt still blocks', async ($, on) => {
  const prefsSend = 'outbox_mode: send\n- 2026-10-01: user turned on send mode\n'
  const draft = '---\nchannel: email\nto: lee@initech.example\nsubject: Quick question\n---\nHi Lee.\n'
  const mark = 'outbox_mode: send\n- 2026-10-01: user turned on send mode'
  const store: Record<string, unknown> = {
    'send-mode:/other': { value: 'send', at: 1, mark },
    'send-receipt:/project|c.md': { at: '2026-10-05 10:00', to: 'lee@initech.example', subject: 'Quick question', state: 'sent', file: 'c.md' },
  }
  const { calls } = setup(on, { 'outbox/c.md': draft, 'profile/signature.txt': 'Alex Rivera', 'profile/preferences.md': prefsSend }, { store, root: '/other' })
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'c.md:approve' })
  await ui.press({ key: 'c.md:confirm' })
  expect(calls.length).toBe(1)
  await ui.unmount()
})

test('an old receipt saved before receipts were kept per folder still blocks a second send', async ($, on) => {
  const prefsSend = 'outbox_mode: send\n- 2026-10-01: user turned on send mode\n'
  const mark = 'outbox_mode: send\n- 2026-10-01: user turned on send mode'
  const store: Record<string, unknown> = {
    'send-mode:/project': { value: 'send', at: 1, mark },
    'send-receipt:c.md': { at: '2026-10-05 10:00', to: 'lee@initech.example', subject: 'Quick question', state: 'sent', file: 'c.md' },
  }
  const { calls } = setup(on, { 'outbox/c.md': '---\nchannel: email\nto: lee@initech.example\nsubject: Quick question\n---\nHi Lee.\n', 'profile/signature.txt': 'Alex Rivera', 'profile/preferences.md': prefsSend }, { store })
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'c.md:approve' })
  expect(JSON.stringify(await ui.drawn())).toContain('already sent from the Outbox')
  expect(calls.length).toBe(0)
  await ui.unmount()
})

test('quote marks are escaped in the Gmail HTML and a link stops at a quote mark', async ($, on) => {
  const files: Record<string, string> = { 'outbox/q.md': '---\nchannel: email\nto: lee@initech.example\nsubject: Link\n---\nMy portfolio is at "https://alex.example/work" if useful.\n', 'profile/signature.txt': 'Alex Rivera' }
  const { calls } = setup(on, files)
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'q.md:approve' })
  await ui.press({ key: 'q.md:confirm' })
  const html = String(calls[0]?.args?.htmlBody ?? JSON.stringify(calls[0]))
  expect(html).toContain('&quot;<a href="https://alex.example/work">https://alex.example/work</a>&quot;')
  await ui.unmount()
})

test('any change to a draft file since the panel read it (even a header line) refuses Discard, Mark sent and Create Gmail draft until the user looks again', async ($, on) => {
  const { files, calls } = setup(on, { 'outbox/2026-10-06-jane.md': DRAFT, 'profile/signature.txt': 'Alex Rivera' })
  await $.command.run({ command: 'outbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
  const edited = DRAFT.replace('status: Draft', 'job: globex-mc\r\nstatus: Draft')
  await ui.press({ key: '2026-10-06-jane.md:discard' })
  files['outbox/2026-10-06-jane.md'] = edited
  await ui.press({ key: '2026-10-06-jane.md:confirm-discard' })
  expect(files['outbox/2026-10-06-jane.md']).toBe(edited)
  expect(JSON.stringify(await ui.drawn())).toContain('That draft changed or moved since this list was drawn')
  // The list now shows the new version: the same press works.
  await ui.press({ key: '2026-10-06-jane.md:approve' })
  files['outbox/2026-10-06-jane.md'] = edited.replace('job: globex-mc', 'job: globex-mc2')
  await ui.press({ key: '2026-10-06-jane.md:confirm' })
  expect(calls.length).toBe(0)
  expect(JSON.stringify(await ui.drawn())).toContain('changed since you opened it')
  await ui.press({ key: '2026-10-06-jane.md:discard' })
  await ui.press({ key: '2026-10-06-jane.md:confirm-discard' })
  expect(files['outbox/2026-10-06-jane.md']).toContain('status: discarded')
  await ui.unmount()
})
