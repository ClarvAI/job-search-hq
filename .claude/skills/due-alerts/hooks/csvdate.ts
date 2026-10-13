// Shared CSV, date and file helpers for the Pipeline, Contacts, Apply Kit, Job Inbox and Due Alerts mods.
// Each mod carries an identical copy of this file (a mod can only import its own files): change all
// five together. Plain helpers with no engine calls, so tests can use them directly. The file helpers
// (openInExcel, appendLine, saveRow) take a `FileIo`: four file calls each register file builds from
// its own `$.fs`, because the engine interface itself can't be handed across an import.

// ---- CSV ----

// A quote mark opens a quoted cell only as the cell's first character; anywhere else it is an
// ordinary character (Excel and hand edits leave stray ones, like 5" or O"Neil). `openQuoteLine`
// is the line where a quoted cell started and never ended (0 when the file is whole).
function scan(text: string): { rows: string[][]; openQuoteLine: number } {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let atStart = true
  let line = 1
  let quoteLine = 0
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

export function parseCsv(text: string): string[][] {
  return scan(text.replace(/^﻿/, '')).rows
}

// problem: '' when the file can be read and saved safely; 'semicolons' when it was saved with ;
// between columns (some Excel language settings do that); 'open-quote:<line>' when a quoted cell
// never ends, so everything after it would land in one cell.
export function readCsv(text: string): { rows: string[][]; problem: string } {
  const { rows, openQuoteLine } = scan(text.replace(/^﻿/, ''))
  const head = rows[0] ?? []
  if (head.length === 1 && (head[0] ?? '').split(';').length >= 3) return { rows, problem: 'semicolons' }
  if (openQuoteLine > 0) return { rows, problem: `open-quote:${openQuoteLine}` }
  return { rows, problem: '' }
}

// What to tell the user about a damaged file; '' when there is nothing wrong.
export function csvTrouble(problem: string, file: string): string {
  if (problem === '') return ''
  if (problem === 'semicolons') return `${file} was saved with semicolons between the columns instead of commas (Excel does this in many European regions), so it can't be read safely. Ask Claude to fix it (saving it again from Excel in those regions keeps the semicolons). Nothing is saved from here until then.`
  const line = problem.replace(/^open-quote:/, '')
  return `${file} looks damaged: a quote mark (") on line ${line} is never closed, so the rows after it can't be read safely. Ask Claude to fix it, or fix that line in Excel. Nothing is saved from here until then.`
}

export function toCsv(rows: string[][]): string {
  const q = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return rows.map(r => r.map(q).join(',')).join('\n') + '\n'
}

// Plain characters only, so the file opens cleanly in Excel: letters (accents included) stay; curly
// quotes, long dashes and the ellipsis become plain ones; line breaks become spaces. A cell never
// starts with = + - @ or a tab: Excel would run it as a formula, so those are dropped.
export function plain(v: string): string {
  return v.replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[\r\n]+/g, ' ').replace(/^[\s=+\-@]+/, '')
}

// Excel's lock file for an open workbook sits next to it: "~$tracker.csv" (Word-style "~$acker.csv" too).
export function isExcelLock(entry: string, file: string): boolean {
  return entry.startsWith('~$') && entry.length > 2 && file.toLowerCase().endsWith(entry.slice(2).toLowerCase())
}

// ---- Dates ----

const pad = (n: number | string) => String(n).padStart(2, '0')

export function localDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// A real calendar day written YYYY-MM-DD (2026-02-31 is not one: it shows as "date unclear").
export const isIso = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  return m !== null && isRealDay(Number(m[1]), Number(m[2]), Number(m[3]))
}

function isRealDay(y: number, mo: number, da: number): boolean {
  return mo >= 1 && mo <= 12 && da >= 1 && da <= new Date(y, mo, 0).getDate()
}

// "YYYY-MM-DD HH:MM" in local time (an evening change must not be dated tomorrow).
export function stamp(ms: number): string {
  const d = new Date(ms)
  return `${localDate(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// One line for history/activity.md, in the format AGENTS.md gives: "- <date time> · <who> · <what>".
export function activityLine(ms: number, who: string, what: string): string {
  return `- ${stamp(ms)} · ${who} · ${what.replace(/[\r\n]+/g, ' ')}\n`
}

function dayOf(iso: string, days = 0): Date {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number)
  return new Date(y, m - 1, d + days)
}

export function addDays(iso: string, days: number, businessOnly = false): string {
  if (!businessOnly) return localDate(dayOf(iso, days).getTime())
  const date = dayOf(iso)
  let left = days
  while (left > 0) {
    date.setDate(date.getDate() + 1)
    const wd = date.getDay()
    if (wd !== 0 && wd !== 6) left--
  }
  return localDate(date.getTime())
}

export function daysBetween(a: string, b: string): number {
  return Math.round((dayOf(b).getTime() - dayOf(a).getTime()) / 86400000)
}

// How the user's spreadsheet writes dates, from the `date_order:` line in profile/preferences.md
// (MDY, DMY or YMD; set during setup). Blank or missing means unknown. Never guessed from where
// the user lives: their Excel may be set up differently.
export type DateOrder = 'mdy' | 'dmy' | 'ymd' | ''
export function dateOrder(prefs: string): DateOrder {
  const text = prefs.replace(/<!--[\s\S]*?-->/g, '')
  const v = /^[ \t]*(?:[-*][ \t]+)?date_order:[ \t]*`?([A-Za-z]{3})\b/mi.exec(text)?.[1]?.toLowerCase() ?? ''
  return v === 'mdy' || v === 'dmy' || v === 'ymd' ? v : ''
}

const SLASH = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/

// The order a single slash date proves by itself (a part over 12), or '' when it can't tell.
function provenOrder(v: string): DateOrder {
  const m = SLASH.exec(v.trim())
  if (!m) return ''
  const a = Number(m[1]), b = Number(m[2])
  if (a > 12 && b >= 1 && b <= 12) return 'dmy'
  if (b > 12 && a >= 1 && a <= 12) return 'mdy'
  return ''
}

// The order a row's own dates prove: another slash date in the same row with a part over 12 shows how
// this spreadsheet writes them. '' when no date proves it, or two dates disagree.
export function rowOrder(cells: string[]): DateOrder {
  let found: DateOrder = ''
  for (const c of cells) {
    const o = provenOrder(c)
    if (o === '') continue
    if (found !== '' && found !== o) return ''
    found = o
  }
  return found
}

// The order to read one row's dates with: the row's own evidence first, then date_order.
export function orderFor(cells: string[], order: DateOrder): DateOrder {
  return rowOrder(cells) || order
}

function build(year: string, mo: number, da: number): string {
  const y = year.length === 2 ? `20${year}` : year
  if (!isRealDay(Number(y), mo, da)) return ''
  return `${y}-${pad(mo)}-${pad(da)}`
}

// A date cell as YYYY-MM-DD when its meaning is certain; otherwise the text exactly as written
// (shown as "date unclear", never alerted on, never rewritten).
//   2026-10-14 always; 14.10.2026 (dotted) always day first; 2026/10/14 always year first;
//   slash dates: a part over 12 settles it; else both parts equal; else `order` (the row's evidence or date_order).
export function toIso(v: string, order: DateOrder = ''): string {
  const t = v.trim()
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (iso) return build(iso[1] ?? '', Number(iso[2]), Number(iso[3])) || t
  const ymd = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(t)
  if (ymd) return build(ymd[1] ?? '', Number(ymd[2]), Number(ymd[3])) || t
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(t)
  if (dotted) return build(dotted[3] ?? '', Number(dotted[2]), Number(dotted[1])) || t
  const m = SLASH.exec(t)
  if (!m) return t
  const a = Number(m[1]), b = Number(m[2])
  const md = monthDay(a, b, order)
  return md ? build(m[3] ?? '', md[0], md[1]) || t : t
}

// [month, day] of two numbers written a/b, or undefined when the order can't be known.
export function monthDay(a: number, b: number, order: DateOrder): [number, number] | undefined {
  const [mo, da] = a === b ? [a, b] : a > 12 ? [b, a] : b > 12 ? [a, b] : order === 'mdy' ? [a, b] : order === 'dmy' ? [b, a] : [0, 0]
  return mo >= 1 && mo <= 12 && da >= 1 && da <= 31 ? [mo, da] : undefined
}

// "Also: Interview 2026-10-12" (or another commitment with a date) at the start of a job's notes:
// the second dated commitment, kept there while next_action holds the earlier one.
export function alsoOf(notes: string, order: DateOrder = ''): { text: string; date: string } | undefined {
  const m = /^\s*Also:\s*([^;|]*?)\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./]\d{1,2}[./](?:\d{4}|\d{2}))\b/i.exec(notes)
  if (!m) return undefined
  const date = toIso(m[2] ?? '', order)
  return { text: `${(m[1] ?? '').trim()} ${m[2]}`.trim(), date: isIso(date) ? date : '' }
}

// ---- Rows and lists ----

// A tracker row's identity, the same in every panel: company + role + folder. Rows typed in by hand
// may have no folder, so the job ID, link or date found keeps two postings with the same title apart.
export function jobKey(get: (c: string) => string): string {
  const base = `${get('company').trim().toLowerCase()}|${get('role').trim().toLowerCase()}`
  const extra = (get('folder') || get('job_id') || get('link') || get('date_found')).trim().toLowerCase()
  return extra ? `${base}|${extra}` : base
}

// The column index of `name` in a header row (case and spaces ignored), or -1.
export function colOf(header: string[], name: string): number {
  return header.findIndex(h => h.trim().toLowerCase() === name)
}

// colOf for many lookups (every cell of a long file): the header's column numbers, worked out once.
export function columnsOf(header: string[]): (name: string) => number {
  const map = new Map<string, number>()
  header.forEach((h, i) => { const k = h.trim().toLowerCase(); if (!map.has(k)) map.set(k, i) })
  return name => map.get(name) ?? -1
}

// After a save, if another app wrote the file at the same instant: is the row as we saved it still
// there? (The change is never applied a second time; that could count a message or push a date twice.)
export function rowKept(back: string, target: string[]): boolean {
  return readCsv(back).rows.some(r => r.length >= target.length && target.every((v, i) => (r[i] ?? '') === v))
}

// One page of a long list. A panel draws at most 100,000 characters, so long lists are shown a page
// at a time rather than all at once.
export function pageOf<T>(list: T[], page: number, size: number): { items: T[]; page: number; pages: number; from: number; to: number } {
  const pages = Math.max(1, Math.ceil(list.length / size))
  const p = Math.min(Math.max(0, Math.floor(page) || 0), pages - 1)
  const start = p * size
  return { items: list.slice(start, start + size), page: p, pages, from: list.length === 0 ? 0 : start + 1, to: Math.min(list.length, start + size) }
}

// ---- Files ----
// The engine interface can't be handed across an import, so each panel passes in four small file
// calls of its own (`FileIo`, built in its register file from `$.fs`); everything else lives here.

export type FileIo = {
  exists: (path: string) => Promise<boolean>
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
  list: (dir: string) => Promise<Array<{ name: string }>>
}

// A short fingerprint of a file's text (53-bit cyrb53): enough to tell "the file changed since the
// panel read it" from "it didn't". Not a secret.
export function fingerprint(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return `${text.length}:${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`
}

// True when Excel seems to have the file open (its "~$" lock file is next to it). Without a lock file
// it may still be open (Excel for Mac often leaves none), so a failed save also asks the user to close it.
export async function openInExcel(io: FileIo, path: string): Promise<boolean> {
  const at = path.lastIndexOf('/')
  try {
    const entries = await io.list(at < 0 ? '.' : path.slice(0, at))
    return entries.some(e => isExcelLock(String(e.name), path.slice(at + 1)))
  } catch { return false }
}

// One line added to the end of history/activity.md. The file is re-read right before the write and
// checked afterwards, so a line another app added meanwhile is kept and this one is not lost.
// The log is a convenience: a failure here never blocks the save it describes.
export async function appendLine(io: FileIo, path: string, lineOut: string): Promise<boolean> {
  const readNow = async (): Promise<string> => ((await io.exists(path)) ? String(await io.read(path)) : '# Recent activity\n\n')
  let wrote = false
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const before = await readNow()
      if (wrote && before.includes(lineOut)) return true
      if ((await readNow()) !== before) continue
      await io.write(path, before.replace(/\n*$/, '\n') + lineOut)
      wrote = true
      if ((await readNow()).includes(lineOut)) return true
    }
  } catch { /* see above */ }
  return false
}

// A row found by its identity (the panel's own key: jobKey for the tracker, name+company for contacts,
// id for leads), read from the cells exactly as they are in the file.
// The header's column numbers are worked out once per header (rowKey runs for every row of a file).
let keyHeader: string[] | undefined
let keyLength = -1
let keyCols: (name: string) => number = () => -1
export function rowKey(header: string[], row: string[], key: (get: (c: string) => string) => string): string {
  if (keyHeader !== header || keyLength !== header.length) { keyHeader = header; keyLength = header.length; keyCols = columnsOf(header) }
  return key(c => { const i = keyCols(c); return i >= 0 ? (row[i] ?? '').trim() : '' })
}

// Why a save didn't happen. 'changed': the file is not what the panel last read (another app saved
// it), so nothing was written; the panel shows the latest version and the user tries again.
export type SaveWhy = 'missing' | 'unreadable' | 'changed' | 'damaged' | 'no-row' | 'refused' | 'excel' | 'locked' | 'lost'
export type SaveResult<R> = { ok: true; result: R; text: string } | { ok: false; why: SaveWhy; text: string }

// What to tell the user for each reason, for a file called `name` ("Your tracker").
export function saveTrouble(why: SaveWhy, name: string, problem = '', label = name): string {
  const lower = name.charAt(0).toLowerCase() + name.slice(1)
  switch (why) {
    case 'missing': return `${name} is missing. Ask Claude to check it.`
    case 'unreadable': return `${name} couldn't be read just now (it may be open or syncing). Try again in a moment.`
    case 'changed': return `${name} changed in another app since this panel read it, so nothing was saved. The panel now shows the latest version: check it and try again.`
    case 'damaged': return csvTrouble(problem, label)
    case 'no-row': return `That row is no longer in ${lower}. Press Refresh, or ask Claude to check it.`
    case 'refused': return ''
    case 'excel': return `${name} is open in Excel. Save and close it there, then try again (otherwise Excel would later put back its older copy).`
    case 'locked': return `${name} is open in another app (like Excel). Save and close it there, then try again.`
    case 'lost': return `Another app saved ${lower} at the same moment, so this change may not have stuck. Check it and try again if needed.`
  }
}

// The one save every panel uses for a CSV: re-read the file right before saving, refuse when it isn't
// the version the panel read (`seen`, its fingerprint; there is no file lock to hold), refuse a damaged
// file or one Excel has open, change one row, compare once more and write back to back, then check the
// row as saved is still there. The change is never applied twice (that could count a message twice).
//   find:  picks the row to change from the rows as read (before any tidying).
//   edit:  changes that row in place through get/set; returns the result, or undefined to refuse (the
//          panel then says why itself).
//   blank: the header to start an empty file with (contacts), else an empty file is 'missing'.
export async function saveRow<R>(io: FileIo, path: string, opts: {
  seen: string
  name: string
  label: string
  find: (header: string[], rows: string[][]) => string[] | undefined
  edit: (row: string[], get: (c: string) => string, set: (c: string, v: string) => void, header: string[]) => R | undefined
  clean?: (v: string) => string
  blank?: string[]
}): Promise<SaveResult<R>> {
  const BOM_ = String.fromCharCode(0xfeff)
  const fail = (why: SaveWhy, problem = ''): SaveResult<R> => ({ ok: false, why, text: saveTrouble(why, opts.name, problem, opts.label) })
  let original: string
  try {
    if (!(await io.exists(path))) return fail('missing')
    original = String(await io.read(path))
  } catch { return fail('unreadable') }
  if (opts.seen !== '' && fingerprint(original) !== opts.seen) return fail('changed')
  const { rows, problem } = readCsv(original)
  // A damaged file is never written back: that would spread the damage.
  if (problem !== '') return fail('damaged', problem)
  if (rows.length === 0) { if (!opts.blank) return fail('missing'); rows.push([...opts.blank]) }
  const header = rows[0] ?? []
  const target = opts.find(header, rows.slice(1))
  if (!target) return fail('no-row')
  const idx = (c: string) => { let i = colOf(header, c); if (i < 0) { header.push(c); i = header.length - 1 } return i }
  const get = (c: string) => { const i = colOf(header, c); return i >= 0 ? (target[i] ?? '').trim() : '' }
  const set = (c: string, v: string) => { const i = idx(c); while (target.length <= i) target.push(''); target[i] = (opts.clean ?? plain)(v) }
  const result = opts.edit(target, get, set, header)
  if (result === undefined) return { ok: false, why: 'refused', text: '' }
  for (const r of rows) while (r.length < header.length) r.push('')
  const next = (original.startsWith(BOM_) ? BOM_ : '') + toCsv(rows)
  if (await openInExcel(io, path)) return fail('excel')
  try {
    // Compare and write back to back, so the window for another app's save to slip in stays as small as it can.
    if (String(await io.read(path)) !== original) return fail('changed')
    await io.write(path, next)
  } catch { return fail('locked') }
  const back = await io.read(path).then(String, () => next)
  if (back !== next && !rowKept(back, target)) return fail('lost')
  return { ok: true, result, text: '' }
}
