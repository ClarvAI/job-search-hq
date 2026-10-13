import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AttachFile, AttachPlan, Draft, Notice } from '../types'

// Outbox: Claude writes drafts as files in outbox/; the user reviews them here.
// Only the user's press of a confirm button creates a Gmail draft or sends email.
// Claude's own send/reply/forward/trash/label mail tools are denied below.

const PANE = 'outbox'
const DIR = 'outbox'
const ACTIVITY = 'history/activity.md'
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
const LINKEDIN_NOTE_LIMIT = 200
// Blanks left to fill in: [Name], {First name}, {{name}}, <Company> (an address in angle brackets is
// fine), or a run of underscores.
const PLACEHOLDER = /\[[^\]\n]{1,60}\]|\{\{?[^{}\n]{1,60}\}\}?|<[^<>@:/\n]{1,40}>|_{3,}/
// A message that says it has an attachment never goes out with the panel's Send: it becomes a Gmail
// draft, with the file attached when it can be found safely (below), and the user sends it from Gmail.
const ATTACHMENT = /\battach(?:ed|ment|ing)\b|\benclosed\b/i
// Attachments (Gmail drafts only): a PDF in the draft's own job folder (`job:` header), named in the
// `attach:` header or, failing that, the one finished resume or cover letter PDF there when the text
// mentions it. Never a "-CHECK" PDF (it hasn't passed its checks), never a link, never a file outside
// jobs/<folder>/. One read is at most 4 MiB (the engine's limit for $.fs.read); Gmail takes 25 MB per
// message in all, so 10 MiB in all is well inside it. Anything off: the draft is made without that
// file and the panel says plainly what to attach by hand.
const MAX_ATTACH_BYTES = 4 * 1024 * 1024
const MAX_ATTACH_TOTAL = 10 * 1024 * 1024
const MIN_PDF_BYTES = 3000
const FOLDER_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
// Drafts with a Gmail call in progress (a plain Set: checked and set with no await in between).
const inFlight = new Set<string>()

const drafts = atom({ plugin: 'outbox', key: 'drafts' } as const, [] as Draft[])
const waiting = atom({ plugin: 'outbox', key: 'waiting' } as const, [] as Draft[])
const broken = atom({ plugin: 'outbox', key: 'broken' } as const, [] as string[])
const armed = atom({ plugin: 'outbox', key: 'armed' } as const, '')
const notice = atom({ plugin: 'outbox', key: 'notice' } as const, { text: '', isError: false, link: '' } as Notice)
const attachPlan = atom({ plugin: 'outbox', key: 'attachPlan' } as const, null as AttachPlan | null)
// draft-only (default): approving makes a Gmail draft the user sends themselves.
// send: the user switched this on in profile/preferences.md; approving sends.
const mode = atom({ plugin: 'outbox', key: 'mode' } as const, 'draft-only')
// What profile/preferences.md says. "send" only takes effect once the user turns it on here, once
// (remembered in the plugin's store until the file says draft-only again).
const fileMode = atom({ plugin: 'outbox', key: 'fileMode' } as const, 'draft-only')
// Drafts whose earlier send was never confirmed: the user checks Gmail's Sent folder first.
const unsure = atom({ plugin: 'outbox', key: 'unsure' } as const, [] as string[])
const signature = atom({ plugin: 'outbox', key: 'signature' } as const, '')
const hasSignature = atom({ plugin: 'outbox', key: 'hasSignature' } as const, true)
const sendMark = atom({ plugin: 'outbox', key: 'sendMark' } as const, '')
const gmail = atom({ plugin: 'outbox', key: 'gmail' } as const, 'unknown')
const gmailServer = atom({ plugin: 'outbox', key: 'gmailServer' } as const, '')
const page = atom({ plugin: 'outbox', key: 'page' } as const, 0)
const waitingPage = atom({ plugin: 'outbox', key: 'waitingPage' } as const, 0)
// Cards per page: each card shows a whole message, and a panel draws at most 100,000 characters.
const SHOWN = 8
// The same words, in the same place (right under the panel's first line), in every panel.
const KEYS_HINT = 'Keys: Ctrl+X then Tab moves into this panel. Tab moves between buttons, Enter presses one, Esc goes back to typing.'
// The files whose change matters at once (the send setting and the signature).
const WATCHED = ['profile/preferences.md', 'profile/signature.txt']

function pageOf<T>(list: T[], at: number, size: number): { items: T[]; page: number; pages: number; from: number; to: number } {
  const pages = Math.max(1, Math.ceil(list.length / size))
  const p = Math.min(Math.max(0, Math.floor(at) || 0), pages - 1)
  return { items: list.slice(p * size, p * size + size), page: p, pages, from: list.length === 0 ? 0 : p * size + 1, to: Math.min(list.length, p * size + size) }
}

function clean(raw: string): string {
  return raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/^\s+(?=---)/, '')
}

function unquote(v: string): string {
  const t = v.trim()
  return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")) ? t.slice(1, -1) : t
}

function parse(file: string, raw: string): Draft | undefined {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(clean(raw))
  if (!match) return undefined
  const head: Record<string, string> = {}
  let listKey = ''
  for (const line of (match[1] ?? '').split('\n')) {
    const item = /^\s*-\s+(.*)$/.exec(line)
    if (item && listKey) { head[listKey] = [head[listKey], unquote(item[1] ?? '')].filter(Boolean).join(', '); continue }
    const at = line.indexOf(':')
    if (at < 1) continue
    const key = line.slice(0, at).trim().toLowerCase()
    // Only a spaced-out "  # comment" is a comment, so "Req #R-123" in a subject survives.
    const value = unquote(line.slice(at + 1).replace(/\s{2,}#\s.*$/, ''))
    head[key] = value
    listKey = value === '' ? key : ''
  }
  const get = (k: string) => (head[k] ?? '').trim()
  return {
    file,
    channel: (get('channel') || 'email').toLowerCase(),
    kind: get('kind').toLowerCase(),
    to: get('to'), cc: get('cc'), subject: get('subject'), job: get('job'), contact: get('contact'),
    created: get('created'),
    status: (get('status') || 'draft').toLowerCase(),
    replyTo: get('reply_to'),
    body: (match[2] ?? '').trim(),
    attach: get('attach'),
    sig: hash(raw),
  }
}

function setStatus(raw: string, status: string, stamp: string, sentOn = ''): string {
  const text = clean(raw)
  const end = text.indexOf('\n---', 3)
  if (!text.startsWith('---\n') || end < 0) return raw
  const lines = text.slice(4, end).split('\n').filter(l => !/^(status|status_at|sent)\s*:/i.test(l))
  lines.push(`status: ${status}`, `status_at: ${stamp}`)
  if (status === 'sent') lines.push(`sent: ${sentOn || stamp.slice(0, 10)}`)
  return `---\n${lines.join('\n')}${text.slice(end)}`
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Plain text with a signature, and a matching HTML body: paragraphs on blank
// lines, line breaks kept, links clickable. What Gmail shows looks hand-typed.
function compose(body: string, sig: string): { body: string; htmlBody: string } {
  const plain = sig.trim() === '' || body.includes(sig.trim()) ? body.trim() : `${body.trim()}\n\n${sig.trim()}`
  const html = plain.split(/\n{2,}/).map(p => {
    const inner = escapeHtml(p)
      // A link ends at a space, "<" or a quote mark (escaped above), so the href matches the text.
      .replace(/(https?:\/\/(?:(?!&quot;)[^\s<])+)/g, '<a href="$1">$1</a>')
      .replace(/(^|[\s(])((?:www\.)?linkedin\.com\/in\/(?:(?!&quot;)[^\s<])+)/g, '$1<a href="https://$2">$2</a>')
      .replace(/\n/g, '<br>')
    return `<p style="margin:0 0 12px 0">${inner}</p>`
  }).join('')
  return { body: plain, htmlBody: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#222">${html}</div>` }
}

// Accepts "a@b.com, c@d.com", "Jane Doe <jane@globex.example>", or YAML list items (already joined).
function addresses(list: string): string[] {
  return list.split(/[,;]/).map(s => s.trim()).filter(Boolean).map(s => /<([^>]+)>/.exec(s)?.[1]?.trim() ?? s)
}

// The example signature's made-up name and phone, which must never go out in a real email.
const SAMPLE_SIGNATURE = /\byour name\b|\byour title\b|555-01\d\d|linkedin\.com\/in\/your-name/i

// Send mode is confirmed per project folder (the plugin's store is shared by every folder on this
// computer), and only for the preferences lines that turned it on: a new dated "turned on send mode"
// note, or switching back to draft-only, asks again. The old unscoped key is never trusted.
const OLD_SEND_OK = 'send-mode-confirmed'
async function sendKey($: any): Promise<string> {
  const root: string = await Promise.resolve().then(() => $.session.root()).catch(() => '')
  return `send-mode:${root}`
}
function markOf(prefs: string): string {
  return prefs.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/).map(l => l.trim()).filter(l => /outbox_mode|send mode/i.test(l)).join('\n')
}

// Which connected Gmail server to call: the configured one if it's connected, else the one Gmail
// connector the session has. 'unknown' when the tool list can't be read (then the configured name is used).
async function findGmail($: any, configured: string): Promise<{ server: string; state: string }> {
  let names: string[]
  try { names = ((await $.tool.list()) as Array<{ name: string }>).map(t => String(t.name)) } catch { return { server: configured, state: 'unknown' } }
  const servers = [...new Set(names.map(n => /^mcp__(.+)__create_draft$/.exec(n)?.[1] ?? '').filter(s => /gmail/i.test(s)))]
  const spelled = configured.replace(/[^A-Za-z0-9_-]/g, '_')
  if (servers.includes(spelled)) return { server: configured, state: 'connected' }
  // One other Gmail connection: used, and named in every confirmation. Several: never picked silently.
  if (servers.length === 1) return { server: servers[0] ?? configured, state: 'connected' }
  if (servers.length > 1) return { server: servers.join(', '), state: 'ambiguous' }
  return { server: configured, state: 'missing' }
}

async function settings($: any): Promise<void> {
  let prefs = ''
  try {
    prefs = (await $.fs.exists('profile/preferences.md')) ? await $.fs.read('profile/preferences.md') : ''
  } catch (err) {
    // Can't tell what the user chose: fall back to draft-only, never keep an old "send".
    if ((await read($, mode)) !== 'draft-only') await update($, mode, () => 'draft-only')
    throw err
  }
  // Only a real setting line counts: never an example inside an HTML comment.
  const found = (/^[ \t]*(?:[-*][ \t]+)?outbox_mode:[ \t]*`?([a-z-]+)/im.exec(prefs.replace(/<!--[\s\S]*?-->/g, ''))?.[1] ?? 'draft-only').toLowerCase()
  const inFile = found === 'send' ? 'send' : 'draft-only'
  if ((await read($, fileMode)) !== inFile) await update($, fileMode, () => inFile)
  let confirmed = false
  const key = await sendKey($)
  const lines = markOf(prefs)
  if ((await read($, sendMark)) !== lines) await update($, sendMark, () => lines)
  await Promise.resolve().then(() => $.store.delete(OLD_SEND_OK)).catch(() => undefined)
  if (inFile === 'send') {
    // If the store can't be read, send mode stays off (fail closed).
    const stored = await Promise.resolve().then(() => $.store.get(key)).catch(() => undefined)
    const was = stored && typeof stored === 'object' ? (stored as { value?: string; mark?: string }) : undefined
    confirmed = was?.value === 'send' && was.mark === lines
  } else {
    // Back to draft-only: turning send mode on again later needs a new confirmation here.
    await Promise.resolve().then(() => $.store.delete(key)).catch(() => undefined)
  }
  const value = inFile === 'send' && confirmed ? 'send' : 'draft-only'
  if ((await read($, mode)) !== value) await update($, mode, () => value)
  // Only the user's own signature is ever added; a missing or still-sample one means no signature.
  const own: string = (await $.fs.exists('profile/signature.txt')) ? clean(await $.fs.read('profile/signature.txt')).trim() : ''
  const isUsable = own !== '' && !PLACEHOLDER.test(own) && !SAMPLE_SIGNATURE.test(own)
  const sig = isUsable ? own : ''
  if ((await read($, signature)) !== sig) await update($, signature, () => sig)
  if ((await read($, hasSignature)) !== isUsable) await update($, hasSignature, () => isUsable)
}

// A receipt per sent message in the plugin's own store (outside this folder), written BEFORE Gmail
// is asked to send, under two keys: the file name, and the message itself (recipient, subject and
// text), so a renamed or copied file is caught too. If the file can't be updated afterwards, or the
// app stops mid-send, or Gmail's answer is an error or never comes, the receipt stays: the draft is
// held as "not confirmed" until the user has checked Gmail's Sent folder. It is never retried by itself.
// Keys are per project folder (the store is shared by every folder on this computer). Receipts kept
// before that change, under the old folder-less keys, are still read, so they keep blocking a repeat send.
const receiptKey = (file: string, root = '') => `send-receipt:${root ? `${root}|` : ''}${file}`
const messageKey = (d: { to: string; subject: string; body: string }, root = '') => `send-receipt-msg:${root ? `${root}|` : ''}${hash(`${d.to.trim().toLowerCase()}\n${d.subject.trim()}\n${d.body.trim()}`)}`
async function rootOf($: any): Promise<string> {
  return Promise.resolve().then(() => $.session.root()).then((r: unknown) => String(r ?? ''), () => '')
}
type Receipt = { at: string; to: string; subject: string; state: 'sending' | 'sent' | 'uncertain'; file?: string }

// A short fingerprint of a message (53-bit cyrb53): enough to tell messages apart, not a secret.
function hash(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

async function receiptOf($: any, d: Draft): Promise<Partial<Receipt> | undefined> {
  const root = await rootOf($)
  for (const rt of root ? [root, ''] : ['']) {
    const byFile = await $.store.get(receiptKey(d.file, rt))
    if (byFile && typeof byFile === 'object') {
      const r = byFile as Partial<Receipt>
      if (r.to === d.to && r.subject === d.subject) return r
    }
    const byMessage = await $.store.get(messageKey(d, rt))
    if (byMessage && typeof byMessage === 'object') return byMessage as Partial<Receipt>
  }
  return undefined
}

async function keepReceipt($: any, d: Draft, r: Receipt): Promise<void> {
  const root = await rootOf($)
  await $.store.set(receiptKey(d.file, root), r)
  await $.store.set(messageKey(d, root), r)
}

// '' when this draft may be sent; otherwise why not (it went out already, or a send was never confirmed).
async function sendBlocked($: any, d: Draft): Promise<string> {
  let r: Partial<Receipt> | undefined
  try { r = await receiptOf($, d) } catch {
    return 'Unable to check whether this message was already sent, so nothing was sent. Press Copy and send it from Gmail yourself.'
  }
  if (!r) return ''
  return r.state === 'sent'
    ? `This message was already sent from the Outbox (${r.at ?? 'earlier'}), so it won't be sent again. Press "Mark sent…" to file it.`
    : `A send of this message at ${r.at ?? 'an earlier time'} was never confirmed, so it won't be sent again from here until you check. Look in your Gmail Sent folder: if it's there, press "Mark sent…". If it isn't, press "Not in my Sent folder…".`
}

// Parsed drafts by file name, with the size and time they had when read (a cache: a reload starts it over).
const fileCache = new Map<string, { stamp: string; draft: Draft | undefined }>()

async function scan($: any): Promise<Draft[]> {
  await settings($).catch(() => undefined)
  const found0 = await findGmail($, configuredServer).catch(() => ({ server: configuredServer, state: 'unknown' }))
  if ((await read($, gmail)) !== found0.state) await update($, gmail, () => found0.state)
  if ((await read($, gmailServer)) !== found0.server) await update($, gmailServer, () => found0.server)
  // A card left saying "Sending…" with nothing in flight (e.g. after an error) gets its buttons back.
  const held = await read($, armed)
  if (held.endsWith('|sending') && !inFlight.has(held.slice(0, -'|sending'.length))) await update($, armed, () => '')
  const found: Draft[] = []
  const pending: Draft[] = []
  const bad: string[] = []
  const entries = (await $.fs.exists(DIR)) ? await $.fs.list(DIR) : []
  const names = new Set<string>()
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.md') || entry.name.startsWith('_') || entry.name.toLowerCase() === 'readme.md') continue
    names.add(entry.name)
    // A file is read again only when its size or time changed (the list is polled; hundreds stay quick).
    const stamp = `${entry.size}|${entry.mtimeMs}`
    const known = fileCache.get(entry.name)
    const draft = known && known.stamp === stamp && entry.mtimeMs > 0 ? known.draft : parse(entry.name, await $.fs.read(`${DIR}/${entry.name}`).catch(() => ''))
    fileCache.set(entry.name, { stamp, draft })
    if (!draft) { bad.push(entry.name); continue }
    if (draft.status === 'draft') found.push(draft)
    else if (draft.status === 'in-gmail-drafts') pending.push(draft)
  }
  for (const name of [...fileCache.keys()]) if (!names.has(name)) fileCache.delete(name)
  found.sort((a, b) => a.file.localeCompare(b.file))
  pending.sort((a, b) => a.file.localeCompare(b.file))
  bad.sort()
  const held2: string[] = []
  // Send records are looked up only for drafts that have one (one look at the store's keys, not two to
  // four reads per draft).
  const root = await rootOf($)
  // If the keys can't be listed, every draft is checked the slow way.
  const stored: Set<string> | null = await Promise.resolve().then(() => $.store.keys()).then((k: unknown) => (Array.isArray(k) ? new Set(k.map(String)) : null), () => null)
  for (const d of found) {
    const may = stored === null || [root, ''].some(rt => stored.has(receiptKey(d.file, rt)) || stored.has(messageKey(d, rt)))
    if (!may) continue
    const r = await Promise.resolve().then(() => receiptOf($, d)).catch(() => undefined)
    if (r && r.state !== 'sent') held2.push(d.file)
  }
  if (JSON.stringify(await read($, unsure)) !== JSON.stringify(held2)) await update($, unsure, () => held2)
  if (JSON.stringify(await read($, drafts)) !== JSON.stringify(found)) await update($, drafts, () => found)
  if (JSON.stringify(await read($, waiting)) !== JSON.stringify(pending)) await update($, waiting, () => pending)
  if (JSON.stringify(await read($, broken)) !== JSON.stringify(bad)) await update($, broken, () => bad)
  return found
}

// Moves the keyboard focus onto a button the next drawing shows, after the pressed one went away
// (a confirm row opened or closed, a card left). Refused when the panel doesn't hold the keyboard
// (a mouse press): then nothing happens.
function focusOn($: any, key: string): void {
  void Promise.resolve().then(() => $.ui.focus({ requestId: PANE, key })).catch(() => undefined)
}

// After a card leaves: the first draft's main button, or Refresh when none is left.
async function focusFirst($: any): Promise<void> {
  const first = (await read($, drafts))[0] ?? (await read($, waiting))[0]
  focusOn($, !first ? 'refresh' : first.status === 'in-gmail-drafts' ? `${first.file}:marksent` : first.channel === 'email' ? `${first.file}:approve` : `${first.file}:copy`)
}

async function say($: any, text: string, isError = false, link = ''): Promise<void> {
  await update($, notice, () => ({ text, isError, link }))
}

async function tellClaude($: any, text: string): Promise<void> {
  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } }).catch(() => undefined)
}

// One line in history/activity.md (same format as the other panels), so Codex or a later session sees the change.
// One log line at a time inside this panel, so two quick actions never interleave their read and write (other
// apps still can; the re-read and check below keep their lines).
let logQueue: Promise<unknown> = Promise.resolve()
function logActivity($: any, stamp: string, what: string): Promise<void> {
  const next = logQueue.then(() => logNow($, stamp, what), () => logNow($, stamp, what))
  logQueue = next.then(() => undefined, () => undefined)
  return next
}
async function logNow($: any, stamp: string, what: string): Promise<void> {
  const lineOut = `- ${stamp} · Outbox panel (Claude) · ${what.replace(/[\r\n]+/g, ' ')}\n`
  // Re-read right before the write and check afterwards, so a line another app added meanwhile is kept.
  const readNow = async (): Promise<string> => ((await $.fs.exists(ACTIVITY)) ? String(await $.fs.read(ACTIVITY)) : '# Recent activity\n\n')
  let wrote = false
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const before = await readNow()
      if (wrote && before.includes(lineOut)) return
      if ((await readNow()) !== before) continue
      await $.fs.write(ACTIVITY, before.replace(/\n*$/, '\n') + lineOut)
      wrote = true
      if ((await readNow()).includes(lineOut)) return
    }
  } catch { /* the log is a convenience; the draft file already holds the new status */ }
}

function isRealDay(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) return false
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3])
}

function dayBefore(iso: string): string {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number)
  const t = new Date(y, m - 1, d - 1)
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}`
}

async function stampNow($: any): Promise<string> {
  // Local time, not UTC: an evening send in the user's time zone must not be dated tomorrow.
  const d = new Date(await $.clock.now())
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

// happened: Gmail already did it (sent, or made the Gmail draft), so the file must record that even
// if someone edited the draft meanwhile; it is never left looking like a draft to approve again.
// sentOn: the day the user says they sent it themselves (YYYY-MM-DD); blank means today.
// link: an "Open in Gmail" address to show with the message ('' for none).
async function mark($: any, draft: Draft, status: string, logText: string, paneText: string, happened = false, sentOn = '', link = ''): Promise<void> {
  const path = `${DIR}/${draft.file}`
  const stamp = await stampNow($)
  // Re-read first: the file may have changed in another app since the pane was drawn.
  const current: string = await (async () => ((await $.fs.exists(path)) ? await $.fs.read(path) : ''))().catch(() => '')
  const now = parse(draft.file, current)
  const changed = now !== undefined && (now.body !== draft.body || now.to !== draft.to || now.subject !== draft.subject || now.cc !== draft.cc)
  // Any change to the file since the panel read it (there is no file lock): the user looks again first.
  const touched = now !== undefined && now.sig !== draft.sig
  if (!happened && (!now || now.status === 'sent' || now.status === status || changed || touched)) {
    await update($, armed, () => '')
    await say($, now?.status === 'sent' ? `"${title(draft)}" is already marked sent, so it was left as is.` : 'That draft changed or moved since this list was drawn. Look it over again.', true)
    await scan($)
    return
  }
  const alreadyRecorded = happened && now !== undefined && (now.status === status || now.status === 'sent')
  try {
    if (!now) throw new Error('missing')
    if (!alreadyRecorded) await $.fs.write(path, setStatus(current, status, stamp, sentOn))
  } catch {
    await update($, armed, () => '')
    const what = status === 'in-gmail-drafts' ? 'The Gmail draft was created' : status === 'sent' ? 'It was sent' : 'That worked'
    await say($, `${what}, but I couldn't update the file (it may be open, syncing or moved). Ask Claude to mark it ${status}; don't approve it again.`, true)
    await tellClaude($, `[Outbox] ${logText}, but writing ${path} failed. Set its status to ${status} by hand (and add sent: <date> if sent). Do not create another Gmail draft for it, and never send it again.`)
    await scan($).catch(() => undefined)
    return
  }
  const editedMeanwhile = happened && changed
    ? ` The file's text was edited in another app while it was being ${status === 'sent' ? 'sent' : 'drafted'}; what went to Gmail is the version the user approved in the panel, not the current file text.`
    : ''
  await logActivity($, stamp, `${title(draft)}: ${status === 'sent' ? (sentOn && sentOn !== stamp.slice(0, 10) ? `sent on ${sentOn}` : 'sent') : status === 'discarded' ? 'discarded' : 'Gmail draft created (not sent yet)'}`)
  await update($, armed, () => '')
  await say($, paneText, false, link)
  await scan($)
  const followUp = status === 'sent' && sentOn !== ''
    ? ` The user says they sent it on ${sentOn}: use that date. Update contacts/contacts.csv for the contact(s) named in the draft following the playbook rule "When the user sends someone a message" (never move a replied/talked/referred contact back to contacted), update jobs/tracker.csv if it relates to a job, add a line to history/activity.md for those changes (the panel already logged the send), then move the file to outbox/sent/.`
    : status === 'sent'
    ? ' If it might not have gone out today, ask the user which day they sent it and use that date. Update contacts/contacts.csv for the contact(s) named in the draft following the playbook rule "When the user sends someone a message" (never move a replied/talked/referred contact back to contacted), update jobs/tracker.csv if it relates to a job, add a line to history/activity.md for those changes (the panel already logged the send), then move the file to outbox/sent/.'
    : status === 'discarded' ? ' Move the file to outbox/discarded/.' : ' It is NOT sent yet; do not set follow-up dates until the user marks it sent.'
  const who = [draft.to && `to: ${draft.to}`, draft.contact && `contact: ${draft.contact}`, draft.job && `job: ${draft.job}`].filter(Boolean).join(', ')
  await tellClaude($, `[Outbox] ${logText} (file: ${path}${who ? `; ${who}` : ''}; at ${stamp}). Re-read the file before describing it to the user.${editedMeanwhile}${followUp} A discarded draft can be restored by setting its status back to draft.`)
}

// Claude may draft but never send, reply, forward, trash, label or archive mail. Same rule as the shared
// guard (.claude/hooks/guard.sh): judge the operation after any app-name prefix (gmail_search_emails ->
// search_emails), then allow only reads and draft creation.
const MAIL_DENY = 'The user sends and manages their mail themselves. Save the message as a draft file in outbox/ and tell the user to type /outbox to review it.'
function isBlockedMail(name: string): boolean {
  const last = (name.split('__').pop() ?? name).replace(/^(gmail|google_?mail|outlook_email|outlook_calendar|outlook|google_?calendar|gcal|superhuman|email|mail|calendar)_/i, '')
  // A calendar tool (an Outlook calendar connector too: its name holds "outlook") is not mail: the shared guard's
  // calendar rule judges it (own calendar, no attendees). One that sends, replies to or forwards mail still counts as mail.
  const isCalendar = (/calendar|gcal/i.test(name) || /(^|_)events?(_|$)/i.test(last)) && !/mail|message|reply|forward/i.test(last)
  const isMail = /mail|outlook|superhuman/i.test(name) && !isCalendar
  const readOnly = /^(batch_read|batch_get|search|list|get|read|fetch|find|query|count|lookup|view|show|download)/i.test(last) || /^(create|update)(_or_update)?_?draft/i.test(last)
  return isMail && !readOnly
}

function ambiguousText(servers: string): string {
  return `More than one Gmail connection is set up (${servers}), so nothing was sent or drafted: the Outbox won't guess which account to use. Ask Claude to set the Outbox's Gmail connector name to the one you want, or press Copy and send it yourself.`
}

function title(d: Draft): string {
  if (d.channel === 'email') return d.subject || '(no subject)'
  // Words, not an arrow: a screen reader reads "→" as "right arrow".
  return `${d.channel === 'linkedin' ? 'LinkedIn message' : d.channel} to ${d.to || '(no one named)'}`
}

// ---- Attachments ----

// True when the message says it carries a file (or names one in `attach:`): it is never sent from the
// panel; it becomes a Gmail draft, with the file attached when it can be found safely.
const mentionsAttachment = (d: Draft) => d.attach.trim() !== '' || ATTACHMENT.test(d.body)

const sizeText = (n: number) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

// Where a path really lands, with '/' between folders, or '' when it can't be told (then nothing is attached).
async function realOf($: any, path: string): Promise<{ real: string; isLink: boolean; kind: string }> {
  const st: any = await $.fs.stat(path, { resolve: true }).catch(() => undefined)
  return { real: String(st?.realPath ?? '').replace(/\\/g, '/').replace(/\/+$/, ''), isLink: Boolean(st?.isLink), kind: String(st?.kind ?? '') }
}

// Which files "Create Gmail draft" will attach for this draft, checked before the user sees them.
async function planAttachments($: any, d: Draft): Promise<AttachPlan> {
  const plan: AttachPlan = { file: d.file, isWanted: mentionsAttachment(d), files: [], problems: [] }
  if (!plan.isWanted) return plan
  const folder = d.job.trim()
  if (folder === '' || !FOLDER_NAME.test(folder) || folder.includes('..')) {
    plan.problems.push(folder === '' ? "the draft doesn't say which job folder the file is in" : `"${folder}" isn't a job folder name`)
    return plan
  }
  const dir = `jobs/${folder}`
  let listing: Array<{ name: string; kind: string; size: number; mtimeMs: number; isLink?: boolean }> = []
  try { listing = await $.fs.list(dir) } catch { plan.problems.push(`the job folder ${dir} wasn't found`); return plan }
  const isPdf = (n: string) => /\.pdf$/i.test(n)
  const isCheck = (n: string) => /-check\.pdf$/i.test(n)
  // What to attach: the names in `attach:`, else the finished resume and/or cover letter PDF the text mentions.
  const picks: Array<{ name: string; label: string; source: string }> = []
  const named = d.attach.split(/[,;]/).map(n => n.trim()).filter(Boolean)
  if (named.length > 0) {
    for (const n of named) {
      if (/[\\/]/.test(n) || n.startsWith('.') || !isPdf(n)) plan.problems.push(`${n} isn't a PDF file name in ${dir}`)
      else if (isCheck(n)) plan.problems.push(`${n} is a check copy that hasn't passed its checks (ask Claude to make the PDF again)`)
      else picks.push({ name: n, label: n, source: /-cover-letter-/i.test(n) ? 'cover-letter.html' : /-resume-/i.test(n) ? 'resume.html' : '' })
    }
  } else {
    const kinds = [
      { label: 'resume', test: /\b(?:resume|résumé|cv)\b/i, file: /-resume-[^/]*\.pdf$/i, source: 'resume.html' },
      { label: 'cover letter', test: /\bcover letter\b/i, file: /-cover-letter-[^/]*\.pdf$/i, source: 'cover-letter.html' },
    ].filter(k => k.test.test(d.body))
    if (kinds.length === 0) plan.problems.push("the message doesn't say which file it means (your resume or cover letter)")
    for (const k of kinds) {
      const found = listing.filter(e => e.kind === 'file' && isPdf(e.name) && !isCheck(e.name) && k.file.test(e.name))
      if (found.length === 1) picks.push({ name: found[0]?.name ?? '', label: k.label, source: k.source })
      else if (found.length === 0) plan.problems.push(`there's no finished ${k.label} PDF in ${dir} yet`)
      else plan.problems.push(`there's more than one ${k.label} PDF in ${dir} (${found.map(e => e.name).join(', ')}), so the panel won't guess`)
    }
  }
  if (picks.length === 0) return plan
  const base = await realOf($, '.')
  const dirReal = await realOf($, dir)
  const isInside = base.real !== '' && dirReal.real !== '' && !dirReal.isLink && dirReal.real.toLowerCase().startsWith(`${base.real.toLowerCase()}/jobs/`)
  let total = 0
  for (const pk of picks) {
    const e = listing.find(x => x.name === pk.name)
    const path = `${dir}/${pk.name}`
    if (!e) { plan.problems.push(`${pk.name} isn't in ${dir}`); continue }
    if (e.kind !== 'file' || e.isLink) { plan.problems.push(`${pk.name} is a link or not a plain file, so it isn't attached`); continue }
    const at = await realOf($, path)
    if (!isInside || at.isLink || at.kind !== 'file' || at.real !== `${dirReal.real}/${pk.name}`) { plan.problems.push(`${pk.name} isn't a plain file inside ${dir}, so it isn't attached`); continue }
    if (e.size < MIN_PDF_BYTES) { plan.problems.push(`${pk.name} looks empty or broken (ask Claude to make it again)`); continue }
    if (e.size > MAX_ATTACH_BYTES) { plan.problems.push(`${pk.name} is ${sizeText(e.size)}, too big to attach from here (4 MB at most)`); continue }
    const src = pk.source ? listing.find(x => x.name === pk.source) : undefined
    if (src && src.mtimeMs > e.mtimeMs) { plan.problems.push(`${pk.name} is older than your latest ${pk.label} (${pk.source}), so it may be out of date (ask Claude to rebuild the PDF)`); continue }
    if (total + e.size > MAX_ATTACH_TOTAL) { plan.problems.push(`${pk.name} would make the email too big (10 MB in all at most)`); continue }
    total += e.size
    plan.files.push({ name: pk.name, path, size: e.size, mtimeMs: e.mtimeMs })
  }
  return plan
}

// The confirm row's words about attachments ('' when the message mentions none).
function attachText(plan: AttachPlan | null): string {
  if (!plan || !plan.isWanted) return ''
  const will = plan.files.length > 0 ? `It will attach ${plan.files.map(f => `${f.name} (${sizeText(f.size)})`).join(' and ')} from jobs/${plan.files[0]?.path.split('/')[1] ?? ''}. ` : ''
  const wont = plan.problems.length > 0 ? `This message mentions an attachment, but ${plan.problems.join('; ')}. The draft will be made without it: attach the file in Gmail before you send. ` : ''
  return (will + wont).trim()
}

// Reads the planned files again right before the Gmail call: the same file (name, size, date) as shown,
// a real PDF, within the size limit. What can't be attached now is named, never silently dropped.
async function loadAttachments($: any, d: Draft, shown: AttachPlan | null): Promise<{ list: Array<{ filename: string; mimeType: string; content: string }>; names: string[]; problems: string[] }> {
  const out = { list: [] as Array<{ filename: string; mimeType: string; content: string }>, names: [] as string[], problems: [] as string[] }
  if (!shown || shown.file !== d.file || !shown.isWanted) return out
  out.problems.push(...shown.problems)
  const now = await planAttachments($, d).catch(() => ({ file: d.file, isWanted: true, files: [] as AttachFile[], problems: [] as string[] }))
  for (const f of shown.files) {
    const same = now.files.find(x => x.name === f.name && x.size === f.size && x.mtimeMs === f.mtimeMs)
    if (!same) { out.problems.push(`${f.name} changed or moved after you opened this, so it wasn't attached`); continue }
    const bytes: any = await $.fs.read(same.path, { as: 'bytes' }).catch(() => undefined)
    const b64 = String(bytes?.base64 ?? '')
    // A PDF starts with "%PDF-" ("JVBER" in base64), and is no bigger than what was checked.
    if (!b64.startsWith('JVBER') || Math.floor((b64.replace(/=+$/, '').length * 3) / 4) > MAX_ATTACH_BYTES) { out.problems.push(`${f.name} couldn't be read as a PDF, so it wasn't attached`); continue }
    out.list.push({ filename: f.name, mimeType: 'application/pdf', content: b64 })
    out.names.push(f.name)
  }
  return out
}

// The "Open in Gmail" address Gmail gives for a new draft (only a mail.google.com address is used).
function viewUrlOf(result: any): string {
  const ok = (v: unknown) => (typeof v === 'string' && /^https:\/\/mail\.google\.com\/[^\s"'<>]*$/.test(v) ? v : '')
  const sc = result?.structuredContent
  const found = [ok(sc?.viewUrl), ok(sc?.draft?.viewUrl)]
  for (const c of (result?.content ?? []) as any[]) {
    const text = String(c?.text ?? '')
    try { const j = JSON.parse(text); found.push(ok(j?.viewUrl), ok(j?.draft?.viewUrl)) } catch { /* not JSON */ }
    found.push(ok(/"viewUrl"\s*:\s*"([^"]+)"/.exec(text)?.[1]), ok(/(https:\/\/mail\.google\.com\/[^\s"'<>)\]]+)/.exec(text)?.[1]))
  }
  return found.find(Boolean) ?? ''
}

// The Gmail connector's name from the plugin's settings (gmail_server), used when it is connected.
let configuredServer = 'claude.ai Gmail'

export const register: Register = (on, options) => {
  configuredServer = String((options as Record<string, unknown>).gmail_server || 'claude.ai Gmail')

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'outbox', description: 'Review draft emails and messages, then create Gmail drafts, copy, or discard them' })
    // No toast here: the due-alerts mod is the one pop-up at session start, and the Pipeline band shows the draft count.
    await scan($).catch(() => [])
    // A poll for new draft files (they can't be watched before they exist); the send setting and the
    // signature also refresh at once when they change (classic.FileChanged below).
    $.clock.every(20000, () => void scan($).catch(() => undefined))
    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    const out = await next(e)
    const root = String(e.cwd ?? '').replace(/[\\/]+$/, '')
    if (root === '') return out
    const sep = /^[A-Za-z]:\\/.test(root) ? '\\' : '/'
    return { ...out, watchPaths: [...(out.watchPaths ?? []), ...WATCHED.map(p => root + sep + p.split('/').join(sep))] }
  }).catch(($, e, next) => next(e))

  on('classic.FileChanged', async ($, e, next) => {
    const path = String(e.file_path ?? '').replace(/\\/g, '/')
    if (WATCHED.some(p => path.endsWith(`/${p}`))) await scan($).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'outbox' }, async $ => {
    const found = await scan($)
    await say($, '')
    const opened = await $.ui.open({ id: PANE, title: 'Outbox', focus: true })
    if (!opened.isPlaced) {
      return {
        text: `${found.length === 0 ? 'No drafts waiting.' : `${found.length} ${found.length === 1 ? 'draft' : 'drafts'} to review.`} The Outbox can't show in this window, so ask Claude to "show my outbox" and go through the drafts here in the chat.`,
        context: ['The Outbox panel is not visible in this app or window. If the user asks, use the chat version of the outbox skill (.agents/skills/outbox/SKILL.md).'],
      }
    }
    return {
      text: found.length === 0
        ? 'No drafts waiting. Ask Claude to draft a follow-up or thank-you note.'
        : `Outbox opened: ${found.length} ${found.length === 1 ? 'draft' : 'drafts'} to review.`,
    }
  })

  // Claude may draft but never send, reply, forward, trash, label or archive mail. The user approves from the pane.
  // Same rule as the shared guard (.claude/hooks/guard.sh): judge the operation after any app-name prefix
  // (gmail_search_emails -> search_emails), then allow only reads and draft creation.
  on('tool.call', async ($, e, next) => {
    const name = String(e.tool)
    if (isBlockedMail(name)) return { deny: MAIL_DENY }
    const ran = await next(e)
    if (/^(Write|Edit|MultiEdit)$/.test(name) && /(^|[\\/])outbox[\\/]/.test(String((e as any).file_path ?? ''))) {
      const before = (await read($, drafts)).length
      const found = await scan($).catch(() => null)
      if (found && found.length > before) $.ui.toast('New draft in your Outbox. Type /outbox to review it.')
    }
    return ran
  // If the hook fails before the tool runs, the same rule still decides (judged from e alone).
  }).catch(($, e, next) => (next.called || !isBlockedMail(String(e.tool)) ? next(e) : { deny: MAIL_DENY }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e) as any
    const { Box, Text, Button } = els
    const canType = 'Input' in els
    const today = (await stampNow($).catch(() => '')).slice(0, 10)
    const yesterday = dayBefore(today)
    const list = await read($, drafts)
    const held = await read($, waiting)
    const bad = await read($, broken)
    const target = await read($, armed)
    const note = await read($, notice)
    const canSend = (await read($, mode)) === 'send'
    const sig = await read($, signature)
    const ownSig = await read($, hasSignature)
    const sendInFile = (await read($, fileMode)) === 'send'
    const held3 = await read($, unsure)
    const sendLines = await read($, sendMark)
    const gmailState = await read($, gmail)
    const server = (await read($, gmailServer)) || configuredServer
    const listPage = pageOf(list, await read($, page), SHOWN)
    const heldPage = pageOf(held, await read($, waitingPage), SHOWN)
    const firstFile = listPage.items[0]?.file ?? ''
    const plan = await read($, attachPlan)

    const card = (d: Draft) => {
      const isEmail = d.channel === 'email'
      // A message that mentions an attachment is never sent from here, even in send mode: it becomes a
      // Gmail draft (with the file attached when it can be found safely) that the user sends from Gmail.
      const hasFile = mentionsAttachment(d)
      const useSend = canSend && !hasFile
      const name = d.subject || d.file
      const action = target.startsWith(`${d.file}|`) ? target.slice(d.file.length + 1) : ''
      const meta = [isEmail ? `To: ${d.to || '(no recipient)'}` : '', d.cc && `cc: ${d.cc}`, d.job && `job: ${d.job}`, d.replyTo && 'reply in the same thread']
        .filter(Boolean).join('  ·  ')
      const isNote = d.channel === 'linkedin' && d.kind !== 'message'
      const chars = d.body.length
      // Cancel puts the focus back on the button that opened the confirm row.
      const cancel = <Button key={`${d.file}:cancel`} label="Cancel" onPress={async () => {
        const was = action
        await update($, armed, () => '')
        focusOn($, `${d.file}:${was === 'approve' ? 'approve' : was === 'unstick' ? 'unstick' : was === 'marksent' ? 'marksent' : 'discard'}`)
      }} />
      // Each card's buttons carry the draft's name for screen readers (a desktop's native buttons):
      // "Copy (Follow-up to Globex)", drawn as "Copy". The visible words start the name (WCAG 2.5.3).
      const named = (visible: string) => `${visible} (${title(d)})`
      return (
        <Box key={d.file} flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold>{title(d)}</Text>
          {meta !== '' && <Text wrap="wrap">{meta}</Text>}
          {/* Exactly what goes out: the text plus the signature that will be added. */}
          <Text wrap="wrap">{isEmail ? compose(d.body, sig).body : d.body}</Text>
          {held3.includes(d.file) && <Text color="warning" wrap="wrap">An earlier send of this message was never confirmed. Check your Gmail Sent folder before doing anything else.</Text>}
          {d.channel === 'linkedin' && (
            <Text color={isNote && chars > LINKEDIN_NOTE_LIMIT ? 'warning' : undefined} bold={isNote && chars > LINKEDIN_NOTE_LIMIT}>
              {isNote
                ? `${chars} / ${LINKEDIN_NOTE_LIMIT} characters for a connection note${chars > LINKEDIN_NOTE_LIMIT ? ' (too long; press "Ask Claude to edit")' : ''}`
                : `${chars} characters (message to an existing connection)`}
            </Text>
          )}
          {canSend && hasFile && isEmail && d.status === 'draft' && <Text wrap="wrap">This message mentions an attachment, so it goes to your Gmail drafts (with the file attached when it can be found) and you send it from Gmail. The Outbox never sends attachments itself.</Text>}
          {action === 'sending' && <Text bold wrap="wrap">{useSend ? 'Sending…' : 'Creating the Gmail draft…'}</Text>}
          {action === 'approve' && (
            <Box flexDirection="column">
              <Text bold wrap="wrap">{useSend
                ? `Send "${name}" from your Gmail (connection: ${server}) to ${d.to} now? This can't be undone.`
                : `Create a Gmail draft to ${d.to} in your Gmail (connection: ${server})? Nothing is sent; you send it from Gmail when you're ready.`}</Text>
              {!useSend && attachText(plan && plan.file === d.file ? plan : null) !== '' && <Text wrap="wrap">{attachText(plan && plan.file === d.file ? plan : null)}</Text>}
              <Box flexDirection="row" gap={1}>
                <Button key={`${d.file}:confirm`} label={useSend ? 'Send email' : 'Create Gmail draft'} variant="primary" onPress={async () => {
                  // Lock synchronously before any await, so a second press can't send twice.
                  if (inFlight.has(d.file)) return
                  inFlight.add(d.file)
                  try {
                  await update($, armed, () => `${d.file}|sending`)
                  // Re-check the file and the mode right before calling Gmail, so the user only ever sends what they saw.
                  const fresh = parse(d.file, (await $.fs.exists(`${DIR}/${d.file}`)) ? await $.fs.read(`${DIR}/${d.file}`) : '')
                  // Fail closed: if the current Outbox setting can't be read, nothing is sent or drafted.
                  const known = await settings($).then(() => true, () => false)
                  if (!known) {
                    await update($, armed, () => '')
                    await say($, 'Unable to verify your current Outbox setting, so nothing was sent. Try again in a moment, or press Copy and send it from Gmail yourself.', true)
                    return
                  }
                  const stillSend = (await read($, mode)) === 'send'
                  // Which Gmail, checked again right before the call: the one shown in the confirmation, or nothing.
                  const now = await findGmail($, configuredServer).catch(() => ({ server: configuredServer, state: 'unknown' }))
                  if (now.state === 'ambiguous' || now.server !== server) {
                    await update($, armed, () => '')
                    await say($, now.state === 'ambiguous' ? ambiguousText(now.server) : 'Your Gmail connection changed since you opened this. Read it again before approving.', true)
                    await scan($)
                    return
                  }
                  // The signature is part of what the user approved: a changed one means reading it again.
                  const sigNow = await read($, signature)
                  if (!fresh || fresh.status !== 'draft' || fresh.sig !== d.sig || fresh.body !== d.body || fresh.to !== d.to || fresh.subject !== d.subject || fresh.cc !== d.cc || stillSend !== canSend || sigNow !== sig) {
                    await update($, armed, () => '')
                    await say($, 'This draft (or your Outbox setting) changed since you opened it. Read it again before approving.', true)
                    await scan($)
                    return
                  }
                  if (useSend) {
                    // Never send the same draft twice: check for an earlier send, then leave a receipt
                    // before calling Gmail. If either step can't be done, nothing is sent.
                    const blocked = await sendBlocked($, d)
                    if (blocked !== '') {
                      await update($, armed, () => '')
                      await say($, blocked, true)
                      return
                    }
                    const receipt: Receipt = { at: await stampNow($), to: d.to, subject: d.subject, state: 'sending', file: d.file }
                    const kept = await Promise.resolve().then(() => keepReceipt($, d, receipt)).then(() => true, () => false)
                    if (!kept) {
                      await update($, armed, () => '')
                      await say($, 'Unable to keep a send record for this message, so nothing was sent. Press Copy and send it from Gmail yourself.', true)
                      return
                    }
                  }
                  const content = compose(d.body, sig)
                  const args: Record<string, unknown> = { to: addresses(d.to), cc: d.cc ? addresses(d.cc) : undefined, subject: d.subject, ...content }
                  if (d.replyTo) args.replyToMessageId = d.replyTo  // reply_to holds a Gmail message ID
                  // Gmail drafts only: the files shown in the confirm row, read again now. Never on a send.
                  const att = useSend ? { list: [], names: [] as string[], problems: [] as string[] } : await loadAttachments($, d, hasFile ? await read($, attachPlan) : null)
                  if (att.list.length > 0) args.attachments = att.list
                  const result: any = await $.mcp.call(server, useSend ? 'send_message' : 'create_draft', args)
                    .catch((err: unknown) => ({ isError: true, content: [{ type: 'text', text: String(err) }] }))
                  if (useSend) {
                    // An error or a lost answer can still mean Gmail sent it: the receipt stays as "uncertain"
                    // (never removed here), so nothing goes out again until the user has checked Sent.
                    const done: Receipt = { at: await stampNow($), to: d.to, subject: d.subject, state: result.isError ? 'uncertain' : 'sent', file: d.file }
                    await Promise.resolve().then(() => keepReceipt($, d, done)).catch(() => undefined)
                  }
                  if (result.isError) {
                    await update($, armed, () => '')
                    await say($, useSend
                      ? "I couldn't confirm whether it sent. Check your Gmail Sent folder: if it's there, press \"Mark sent…\". If it isn't, press \"Not in my Sent folder…\", then send it again or press Copy and send it from Gmail."
                      : gmailState === 'connected'
                        ? "I couldn't confirm the Gmail draft was created. Check your Gmail Drafts before trying again, so you don't end up with two."
                        : 'Gmail didn\'t answer, and it doesn\'t look connected. Connect Gmail (desktop app: Settings → Connectors; terminal: claude.ai/customize/connectors, then type /mcp), or press Copy and send it yourself.', true)
                    await scan($).catch(() => undefined)
                    const detail = (result.content ?? []).map((c: any) => c.text ?? '').join(' ').slice(0, 400)
                    await tellClaude($, `[Outbox] Gmail call failed for ${DIR}/${d.file} via "${server}": ${detail}. If the user asks, help them check the Gmail connector.`)
                  } else if (useSend) {
                    await mark($, d, 'sent', `The user sent "${name}" to ${d.to}`, `Sent "${name}" to ${d.to}.`, true)
                    await focusFirst($)
                  } else {
                    const attached = att.names.length > 0 ? ` Attached: ${att.names.join(' and ')}.` : ''
                    const byHand = att.problems.length > 0 ? ` Not attached: ${att.problems.join('; ')}. Attach the file in Gmail before you send.` : ''
                    const forClaude = `${att.names.length > 0 ? `, with ${att.names.join(' and ')} attached` : ''}${att.problems.length > 0 ? `. A file it mentions was not attached (${att.problems.join('; ')}); the user attaches it in Gmail` : ''}`
                    await update($, attachPlan, () => null)
                    await mark($, d, 'in-gmail-drafts', `"${name}" is now a draft in the user's Gmail (not sent yet; they send it from Gmail)${forClaude}`, `Gmail draft created for "${name}".${attached}${byHand} Open Gmail to send it, then press "Mark sent…" under "Waiting in Gmail".`, true, '', viewUrlOf(result))
                    await focusFirst($)
                  }
                  } catch {
                    await update($, armed, () => '')
                    await say($, "Something went wrong after pressing the button. Check your Gmail Drafts (or Sent) before trying again.", true)
                  } finally {
                    inFlight.delete(d.file)
                  }
                }} />
                {cancel}
              </Box>
            </Box>
          )}
          {action === 'unstick' && (
            <Box flexDirection="column">
              <Text bold wrap="wrap">{`You checked your Gmail Sent folder and "${title(d)}" isn't there? Then it can be sent again from here.`}</Text>
              <Box flexDirection="row" gap={1}>
                <Button key={`${d.file}:confirm-unstick`} label="It's not there: allow sending again" variant="primary" onPress={async () => {
                  await Promise.resolve().then(async () => {
                    const root = await rootOf($)
                    for (const rt of root ? [root, ''] : ['']) { await $.store.delete(receiptKey(d.file, rt)); await $.store.delete(messageKey(d, rt)) }
                  }).catch(() => undefined)
                  await update($, armed, () => '')
                  await say($, `"${title(d)}" can be sent again. Read it over, then press Send… when you're ready.`)
                  await scan($)
                  focusOn($, `${d.file}:approve`)
                }} />
                {cancel}
              </Box>
            </Box>
          )}
          {action === 'marksent' && (
            <Box flexDirection="column">
              <Text bold wrap="wrap">{`When did you send "${title(d)}"? Only mark it after you've sent it yourself.`}</Text>
              <Box flexDirection="row" gap={1} flexWrap="wrap">
                <Button key={`${d.file}:confirm-sent`} label={`Sent today (${today})`} variant="primary" onPress={async () => { await mark($, d, 'sent', `The user sent "${title(d)}" to ${d.to} themselves`, `Marked "${title(d)}" as sent today.`, false, today); await focusFirst($) }} />
                <Button key={`${d.file}:confirm-sent-yesterday`} label={`Sent yesterday (${yesterday})`} onPress={async () => { await mark($, d, 'sent', `The user sent "${title(d)}" to ${d.to} themselves on ${yesterday}`, `Marked "${title(d)}" as sent on ${yesterday}.`, false, yesterday); await focusFirst($) }} />
                {cancel}
              </Box>
              {canType && <els.Input key={`${d.file}:sent-date`} label="Another day" value="" placeholder="YYYY-MM-DD" submitLabel="save" onSubmit={async (v: string) => {
                const day = v.trim()
                if (!isRealDay(day) || day > today) { await say($, 'Type the day you sent it as YYYY-MM-DD (not a future date), for example 2026-10-05.', true); return }
                await mark($, d, 'sent', `The user sent "${title(d)}" to ${d.to} themselves on ${day}`, `Marked "${title(d)}" as sent on ${day}.`, false, day)
                await focusFirst($)
              }} />}
            </Box>
          )}
          {action === 'discard' && (
            <Box flexDirection="column">
              <Text bold wrap="wrap">{`Discard "${title(d)}"? It leaves your Outbox. Ask Claude to restore it if you change your mind.`}</Text>
              <Box flexDirection="row" gap={1}>
                <Button key={`${d.file}:confirm-discard`} label="Discard draft" variant="primary" onPress={async () => { await mark($, d, 'discarded', `The user discarded the draft "${title(d)}"`, `Discarded "${title(d)}".`); await focusFirst($) }} />
                {cancel}
              </Box>
            </Box>
          )}
          {action === '' && d.status === 'draft' && (
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              {isEmail && <Button key={`${d.file}:approve`} label={named(useSend ? 'Send…' : 'Create Gmail draft…')} variant="primary" autoFocus={d.file === firstFile ? true : undefined} onPress={async () => {
                const bad2 = addresses(d.to + ',' + d.cc).filter(a => !EMAIL.test(a))
                if (addresses(d.to).length === 0 || bad2.length > 0) {
                  await say($, `The recipient address needs fixing (${bad2.join(', ') || 'no "to" address'}). Press "Ask Claude to edit".`, true)
                  return
                }
                if (PLACEHOLDER.test(d.body) || PLACEHOLDER.test(d.to) || PLACEHOLDER.test(d.subject)) {
                  await say($, `This draft still has a placeholder (${(PLACEHOLDER.exec(d.body + d.to + d.subject) ?? [''])[0]}). Press "Ask Claude to edit" to fill it in.`, true)
                  return
                }
                if (d.subject.trim() === '') {
                  await say($, 'This email has no subject. Press "Ask Claude to edit".', true)
                  return
                }
                if (gmailState === 'ambiguous') {
                  await say($, ambiguousText(server), true)
                  return
                }
                const blocked = useSend ? await sendBlocked($, d) : ''
                if (blocked !== '') {
                  await say($, blocked, true)
                  return
                }
                await say($, '')
                // The files a Gmail draft will carry are checked now and shown in the confirm row.
                const shown = hasFile ? await planAttachments($, d).catch(() => ({ file: d.file, isWanted: true, files: [] as AttachFile[], problems: ["the files couldn't be checked just now"] })) : null
                await update($, attachPlan, () => shown)
                await update($, armed, () => `${d.file}|approve`)
                // Sending can't be undone, so its confirm row starts on Cancel; a Gmail draft sends nothing.
                focusOn($, useSend ? `${d.file}:cancel` : `${d.file}:confirm`)
              }}>{useSend ? 'Send…' : 'Create Gmail draft…'}</Button>}
              <Button key={`${d.file}:copy`} label={named('Copy')} autoFocus={!isEmail && d.file === firstFile ? true : undefined} onPress={async press => {
                if (PLACEHOLDER.test(d.body) || PLACEHOLDER.test(d.to)) {
                  await say($, `This draft still has a placeholder (${(PLACEHOLDER.exec(d.body + d.to) ?? [''])[0]}). Press "Ask Claude to edit" to fill it in.`, true)
                  return
                }
                const text = isEmail ? `Subject: ${d.subject}\n\n${compose(d.body, sig).body}` : d.body
                const copied = await $.ui.copy({ text, surface: press.surface })
                if (copied.isCopied) await say($, isEmail ? 'Copied. Paste and send it yourself, then press "Mark sent…".' : 'Copied. Paste it into LinkedIn and send it yourself, then press "Mark sent…".')
                else await say($, 'Unable to copy here. Select the text above and copy it.', true)
              }}>Copy</Button>
              <Button key={`${d.file}:marksent`} label={named('Mark sent…')} onPress={async () => { await update($, armed, () => `${d.file}|marksent`); focusOn($, `${d.file}:confirm-sent`) }}>Mark sent…</Button>
              {held3.includes(d.file) && <Button key={`${d.file}:unstick`} label={named('Not in my Sent folder…')} onPress={async () => { await update($, armed, () => `${d.file}|unstick`); focusOn($, `${d.file}:cancel`) }}>Not in my Sent folder…</Button>}
              <Button key={`${d.file}:edit`} label={named('Ask Claude to edit')} onPress={() => $.prompt.fill({ text: `Revise my outbox draft ${DIR}/${d.file}: ` })}>Ask Claude to edit</Button>
              <Button key={`${d.file}:discard`} label={named('Discard…')} dimColor onPress={async () => { await update($, armed, () => `${d.file}|discard`); focusOn($, `${d.file}:cancel`) }}>Discard…</Button>
            </Box>
          )}
          {action === '' && d.status === 'in-gmail-drafts' && (
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              <Button key={`${d.file}:marksent`} label={named('Mark sent…')} variant="primary" onPress={async () => { await update($, armed, () => `${d.file}|marksent`); focusOn($, `${d.file}:confirm-sent`) }}>Mark sent…</Button>
              <Button key={`${d.file}:discard`} label={named('I deleted it in Gmail')} dimColor onPress={async () => { await update($, armed, () => `${d.file}|discard`); focusOn($, `${d.file}:cancel`) }}>I deleted it in Gmail</Button>
            </Box>
          )}
        </Box>
      )
    }

    const pager = (id: string, pg: ReturnType<typeof pageOf>, total: number, move: (to: number) => unknown) => pg.pages > 1 && (
      <Box key={`${id}-pager`} flexDirection="row" gap={1} flexWrap="wrap">
        <Text dimColor>{`Showing ${pg.from}–${pg.to} of ${total}`}</Text>
        {pg.page > 0 && <Button key={`${id}-prev`} label="Previous page" plain onPress={() => move(pg.page - 1)} />}
        {pg.page < pg.pages - 1 && <Button key={`${id}-next`} label="Next page" plain onPress={() => move(pg.page + 1)} />}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1}>
          <Button key="refresh" label="Refresh" onPress={() => scan($)} />
          <Button key="close" label="Close" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
        {e.surface === 'terminal' && <Text>{KEYS_HINT}</Text>}
        <Text wrap="wrap">{canSend
          ? 'Mode: send. "Send email" sends from your Gmail after you confirm.'
          : 'Mode: draft only. "Create Gmail draft" puts it in your Gmail drafts; you press Send in Gmail.'}</Text>
        {sendInFile && !canSend && target !== 'mode|confirm' && (
          <Box flexDirection="column">
            <Text color="warning" wrap="wrap">Your preferences say outbox_mode: send, but send mode isn't on yet. Turn it on here once to let this panel send email from your Gmail (you still confirm every message).</Text>
            <Button key="mode-on" label="Turn on send mode…" onPress={async () => { await update($, armed, () => 'mode|confirm'); focusOn($, 'mode-keep') }} />
          </Box>
        )}
        {sendInFile && !canSend && target === 'mode|confirm' && (
          <Box flexDirection="column" borderStyle="round" paddingX={1}>
            <Text bold wrap="wrap">Turn on send mode? "Send email" will then send straight from your Gmail after you confirm each message, and a sent email can't be taken back. You can switch back any time by setting outbox_mode: draft-only in your preferences.</Text>
            <Box flexDirection="row" gap={1}>
              <Button key="mode-confirm" label="Yes, turn on send mode" variant="primary" onPress={async () => {
                const ok = await Promise.resolve().then(async () => $.store.set(await sendKey($), { value: 'send', at: Date.now(), mark: sendLines })).then(() => true, () => false)
                await update($, armed, () => '')
                await say($, ok ? 'Send mode is on.' : 'Unable to save that choice, so the Outbox stays in draft-only mode.', !ok)
                await scan($)
              }} />
              <Button key="mode-keep" label="Keep draft-only" onPress={async () => { await update($, armed, () => ''); focusOn($, 'mode-on') }} />
            </Box>
          </Box>
        )}
        {gmailState === 'ambiguous' && list.some(d => d.channel === 'email') && <Text color="warning" wrap="wrap">{`Needs fixing: more than one Gmail connection is set up (${server}). Ask Claude to set the Outbox's Gmail connector name to the one you want; until then, use Copy.`}</Text>}
        {gmailState === 'missing' && list.some(d => d.channel === 'email') && <Text color="warning" wrap="wrap">{canSend
          ? 'Gmail doesn\'t look connected, so "Send…" may not work. Connect Gmail (desktop app: Settings → Connectors; terminal: claude.ai/customize/connectors, then type /mcp), or press Copy and send it yourself.'
          : 'Gmail doesn\'t look connected, so "Create Gmail draft…" may not work. Connect Gmail (desktop app: Settings → Connectors; terminal: claude.ai/customize/connectors, then type /mcp), or press Copy and send it yourself.'}</Text>}
        {!ownSig && <Text color="warning" wrap="wrap">Your signature isn't set up, so emails go without one. Ask Claude to set it up (part of /start).</Text>}
        {note.text !== '' && <Text color={note.isError ? 'error' : 'success'} wrap="wrap">{note.isError ? `Not done: ${note.text}` : note.text}</Text>}
        {note.text !== '' && !note.isError && (note.link ?? '') !== '' && <els.Link key="open-gmail" href={note.link} label="Open in Gmail" />}
        {list.length === 0 && held.length === 0 && <Text>No drafts waiting. Ask Claude to draft a follow-up, thank-you note, or networking message.</Text>}
        {listPage.items.map(card)}
        {pager('drafts', listPage, list.length, to => update($, page, () => to))}
        {held.length > 0 && <Text bold>Waiting in Gmail (press "Mark sent…" after you send each one)</Text>}
        {heldPage.items.map(card)}
        {pager('waiting', heldPage, held.length, to => update($, waitingPage, () => to))}
        {bad.length > 0 && (
          <Box flexDirection="column">
            <Text color="warning">{`Needs fixing (Claude can't read the header): ${bad.join(', ')}`}</Text>
            <Button key="fix-broken" label="Ask Claude to fix them" onPress={() => $.prompt.fill({ text: `Fix the header of these outbox drafts so they follow the format in AGENTS.md: ${bad.join(', ')}` })} />
          </Box>
        )}
      </Box>
    )
  })
}
