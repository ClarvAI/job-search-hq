#!/usr/bin/env node
// Builds the private, published copies of the job-search dashboard, deterministically, so no number is assembled by hand.
//
// Usage (from the workspace folder):
//   node .claude/skills/pages/scripts/build-dashboard-data.mjs
//        Claude Dashboard data: reads jobs/tracker.csv (+ profile/preferences.md and the data block of
//        pages/dashboard.html) and writes to pages/.publish/claude-dashboard/:
//          jobs.json, week.json, history.json   the three files to attach (arrays of rows)
//          datasets.json                        each dataset's title, description, file and freshness
//          doc-dash-meta.json, doc-index.json   ready-to-write documents (dash/meta, files/index.html)
//   node .claude/skills/pages/scripts/build-dashboard-data.mjs --docs jobs=<url> week=<url> history=<url>
//        after the three files are attached: writes doc-dataset-<id>.json (datasets/<id>) with each file's url.
//   node .claude/skills/pages/scripts/build-dashboard-data.mjs --publish-copy
//        themed-page route: writes pages/.publish/dashboard.html from pages/dashboard.html with the same privacy
//        filter on its data block, without the page's own <html>/<head> wrapper (the Artifact adds one).
// Options: --root <folder> (another workspace; tests), --out <folder>, --today YYYY-MM-DD, --now <ISO time>.
// Exit: 0 done; 2 bad arguments or missing file; 3 the tracker looks damaged (nothing written).
//
// Privacy (every published copy): only the user's own job list. Each job keeps company, role, status, stage, the
// dates it was found and applied, its next step (reduced to the standard wording, so no names or notes ride along),
// that step's due date and the deadline. Never: contacts, notes, pay, links, locations, fit, priority, the activity
// log, or the user's name. Dates follow AGENTS.md: YYYY-MM-DD always; dotted = day first; a slash date is settled by
// a part over 12, equal parts, the row's own evidence, then date_order: in preferences; anything else is
// "date unclear" (never guessed). The tracker is read with the CSV rules: a quote opens a value only at the start
// of a cell; a file saved with semicolons or with a quote that never closes is refused.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const STALE_HOURS = 72
const BY = 'Job Search HQ'
const UNCLEAR = 'date unclear'
const LT = String.fromCharCode(92) + 'u003c' // JSON's own escape for "<" (AGENTS.md, D4)

// ---- Arguments ----
const args = process.argv.slice(2)
const opt = name => { const i = args.indexOf(name); if (i < 0) return ''; const v = args[i + 1]; if (!v || v.startsWith('--')) fail(2, `${name} needs a value`); return v }
const known = new Set(['--root', '--out', '--today', '--now', '--docs', '--publish-copy'])
for (const a of args) if (a.startsWith('--') && !known.has(a)) fail(2, `Unknown option ${a}`)
function fail(code, msg) { console.error(msg); process.exit(code) }

function findRoot(start) {
  let d = resolve(start)
  for (;;) {
    if (existsSync(join(d, 'AGENTS.md'))) return d
    const up = dirname(d)
    if (up === d) fail(2, 'Could not find the workspace folder (the one with AGENTS.md). Pass --root <folder>.')
    d = up
  }
}
const ROOT = opt('--root') ? resolve(opt('--root')) : findRoot(HERE)
const OUT = opt('--out') ? resolve(opt('--out')) : join(ROOT, 'pages', '.publish', 'claude-dashboard')

const pad = n => String(n).padStart(2, '0')
const localDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const TODAY = opt('--today') || localDay(new Date())
if (!/^\d{4}-\d{2}-\d{2}$/.test(TODAY)) fail(2, '--today must be YYYY-MM-DD')
const NOW = opt('--now') || new Date().toISOString()

// ---- CSV (same rules as the panels' csvdate.ts) ----
function scanCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false; let atStart = true; let line = 1; let quoteLine = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else { cell += c; if (c === '\n') line++ }
    } else if (c === '"' && atStart) { quoted = true; atStart = false; quoteLine = line }
    else if (c === ',') { row.push(cell); cell = ''; atStart = true }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''; atStart = true; line++
    } else { cell += c; atStart = false }
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }
  return { rows: rows.filter(r => r.some(v => v.trim() !== '')), openQuoteLine: quoted ? quoteLine : 0 }
}
function readCsv(text) {
  const { rows, openQuoteLine } = scanCsv(text.replace(/^﻿/, ''))
  const head = rows[0] || []
  if (head.length === 1 && (head[0] || '').split(';').length >= 3) return { rows, problem: 'semicolons' }
  if (openQuoteLine > 0) return { rows, problem: `open-quote:${openQuoteLine}` }
  return { rows, problem: '' }
}

// ---- Dates (same rules as csvdate.ts) ----
const isRealDay = (y, mo, da) => mo >= 1 && mo <= 12 && da >= 1 && da <= new Date(y, mo, 0).getDate()
const isIso = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); return m !== null && isRealDay(+m[1], +m[2], +m[3]) }
const SLASH = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/
function dateOrder(prefs) {
  const text = prefs.replace(/<!--[\s\S]*?-->/g, '')
  const m = /^[ \t]*(?:[-*][ \t]+)?date_order:[ \t]*`?([A-Za-z]{3})\b/mi.exec(text)
  const v = m ? m[1].toLowerCase() : ''
  return ['mdy', 'dmy', 'ymd'].includes(v) ? v : ''
}
function provenOrder(v) {
  const m = SLASH.exec(v.trim()); if (!m) return ''
  const a = +m[1], b = +m[2]
  if (a > 12 && b >= 1 && b <= 12) return 'dmy'
  if (b > 12 && a >= 1 && a <= 12) return 'mdy'
  return ''
}
function rowOrder(cells) {
  let found = ''
  for (const c of cells) { const o = provenOrder(c); if (!o) continue; if (found && found !== o) return ''; found = o }
  return found
}
function build(year, mo, da) {
  const y = year.length === 2 ? `20${year}` : year
  return isRealDay(+y, mo, da) ? `${y}-${pad(mo)}-${pad(da)}` : ''
}
function monthDay(a, b, order) {
  const [mo, da] = a === b ? [a, b] : a > 12 ? [b, a] : b > 12 ? [a, b] : order === 'mdy' ? [a, b] : order === 'dmy' ? [b, a] : [0, 0]
  return mo >= 1 && mo <= 12 && da >= 1 && da <= 31 ? [mo, da] : null
}
function toIso(v, order) {
  const t = v.trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t); if (m) return build(m[1], +m[2], +m[3]) || t
  m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(t); if (m) return build(m[1], +m[2], +m[3]) || t
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(t); if (m) return build(m[3], +m[2], +m[1]) || t
  m = SLASH.exec(t); if (!m) return t
  const md = monthDay(+m[1], +m[2], order)
  return md ? build(m[3], md[0], md[1]) || t : t
}
// A date cell for a published copy: YYYY-MM-DD, "" when blank, or "date unclear" (never guessed).
const clearDate = (v, order) => { const t = (v || '').trim(); if (!t) return ''; const d = toIso(t, order); return isIso(d) ? d : UNCLEAR }
const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return localDay(new Date(y, m - 1, d + n)) }
const mondayOf = iso => { const [y, m, d] = iso.split('-').map(Number); const wd = new Date(y, m - 1, d).getDay(); return addDays(iso, -((wd + 6) % 7)) }

// ---- Statuses and next steps (knowledge/job-search-playbook.md, "Tracker") ----
const STAGE = { interested: 'To apply', applied: 'Applied', screening: 'Talking', interviewing: 'Talking', offer: 'Offer', accepted: 'Offer', rejected: 'Closed', withdrawn: 'Closed', skipped: 'Closed', ghosted: 'Closed' }
const STEPS = ['Decide: apply or skip', 'Review package and submit', 'Find a contact', 'Follow up', 'Schedule interview', 'Prep for interview', 'Send thank-you notes', 'Wait for decision', 'Respond to offer', 'Decide next step', 'Send withdrawal note']
const DATED = ['Interview', 'Take-home due']
const DATE_TOKEN = /(\d{4}-\d{1,2}-\d{1,2}|\d{4}\/\d{1,2}\/\d{1,2}|\d{1,2}[./]\d{1,2}[./](?:\d{4}|\d{2}))/
const plainText = v => String(v || '').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim()
// The next step in the playbook's own words only. Anything typed after it ("Follow up with Pat") is dropped,
// because it can name a person; a step that isn't one of the standard ones becomes "Next step".
function sanitizeStep(raw, order) {
  const t = plainText(raw)
  if (!t) return ''
  const low = t.toLowerCase()
  const unclearNote = /\(date unclear\)/i.test(t)
  for (const s of STEPS) if (low.startsWith(s.toLowerCase())) return s + (unclearNote ? ' (date unclear)' : '')
  for (const s of DATED) {
    if (!low.startsWith(s.toLowerCase())) continue
    const m = DATE_TOKEN.exec(t.slice(s.length))
    if (!m) return s + (unclearNote ? ' (date unclear)' : '')
    const d = toIso(m[1], order)
    return isIso(d) ? `${s} ${d}` : `${s} (date unclear)`
  }
  return 'Next step'
}

// ---- Reading the user's files ----
function readText(p) { try { return readFileSync(p, 'utf8') } catch { return '' } }
function pageData(html) {
  const m = /<script type="application\/json" id="data">([\s\S]*?)<\/script>/.exec(html)
  if (!m) return null
  try { return JSON.parse(m[1]) } catch { return null }
}
const count = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null)
function goalsFrom(prefs) {
  const text = prefs.replace(/<!--[\s\S]*?-->/g, '')
  const m = /^[ \t]*(?:[-*][ \t]+)?weekly_goals:[ \t]*(.*)$/mi.exec(text)
  const line = m ? m[1] : ''
  const grab = re => { const g = re.exec(line); return g ? Number(g[1]) : null }
  return { applications: grab(/(\d+)\s+applications?/i), conversations: grab(/(\d+)\s+(?:\w+\s+)?conversations?/i), mocks: grab(/(\d+)\s+mock/i) }
}

function loadTracker() {
  const file = join(ROOT, 'jobs', 'tracker.csv')
  if (!existsSync(file)) fail(2, 'There is no jobs/tracker.csv yet, so there is nothing to publish.')
  const { rows, problem } = readCsv(readText(file))
  if (problem === 'semicolons') fail(3, 'jobs/tracker.csv was saved with semicolons between the columns (Excel does this in many European regions), so it can\'t be read safely. Nothing was published. Fix the file first.')
  if (problem) fail(3, `jobs/tracker.csv looks damaged: a quote mark on line ${problem.split(':')[1]} is never closed. Nothing was published. Fix that line first.`)
  const head = (rows[0] || []).map(h => h.replace(/^﻿/, '').trim().toLowerCase())
  for (const need of ['company', 'role', 'status']) if (!head.includes(need)) fail(3, `jobs/tracker.csv has no "${need}" column, so it can't be read safely. Nothing was published.`)
  return rows.slice(1).map(r => { const o = {}; head.forEach((h, i) => { o[h] = r[i] === undefined ? '' : r[i] }); o.__cells = r; return o })
}

// The published job list, one row per tracker row.
function buildJobs(order, page) {
  const flags = new Map()
  if (page && page.example === false && Array.isArray(page.jobs)) for (const j of page.jobs) {
    if (!j || typeof j !== 'object') continue
    flags.set(`${plainText(j.company).toLowerCase()}|${plainText(j.role).toLowerCase()}`, { heard: j.heard === true, interviewed: j.interviewed === true })
  }
  const seen = new Map()
  const out = []
  for (const r of loadTracker()) {
    const company = plainText(r.company), role = plainText(r.role)
    if (!company && !role) continue
    const rowOrd = rowOrder(r.__cells) || order
    const st = plainText(r.status).toLowerCase()
    const status = STAGE[st] ? st : 'unknown'
    const base = [company || 'Company', role || 'Role'].join(' · ')
    const n = (seen.get(base) || 0) + 1; seen.set(base, n)
    const f = flags.get(`${company.toLowerCase()}|${role.toLowerCase()}`) || { heard: false, interviewed: false }
    const reachedInterview = ['interviewing', 'offer', 'accepted'].includes(status) || f.interviewed
    const reachedScreen = reachedInterview || ['screening'].includes(status) || f.heard
    out.push({
      key: n === 1 ? base : `${base} (${n})`,
      company, role, status,
      stage: STAGE[status] || 'Other',
      found: clearDate(r.date_found, rowOrd),
      applied: clearDate(r.date_applied, rowOrd),
      next_step: sanitizeStep(r.next_action, rowOrd),
      due: clearDate(r.next_action_date, rowOrd),
      deadline: clearDate(r.deadline, rowOrd),
      reached_screen: reachedScreen ? 'yes' : 'no',
      reached_interview: reachedInterview ? 'yes' : 'no'
    })
  }
  return out
}

function buildWeek(jobs, goals, page) {
  const from = addDays(TODAY, -6)
  const inRange = d => isIso(d) && d >= from && d <= TODAY
  const rows = [{ measure: 'Applications', done: jobs.filter(j => inRange(j.applied)).length, goal: goals.applications, from, to: TODAY }]
  // Conversations and mock interviews are counted by the pages skill into the local dashboard; use them only when
  // that page holds the user's own data and was refreshed today. Otherwise leave them out rather than guess.
  if (page && page.example === false && page.generated === TODAY && page.week && typeof page.week === 'object') {
    const c = count(page.week.conversations), m = count(page.week.mocks)
    if (c !== null) rows.push({ measure: 'Conversations', done: c, goal: goals.conversations, from, to: TODAY })
    if (m !== null) rows.push({ measure: 'Mock interviews', done: m, goal: goals.mocks, from, to: TODAY })
  }
  return rows
}

function buildHistory(jobs, page) {
  const thisMonday = mondayOf(TODAY)
  const dated = jobs.flatMap(j => [j.found, j.applied]).filter(isIso).sort()
  const firstMonday = dated.length ? mondayOf(dated[0]) : thisMonday
  const extra = new Map()
  if (page && page.example === false && Array.isArray(page.history)) for (const h of page.history) {
    if (h && isIso(h.week)) extra.set(mondayOf(h.week), { conversations: count(h.conversations), mocks: count(h.mocks) })
  }
  const rows = []
  for (let k = 7; k >= 0; k--) {
    const week = addDays(thisMonday, -7 * k)
    if (week < firstMonday && k > 0) continue
    const end = addDays(week, 6)
    const e = extra.get(week) || { conversations: null, mocks: null }
    rows.push({ week, applications: jobs.filter(j => isIso(j.applied) && j.applied >= week && j.applied <= end).length, conversations: e.conversations, mocks: e.mocks })
  }
  return rows
}

const json = v => JSON.stringify(v, null, 1).split('<').join(LT) + '\n'
function write(name, value) { mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, name), typeof value === 'string' ? value : json(value)) }

const DATASETS = [
  { id: 'jobs', file: 'jobs.json', title: 'Your job list', description: 'One row per job in your tracker: company, role, stage, key dates and next step. No contacts, notes or pay.' },
  { id: 'week', file: 'week.json', title: 'Last 7 days vs goals', description: 'What you did in the last seven days, next to your weekly goals.' },
  { id: 'history', file: 'history.json', title: 'Applications by week', description: 'Applications sent each week (weeks start on Monday), from your tracker.' }
]

// ---- Modes ----
if (args.includes('--docs')) {
  const i = args.indexOf('--docs')
  const pairs = new Map()
  for (const a of args.slice(i + 1)) { if (a.startsWith('--')) break; const m = /^([a-z]+)=(\S+)$/.exec(a); if (!m) fail(2, `--docs takes id=url pairs, not "${a}"`); pairs.set(m[1], m[2]) }
  const manifest = JSON.parse(readText(join(OUT, 'datasets.json')) || 'null')
  if (!Array.isArray(manifest)) fail(2, 'Run the builder once without --docs first.')
  for (const d of manifest) {
    const url = pairs.get(d.id)
    if (!url) fail(2, `Missing the url for ${d.id} (pass ${d.id}=<url from the upload>).`)
    if (!/^\/_blob\/[A-Za-z0-9_-]+$/.test(url)) fail(2, `The url for ${d.id} should look like /_blob/<id>, as the upload returned it.`)
    write(`doc-dataset-${d.id}.json`, { title: d.title, description: d.description, source: { kind: 'file', url, name: d.file, format: 'json' }, updated: d.updated, staleAfterHours: d.staleAfterHours })
  }
  console.log(`Wrote ${manifest.length} dataset documents to ${OUT}`)
  process.exit(0)
}

if (args.includes('--publish-copy')) {
  const src = join(ROOT, 'pages', 'dashboard.html')
  const html = readText(src)
  if (!html) fail(2, 'pages/dashboard.html is missing.')
  const page = pageData(html)
  if (!page) fail(3, 'The data block in pages/dashboard.html could not be read. Refresh the dashboard first.')
  const order = dateOrder(readText(join(ROOT, 'profile', 'preferences.md')))
  const iso = v => (isIso(v) ? v : undefined)
  const safe = {
    example: page.example === true,
    generated: iso(page.generated) || TODAY,
    goals: page.goals && typeof page.goals === 'object' ? { applications: count(page.goals.applications) ?? 0, conversations: count(page.goals.conversations) ?? 0, mocks: count(page.goals.mocks) ?? 0 } : undefined,
    week: page.week && typeof page.week === 'object' ? { start: iso(page.week.start), applications: count(page.week.applications) ?? 0, conversations: count(page.week.conversations) ?? 0, mocks: count(page.week.mocks) ?? 0 } : undefined,
    history: Array.isArray(page.history) ? page.history.filter(h => h && isIso(h.week)).map(h => ({ week: h.week, applications: count(h.applications) ?? 0, conversations: count(h.conversations) ?? 0, mocks: count(h.mocks) ?? 0 })) : undefined,
    streak: count(page.streak) ?? undefined,
    jobs: (Array.isArray(page.jobs) ? page.jobs : []).filter(j => j && typeof j === 'object').map(j => ({
      company: plainText(j.company), role: plainText(j.role),
      status: STAGE[plainText(j.status).toLowerCase()] ? plainText(j.status).toLowerCase() : 'unknown',
      next: sanitizeStep(j.next, order) || undefined,
      due: iso(j.due), deadline: iso(j.deadline), applied: iso(j.applied),
      heard: j.heard === true || undefined, interviewed: j.interviewed === true || undefined
    })),
    contacts: []
  }
  const block = JSON.stringify(safe, null, 2).split('<').join(LT)
  let body = html.replace(/<script type="application\/json" id="data">[\s\S]*?<\/script>/, () => `<script type="application/json" id="data">\n${block}\n</script>`)
  const layout = (/<html\b[^>]*\bdata-layout="([a-z-]+)"/i.exec(body) || [])[1] || ''
  body = body.replace(/^\s*<!doctype html>[^\n]*\n/i, '').replace(/^\s*<html\b[^>]*>[^\n]*\n/i, '').replace(/^\s*<meta charset[^>]*>[^\n]*\n/i, '').replace(/^\s*<meta name="viewport"[^>]*>[^\n]*\n/i, '').replace(/<\/html>\s*$/i, '\n')
  if (layout) body = `<script>document.documentElement.dataset.layout = "${layout}"</script>\n` + body
  const dest = join(ROOT, 'pages', '.publish')
  mkdirSync(dest, { recursive: true })
  writeFileSync(join(dest, 'dashboard.html'), body)
  console.log(`Wrote pages/.publish/dashboard.html (${safe.jobs.length} jobs; no contacts, activity, notes, pay, links or locations)`)
  process.exit(0)
}

// Default: the Claude Dashboard files.
const prefs = readText(join(ROOT, 'profile', 'preferences.md'))
const order = dateOrder(prefs)
const page = pageData(readText(join(ROOT, 'pages', 'dashboard.html')))
const jobs = buildJobs(order, page)
const week = buildWeek(jobs, goalsFrom(prefs), page)
const history = buildHistory(jobs, page)
write('jobs.json', jobs)
write('week.json', week)
write('history.json', history)
const updated = { at: NOW, by: BY }
write('datasets.json', DATASETS.map(d => ({ ...d, updated, staleAfterHours: STALE_HOURS })))
write('doc-dash-meta.json', { title: 'My job search' })
const index = readText(join(HERE, '..', 'assets', 'dashboard-type-index.html')).split('\r\n').join('\n') // same text on a Windows (CRLF) checkout
if (!index) fail(2, 'The dashboard page (assets/dashboard-type-index.html) is missing from the app. Run /health.')
write('doc-index.json', JSON.stringify({ text: index }) + '\n')
const unclear = jobs.filter(j => [j.found, j.applied, j.due, j.deadline].includes(UNCLEAR)).length
console.log(`Wrote ${jobs.length} jobs, ${week.length} weekly measures and ${history.length} weeks to ${OUT}` + (unclear ? `\n${unclear} job(s) have a date shown as "date unclear"; ask the user what it means before relying on it.` : ''))
