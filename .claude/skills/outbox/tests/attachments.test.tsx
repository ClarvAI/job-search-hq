import { expect, mock, test } from 'claude-code/testing'

// Gmail drafts may carry the checked resume or cover letter PDF from the draft's own job folder.
// Never a -CHECK PDF, never a link, never a file outside jobs/<folder>/, never on a send.

const PANE = { component: 'Pane', requestId: 'outbox', props: { title: 'Outbox', isFocused: true, bodyColumns: 100 } } as const
const ROOT = '/ws'
// A small stand-in for a PDF's bytes: "%PDF-1.7" and some padding, in base64.
const PDF64 = 'JVBERi0xLjcK' + 'A'.repeat(64)

type Entry = { size: number; mtimeMs: number; kind?: string; isLink?: boolean; real?: string; base64?: string }

function setup(on: any, files: Record<string, string>, folder: Record<string, Entry>, opts: { store?: Record<string, unknown>; view?: string; dirReal?: string } = {}) {
  mock.clock(on, { now: new Date(2026, 9, 6, 9, 0).getTime() } as never)
  mock.store(on, opts.store ?? {})
  const rel = (p: string) => p.replace(/^.*\/skills\/outbox\/?/, '')
  const calls: any[] = []
  const reads: string[] = []
  const DIR = 'jobs/acme-ops'
  on('fs.exists', (_$: any, e: any) => ({ value: rel(e.path) === 'outbox' || rel(e.path) in files }) as never)
  on('fs.list', (_$: any, e: any) => {
    const r = rel(e.path)
    if (r === 'outbox') return { value: Object.keys(files).filter(f => f.startsWith('outbox/')).map(f => ({ name: f.slice(7), kind: 'file', size: 1, mtimeMs: 0, isLink: false })) } as never
    if (r === DIR) return { value: Object.entries(folder).map(([name, f]) => ({ name, kind: f.kind ?? 'file', size: f.size, mtimeMs: f.mtimeMs, isLink: f.isLink ?? false })) } as never
    throw new Error('ENOENT')
  })
  on('fs.stat', (_$: any, e: any) => {
    const r = rel(e.path)
    if (r === '' || r === '.') return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false, realPath: ROOT } } as never
    if (r === DIR) return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false, realPath: opts.dirReal ?? `${ROOT}/${DIR}` } } as never
    const name = r.startsWith(`${DIR}/`) ? r.slice(DIR.length + 1) : ''
    const f = folder[name]
    if (!f) throw new Error('ENOENT')
    return { value: { kind: f.kind === 'other' ? 'file' : 'file', size: f.size, mtimeMs: f.mtimeMs, isLink: f.isLink ?? false, realPath: f.real ?? `${ROOT}/${DIR}/${name}` } } as never
  })
  on('fs.read', (_$: any, e: any) => {
    const r = rel(e.path)
    if (e.as === 'bytes') {
      reads.push(r)
      const f = folder[r.slice(DIR.length + 1)]
      if (!f) throw new Error('ENOENT')
      return { value: { base64: f.base64 ?? PDF64 } } as never
    }
    return { value: files[r] ?? '' } as never
  })
  on('fs.write', (_$: any, e: any) => { files[rel(e.path)] = e.text; return { value: undefined } as never })
  on('mcp.call', (_$: any, e: any) => {
    calls.push(e)
    const view = opts.view ?? 'https://mail.google.com/mail/u/0/#drafts?compose=abc123'
    return { value: { content: [{ type: 'text', text: JSON.stringify({ id: 'r-1', threadId: 't-1', viewUrl: view }) }], isError: false } } as never
  })
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.root', () => ({ value: ROOT }) as never)
  on('tool.list', () => ({ value: ['mcp__claude_ai_Gmail__create_draft', 'mcp__claude_ai_Gmail__send_message'].map(name => ({ name, description: '', mcp: true })) }) as never)
  on('session.append', () => ({ deny: 'recorded by the test' }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  return { files, calls, reads, folder }
}

const draft = (body: string, extra = '') => `---\nchannel: email\nto: pat@globex.example\nsubject: Referral\njob: acme-ops\n${extra}status: draft\n---\n${body}\n`
const RESUME = 'Alex-Rivera-Resume-Acme.pdf'
const LETTER = 'Alex-Rivera-Cover-Letter-Acme.pdf'

async function open($: any) {
  await $.command.run({ command: 'outbox', args: '' } as never)
  return $.ui.mount({ plugin: 'outbox', surface: 'terminal', ...PANE } as never)
}

test('the checked resume PDF is shown before the draft is made, then attached, and "Open in Gmail" is offered', async ($, on) => {
  const { calls, files } = setup(on, { 'outbox/a.md': draft('Hi Pat, my resume is attached. Thanks!'), 'profile/signature.txt': 'Alex Rivera' },
    { [RESUME]: { size: 84000, mtimeMs: 2000 }, 'resume.html': { size: 9000, mtimeMs: 1000 }, 'Alex-Rivera-Resume-Acme-CHECK.pdf': { size: 84000, mtimeMs: 3000 } })
  const ui = await open($)
  await ui.press({ key: 'a.md:approve' })
  const confirm = JSON.stringify(await ui.drawn())
  expect(confirm).toContain(`It will attach ${RESUME} (82 KB) from jobs/acme-ops.`)
  expect(confirm).not.toContain('CHECK')
  await ui.press({ key: 'a.md:confirm' })
  expect(calls.length).toBe(1)
  expect(calls[0].tool).toBe('create_draft')
  const att = calls[0].args.attachments
  expect(att.length).toBe(1)
  expect(att[0]).toEqual({ filename: RESUME, mimeType: 'application/pdf', content: PDF64 })
  const after = JSON.stringify(await ui.drawn())
  expect(after).toContain(`Attached: ${RESUME}.`)
  expect(after).toContain('"href":"https://mail.google.com/mail/u/0/#drafts?compose=abc123","label":"Open in Gmail"')
  expect(files['outbox/a.md']).toContain('status: in-gmail-drafts')
  await ui.unmount()
})

test('a resume and a cover letter can both go; the attach: header names exact files', async ($, on) => {
  const { calls } = setup(on, { 'outbox/a.md': draft('Attached are my resume and cover letter.'), 'outbox/b.md': draft('Please find the file attached.', `attach: ${LETTER}\n`), 'profile/signature.txt': 'Alex Rivera' },
    { [RESUME]: { size: 84000, mtimeMs: 2000 }, [LETTER]: { size: 40000, mtimeMs: 2000 } })
  const ui = await open($)
  await ui.press({ key: 'a.md:approve' })
  expect(JSON.stringify(await ui.drawn())).toContain(`It will attach ${RESUME} (82 KB) and ${LETTER} (39 KB)`)
  await ui.press({ key: 'a.md:confirm' })
  expect(calls[0].args.attachments.map((a: any) => a.filename)).toEqual([RESUME, LETTER])
  await ui.press({ key: 'b.md:approve' })
  await ui.press({ key: 'b.md:confirm' })
  expect(calls[1].args.attachments.map((a: any) => a.filename)).toEqual([LETTER])
  await ui.unmount()
})

test('only a -CHECK PDF, no job folder, or a file name that leaves the folder: the draft is made without it and the panel says what to attach', async ($, on) => {
  const { calls } = setup(on, {
    'outbox/a.md': draft('My resume is attached.'),
    'outbox/b.md': '---\nchannel: email\nto: pat@globex.example\nsubject: Hi\nstatus: draft\n---\nMy resume is attached.\n',
    'outbox/c.md': draft('The file is attached.', 'attach: ../../profile/master-resume.pdf\n'),
    'outbox/d.md': draft('The file is attached.', 'attach: Alex-Rivera-Resume-Acme-CHECK.pdf\n'),
    'profile/signature.txt': 'Alex Rivera',
  }, { 'Alex-Rivera-Resume-Acme-CHECK.pdf': { size: 84000, mtimeMs: 3000 } })
  const ui = await open($)
  const expectNone = async (file: string, words: string) => {
    await ui.press({ key: `${file}:approve` })
    const confirm = JSON.stringify(await ui.drawn())
    expect(confirm).toContain(words)
    expect(confirm).toContain('The draft will be made without it: attach the file in Gmail before you send.')
    await ui.press({ key: `${file}:confirm` })
    const last = calls[calls.length - 1]
    expect(last.tool).toBe('create_draft')
    expect(last.args.attachments).toBeUndefined()
    expect(JSON.stringify(await ui.drawn())).toContain('Not attached:')
  }
  await expectNone('a.md', "there's no finished resume PDF in jobs/acme-ops yet")
  await expectNone('b.md', "the draft doesn't say which job folder the file is in")
  await expectNone('c.md', "isn't a PDF file name in jobs/acme-ops")
  await expectNone('d.md', 'is a check copy that hasn\'t passed its checks')
  expect(calls.length).toBe(4)
  await ui.unmount()
})

test('a link, a file that lands outside the folder, a file that is too big, empty, out of date, not a PDF, or ambiguous is never attached', async ($, on) => {
  const big = 'Alex-Rivera-Resume-Big.pdf'
  const { calls, reads } = setup(on, {
    'outbox/a.md': draft('Attached.', 'attach: Linked.pdf\n'),
    'outbox/b.md': draft('Attached.', 'attach: Elsewhere.pdf\n'),
    'outbox/c.md': draft('Attached.', `attach: ${big}\n`),
    'outbox/d.md': draft('Attached.', 'attach: Tiny.pdf\n'),
    'outbox/e.md': draft('Attached.', 'attach: NotPdf.pdf\n'),
    'outbox/f.md': draft('My cover letter is attached.'),
    'outbox/g.md': draft('My resume is attached.'),
    'profile/signature.txt': 'Alex Rivera',
  }, {
    'Linked.pdf': { size: 9000, mtimeMs: 1, kind: 'other', isLink: true },
    'Elsewhere.pdf': { size: 9000, mtimeMs: 1, real: '/Users/alex/Documents/Elsewhere.pdf' },
    [big]: { size: 5 * 1024 * 1024, mtimeMs: 1 },
    'Tiny.pdf': { size: 100, mtimeMs: 1 },
    'NotPdf.pdf': { size: 9000, mtimeMs: 1, base64: 'PGh0bWw+' },
    [LETTER]: { size: 9000, mtimeMs: 1 },
    'cover-letter.html': { size: 9000, mtimeMs: 5 },
    [RESUME]: { size: 9000, mtimeMs: 1 },
    'Alex-Rivera-Resume-Acme-v2.pdf': { size: 9000, mtimeMs: 1 },
  })
  const ui = await open($)
  const cases: Array<[string, string]> = [
    ['a.md', 'Linked.pdf is a link or not a plain file'],
    ['b.md', "Elsewhere.pdf isn't a plain file inside jobs/acme-ops"],
    ['c.md', `${big} is 5.0 MB, too big to attach from here (4 MB at most)`],
    ['d.md', 'Tiny.pdf looks empty or broken'],
    ['f.md', `${LETTER} is older than your latest cover letter (cover-letter.html)`],
    ['g.md', "there's more than one resume PDF in jobs/acme-ops"],
  ]
  for (const [file, words] of cases) {
    await ui.press({ key: `${file}:approve` })
    expect(JSON.stringify(await ui.drawn())).toContain(words)
    await ui.press({ key: `${file}:confirm` })
    expect(calls[calls.length - 1].args.attachments).toBeUndefined()
  }
  // Passes the checks on size and place, but its bytes are not a PDF.
  await ui.press({ key: 'e.md:approve' })
  expect(JSON.stringify(await ui.drawn())).toContain('It will attach NotPdf.pdf')
  await ui.press({ key: 'e.md:confirm' })
  expect(calls[calls.length - 1].args.attachments).toBeUndefined()
  expect(JSON.stringify(await ui.drawn())).toContain("NotPdf.pdf couldn't be read as a PDF, so it wasn't attached")
  expect(reads).toEqual(['jobs/acme-ops/NotPdf.pdf'])
  await ui.unmount()
})

test('a job folder that is a link to somewhere else is never read from', async ($, on) => {
  const { calls, reads } = setup(on, { 'outbox/a.md': draft('My resume is attached.'), 'profile/signature.txt': 'Alex Rivera' },
    { [RESUME]: { size: 84000, mtimeMs: 2000, real: '/Users/alex/Private/acme-ops/' + RESUME } }, { dirReal: '/Users/alex/Private/acme-ops' })
  const ui = await open($)
  await ui.press({ key: 'a.md:approve' })
  expect(JSON.stringify(await ui.drawn())).toContain(`${RESUME} isn't a plain file inside jobs/acme-ops`)
  await ui.press({ key: 'a.md:confirm' })
  expect(calls[0].args.attachments).toBeUndefined()
  expect(reads).toEqual([])
  await ui.unmount()
})

test('a file that changed after the user saw it is not attached, and the panel says so', async ($, on) => {
  const { calls, folder } = setup(on, { 'outbox/a.md': draft('My resume is attached.'), 'profile/signature.txt': 'Alex Rivera' },
    { [RESUME]: { size: 84000, mtimeMs: 2000 } })
  const ui = await open($)
  await ui.press({ key: 'a.md:approve' })
  folder[RESUME] = { size: 91000, mtimeMs: 4000 }
  await ui.press({ key: 'a.md:confirm' })
  expect(calls[0].args.attachments).toBeUndefined()
  expect(JSON.stringify(await ui.drawn())).toContain(`${RESUME} changed or moved after you opened this, so it wasn't attached`)
  await ui.unmount()
})

test('send mode never sends an attachment: the message becomes a Gmail draft with the file, and nothing is sent', async ($, on) => {
  const prefs = 'outbox_mode: send\n'
  const store = { 'send-mode:/ws': { value: 'send', at: 0, mark: 'outbox_mode: send' } }
  const { calls } = setup(on, { 'outbox/a.md': draft('My resume is attached.'), 'outbox/b.md': draft('Thanks for your time.'), 'profile/signature.txt': 'Alex Rivera', 'profile/preferences.md': prefs },
    { [RESUME]: { size: 84000, mtimeMs: 2000 } }, { store })
  const ui = await open($)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('"label":"Create Gmail draft… (Referral)"')
  expect(drawn).toContain('"label":"Send… (Referral)"')
  await ui.press({ key: 'a.md:approve' })
  expect(JSON.stringify(await ui.drawn())).toContain('Create a Gmail draft to pat@globex.example')
  await ui.press({ key: 'a.md:confirm' })
  expect(calls[0].tool).toBe('create_draft')
  expect(calls[0].args.attachments[0].filename).toBe(RESUME)
  expect(calls.some(c => c.tool === 'send_message')).toBe(false)
  await ui.unmount()
})

test('a Gmail answer without a mail.google.com address shows no link', async ($, on) => {
  setup(on, { 'outbox/b.md': draft('Thanks for your time.'), 'profile/signature.txt': 'Alex Rivera' }, {}, { view: 'https://evil.example/phish' })
  const ui = await open($)
  await ui.press({ key: 'b.md:approve' })
  await ui.press({ key: 'b.md:confirm' })
  const after = JSON.stringify(await ui.drawn())
  expect(after).toContain('Gmail draft created for')
  expect(after).not.toContain('Open in Gmail')
  expect(after).not.toContain('evil.example')
  await ui.unmount()
})
