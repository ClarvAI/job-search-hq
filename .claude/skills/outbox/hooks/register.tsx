import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Draft, Notice } from '../types'

// Outbox: Claude writes drafts as files in outbox/; the user reviews them here.
// Only the user's press of a confirm button creates a Gmail draft or sends email.
// Claude's own send/reply/forward/trash/label mail tools are denied below.

const PANE = 'outbox'
const DIR = 'outbox'
const ACTIVITY = 'history/activity.md'
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
const LINKEDIN_NOTE_LIMIT = 200
const PLACEHOLDER = /\[[^\]\n]{1,60}\]/
// Drafts with a Gmail call in progress (a plain Set: checked and set with no await in between).
const inFlight = new Set<string>()

const drafts = atom({ plugin: 'outbox', key: 'drafts' } as const, [] as Draft[])
const waiting = atom({ plugin: 'outbox', key: 'waiting' } as const, [] as Draft[])
const broken = atom({ plugin: 'outbox', key: 'broken' } as const, [] as string[])
const armed = atom({ plugin: 'outbox', key: 'armed' } as const, '')
const notice = atom({ plugin: 'outbox', key: 'notice' } as const, { text: '', isError: false } as Notice)
// draft-only (default): approving makes a Gmail draft the user sends themselves.
// send: the user switched this on in profile/preferences.md; approving sends.
const mode = atom({ plugin: 'outbox', key: 'mode' } as const, 'draft-only')
const signature = atom({ plugin: 'outbox', key: 'signature' } as const, '')
const hasSignature = atom({ plugin: 'outbox', key: 'hasSignature' } as const, true)

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
  for (const line of match[1].split('\n')) {
    const item = /^\s*-\s+(.*)$/.exec(line)
    if (item && listKey) { head[listKey] = [head[listKey], unquote(item[1])].filter(Boolean).join(', '); continue }
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
    body: match[2].trim(),
  }
}

function setStatus(raw: string, status: string, stamp: string): string {
  const text = clean(raw)
  const end = text.indexOf('\n---', 3)
  if (!text.startsWith('---\n') || end < 0) return raw
  const lines = text.slice(4, end).split('\n').filter(l => !/^(status|status_at|sent)\s*:/i.test(l))
  lines.push(`status: ${status}`, `status_at: ${stamp}`)
  if (status === 'sent') lines.push(`sent: ${stamp.slice(0, 10)}`)
  return `---\n${lines.join('\n')}${text.slice(end)}`
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Plain text with a signature, and a matching HTML body: paragraphs on blank
// lines, line breaks kept, links clickable. What Gmail shows looks hand-typed.
function compose(body: string, sig: string): { body: string; htmlBody: string } {
  const plain = sig.trim() === '' || body.includes(sig.trim()) ? body.trim() : `${body.trim()}\n\n${sig.trim()}`
  const html = plain.split(/\n{2,}/).map(p => {
    const inner = escapeHtml(p)
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
      .replace(/(^|[\s(])((?:www\.)?linkedin\.com\/in\/[^\s<]+)/g, '$1<a href="https://$2">$2</a>')
      .replace(/\n/g, '<br>')
    return `<p style="margin:0 0 12px 0">${inner}</p>`
  }).join('')
  return { body: plain, htmlBody: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#222">${html}</div>` }
}

// Accepts "a@b.com, c@d.com", "Jane Doe <jane@globex.example>", or YAML list items (already joined).
function addresses(list: string): string[] {
  return list.split(/[,;]/).map(s => s.trim()).filter(Boolean).map(s => /<([^>]+)>/.exec(s)?.[1].trim() ?? s)
}

// The example signature's made-up name and phone, which must never go out in a real email.
const SAMPLE_SIGNATURE = /\byour name\b|\byour title\b|555-01\d\d|linkedin\.com\/in\/your-name/i

async function settings($: any): Promise<void> {
  let prefs = ''
  try {
    prefs = (await $.fs.exists('profile/preferences.md')) ? await $.fs.read('profile/preferences.md') : ''
  } catch (err) {
    // Can't tell what the user chose: fall back to draft-only, never keep an old "send".
    if ((await read($, mode)) !== 'draft-only') await update($, mode, () => 'draft-only')
    throw err
  }
  const found = /^\s*outbox_mode:\s*([a-z-]+)/im.exec(prefs)?.[1] ?? 'draft-only'
  const value = found === 'send' ? 'send' : 'draft-only'
  if ((await read($, mode)) !== value) await update($, mode, () => value)
  // Only the user's own signature is ever added; a missing or still-sample one means no signature.
  const own: string = (await $.fs.exists('profile/signature.txt')) ? clean(await $.fs.read('profile/signature.txt')).trim() : ''
  const isUsable = own !== '' && !PLACEHOLDER.test(own) && !SAMPLE_SIGNATURE.test(own)
  const sig = isUsable ? own : ''
  if ((await read($, signature)) !== sig) await update($, signature, () => sig)
  if ((await read($, hasSignature)) !== isUsable) await update($, hasSignature, () => isUsable)
}

// A receipt per sent message in the plugin's own store (outside this folder), written BEFORE Gmail
// is asked to send. If the file can't be updated afterwards, or the app stops mid-send, the receipt
// still blocks a second send of that draft (same file, recipient and subject), even if an old copy of
// the file comes back as a draft later. Only a send Gmail reported as failed removes its receipt.
const receiptKey = (file: string) => `send-receipt:${file}`
type Receipt = { at: string; to: string; subject: string; state: 'sending' | 'sent' }

// '' when this draft may be sent; otherwise why not (it went out already, or a send was never confirmed).
async function sendBlocked($: any, d: Draft): Promise<string> {
  let found: unknown
  try { found = await $.store.get(receiptKey(d.file)) } catch {
    return 'Unable to check whether this message was already sent, so nothing was sent. Press Copy and send it from Gmail yourself.'
  }
  if (!found || typeof found !== 'object') return ''
  const r = found as Partial<Receipt>
  if (r.to !== d.to || r.subject !== d.subject) return ''
  return r.state === 'sent'
    ? `This message was already sent from the Outbox (${r.at ?? 'earlier'}), so it won't be sent again. Press "Mark sent…" to file it.`
    : `A send of this message started at ${r.at ?? 'an earlier time'} but was never confirmed. Check your Gmail Sent folder: if it's there, press "Mark sent…". If it isn't, press Copy and send it from Gmail yourself.`
}

async function scan($: any): Promise<Draft[]> {
  await settings($).catch(() => undefined)
  // A card left saying "Sending…" with nothing in flight (e.g. after an error) gets its buttons back.
  const held = await read($, armed)
  if (held.endsWith('|sending') && !inFlight.has(held.slice(0, -'|sending'.length))) await update($, armed, () => '')
  const found: Draft[] = []
  const pending: Draft[] = []
  const bad: string[] = []
  const entries = (await $.fs.exists(DIR)) ? await $.fs.list(DIR) : []
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.md') || entry.name.startsWith('_') || entry.name.toLowerCase() === 'readme.md') continue
    const draft = parse(entry.name, await $.fs.read(`${DIR}/${entry.name}`).catch(() => ''))
    if (!draft) { bad.push(entry.name); continue }
    if (draft.status === 'draft') found.push(draft)
    else if (draft.status === 'in-gmail-drafts') pending.push(draft)
  }
  found.sort((a, b) => a.file.localeCompare(b.file))
  pending.sort((a, b) => a.file.localeCompare(b.file))
  bad.sort()
  if (JSON.stringify(await read($, drafts)) !== JSON.stringify(found)) await update($, drafts, () => found)
  if (JSON.stringify(await read($, waiting)) !== JSON.stringify(pending)) await update($, waiting, () => pending)
  if (JSON.stringify(await read($, broken)) !== JSON.stringify(bad)) await update($, broken, () => bad)
  return found
}

async function say($: any, text: string, isError = false): Promise<void> {
  await update($, notice, () => ({ text, isError }))
}

async function tellClaude($: any, text: string): Promise<void> {
  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } }).catch(() => undefined)
}

// One line in history/activity.md (same format as the other panels), so Codex or a later session sees the change.
async function logActivity($: any, stamp: string, what: string): Promise<void> {
  const lineOut = `- ${stamp} · Outbox panel (Claude) · ${what.replace(/[\r\n]+/g, ' ')}\n`
  try {
    const before: string = (await $.fs.exists(ACTIVITY)) ? await $.fs.read(ACTIVITY) : '# Recent activity\n\n'
    await $.fs.write(ACTIVITY, before.replace(/\n*$/, '\n') + lineOut)
    const after: string = await $.fs.read(ACTIVITY)
    if (!after.includes(lineOut)) await $.fs.write(ACTIVITY, after.replace(/\n*$/, '\n') + lineOut)
  } catch { /* the log is a convenience; the draft file already holds the new status */ }
}

async function stampNow($: any): Promise<string> {
  // Local time, not UTC: an evening send in the user's time zone must not be dated tomorrow.
  const d = new Date(await $.clock.now())
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

// happened: Gmail already did it (sent, or made the Gmail draft), so the file must record that even
// if someone edited the draft meanwhile; it is never left looking like a draft to approve again.
async function mark($: any, draft: Draft, status: string, logText: string, paneText: string, happened = false): Promise<void> {
  const path = `${DIR}/${draft.file}`
  const stamp = await stampNow($)
  // Re-read first: the file may have changed in another app since the pane was drawn.
  const current: string = await (async () => ((await $.fs.exists(path)) ? await $.fs.read(path) : ''))().catch(() => '')
  const now = parse(draft.file, current)
  const changed = now !== undefined && (now.body !== draft.body || now.to !== draft.to || now.subject !== draft.subject || now.cc !== draft.cc)
  if (!happened && (!now || now.status === 'sent' || now.status === status || changed)) {
    await update($, armed, () => '')
    await say($, now?.status === 'sent' ? `"${title(draft)}" is already marked sent, so it was left as is.` : 'That draft changed or moved since this list was drawn. Look it over again.', true)
    await scan($)
    return
  }
  const alreadyRecorded = happened && now !== undefined && (now.status === status || now.status === 'sent')
  try {
    if (!now) throw new Error('missing')
    if (!alreadyRecorded) await $.fs.write(path, setStatus(current, status, stamp))
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
  await logActivity($, stamp, `${title(draft)}: ${status === 'sent' ? 'sent' :status === 'discarded' ? 'discarded' : 'Gmail draft created (not sent yet)'}`)
  await update($, armed, () => '')
  await say($, paneText)
  await scan($)
  const followUp = status === 'sent'
    ? ' If it might not have gone out today, ask the user which day they sent it and use that date. Update contacts/contacts.csv for the contact(s) named in the draft following the playbook rule "When the user sends someone a message" (never move a replied/talked/referred contact back to contacted), update jobs/tracker.csv if it relates to a job, add a line to history/activity.md for those changes (the panel already logged the send), then move the file to outbox/sent/.'
    : status === 'discarded' ? ' Move the file to outbox/discarded/.' : ' It is NOT sent yet; do not set follow-up dates until the user marks it sent.'
  const who = [draft.to && `to: ${draft.to}`, draft.contact && `contact: ${draft.contact}`, draft.job && `job: ${draft.job}`].filter(Boolean).join(', ')
  await tellClaude($, `[Outbox] ${logText} (file: ${path}${who ? `; ${who}` : ''}; at ${stamp}). Re-read the file before describing it to the user.${editedMeanwhile}${followUp} A discarded draft can be restored by setting its status back to draft.`)
}

function title(d: Draft): string {
  if (d.channel === 'email') return d.subject || '(no subject)'
  return `${d.channel === 'linkedin' ? 'LinkedIn' : d.channel} → ${d.to || '(no one named)'}`
}

export const register: Register = (on, options) => {
  const server = String((options as Record<string, unknown>).gmail_server || 'claude.ai Gmail')

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'outbox', description: 'Review draft emails and messages, then create Gmail drafts, copy, or discard them' })
    // No toast here: the due-alerts mod is the one pop-up at session start, and the Pipeline band shows the draft count.
    await scan($).catch(() => [])
    $.clock.every(20000, () => void scan($).catch(() => undefined))
    return next(e)
  })

  on('command.run', { command: 'outbox' }, async $ => {
    const found = await scan($)
    await say($, '')
    await $.ui.open({ id: PANE, title: 'Outbox' })
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
    const last = (name.split('__').pop() ?? name).replace(/^(gmail|google_?mail|outlook_email|outlook_calendar|outlook|google_?calendar|gcal|superhuman|email|mail|calendar)_/i, '')
    const isMail = /mail|outlook|superhuman/i.test(name)
    const readOnly = /^(batch_read|batch_get|search|list|get|read|fetch|find|query|count|lookup|view|show|download)/i.test(last) || /^(create|update)(_or_update)?_?draft/i.test(last)
    if (isMail && !readOnly) {
      return { deny: 'The user sends and manages their mail themselves. Save the message as a draft file in outbox/ and tell the user to type /outbox to review it.' }
    }
    const ran = await next(e)
    if (/^(Write|Edit|MultiEdit)$/.test(name) && /(^|[\\/])outbox[\\/]/.test(String((e as any).file_path ?? ''))) {
      const before = (await read($, drafts)).length
      const found = await scan($).catch(() => null)
      if (found && found.length > before) $.ui.toast('New draft in your Outbox. Type /outbox to review it.')
    }
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, drafts)
    const held = await read($, waiting)
    const bad = await read($, broken)
    const target = await read($, armed)
    const note = await read($, notice)
    const canSend = (await read($, mode)) === 'send'
    const sig = await read($, signature)
    const ownSig = await read($, hasSignature)

    const card = (d: Draft) => {
      const isEmail = d.channel === 'email'
      const name = d.subject || d.file
      const action = target.startsWith(`${d.file}|`) ? target.slice(d.file.length + 1) : ''
      const meta = [isEmail ? `To: ${d.to || '(no recipient)'}` : '', d.cc && `cc: ${d.cc}`, d.job && `job: ${d.job}`, d.replyTo && 'reply in the same thread']
        .filter(Boolean).join('  ·  ')
      const isNote = d.channel === 'linkedin' && d.kind !== 'message'
      const chars = d.body.length
      const cancel = <Button key={`${d.file}:cancel`} label="Cancel" onPress={() => update($, armed, () => '')} />
      return (
        <Box key={d.file} flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold>{title(d)}</Text>
          {meta !== '' && <Text wrap="wrap">{meta}</Text>}
          <Text wrap="wrap">{d.body}</Text>
          {d.channel === 'linkedin' && (
            <Text color={isNote && chars > LINKEDIN_NOTE_LIMIT ? 'warning' : undefined} bold={isNote && chars > LINKEDIN_NOTE_LIMIT}>
              {isNote
                ? `${chars} / ${LINKEDIN_NOTE_LIMIT} characters for a connection note${chars > LINKEDIN_NOTE_LIMIT ? ' (too long; press "Ask Claude to edit")' : ''}`
                : `${chars} characters (message to an existing connection)`}
            </Text>
          )}
          {action === 'sending' && <Text bold wrap="wrap">{canSend ? 'Sending…' : 'Creating the Gmail draft…'}</Text>}
          {action === 'approve' && (
            <Box flexDirection="column">
              <Text bold wrap="wrap">{canSend
                ? `Send "${name}" from your Gmail to ${d.to} now? This can't be undone.`
                : `Create a Gmail draft to ${d.to}? Nothing is sent; you send it from Gmail when you're ready.`}</Text>
              <Box flexDirection="row" gap={1}>
                <Button key={`${d.file}:confirm`} label={canSend ? 'Send email' : 'Create Gmail draft'} variant="primary" onPress={async () => {
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
                  if (!fresh || fresh.status !== 'draft' || fresh.body !== d.body || fresh.to !== d.to || fresh.subject !== d.subject || fresh.cc !== d.cc || stillSend !== canSend) {
                    await update($, armed, () => '')
                    await say($, 'This draft (or your Outbox setting) changed since you opened it. Read it again before approving.', true)
                    await scan($)
                    return
                  }
                  if (canSend) {
                    // Never send the same draft twice: check for an earlier send, then leave a receipt
                    // before calling Gmail. If either step can't be done, nothing is sent.
                    const blocked = await sendBlocked($, d)
                    if (blocked !== '') {
                      await update($, armed, () => '')
                      await say($, blocked, true)
                      return
                    }
                    const receipt: Receipt = { at: await stampNow($), to: d.to, subject: d.subject, state: 'sending' }
                    const kept = await Promise.resolve().then(() => $.store.set(receiptKey(d.file), receipt)).then(() => true, () => false)
                    if (!kept) {
                      await update($, armed, () => '')
                      await say($, 'Unable to keep a send record for this message, so nothing was sent. Press Copy and send it from Gmail yourself.', true)
                      return
                    }
                  }
                  const content = compose(d.body, sig)
                  const args: Record<string, unknown> = { to: addresses(d.to), cc: d.cc ? addresses(d.cc) : undefined, subject: d.subject, ...content }
                  if (d.replyTo) args.replyToMessageId = d.replyTo  // reply_to holds a Gmail message ID
                  const result: any = await $.mcp.call(server, canSend ? 'send_message' : 'create_draft', args)
                    .catch((err: unknown) => ({ isError: true, content: [{ type: 'text', text: String(err) }] }))
                  if (canSend && !result.isError) {
                    const done: Receipt = { at: await stampNow($), to: d.to, subject: d.subject, state: 'sent' }
                    await Promise.resolve().then(() => $.store.set(receiptKey(d.file), done)).catch(() => undefined)
                  }
                  // Gmail said the send failed: the receipt goes, so the user can try again after checking Sent.
                  if (canSend && result.isError) await Promise.resolve().then(() => $.store.delete(receiptKey(d.file))).catch(() => undefined)
                  if (result.isError) {
                    await update($, armed, () => '')
                    await say($, canSend
                      ? "I couldn't confirm whether it sent. Check your Gmail Sent folder before trying again: if it's there, press Mark sent instead. If it isn't, try again or press Copy and send it from Gmail."
                      : "I couldn't confirm the Gmail draft was created. Check your Gmail Drafts before trying again, so you don't end up with two.", true)
                    const detail = (result.content ?? []).map((c: any) => c.text ?? '').join(' ').slice(0, 400)
                    await tellClaude($, `[Outbox] Gmail call failed for ${DIR}/${d.file} via "${server}": ${detail}. If the user asks, help them check the Gmail connector.`)
                  } else if (canSend) {
                    await mark($, d, 'sent', `The user sent "${name}" to ${d.to}`, `Sent "${name}" to ${d.to}.`, true)
                  } else {
                    await mark($, d, 'in-gmail-drafts', `"${name}" is now a draft in the user's Gmail (not sent yet; they send it from Gmail)`, `Gmail draft created for "${name}". Open Gmail to send it, then press "Mark sent…" under "Waiting in Gmail".`, true)
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
          {action === 'marksent' && (
            <Box flexDirection="column">
              <Text bold wrap="wrap">{`Mark "${title(d)}" as sent? Only do this after you've sent it yourself.`}</Text>
              <Box flexDirection="row" gap={1}>
                <Button key={`${d.file}:confirm-sent`} label="Mark as sent" variant="primary" onPress={() => mark($, d, 'sent', `The user sent "${title(d)}" to ${d.to} themselves`, `Marked "${title(d)}" as sent.`)} />
                {cancel}
              </Box>
            </Box>
          )}
          {action === 'discard' && (
            <Box flexDirection="column">
              <Text bold wrap="wrap">{`Discard "${title(d)}"? It leaves your Outbox. Ask Claude to restore it if you change your mind.`}</Text>
              <Box flexDirection="row" gap={1}>
                <Button key={`${d.file}:confirm-discard`} label="Discard draft" variant="primary" onPress={() => mark($, d, 'discarded', `The user discarded the draft "${title(d)}"`, `Discarded "${title(d)}".`)} />
                {cancel}
              </Box>
            </Box>
          )}
          {action === '' && d.status === 'draft' && (
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              {isEmail && <Button key={`${d.file}:approve`} label={canSend ? 'Send…' : 'Create Gmail draft…'} variant="primary" onPress={async () => {
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
                const blocked = canSend ? await sendBlocked($, d) : ''
                if (blocked !== '') {
                  await say($, blocked, true)
                  return
                }
                await say($, '')
                await update($, armed, () => `${d.file}|approve`)
              }} />}
              <Button key={`${d.file}:copy`} label="Copy" onPress={async press => {
                if (PLACEHOLDER.test(d.body) || PLACEHOLDER.test(d.to)) {
                  await say($, `This draft still has a placeholder (${(PLACEHOLDER.exec(d.body + d.to) ?? [''])[0]}). Press "Ask Claude to edit" to fill it in.`, true)
                  return
                }
                const text = isEmail ? `Subject: ${d.subject}\n\n${compose(d.body, sig).body}` : d.body
                const copied = await $.ui.copy({ text, surface: press.surface })
                if (copied.isCopied) await say($, isEmail ? 'Copied. Paste and send it yourself, then press "Mark sent…".' : 'Copied. Paste it into LinkedIn and send it yourself, then press "Mark sent…".')
                else await say($, 'Unable to copy here. Select the text above and copy it.', true)
              }} />
              <Button key={`${d.file}:marksent`} label="Mark sent…" onPress={() => update($, armed, () => `${d.file}|marksent`)} />
              <Button key={`${d.file}:edit`} label="Ask Claude to edit" onPress={() => $.prompt.fill({ text: `Revise my outbox draft ${DIR}/${d.file}: ` })} />
              <Button key={`${d.file}:discard`} label="Discard…" dimColor onPress={() => update($, armed, () => `${d.file}|discard`)} />
            </Box>
          )}
          {action === '' && d.status === 'in-gmail-drafts' && (
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              <Button key={`${d.file}:marksent`} label="Mark sent…" variant="primary" onPress={() => update($, armed, () => `${d.file}|marksent`)} />
              <Button key={`${d.file}:discard`} label="I deleted it in Gmail" dimColor onPress={() => update($, armed, () => `${d.file}|discard`)} />
            </Box>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Text wrap="wrap">{canSend
          ? 'Mode: send. "Send email" sends from your Gmail after you confirm.'
          : 'Mode: draft only. "Create Gmail draft" puts it in your Gmail drafts; you press Send in Gmail.'}</Text>
        {!ownSig && <Text color="warning" wrap="wrap">Your signature isn't set up, so emails go without one. Ask Claude to set it up (part of /start).</Text>}
        {note.text !== '' && <Text color={note.isError ? 'error' : 'success'}>{note.isError ? `Not done: ${note.text}` : note.text}</Text>}
        {list.length === 0 && held.length === 0 && <Text dimColor>No drafts waiting. Ask Claude to draft a follow-up, thank-you note, or networking message.</Text>}
        {list.map(card)}
        {held.length > 0 && <Text bold>Waiting in Gmail (press "Mark sent…" after you send each one)</Text>}
        {held.map(card)}
        {bad.length > 0 && (
          <Box flexDirection="column">
            <Text color="warning">{`Needs fixing (Claude can't read the header): ${bad.join(', ')}`}</Text>
            <Button key="fix-broken" label="Ask Claude to fix them" onPress={() => $.prompt.fill({ text: `Fix the header of these outbox drafts so they follow the format in AGENTS.md: ${bad.join(', ')}` })} />
          </Box>
        )}
        <Box flexDirection="row" gap={1}>
          <Button key="refresh" label="Refresh" onPress={() => scan($)} />
          <Button key="close" label="Close" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
