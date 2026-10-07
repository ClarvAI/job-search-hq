import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Field, FileItem, Job, Kit, Notice, Section } from '../types'

// Apply Kit: while the user fills in an online application form themselves, this pane shows every
// answer the form will ask for (from profile/ and the job's folder), each with a Copy button.
// It is read-only except "Mark applied", which updates that job's row in jobs/tracker.csv.
// It never shows sensitive data (SSN, date of birth, ID or bank numbers, passwords).

const PANE = 'apply-kit'
const TRACKER = 'jobs/tracker.csv'
const ACTIVITY = 'history/activity.md'
const RESUME = 'profile/master-resume.md'
const PREFS = 'profile/preferences.md'
const MISSING = '[not set] — ask Claude'
const DATE_COLS = ['next_action_date', 'date_found', 'date_applied', 'deadline']
// A bracketed placeholder like [ASK] or [Your answer], but not a markdown link [text](url).
const PLACEHOLDER = /\[[^\]\n]{1,80}\](?!\()/
const SENSITIVE_KEY = /(\bssn\b|social security|date of birth|\bdob\b|birth ?date|passport|licen[cs]e number|driver'?s? licen[cs]e|\bbank\b|routing|account number|password|tax id|\bitin\b|id number)/i
const SENSITIVE_VALUE = /\b\d{3}-\d{2}-\d{4}\b/
// Follow-up timing from knowledge/job-search-playbook.md: applied online, no response -> 7-10 business days.
const FOLLOW_UP_BUSINESS_DAYS = 7

const kit = atom({ plugin: 'apply-kit', key: 'kit' } as const, null as Kit | null)
const chosen = atom({ plugin: 'apply-kit', key: 'chosen' } as const, '')
const armed = atom({ plugin: 'apply-kit', key: 'armed' } as const, false)
const picking = atom({ plugin: 'apply-kit', key: 'picking' } as const, false)
const notice = atom({ plugin: 'apply-kit', key: 'notice' } as const, { text: '', isError: false } as Notice)

// ---- CSV and dates (same rules as the Pipeline panel) ----

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(v => v.trim() !== ''))
}

function toCsv(rows: string[][]): string {
  const q = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return rows.map(r => r.map(q).join(',')).join('\n') + '\n'
}

// tracker.csv holds plain characters only, so it opens cleanly in Excel.
// A cell never starts with = + - @ or a tab: Excel would run it as a formula, so those are dropped.
function plain(v: string): string {
  return v.replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[\r\n]+/g, ' ').replace(/^[\s=+\-@]+/, '')
}

function localDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function addDays(iso: string, days: number, businessOnly = false): string {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  let left = days
  while (left > 0) {
    date.setDate(date.getDate() + 1)
    const wd = date.getDay()
    if (!businessOnly || (wd !== 0 && wd !== 6)) left--
  }
  return localDate(date.getTime())
}

// Same date rules as the Pipeline panel: a slash date is read only when its day/month order is
// certain (a part over 12, both parts the same, or a US or day-first home_base); otherwise it is
// left exactly as written for the user to confirm.
type DateOrder = 'mdy' | 'dmy' | ''
const US_STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY'
function dateOrder(prefs: string): DateOrder {
  const home = /^[ \t]*home_base:[ \t]*(.*)$/m.exec(prefs)?.[1]?.trim() ?? ''
  if (/\b(USA|U\.S\.A?\.?|United States)\b/i.test(home) || new RegExp(`,\\s*(${US_STATES})\\b`).test(home)) return 'mdy'
  if (/\b(UK|U\.K\.|United Kingdom|Britain|England|Scotland|Wales|Ireland|Australia|New Zealand|India|South Africa|Singapore|Germany|France|Spain|Italy|Portugal|Netherlands|Belgium|Brazil|Mexico)\b/i.test(home)) return 'dmy'
  return ''
}
function toIso(v: string, order: DateOrder = ''): string {
  const t = v.trim()
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t)
  if (!m || !m[3]) return t
  const a = Number(m[1]), b = Number(m[2])
  const [mo = 0, da = 0] = a === b ? [a, b] : a > 12 ? [b, a] : b > 12 ? [a, b] : order === 'mdy' ? [a, b] : order === 'dmy' ? [b, a] : [0, 0]
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return t
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${pad(mo)}-${pad(da)}`
}

// Same row identity as the Pipeline panel: company + role + folder (or job ID, link, date found).
function keyOf(company: string, role: string, folder = ''): string {
  const base = `${company.trim().toLowerCase()}|${role.trim().toLowerCase()}`
  return folder.trim() ? `${base}|${folder.trim().toLowerCase()}` : base
}
function rowKey(get: (c: string) => string): string {
  return keyOf(get('company'), get('role'), get('folder') || get('job_id') || get('link') || get('date_found'))
}

// ---- Reading the user's files ----

async function readText($: any, path: string): Promise<string> {
  try {
    if (!(await $.fs.exists(path))) return ''
    return String(await $.fs.read(path)).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
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
const isSensitive = (label: string, value: string) => SENSITIVE_KEY.test(label) || SENSITIVE_VALUE.test(value)

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

function eligibilitySection(prefs: string): Section {
  const want = section(prefs, /^what you want/i)
  const fields: Field[] = []
  const auth = tidy(valueOf(want, /^work authori/i))
  fields.push(field('auth', 'Work authorization', auth, isUnset(auth) ? 'Forms ask "Are you legally authorized to work here?" and "Will you now or in the future need sponsorship?". Only you can answer these.' : 'Your recorded answer to "Are you authorized to work here?" and "Do you need sponsorship?".'))
  const sponsor = valueOf(want, /sponsor/i)
  if (sponsor !== undefined) fields.push(field('sponsor', 'Needs sponsorship', tidy(sponsor)))
  fields.push(field('start', 'Earliest start date', tidy(valueOf(want, /^earliest start/i))))
  const relocate = valueOf(want, /relocat/i)
  const locations = tidy(valueOf(want, /^locations?$/i))
  const relocValue = relocate !== undefined ? tidy(relocate) : /relocat/i.test(locations) && !isUnset(locations) ? locations : ''
  fields.push(field('relocate', 'Willing to relocate', relocValue))
  fields.push(field('travel', 'Willing to travel', tidy(valueOf(want, /travel/i))))
  const salary = tidy(valueOf(want, /^salary|^desired salary|^pay/i))
  if (isUnset(salary) || /not set|market range/i.test(salary)) {
    fields.push({ id: 'salary', label: 'Salary expectation', value: 'Not set. Leave it blank if the field is optional, or type "Negotiable".', copy: 'Negotiable', hint: 'Ask Claude for a market range for this job if the form makes you enter a number.', isMissing: false })
  } else {
    fields.push(field('salary', 'Salary expectation', salary, 'From your preferences. Check this job\'s answers below for a range tailored to it.'))
  }
  return { title: 'Eligibility and preferences', note: '', fields }
}

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
    .map((b, i) => field(`answer${i}`, b.q, b.a.join('\n').trim(), '', 'Not drafted yet — ask Claude'))
  if (fields.length === 0 && body.trim() !== '') return [field('answers-all', 'Your drafted answers', body.trim())]
  return fields
}

function hyphenName(v: string): string {
  return v.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
}

async function filesFor($: any, dir: string, job: Job, name: string, documents: string): Promise<FileItem[]> {
  const items: FileItem[] = []
  const company = hyphenName(job.company)
  const person = hyphenName(name)
  const exists = async (f: string) => { try { return await $.fs.exists(`${dir}/${f}`) } catch { return false } }
  // sources: the formatted .html page the user prints to PDF. draft: the text-only version (Markdown),
  // which is not something to print or upload; it means Claude still has to build the page.
  const doc = async (label: string, kind: string, sources: string[], command: string, need: 'required' | 'optional' | 'none', draft = '') => {
    const pdf = person ? `${person}-${kind}-${company}.pdf` : ''
    const shown = pdf || `${MISSING} (your name isn't in your profile yet)`
    if (pdf && (await exists(pdf))) { items.push({ label, name: pdf, status: 'Saved in the job folder. Upload this file.', isReady: true, fix: '' }); return }
    let source = ''
    for (const s of sources) if (!source && (await exists(s))) source = s
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
  await doc('Resume', 'Resume', ['resume.html'], '/tailor-resume', 'required', 'resume.md')
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
  const [header = [], ...rows] = parseCsv(raw)
  const col = (name: string) => header.findIndex(h => h.trim().toLowerCase() === name)
  const at = (r: string[], name: string) => (col(name) >= 0 ? (r[col(name)] ?? '').trim() : '')
  return rows.map(r => {
    const folder = at(r, 'folder')
    return {
      key: rowKey(c => at(r, c)),
      company: at(r, 'company'),
      role: at(r, 'role'),
      status: at(r, 'status').toLowerCase(),
      nextAction: at(r, 'next_action'),
      nextDate: toIso(at(r, 'next_action_date'), order),
      deadline: toIso(at(r, 'deadline'), order),
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
  if (job) {
    const dir = job.folder ? `jobs/${job.folder}` : ''
    const posting = frontmatter(dir ? await readText($, `${dir}/posting.md`) : '')
    const p = posting.head
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
      if (!drafted) questions.push({ id: `asked${i}`, label: q, value: hasAnswers ? 'Not drafted yet — ask Claude' : 'No answer drafted yet', copy: '', hint: '', isMissing: true })
    })
    files = dir ? await filesFor($, dir, job, contact.name, p.documents ?? '') : []
  }
  sections.push(contact.section, eligibilitySection(prefs), eeoSection(prefs), ...historySections(resume))
  return { today, job, jobs, sections, questions, hasAnswers, files, followUpDate: addDays(today, FOLLOW_UP_BUSINESS_DAYS, true) }
}

async function refresh($: any): Promise<Kit> {
  const next = await build($, await read($, chosen))
  if (next.job && next.job.key !== (await read($, chosen))) await update($, chosen, () => next.job!.key)
  if (JSON.stringify(await read($, kit)) !== JSON.stringify(next)) await update($, kit, () => next)
  return next
}

async function say($: any, text: string, isError = false): Promise<void> {
  await update($, notice, () => ({ text, isError }))
}

async function logActivity($: any, what: string): Promise<void> {
  const d = new Date(await $.clock.now())
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${localDate(d.getTime())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  const lineOut = `- ${stamp} · Apply Kit panel (Claude) · ${what.replace(/[\r\n]+/g, ' ')}\n`
  try {
    const before: string = (await $.fs.exists(ACTIVITY)) ? await $.fs.read(ACTIVITY) : '# Recent activity\n\n'
    await $.fs.write(ACTIVITY, before.replace(/\n*$/, '\n') + lineOut)
    const after: string = await $.fs.read(ACTIVITY)
    if (!after.includes(lineOut)) await $.fs.write(ACTIVITY, after.replace(/\n*$/, '\n') + lineOut)
  } catch { /* the log is a convenience; never block a tracker save on it */ }
}

// Re-read the tracker, set the one row to applied, write it back, log it, and tell Claude.
async function markApplied($: any, job: Job): Promise<void> {
  const today = localDate(await $.clock.now())
  let what = ''
  let saved = { nextAction: '', nextDate: '' }
  const order = dateOrder(await readText($, PREFS))
  for (let attempt = 0; ; attempt++) {
    let original = ''
    try { original = await $.fs.read(TRACKER) } catch { await say($, 'I couldn\'t read your tracker (jobs/tracker.csv). Ask Claude to check it.', true); return }
    const rows = parseCsv(original.replace(/^\uFEFF/, ''))
    const header = rows[0] ?? []
    const find = (c: string) => header.findIndex(h => h.trim().toLowerCase() === c)
    const idx = (c: string) => { let i = find(c); if (i < 0) { header.push(c); i = header.length - 1 } return i }
    // Find the row by its cells as read, before any of its dates is tidied; other rows stay as they are.
    const target = rows.slice(1).find(r => rowKey(c => (find(c) >= 0 ? (r[find(c)] ?? '') : '').trim()) === job.key)
    if (!target) { await say($, 'That job is no longer in your tracker. Press Refresh, or ask Claude to check it.', true); return }
    for (const c of DATE_COLS) { const i = find(c); if (i >= 0 && target[i]) target[i] = toIso(target[i], order) }
    const get = (c: string) => (target[idx(c)] ?? '').trim()
    const set = (c: string, v: string) => { const i = idx(c); while (target.length <= i) target.push(''); target[i] = plain(v) }
    if (get('status').toLowerCase() !== 'interested') {
      await update($, armed, () => false)
      await say($, `${job.company} is already marked "${get('status')}" in your tracker, so nothing was changed.`, true)
      await refresh($)
      return
    }
    const contact = get('contact').split(/[;,]/)[0]?.trim() ?? ''
    saved = { nextAction: contact ? `Follow up with ${contact}` : 'Follow up', nextDate: addDays(today, FOLLOW_UP_BUSINESS_DAYS, true) }
    set('status', 'applied')
    set('date_applied', today)
    set('next_action', saved.nextAction)
    set('next_action_date', saved.nextDate)
    set('followups', '0')
    for (const r of rows) while (r.length < header.length) r.push('')
    what = `${job.company} (${job.role}): marked applied on ${today}; follow-up set for ${saved.nextDate}`
    const next = (original.startsWith('\uFEFF') ? '\uFEFF' : '') + toCsv(rows)
    try {
      // Compare and write back to back, so another app's save has the smallest window to slip in.
      if ((await $.fs.read(TRACKER)) !== original) {
        if (attempt < 3) continue
        await say($, 'Your tracker kept changing while saving (another app may be editing it). Try again in a moment.', true)
        return
      }
      await $.fs.write(TRACKER, next)
    } catch {
      await say($, 'Your tracker is open in another app (like Excel). Save and close it there, then try again.', true)
      return
    }
    // If another app saved at the same instant, never redo the change; check the saved row is still there.
    const back: string = await $.fs.read(TRACKER).catch(() => next)
    if (back !== next && !parseCsv(back.replace(/^\uFEFF/, '')).some(r => r.length >= target.length && target.every((v, i) => (r[i] ?? '') === v))) {
      await update($, armed, () => false)
      await refresh($).catch(() => undefined)
      await say($, 'Another app saved your tracker at the same moment, so "applied" may not have been recorded. Check the job, and tell Claude you applied if it still shows "interested".', true)
      return
    }
    break
  }
  await logActivity($, what)
  await update($, armed, () => false)
  await refresh($)
  await say($, `Marked applied today (${today}). Follow-up is set for ${saved.nextDate}. Save or screenshot the confirmation page.`)
  await $.session.append({
    message: { type: 'user', content: [{ type: 'text', text: `[Apply Kit] The user marked ${job.company} (${job.role}) as applied from the Apply Kit. jobs/tracker.csv now has status=applied, date_applied=${today}, next_action=${saved.nextAction}, next_action_date=${saved.nextDate}, followups=0. If they actually applied on another day, ask and correct the dates. Finish what the apply skill does after submitting (e.g. a recruiter question in the Outbox, contacts/contacts.csv if someone referred them). If the dashboard is published (profile/published-pages.md), republish it the next time the user talks to you.` }] },
  }).catch(() => undefined)
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
    // Claude may have just drafted answers or a resume: keep an open kit current.
    if ((await read($, kit)) !== null) await refresh($).catch(() => undefined)
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
    await $.ui.open({ id: PANE, title: 'Apply Kit' })
    return { text: k.job ? `Apply Kit: ${k.job.company} · ${k.job.role}` : 'Apply Kit: pick the job you\'re applying to.' }
  })

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

    const row = (f: Field) => {
      const isShort = f.value.length <= 60 && !f.value.includes('\n')
      const copyButton = f.copy !== '' && <Button key={`copy:${f.id}`} label="Copy" onPress={press => copy(f, press.surface)} />
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

    const picker = (
      <Box key="picker" flexDirection="column" borderStyle="round" paddingX={1}>
        <Text bold>Which job are you applying to?</Text>
        {k.jobs.length === 0 && <Text dimColor wrap="wrap">No jobs are waiting for you to apply. Paste a job link to Claude, or type /find-jobs.</Text>}
        {k.jobs.map(j => {
          const label = `${j.key === k.job?.key ? 'Current: ' : ''}${j.company} · ${j.role}${j.deadline ? ` · deadline ${j.deadline}` : ''}`
          const pick = async () => {
            await update($, chosen, () => j.key)
            await update($, picking, () => false)
            await update($, armed, () => false)
            await say($, '')
            await refresh($)
          }
          return <Button key={`pick:${j.key}`} label={label} onPress={pick} />
        })}
      </Box>
    )

    const job = k.job
    const profileGaps = k.sections.filter(s => s.title !== 'This job').flatMap(s => s.fields).filter(f => f.isMissing && f.value === MISSING).map(f => f.label)

    return (
      <Box flexDirection="column" gap={1}>
        {job ? (
          <Box flexDirection="column">
            <Text bold>{`${job.company} · ${job.role}`}</Text>
            <Text dimColor wrap="wrap">Copy each answer into the application form. You fill in and submit the form yourself; nothing here sends anything.</Text>
          </Box>
        ) : (
          <Text dimColor wrap="wrap">Pick a job to see its answers. Your profile answers are below either way.</Text>
        )}
        {note.text !== '' && <Text color={note.isError ? 'error' : 'success'} wrap="wrap">{note.text}</Text>}
        {(isPicking || !job) ? picker : <Button key="switch" label="Switch job" plain onPress={() => update($, picking, () => true)} />}
        {k.sections.filter(s => s.title === 'This job').map(block)}
        {job && (
          <Box key="questions" flexDirection="column" borderStyle="round" paddingX={1}>
            <Text bold>This job's application questions</Text>
            {!k.hasAnswers && <Text dimColor wrap="wrap">No answers have been drafted for this job yet.</Text>}
            {k.hasAnswers && <Text dimColor wrap="wrap">Drafted by Claude from your profile. Read each one before you paste it.</Text>}
            {k.questions.map(row)}
            {(!k.hasAnswers || k.questions.some(q => q.isMissing)) && (
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
                  {/\.pdf$/.test(f.name) && <Button key={`copy:file:${f.label}`} label="Copy name" onPress={press => copy({ label: `the ${f.label.toLowerCase()} file name`, copy: f.name }, press.surface)} />}
                </Box>
                <Text dimColor wrap="wrap">{f.status}</Text>
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
          <Button key="mark-applied" label="Mark applied…" variant="primary" onPress={() => update($, armed, () => true)} />
        )}
        {job && job.status === 'interested' && isArmed && (
          <Box key="confirm" flexDirection="column" borderStyle="round" paddingX={1}>
            <Text bold wrap="wrap">{`Did you submit the application to ${job.company} today? This marks it applied on ${k.today} and sets a follow-up for ${k.followUpDate}. If you applied on another day, tell Claude instead.`}</Text>
            <Box flexDirection="row" gap={1}>
              <Button key="confirm-applied" label="Yes, I submitted it" variant="primary" onPress={() => markApplied($, job)} />
              <Button key="cancel-applied" label="Cancel" onPress={() => update($, armed, () => false)} />
            </Box>
          </Box>
        )}
        {job && job.status !== 'interested' && (
          <Text dimColor wrap="wrap">{`This job is marked "${job.status}" in your tracker${job.nextAction ? `. Next: ${job.nextAction}${job.nextDate ? ` (${job.nextDate})` : ''}` : ''}.`}</Text>
        )}
        <Box flexDirection="row" gap={1}>
          <Button key="refresh" label="Refresh" onPress={async () => { await say($, ''); await refresh($) }} />
          <Button key="close" label="Close" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
