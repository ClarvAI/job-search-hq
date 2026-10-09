// Shared CSV, date and file helpers for the Pipeline, Contacts, Apply Kit, Job Inbox and Due Alerts mods.
// Each mod carries an identical copy of this file (a mod can only import its own files): change all
// five together. Plain helpers with no engine calls, so tests can use them directly. The file helpers
// that need the engine (openInExcel, appendLine) live in each register file, because the engine
// interface can't be handed across an import.

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

export const isIso = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

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
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return ''
  return `${year.length === 2 ? `20${year}` : year}-${pad(mo)}-${pad(da)}`
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
