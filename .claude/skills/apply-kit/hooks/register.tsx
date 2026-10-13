import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Field, FileItem, Job, Kit, Notice, Section } from '../types'
import { activityLine, addDays, appendLine, colOf, columnsOf, csvTrouble, dateOrder, fingerprint, isIso, jobKey, localDate, orderFor, pageOf, readCsv, rowKey, saveRow, toIso } from './csvdate'
import type { DateOrder, FileIo } from './csvdate'

// Apply Kit: while the user fills in an online application form themselves, this pane shows every
// answer the form will ask for (from profile/ and the job's folder), each with a Copy button.
// It is read-only except "Mark applied", which updates that job's row in jobs/tracker.csv.
// It never shows sensitive data (SSN, date of birth, ID or bank numbers, passwords).

const PANE = 'apply-kit'
const TRACKER = 'jobs/tracker.csv'
const ACTIVITY = 'history/activity.md'
const RESUME = 'profile/master-resume.md'
const PREFS = 'profile/preferences.md'
const BOM = String.fromCharCode(0xfeff)
// The same words, in the same place (right under the panel's first line), in every panel.
const KEYS_HINT = 'Keys: Ctrl+X then Tab moves into this panel. Tab moves between buttons, Enter presses one, Esc goes back to typing.'
// Jobs per page in the job picker (a panel draws at most 100,000 characters).
const PICKER_SHOWN = 15
const MISSING = '[not set] — ask Claude'
const DATE_COLS = ['next_action_date', 'date_found', 'date_applied', 'deadline']
// A bracketed placeholder like [ASK] or [Your answer], but not a markdown link [text](url).
const PLACEHOLDER = /\[[^\]\n]{1,80}\](?!\()/
// Sensitive data is judged by the value, not by the question's words: "Do you have a valid driver's
// license? Yes" or "Why Bank of America?" are fine to show; a number under a sensitive question is not.
const SENSITIVE_KEY = /(\bssn\b|social security|date of birth|\bdob\b|birth ?date|passport|licen[cs]e|\bbank\b|routing|account number|bank account|\biban\b|password|tax id|\bitin\b|\bnin\b|national insurance|id number|identification number|visa number|alien|\ba-number|\bi-94\b)/i
// A run of 5 or more digits (spaces or dashes allowed between): an ID, account or date of birth.
const ID_LIKE = /\d(?:[\s./-]?\d){4,}/
const SENSITIVE_VALUE = /\b\d{3}-\d{2}-\d{4}\b|\bpass(?:word|wd)?\s*[:=]\s*\S/i
// Follow-up timing from knowledge/job-search-playbook.md: applied online, no response -> 7-10 business days.
const FOLLOW_UP_BUSINESS_DAYS = 7

const kit = atom({ plugin: 'apply-kit', key: 'kit' } as const, null as Kit | null)
const chosen = atom({ plugin: 'apply-kit', key: 'chosen' } as const, '')
const armed = atom({ plugin: 'apply-kit', key: 'armed' } as const, false)
const picking = atom({ plugin: 'apply-kit', key: 'picking' } as const, false)
const notice = atom({ plugin: 'apply-kit', key: 'notice' } as const, { text: '', isError: false } as Notice)
const isOpen = atom({ plugin: 'apply-kit', key: 'isOpen' } as const, false)
const pickerPage = atom({ plugin: 'apply-kit', key: 'pickerPage' } as const, 0)

// CSV and dates: csvdate.ts, the same rules as the Pipeline panel. A date is read only when its meaning
// is certain; anything else is left exactly as written for the user to confirm.

// Row identity: jobKey in csvdate.ts, the same as the Pipeline panel (company + role + folder, or job ID, link, date found).

// ---- Reading the user's files ----

async function readText($: any, path: string): Promise<string> {
  try {
    if (!(await $.fs.exists(path))) return ''
    const text = String(await $.fs.read(path))
    return (text.startsWith(BOM) ? text.slice(1) : text).replace(/\r\n?/g, '\n')
  } catch { return '' }
}

const noComments = (md: string) => md.replace(/<!--[\s\S]*?-->/g, '')

// The text under "## <title>" up to the next "## " heading.
function section(md: string, title: RegExp): string {
  const lines = noComments(md).split('\n')
  const start = lines.findIndex(l => /^##\s/.test(l) && !/^###/.test(l) && title.test(l.replace(/^##\s+/, '')))
  if (start < 0) return ''
  const rest = lines.slice(start + 1)
  const end = rest.findIndex(l => /^#{1,2}\s/.test(l) && !/^###/.test(l))
  return (end < 0 ? rest : rest.slice(0, end)).join('\n')
}

// "- Key (hint): value" or "key: value" lines; the key without bold, backticks or a parenthetical hint.
function valueOf(text: string, key: RegExp): string | undefined {
  for (const line of text.split('\n')) {
    const m = /^\s*(?:[-*]\s+)?([^:\n]{1,60}?):\s*(.*)$/.exec(line)
    if (!m) continue
    const k = (m[1] ?? '').replace(/[*`_]/g, '').replace(/\([^)]*\)/g, '').trim()
    if (key.test(k)) return m[2]
  }
  return undefined
}

function tidy(v: string | undefined, links: 'url' | 'text' = 'text'): string {
  if (v === undefined) return ''
  return v
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, links === 'url' ? '$2' : '$1')
    .replace(/\*\*|__|`/g, '')
    .trim()
}

const isUnset = (v: string) => v === '' || /\[ASK/i.test(v) || /^(tbd|n\/a|none yet)$/i.test(v)
// Under these labels the value is never shown, whatever it looks like ("Date of birth: May 5, 1995",
// a password with no "password:" prefix): such details don't belong in these files (AGENTS.md rule 4).
const ALWAYS_HIDDEN = /date of birth|\bdob\b|birth ?date|password|passcode|\bssn\b|social security|passport number|(?:^|\s)id number|identification number|national insurance number|tax id|account number|routing number|\biban\b/i
const isSensitive = (label: string, value: string) => ALWAYS_HIDDEN.test(label) || SENSITIVE_VALUE.test(value) || (SENSITIVE_KEY.test(label) && ID_LIKE.test(value))

// Questions only the user can answer: legal certifications and attestations, and anything Claude marked
// [ASK]. The kit never offers to draft or copy these.
const YOURS = /certif|attest|\bi (?:hereby )?(?:certify|confirm|acknowledge|agree)|true(?:,)? (?:and|&) (?:complete|correct|accurate)|convicted|criminal|felony|non-?compete|signature|e-?sign/i
const ONLY_YOU = 'Only you can answer this. Read the question on the form and answer it yourself.'

function field(id: string, label: string, raw: string, hint = '', missingText = MISSING): Field {
  if (isSensitive(label, raw)) {
    return { id, label, value: 'Hidden: this looks like sensitive information. Type it into the employer\'s site yourself.', copy: '', hint: 'Ask Claude to remove it from your files.', isMissing: true }
  }
  if (isUnset(raw)) return { id, label, value: missingText, copy: '', hint, isMissing: true }
  if (PLACEHOLDER.test(raw)) return { id, label, value: raw, copy: '', hint: 'This still has a blank to fill in. Answer it on the form yourself, or ask Claude.', isMissing: true }
  return { id, label, value: raw, copy: raw, hint, isMissing: false }
}

const info = (id: string, label: string, value: string, hint = ''): Field => ({ id, label, value, copy: '', hint, isMissing: false })

function frontmatter(md: string): { head: Record<string, string>; lists: Record<string, string[]>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(md.replace(/^\s+(?=---)/, ''))
  const head: Record<string, string> = {}
  const lists: Record<string, string[]> = {}
  if (!m) return { head, lists, body: md }
  let listKey = ''
  for (const line of (m[1] ?? '').split('\n')) {
    const item = /^\s*-\s+(.*)$/.exec(line)
    if (item && listKey) { (lists[listKey] ??= []).push((item[1] ?? '').replace(/\s{2,}#\s.*$/, '').trim()); continue }
    const at = line.indexOf(':')
    if (at < 1 || /^\s/.test(line)) continue
    const key = line.slice(0, at).trim().toLowerCase()
    const value = line.slice(at + 1).replace(/\s{2,}#\s.*$/, '').replace(/^\s*#.*$/, '').trim().replace(/^["']|["']$/g, '')
    head[key] = value
    listKey = value === '' ? key : ''
  }
  return { head, lists, body: m[2] ?? '' }
}

// ---- Building the kit ----

function contactSection(resume: string, prefs: string): { section: Section; name: string } {
  const c = section(resume, /^contact/i)
  const about = section(prefs, /^about you/i)
  const prefName = tidy(valueOf(about, /^name$/i))
  const resumeName = tidy(valueOf(c, /^name$/i)).replace(/\s*\([^)]*\)\s*$/, '')
  const name = !isUnset(prefName) ? prefName : resumeName
  const city = tidy(valueOf(c, /^location|^city/i))
  const home = tidy(valueOf(about, /^home_base$/i))
  return {
    name: isUnset(name) || PLACEHOLDER.test(name) ? '' : name,
    section: {
      title: 'Contact details',
      note: '',
      fields: [
        field('name', 'Full name', name),
        field('email', 'Email', tidy(valueOf(c, /^e-?mail/i))),
        field('phone', 'Phone', tidy(valueOf(c, /^phone|^mobile/i))),
        field('city', 'City, state', !isUnset(city) ? city : home),
        field('linkedin', 'LinkedIn', tidy(valueOf(c, /^linkedin/i), 'url')),
        field('portfolio', 'Portfolio or website', tidy(valueOf(c, /^portfolio|^website|^github/i), 'url'), 'Optional. Leave the form field blank if you don\'t have one.'),
      ],
    },
  }
}

// "- Work authorization (US): Yes" and "- Needs sponsorship (US): No": one pair per country (the
// preferences template's exact format). The template's own "(<country>)" line is not an answer.
function countryLines(text: string, key: RegExp): Array<{ country: string; value: string }> {
  const out: Array<{ country: string; value: string }> = []
  for (const line of text.split('\n')) {
    const m = /^\s*(?:[-*]\s+)?\**([^:(\n]+?)\s*\(([^)\n]+)\)\**\s*:\s*(.*)$/.exec(line)
    if (!m || !key.test((m[1] ?? '').replace(/[*`_]/g, '').trim())) continue
    const country = (m[2] ?? '').trim()
    if (country === '' || /^<.*>$/.test(country)) continue
    out.push({ country, value: tidy(m[3]) })
  }
  return out
}

function yesNo(id: string, label: string, raw: string | undefined, hint: string): Field {
  const v = raw ?? ''
  if (isUnset(v)) return { id, label, value: MISSING, copy: '', hint: `${hint} Only you can answer this.`, isMissing: true }
  if (/not sure|unsure|don'?t know|depends/i.test(v)) return { id, label, value: ONLY_YOU, copy: '', hint: '', isMissing: true, isYours: true }
  return field(id, label, v, hint)
}

function authFields(want: string): { fields: Field[]; note: string } {
  const auths = countryLines(want, /^work authori/i)
  const sponsors = countryLines(want, /^(needs )?sponsorship/i)
  const countries = [...new Set([...auths, ...sponsors].map(l => l.country))]
  if (countries.length > 0) {
    const fields = countries.flatMap(c => [
      yesNo(`auth-${c}`, `Authorized to work in ${c}`, auths.find(l => l.country === c)?.value, 'Answers "Are you legally authorized to work here?".'),
      yesNo(`sponsor-${c}`, `Needs sponsorship (${c})`, sponsors.find(l => l.country === c)?.value, 'Answers "Will you now or in the future require sponsorship?".'),
    ])
    return { fields, note: countries.length > 1 ? 'Use the answers for the country this job is in.' : '' }
  }
  // An older single line, like "Work authorization: Yes, authorized in the US; no sponsorship needed".
  const fields: Field[] = []
  const auth = tidy(valueOf(want, /^work authori/i))
  fields.push(field('auth', 'Work authorization', auth, isUnset(auth) ? 'Forms ask "Are you legally authorized to work here?" and "Will you now or in the future need sponsorship?". Only you can answer these.' : 'Your recorded answer to "Are you authorized to work here?" and "Do you need sponsorship?".'))
  const sponsor = valueOf(want, /sponsor/i)
  if (sponsor !== undefined) fields.push(field('sponsor', 'Needs sponsorship', tidy(sponsor)))
  return { fields, note: '' }
}

// What to type as a salary expectation: this job's drafted answer, else a desired salary from the
// preferences, else the range the posting lists. The user's minimum (salary floor) is never offered
// as an expectation: it is shown for their eyes only, with nothing to copy.
function salaryFields(want: string, jobAnswer: string, posted: string): Field[] {
  const out: Field[] = []
  const desired = tidy(valueOf(want, /^desired salary|^salary expectation|^target salary/i))
  const isSet = (v: string) => !isUnset(v) && !PLACEHOLDER.test(v) && !/not set|market range/i.test(v)
  if (isSet(jobAnswer)) out.push(field('salary', 'Salary expectation', jobAnswer, 'From this job\'s drafted answers.'))
  else if (isSet(desired)) out.push(field('salary', 'Salary expectation', desired, 'From your preferences.'))
  else if (isSet(posted)) out.push(field('salary', 'Salary expectation', posted, 'The pay range this posting lists. Entering it (or "Negotiable") is common; ask Claude for a number if you want one.'))
  else out.push({ id: 'salary', label: 'Salary expectation', value: 'Not set. Leave it blank if the field is optional, or type "Negotiable".', copy: 'Negotiable', hint: 'Ask Claude for a market range for this job if the form makes you enter a number.', isMissing: false })
  const floor = tidy(valueOf(want, /^salary floor|^minimum salary|^floor|^minimum pay/i))
  if (isSet(floor)) out.push(info('salary-floor', 'Your minimum — don\'t type this', floor, 'For your eyes only: putting your minimum on a form sets a low anchor.'))
  return out
}

function eligibilitySection(prefs: string, salaryAnswer = '', posted = ''): Section {
  const want = section(prefs, /^what you want/i)
  const auth = authFields(want)
  const fields: Field[] = [...auth.fields]
  fields.push(field('start', 'Earliest start date', tidy(valueOf(want, /^earliest start/i))))
  const relocate = valueOf(want, /relocat/i)
  const locations = tidy(valueOf(want, /^locations?$/i))
  const relocValue = relocate !== undefined ? tidy(relocate) : /relocat/i.test(locations) && !isUnset(locations) ? locations : ''
  fields.push(field('relocate', 'Willing to relocate', relocValue))
  fields.push(field('travel', 'Willing to travel', tidy(valueOf(want, /travel/i))))
  // Hourly and shift work: shown only when the user filled them in (forms for those jobs ask for them).
  for (const [id, label, key] of [['availability', 'Availability', /^availability$/i], ['hours', 'Hours wanted', /^hours wanted$/i], ['shifts', 'Shifts', /^shifts$/i]] as const) {
    const v = tidy(valueOf(want, key))
    if (!isUnset(v)) fields.push(field(id, label, v))
  }
  fields.push(...salaryFields(want, salaryAnswer, posted))
  return { title: 'Eligibility and preferences', note: auth.note, fields }
}

// How the user chose to answer voluntary self-identification questions: recorded answers, decline,
// or decide each time / not chosen yet (then the kit offers nothing to copy for them).
function eeoMode(prefs: string): 'answers' | 'decline' | 'each' | 'unset' {
  const use = tidy(valueOf(section(prefs, /^voluntary self/i), /^use these/i))
  if (isUnset(use)) return 'unset'
  if (/each time|decide/i.test(use)) return 'each'
  if (/decline|prefer not|^no\b/i.test(use)) return 'decline'
  return 'answers'
}
const SELF_ID = /race|ethnic|gender|\bsex\b|sexual orientation|disabilit|veteran|self-?identif|transgender|pronoun/i
// A self-identification question, not an essay that mentions one of these words.
const isSelfId = (label: string) => SELF_ID.test(label) && (label.length <= 40 || /identif|status|are you|do you|select|which best|what is your/i.test(label))

function eeoSection(prefs: string): Section {
  const eeo = section(prefs, /^voluntary self/i)
  const use = tidy(valueOf(eeo, /^use these/i))
  const title = 'Voluntary self-identification (optional questions)'
  if (isUnset(use)) return { title, note: 'You haven\'t chosen how to answer these yet. They\'re optional: answer them yourself on the form, or ask Claude to record your choice.', fields: [] }
  if (/each time|decide/i.test(use)) return { title, note: 'You chose to decide each time. Answer these yourself on the form.', fields: [] }
  if (/decline|prefer not|^no\b/i.test(use)) return { title, note: 'You chose not to self-identify. Pick "I don\'t wish to answer" (or "Decline to self-identify") for each one.', fields: [] }
  const one = (id: string, label: string, key: RegExp) => {
    const v = tidy(valueOf(eeo, key))
    return isUnset(v) ? info(id, label, 'Not recorded. Answer this one yourself.') : field(id, label, v)
  }
  return {
    title,
    note: 'Your confirmed answers. These are always optional.',
    fields: [one('race', 'Race/ethnicity', /^race/i), one('gender', 'Gender', /^gender/i), one('disability', 'Disability', /^disability/i), one('veteran', 'Veteran status', /^veteran/i)],
  }
}

function splitDates(d: string): [string, string] {
  const parts = d.split(/\s+(?:–|—|-|to)\s+|\s*[–—]\s*/).map(s => s.trim()).filter(Boolean)
  return [parts[0] ?? '', parts[1] ?? '']
}

function historySections(resume: string): Section[] {
  const out: Section[] = []
  // Education: "**School**, City, ST" (or "### School, City, ST"), then bullets.
  const edu = section(resume, /^education/i).split('\n')
  const schools: { head: string; bullets: string[] }[] = []
  for (const line of edu) {
    const h = /^\s*(?:\*\*(.+?)\*\*\s*,?\s*(.*)|###\s+(.*))$/.exec(line)
    if (h) { schools.push({ head: h[3] ?? `${h[1]}${h[2] ? `, ${h[2]}` : ''}`, bullets: [] }); continue }
    const b = /^\s*[-*]\s+(.*)$/.exec(line)
    if (b && schools.length > 0) schools[schools.length - 1]!.bullets.push(tidy(b[1]))
  }
  if (schools.length === 0) {
    out.push({ title: 'Education', note: '', fields: [field('edu', 'Education', '')] })
  }
  schools.forEach((s, i) => {
    const [school, ...where] = s.head.split(',').map(x => tidy(x))
    const degreeLine = s.bullets[0] ?? ''
    const dates = /\(([^()]*\d{4}[^()]*)\)/.exec(degreeLine)?.[1] ?? ''
    const degree = degreeLine.replace(/\s*\([^()]*\d{4}[^()]*\)/, '').trim()
    const details = s.bullets.slice(1).filter(b => !isUnset(b) && !PLACEHOLDER.test(b)).join('; ')
    out.push({
      title: schools.length > 1 ? `Education ${i + 1} of ${schools.length}` : 'Education',
      note: '',
      fields: [
        field(`edu${i}-school`, 'School', school ?? ''),
        field(`edu${i}-location`, 'Location', where.join(', ')),
        field(`edu${i}-degree`, 'Degree and major', degree),
        field(`edu${i}-dates`, 'Dates', dates.replace(/^expected\s+/i, 'Expected ')),
        ...(details ? [field(`edu${i}-details`, 'Also listed', details)] : []),
      ],
    })
  })
  // Experience: "### Company, City, ST: Job Title (Mon YYYY – Mon YYYY)", then bullets.
  const exp = section(resume, /^experience/i).split('\n')
  const jobs: { head: string; bullets: string[] }[] = []
  for (const line of exp) {
    const h = /^###\s+(.*)$/.exec(line)
    if (h) { jobs.push({ head: tidy(h[1]), bullets: [] }); continue }
    const b = /^\s*[-*]\s+(.*)$/.exec(line)
    if (b && b[1] && jobs.length > 0 && !isUnset(b[1]) && !PLACEHOLDER.test(b[1])) jobs[jobs.length - 1]!.bullets.push(tidy(b[1]))
  }
  if (jobs.length === 0) out.push({ title: 'Work history', note: '', fields: [field('exp', 'Work history', '')] })
  jobs.forEach((j, i) => {
    const m = /^(.*?):\s+(.*?)\s*\(([^()]*)\)\s*$/.exec(j.head)
    const left = m ? m[1] : j.head
    const [employer, ...where] = (left ?? '').split(',').map(x => x.trim())
    const [from, to] = splitDates(m?.[3] ?? '')
    out.push({
      title: `Job ${i + 1} of ${jobs.length}`,
      note: '',
      fields: [
        field(`job${i}-employer`, 'Employer', employer ?? ''),
        field(`job${i}-title`, 'Job title', m?.[2] ?? ''),
        field(`job${i}-start`, 'Start', from),
        field(`job${i}-end`, 'End', to),
        field(`job${i}-location`, 'Location', where.join(', ')),
        ...(j.bullets.length > 0 ? [field(`job${i}-desc`, 'Description', j.bullets.map(b => `- ${b}`).join('\n'))] : []),
      ],
    })
  })
  return out
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// application-answers.md: each question is a heading ("## Why this company?") or a bold line,
// with its answer below it. "Q:" / "A:" pairs work too.
function parseAnswers(md: string): Field[] {
  const { body } = frontmatter(noComments(md))
  const blocks: { q: string; a: string[] }[] = []
  for (const line of body.split('\n')) {
    const h = /^#{2,4}\s+(.*)$/.exec(line) ?? /^\s*\*\*(.+?)\*\*\s*$/.exec(line) ?? /^\s*(?:\*\*)?Q(?:uestion)?\s*:\s*(?:\*\*)?\s*(.*)$/i.exec(line)
    if (h) { blocks.push({ q: tidy(h[1]).replace(/^Q(?:uestion)?\s*:\s*/i, ''), a: [] }); continue }
    if (/^#\s/.test(line)) continue
    if (blocks.length > 0) blocks[blocks.length - 1]!.a.push(line.replace(/^\s*(?:\*\*)?A(?:nswer)?\s*:\s*(?:\*\*)?\s*/i, ''))
  }
  const fields = blocks
    .map((b, i) => {
      const answer = b.a.join('\n').trim()
      if (YOURS.test(b.q) || /\[ASK/i.test(answer)) return { id: `answer${i}`, label: b.q, value: ONLY_YOU, copy: '', hint: '', isMissing: true, isYours: true }
      return field(`answer${i}`, b.q, answer, '', 'Not drafted yet — ask Claude')
    })
  if (fields.length === 0 && body.trim() !== '') return [field('answers-all', 'Your drafted answers', body.trim())]
  return fields
}

function hyphenName(v: string): string {
  return v.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
}

// A PDF counts as ready to upload only when it is a real file (not a near-empty or broken print, not a
// "-CHECK.pdf" that make-pdf saved for the user to look at) and newer than the page it was printed from.
const MIN_PDF_BYTES = 3000

async function filesFor($: any, dir: string, job: Job, name: string, documents: string): Promise<FileItem[]> {
  const items: FileItem[] = []
  const company = hyphenName(job.company)
  const person = hyphenName(name)
  const exists = async (f: string) => { try { return await $.fs.exists(`${dir}/${f}`) } catch { return false } }
  let listing: Array<{ name: string; kind: string; size: number; mtimeMs: number }> = []
  try { listing = await $.fs.list(dir) } catch { listing = [] }
  // Matched by letters and digits only, so "Jane-O’Neil-Resume-Acme.pdf" (saved on a Mac) is found too.
  const entry = (file: string) => listing.find(e => e.kind === 'file' && /\.pdf$/i.test(e.name) && hyphenName(e.name.replace(/\.pdf$/i, '')).toLowerCase() === hyphenName(file.replace(/\.pdf$/i, '')).toLowerCase())
  const mtime = (file: string) => listing.find(e => e.name === file)?.mtimeMs ?? 0
  // sources: the formatted .html page the user prints to PDF. draft: the text-only version (Markdown),
  // which is not something to print or upload; it means Claude still has to build the page.
  // newer: other files a PDF is made from (resume.md, the RenderCV file); a PDF older than one of them is out of date.
  const doc = async (label: string, kind: string, sources: string[], command: string, need: 'required' | 'optional' | 'none', draft = '', newer: string[] = []) => {
    const pdf = person ? `${person}-${kind}-${company}.pdf` : ''
    const shown = pdf || `${MISSING} (your name isn't in your profile yet)`
    let source = ''
    for (const s of sources) if (!source && (await exists(s))) source = s
    const found = pdf ? entry(pdf) : undefined
    const check = pdf ? entry(pdf.replace(/\.pdf$/, '-CHECK.pdf')) : undefined
    if (found) {
      const isStale = source !== '' && mtime(source) > found.mtimeMs
      const changedText = [draft, ...newer].filter(Boolean).find(f => mtime(f) > found.mtimeMs) ?? ''
      if (found.size < MIN_PDF_BYTES) {
        items.push({ label, name: found.name, status: `This PDF looks empty or broken. ${source ? `Open ${source} in your browser, Print, Save as PDF with this name (replace the old file), and check it.` : 'Ask Claude to make it again.'}`, isReady: false, fix: source ? '' : `${command} ${job.folder || `${job.company} ${job.role}`}` })
      } else if (changedText !== '' && !isStale) {
        items.push({ label, name: found.name, status: `This PDF is older than your latest ${label.toLowerCase()} text (${changedText}), so it may be out of date. Ask Claude to rebuild the ${label.toLowerCase()} and its PDF.`, isReady: false, fix: `${command} ${job.folder || `${job.company} ${job.role}`}` })
      } else if (isStale) {
        items.push({ label, name: found.name, status: `This PDF is older than your latest ${label.toLowerCase()} (${source}), so it may be out of date. Open ${source} in your browser, Print, Save as PDF with this name (replace the old file).`, isReady: false, fix: '' })
      } else {
        items.push({ label, name: found.name, status: 'Saved in the job folder. Upload this file.', isReady: true, fix: '' })
      }
      return
    }
    if (check) {
      // Never rename a -CHECK file (tailor-resume): it can look fine and still have no readable text.
      items.push({ label, name: shown, status: `${check.name} needs a look first: the PDF maker couldn't confirm it came out right (an application system may not be able to read it). Don't rename it: ask Claude to make it again.`, isReady: false, fix: `${command} ${job.folder || `${job.company} ${job.role}`}` })
      return
    }
    if (source) {
      items.push({ label, name: shown, status: `Ready to save: open ${source} in your browser, Print, Save as PDF with this name.`, isReady: true, fix: '' })
    } else if (draft && (await exists(draft))) {
      items.push({ label, name: shown, status: `The ${label.toLowerCase()} text is drafted. Ask Claude to finish its checks, build the formatted ${label.toLowerCase()}, and create the PDF.`, isReady: false, fix: `${command} ${job.folder || `${job.company} ${job.role}`}` })
    } else if (need === 'none') {
      items.push({ label, name: 'Not needed', status: 'The posting doesn\'t ask for one.', isReady: true, fix: '' })
    } else {
      items.push({ label, name: shown, status: need === 'required' ? 'Not made yet, and this job needs one.' : 'Not made yet (optional for this job).', isReady: false, fix: `${command} ${job.folder || `${job.company} ${job.role}`}` })
    }
  }
  await doc('Resume', 'Resume', ['resume.html'], '/tailor-resume', 'required', 'resume.md', ['resume.rendercv.yaml'])
  const docs = documents.toLowerCase()
  const letterNeed = /cover letter[^,]*optional/.test(docs) ? 'optional' : /cover letter/.test(docs) ? 'required' : 'none'
  await doc('Cover letter', 'Cover-Letter', ['cover-letter.html'], '/cover-letter', letterNeed, 'cover-letter.md')
  for (const other of documents.split(',').map(s => s.trim()).filter(s => s && !/resume|cv\b|cover letter/i.test(s))) {
    items.push({ label: 'Also needed', name: other, status: 'You provide this one.', isReady: false, fix: '' })
  }
  return items
}

function pickDefault(all: Job[]): Job | undefined {
  const ready = all.filter(j => j.status === 'interested' && /^review package and submit/i.test(j.nextAction))
  const when = (j: Job) => (j.deadline || j.nextDate || '9999')
  return ready.sort((a, b) => when(a).localeCompare(when(b)))[0]
}

async function loadJobs($: any): Promise<Job[]> {
  const raw = await readText($, TRACKER)
  const order = dateOrder(await readText($, PREFS))
  const { rows: [header = [], ...rows], problem } = readCsv(raw)
  // A damaged tracker shows no jobs (only the message); its rows can't be trusted.
  if (problem !== '') return []
  const col = columnsOf(header)
  const at = (r: string[], name: string) => { const i = col(name); return i >= 0 ? (r[i] ?? '').trim() : '' }
  return rows.map(r => {
    const folder = at(r, 'folder')
    const o = orderFor(r, order)
    return {
      key: jobKey(c => at(r, c)),
      company: at(r, 'company'),
      role: at(r, 'role'),
      status: at(r, 'status').toLowerCase(),
      nextAction: at(r, 'next_action'),
      nextDate: toIso(at(r, 'next_action_date'), o),
      deadline: toIso(at(r, 'deadline'), o),
      // A folder name is one plain path segment; anything else is ignored rather than followed.
      folder: /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(folder) && !folder.includes('..') ? folder : '',
      contact: at(r, 'contact'),
      applyLink: at(r, 'apply_link') || at(r, 'link'),
      jobId: at(r, 'job_id'),
    }
  }).filter(j => j.company !== '')
}

async function build($: any, want: string): Promise<Kit> {
  const today = localDate(await $.clock.now())
  const all = await loadJobs($)
  const jobs = all.filter(j => j.status === 'interested')
  const job = all.find(j => j.key === want) ?? pickDefault(all) ?? null
  const resume = await readText($, RESUME)
  const prefs = await readText($, PREFS)
  const contact = contactSection(resume, prefs)
  const sections: Section[] = []
  let questions: Field[] = []
  let hasAnswers = false
  let files: FileItem[] = []
  let posted = ''
  if (job) {
    const dir = job.folder ? `jobs/${job.folder}` : ''
    const posting = frontmatter(dir ? await readText($, `${dir}/posting.md`) : '')
    const p = posting.head
    posted = p.pay_range ?? ''
    sections.push({
      title: 'This job',
      note: dir ? '' : 'This job has no folder yet, so there are no drafted answers or files. Paste the posting link to Claude to set it up.',
      fields: [
        field('apply-link', 'Apply here', p.apply_link || job.applyLink, '', 'Not saved — ask Claude'),
        field('job-id', 'Job ID', p.job_id || job.jobId, 'Some forms ask for it. Quote it in emails about this job.', 'Not listed on the posting'),
        info('deadline', 'Deadline', p.deadline || job.deadline || 'Not listed (often "open until filled")'),
        ...(job.contact ? [field('referral', 'Your contact here', job.contact, 'If this person referred you, enter their name in the form\'s referral field.')] : []),
      ],
    })
    const answersText = dir ? await readText($, `${dir}/application-answers.md`) : ''
    hasAnswers = answersText.trim() !== ''
    questions = hasAnswers ? parseAnswers(answersText) : []
    const asked = (posting.lists.questions ?? []).filter(q => q.trim() !== '')
    asked.forEach((q, i) => {
      const n = norm(q)
      const drafted = questions.some(f => { const m = norm(f.label); return m !== '' && n !== '' && (m.includes(n) || n.includes(m)) })
      if (drafted) return
      if (YOURS.test(q)) questions.push({ id: `asked${i}`, label: q, value: ONLY_YOU, copy: '', hint: '', isMissing: true, isYours: true })
      else questions.push({ id: `asked${i}`, label: q, value: hasAnswers ? 'Not drafted yet — ask Claude' : 'No answer drafted yet', copy: '', hint: '', isMissing: true })
    })
    files = dir ? await filesFor($, dir, job, contact.name, p.documents ?? '') : []
  }
  // Your answers to self-identification questions follow your current choice in preferences, even if
  // they were drafted before you changed it.
  const mode = eeoMode(prefs)
  if (mode !== 'answers') {
    questions = questions.map(q => (isSelfId(q.label) && !q.isYours
      ? { ...q, value: mode === 'decline' ? 'You chose not to self-identify. Pick "I don\'t wish to answer" (or "Decline to self-identify").' : 'You chose to answer these yourself each time (or haven\'t chosen yet). Answer it on the form.', copy: '', hint: 'Optional.', isMissing: false, isYours: true }
      : q))
  }
  // A question about what you earn now or earned before is not your salary expectation.
  const salaryAnswer = questions.find(q => /salary|compensation|pay (?:expectation|requirement|range)|expected pay/i.test(q.label) && !/current|previous|prior|last|history|present/i.test(q.label) && q.copy !== '')?.copy ?? ''
  sections.push(contact.section, eligibilitySection(prefs, salaryAnswer, posted), eeoSection(prefs), ...historySections(resume))
  // The tracker as it is now: its problems, and the fingerprint "Mark applied" checks before saving.
  const rawTracker: string = (await $.fs.exists(TRACKER).catch(() => false)) ? await $.fs.read(TRACKER).then(String, () => '') : ''
  const problem = csvTrouble(readCsv(rawTracker).problem, 'Your tracker (jobs/tracker.csv)')
  return { today, job, jobs, sections, questions, hasAnswers, files, followUpDate: addDays(today, FOLLOW_UP_BUSINESS_DAYS, true), problem, sig: fingerprint(rawTracker) }
}

async function refresh($: any): Promise<Kit> {
  const next = await build($, await read($, chosen))
  if (next.job && next.job.key !== (await read($, chosen))) await update($, chosen, () => next.job!.key)
  if (JSON.stringify(await read($, kit)) !== JSON.stringify(next)) await update($, kit, () => next)
  return next
}

// Moves the keyboard focus onto a button the next drawing shows, after the pressed one went away
// (the confirm row or the job list opened or closed). Refused when the panel doesn't hold the keyboard.
function focusOn($: any, key: string): void {
  void Promise.resolve().then(() => $.ui.focus({ requestId: PANE, key })).catch(() => undefined)
}

async function say($: any, text: string, isError = false): Promise<void> {
  await update($, notice, () => ({ text, isError }))
}

async function logActivity($: any, what: string): Promise<void> {
  await appendLine(io($), ACTIVITY, activityLine(await $.clock.now(), 'Apply Kit panel (Claude)', what))
}

// The file calls the shared helpers in csvdate.ts use (the engine interface can't cross an import).
function io($: any): FileIo {
  return { exists: p => $.fs.exists(p), read: async p => String(await $.fs.read(p)), write: (p, t) => $.fs.write(p, t), list: d => $.fs.list(d) }
}

// Re-read the tracker, set the one row to applied, write it back, log it, and tell Claude. Refused when
// the tracker changed since the kit read it (no file lock exists): the kit then shows the new version.
async function markApplied($: any, job: Job): Promise<void> {
  const today = localDate(await $.clock.now())
  const order = dateOrder(await readText($, PREFS))
  const seen = (await read($, kit))?.sig ?? ''
  const nextAction = (contact: string) => (contact ? `Follow up with ${contact}` : 'Follow up')
  let already = ''
  const saved = await saveRow(io($), TRACKER, {
    seen,
    name: 'Your tracker',
    label: 'Your tracker (jobs/tracker.csv)',
    // Found by its cells as read, before any of its dates is tidied; other rows stay as they are.
    find: (header, rows) => rows.find(r => rowKey(header, r, jobKey) === job.key),
    edit: (target, get, set, header) => {
      if (get('status').toLowerCase() !== 'interested') { already = get('status'); return undefined }
      const o = orderFor(target, order)
      for (const c of DATE_COLS) { const i = colOf(header, c); if (i >= 0 && target[i]) target[i] = toIso(target[i], o) }
      const ni = colOf(header, 'notes')
      if (ni >= 0 && target[ni]) target[ni] = tidyAlso(target[ni] ?? '', o)
      const out = { nextAction: nextAction(get('contact').split(/[;,]/)[0]?.trim() ?? ''), nextDate: addDays(today, FOLLOW_UP_BUSINESS_DAYS, true) }
      set('status', 'applied')
      set('date_applied', today)
      set('next_action', out.nextAction)
      set('next_action_date', out.nextDate)
      set('followups', '0')
      return out
    },
  })
  if (!saved.ok) {
    await update($, armed, () => false)
    await refresh($).catch(() => undefined)
    const text = saved.why === 'refused' ? `${job.company} is already marked "${already}" in your tracker, so nothing was changed.`
      : saved.why === 'no-row' ? 'That job is no longer in your tracker. Press Refresh, or ask Claude to check it.'
      : saved.why === 'excel' ? 'Your tracker is open in Excel. Save and close it there, then press "Yes, I submitted it" again (otherwise Excel would later put back its older copy).'
      : saved.why === 'changed' ? 'Your tracker changed in another app since this kit read it, so nothing was saved. The kit now shows the latest version: check it, then press "Yes, I submitted it" again.'
      : saved.why === 'lost' ? 'Another app saved your tracker at the same moment, so "applied" may not have been recorded. Check the job, and tell Claude you applied if it still shows "interested".'
      : saved.text
    await say($, text, true)
    return
  }
  const result = saved.result
  const what = `${job.company} (${job.role}): marked applied on ${today}; follow-up set for ${result.nextDate}`
  await logActivity($, what)
  await update($, armed, () => false)
  await refresh($)
  await say($, `Marked applied today (${today}). Follow-up is set for ${result.nextDate}. Save or screenshot the confirmation page.`)
  await $.session.append({
    message: { type: 'user', content: [{ type: 'text', text: `[Apply Kit] The user marked ${job.company} (${job.role}) as applied from the Apply Kit. jobs/tracker.csv now has status=applied, date_applied=${today}, next_action=${result.nextAction}, next_action_date=${result.nextDate}, followups=0. If they actually applied on another day, ask and correct the dates. Finish what the apply skill does after submitting (e.g. a recruiter question in the Outbox, contacts/contacts.csv if someone referred them). If the dashboard is published (profile/published-pages.md), republish it the next time the user talks to you.` }] },
  }).catch(() => undefined)
}

// When a save tidies this row's dates into YYYY-MM-DD, the "Also: <step> <date>" at the start of the
// notes is tidied with the same order. Otherwise the row would lose the date that proved its order,
// and the Also: date would later be read another way (date_order) or become "date unclear".
function tidyAlso(notes: string, order: DateOrder): string {
  const m = /^(\s*Also:\s*[^;|]*?\s*)(\d{1,2}[./]\d{1,2}[./](?:\d{4}|\d{2}))\b/i.exec(notes)
  if (!m) return notes
  const iso = toIso(m[2] ?? '', order)
  return isIso(iso) ? `${m[1] ?? ''}${iso}${notes.slice(m[0].length)}` : notes
}

function matchArg(jobs: Job[], arg: string): Job | undefined {
  const a = arg.trim().toLowerCase()
  if (a === '') return undefined
  return jobs.find(j => j.folder.toLowerCase() === a) ?? jobs.find(j => `${j.company} ${j.role}`.toLowerCase().includes(a)) ?? jobs.find(j => a.includes(j.company.toLowerCase()))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'apply-kit', description: 'Every answer an application form asks for, ready to copy, for the job you\'re applying to' })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // Claude may have just drafted answers or a resume: keep the kit current while its pane is open.
    if ((await read($, kit)) !== null && (await read($, isOpen))) await refresh($).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'apply-kit' }, async ($, e) => {
    const all = await loadJobs($)
    const hit = matchArg(all, String((e as any).args ?? ''))
    if (hit) await update($, chosen, () => hit.key)
    await update($, armed, () => false)
    await say($, '')
    const k = await refresh($)
    await update($, picking, () => k.job === null)
    const opened = await $.ui.open({ id: PANE, title: 'Apply Kit', focus: true })
    await update($, isOpen, () => opened.isPlaced)
    if (!opened.isPlaced) {
      return {
        text: `${k.job ? `Apply Kit: ${k.job.company} · ${k.job.role}.` : 'Apply Kit.'} The kit can't show in this window, so ask Claude for "my apply kit" and the answers will be listed here in the chat.`,
        context: ['The Apply Kit panel is not visible in this app or window. If the user asks, use the chat version of the apply-kit skill (.agents/skills/apply-kit/SKILL.md).'],
      }
    }
    return { text: k.job ? `Apply Kit: ${k.job.company} · ${k.job.role}` : 'Apply Kit: pick the job you\'re applying to.' }
  })

  // The pane closed (its Close button, the person's close mark, or Esc): stop keeping the kit current.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const done = await next(e)
    await update($, isOpen, () => false)
    return done
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const k = await read($, kit)
    const note = await read($, notice)
    const isArmed = await read($, armed)
    const isPicking = await read($, picking)
    if (k === null) return <Text dimColor>Loading…</Text>

    const copy = async (f: { label: string; copy: string }, surface: any) => {
      const done = await $.ui.copy({ text: f.copy, surface })
      if (done.isCopied) await say($, `Copied ${f.label}. Paste it into the form.`)
      else await say($, 'Unable to copy here. Select the text and copy it yourself.', true)
    }

    // The keyboard's focus starts on the first Copy button (copying changes nothing).
    const firstCopy = [...k.sections.filter(s => s.title === 'This job'), ...k.sections].flatMap(s => s.fields).find(f => f.copy !== '')?.id ?? ''
    const row = (f: Field) => {
      const isShort = f.value.length <= 60 && !f.value.includes('\n')
      const copyButton = f.copy !== '' && (f.id === firstCopy
        ? <Button key={`copy:${f.id}`} label={`Copy (${f.label})`} autoFocus onPress={press => copy(f, press.surface)}>Copy</Button>
        : <Button key={`copy:${f.id}`} label={`Copy (${f.label})`} onPress={press => copy(f, press.surface)}>Copy</Button>)
      // Every Copy button is named after its answer for screen readers ("Copy (Email)"), drawn as "Copy".
      return (
        <Box key={f.id} flexDirection="column">
          {isShort ? (
            <Box flexDirection="row" gap={1}>
              <Text color={f.isMissing ? 'warning' : undefined}>{`${f.label}: ${f.value}`}</Text>
              {copyButton}
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text bold>{f.label}</Text>
              <Text wrap="wrap" color={f.isMissing ? 'warning' : undefined}>{f.value}</Text>
              {copyButton}
            </Box>
          )}
          {f.hint !== '' && <Text dimColor wrap="wrap">{f.hint}</Text>}
        </Box>
      )
    }

    const block = (s: Section) => (
      <Box key={`section:${s.title}`} flexDirection="column" borderStyle="round" paddingX={1}>
        <Text bold>{s.title}</Text>
        {s.note !== '' && <Text dimColor wrap="wrap">{s.note}</Text>}
        {s.fields.map(row)}
      </Box>
    )

    const picked = pageOf(k.jobs, await read($, pickerPage), PICKER_SHOWN)
    const picker = (
      <Box key="picker" flexDirection="column" borderStyle="round" paddingX={1}>
        <Text bold>Which job are you applying to?</Text>
        {k.jobs.length === 0 && <Text wrap="wrap">No jobs are waiting for you to apply. Paste a job link to Claude, or type /find-jobs.</Text>}
        {picked.items.map(j => {
          const label = `${j.key === k.job?.key ? 'Current: ' : ''}${j.company} · ${j.role}${j.deadline ? ` · deadline ${j.deadline}` : ''}`
          const pick = async () => {
            await update($, chosen, () => j.key)
            await update($, picking, () => false)
            await update($, armed, () => false)
            await say($, '')
            await refresh($)
            focusOn($, 'switch')
          }
          return <Button key={`pick:${j.key}`} label={label} onPress={pick} />
        })}
        {picked.pages > 1 && (
          <Box key="picker-pager" flexDirection="row" gap={1} flexWrap="wrap">
            <Text dimColor>{`Showing ${picked.from}–${picked.to} of ${k.jobs.length}`}</Text>
            {picked.page > 0 && <Button key="picker-prev" label="Previous page" plain onPress={() => update($, pickerPage, () => picked.page - 1)} />}
            {picked.page < picked.pages - 1 && <Button key="picker-next" label="Next page" plain onPress={() => update($, pickerPage, () => picked.page + 1)} />}
          </Box>
        )}
      </Box>
    )

    const job = k.job
    const profileGaps = k.sections.filter(s => s.title !== 'This job').flatMap(s => s.fields).filter(f => f.isMissing && f.value === MISSING).map(f => f.label)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1}>
          <Button key="refresh" label="Refresh" onPress={async () => { await say($, ''); await refresh($) }} />
          <Button key="close" label="Close" role="dismiss" onPress={async () => { await update($, isOpen, () => false); await $.ui.close({ id: PANE }) }} />
        </Box>
        {e.surface === 'terminal' && <Text>{KEYS_HINT}</Text>}
        {job ? (
          <Box flexDirection="column">
            <Text bold>{`${job.company} · ${job.role}`}</Text>
            <Text dimColor wrap="wrap">Copy each answer into the application form. You fill in and submit the form yourself; nothing here sends anything.</Text>
          </Box>
        ) : (
          <Text dimColor wrap="wrap">Pick a job to see its answers. Your profile answers are below either way.</Text>
        )}
        {k.problem !== '' && <Text color="error" wrap="wrap">{k.problem}</Text>}
        {note.text !== '' && <Text color={note.isError ? 'error' : 'success'} wrap="wrap">{note.isError ? `Not done: ${note.text}` : note.text}</Text>}
        {(isPicking || !job) ? picker : <Button key="switch" label="Switch job" plain onPress={async () => { await update($, picking, () => true); const first = k.jobs[0]; if (first) focusOn($, `pick:${first.key}`) }} />}
        {k.sections.filter(s => s.title === 'This job').map(block)}
        {job && (
          <Box key="questions" flexDirection="column" borderStyle="round" paddingX={1}>
            <Text bold>This job's application questions</Text>
            {!k.hasAnswers && <Text dimColor wrap="wrap">No answers have been drafted for this job yet.</Text>}
            {k.hasAnswers && <Text dimColor wrap="wrap">Drafted by Claude from your profile. Read each one before you paste it.</Text>}
            {k.questions.map(row)}
            {(!k.hasAnswers || k.questions.some(q => q.isMissing && !q.isYours)) && (
              <Button key="draft-answers" label="Ask Claude to draft answers" onPress={() => $.prompt.fill({ text: `Draft my application answers for ${job.company} ${job.role}${job.folder ? ` (jobs/${job.folder}/application-answers.md)` : ''}, including every question on the posting.` })} />
            )}
          </Box>
        )}
        {job && k.files.length > 0 && (
          <Box key="files" flexDirection="column" borderStyle="round" paddingX={1}>
            <Text bold>Files to upload</Text>
            {k.files.map(f => (
              <Box key={`file:${f.label}:${f.name}`} flexDirection="column">
                <Box flexDirection="row" gap={1}>
                  <Text color={f.isReady ? undefined : 'warning'}>{`${f.label}: ${f.name}`}</Text>
                  {/\.pdf$/.test(f.name) && <Button key={`copy:file:${f.label}`} label={`Copy name (${f.label} file)`} onPress={press => copy({ label: `the ${f.label.toLowerCase()} file name`, copy: f.name }, press.surface)}>Copy name</Button>}
                </Box>
                <Text dimColor={f.isReady} wrap="wrap">{f.status}</Text>
                {f.fix !== '' && <Button key={`fix:${f.label}`} label={`Ask Claude to make the ${f.label.toLowerCase()}`} plain onPress={() => $.prompt.fill({ text: f.fix })} />}
              </Box>
            ))}
          </Box>
        )}
        {k.sections.filter(s => s.title !== 'This job').map(block)}
        {profileGaps.length > 0 && (
          <Button key="fill-gaps" label="Ask Claude to fill in what's missing" plain onPress={() => $.prompt.fill({ text: `My Apply Kit is missing these details from my profile: ${profileGaps.join(', ')}. Ask me for them one at a time and add them.` })} />
        )}
        {job && job.status === 'interested' && !isArmed && (
          <Button key="mark-applied" label="Mark applied…" variant="primary" onPress={async () => { await update($, armed, () => true); focusOn($, 'confirm-applied') }} />
        )}
        {job && job.status === 'interested' && isArmed && (
          <Box key="confirm" flexDirection="column" borderStyle="round" paddingX={1}>
            <Text bold wrap="wrap">{`Did you submit the application to ${job.company} today? This marks it applied on ${k.today} and sets a follow-up for ${k.followUpDate}. If you applied on another day, tell Claude instead.`}</Text>
            <Box flexDirection="row" gap={1}>
              <Button key="confirm-applied" label="Yes, I submitted it" variant="primary" onPress={async () => { await markApplied($, job); focusOn($, 'refresh') }} />
              <Button key="cancel-applied" label="Cancel" onPress={async () => { await update($, armed, () => false); focusOn($, 'mark-applied') }} />
            </Box>
          </Box>
        )}
        {job && job.status !== 'interested' && (
          <Text dimColor wrap="wrap">{`This job is marked "${job.status}" in your tracker${job.nextAction ? `. Next: ${job.nextAction}${job.nextDate ? ` (${job.nextDate})` : ''}` : ''}.`}</Text>
        )}
      </Box>
    )
  })
}
