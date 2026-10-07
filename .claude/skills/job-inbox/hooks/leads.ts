// Plain helpers for jobs/leads.csv: CSV in and out, dates, and the duplicate check.
// No engine calls here, so the tests can use them directly.

export const LEAD_COLUMNS = ['id', 'found_date', 'company', 'role', 'location', 'remote', 'pay', 'posted', 'link', 'apply_link', 'job_id', 'source', 'fit_guess', 'why', 'concerns', 'status', 'reason', 'decided_date']

export function parseCsv(text: string): string[][] {
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

export function toCsv(rows: string[][]): string {
  const q = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return rows.map(r => r.map(q).join(',')).join('\n') + '\n'
}

// Plain characters only, so the file opens cleanly in Excel (same rule as tracker.csv). A cell never
// starts with = + - @ or a tab: Excel would run it as a formula, so those are dropped.
export function plain(v: string): string {
  return v.replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[\r\n]+/g, ' ').trim().replace(/^[\s=+\-@]+/, '')
}

export function localDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Excel may rewrite dates as 14/10/2026 or 10/14/26, in the order of the user's region. Same rules as
// the Pipeline panel: a slash date is read only when its order is certain (a part over 12, both parts
// the same, or a US or day-first home_base); otherwise it stays as written.
export type DateOrder = 'mdy' | 'dmy' | ''
const US_STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY'
export function dateOrder(prefs: string): DateOrder {
  const home = /^[ \t]*home_base:[ \t]*(.*)$/m.exec(prefs)?.[1]?.trim() ?? ''
  if (/\b(USA|U\.S\.A?\.?|United States)\b/i.test(home) || new RegExp(`,\\s*(${US_STATES})\\b`).test(home)) return 'mdy'
  if (/\b(UK|U\.K\.|United Kingdom|Britain|England|Scotland|Wales|Ireland|Australia|New Zealand|India|South Africa|Singapore|Germany|France|Spain|Italy|Portugal|Netherlands|Belgium|Brazil|Mexico)\b/i.test(home)) return 'dmy'
  return ''
}
export function toIso(v: string, order: DateOrder = ''): string {
  const t = v.trim()
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t)
  if (!m) return t
  const a = Number(m[1]), b = Number(m[2])
  const [mo, da] = a === b ? [a, b] : a > 12 ? [b, a] : b > 12 ? [a, b] : order === 'mdy' ? [a, b] : order === 'dmy' ? [b, a] : [0, 0]
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return t
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${pad(mo)}-${pad(da)}`
}

export const isIso = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) / 86400000)
}

// A link reduced to what identifies the posting: no scheme, www, tracking parameters, fragment or trailing slash.
export function normLink(url: string): string {
  let u = url.trim().toLowerCase()
  if (u === '') return ''
  u = u.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/#.*$/, '')
  const [path, query = ''] = u.split('?')
  const keep = query.split('&').filter(p => p !== '' && !/^(utm_[a-z]+|ref|refid|src|source|trk|trackingid|from|gh_src|lever-source|fbclid|gclid)=/.test(p))
  return path.replace(/\/+$/, '') + (keep.length > 0 ? `?${keep.join('&')}` : '')
}

// Company names compare without punctuation or legal suffixes: "Northwind Traders, Inc." = "northwind traders".
export function normCompany(name: string): string {
  return name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|ag|sa|lp|the)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

export function normRole(title: string): string {
  return title.toLowerCase().replace(/&/g, ' and ').replace(/\bsr\b\.?/g, 'senior').replace(/\bjr\b\.?/g, 'junior')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function normPlace(loc: string): string {
  return loc.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export type JobRef = { company: string; role: string; location?: string; link?: string; applyLink?: string; jobId?: string }

// Same posting if: a link matches, or the same company has the same job ID, or the same company and title
// at the same place (a blank location on either side counts as the same place). The same title at a
// different location, or with a different job ID, is a separate opening.
export function isSamePosting(a: JobRef, b: JobRef): boolean {
  const linksA = [a.link ?? '', a.applyLink ?? ''].map(normLink).filter(Boolean)
  const linksB = [b.link ?? '', b.applyLink ?? ''].map(normLink).filter(Boolean)
  if (linksA.some(l => linksB.includes(l))) return true
  if (normCompany(a.company) === '' || normCompany(a.company) !== normCompany(b.company)) return false
  const idA = (a.jobId ?? '').trim().toLowerCase(), idB = (b.jobId ?? '').trim().toLowerCase()
  if (idA !== '' && idB !== '') return idA === idB
  if (normRole(a.role) === '' || normRole(a.role) !== normRole(b.role)) return false
  const pa = normPlace(a.location ?? ''), pb = normPlace(b.location ?? '')
  return pa === '' || pb === '' || pa === pb || pa.includes(pb) || pb.includes(pa)
}

// Read a CSV into objects keyed by lowercase header name.
export function records(text: string): Record<string, string>[] {
  const [header = [], ...rows] = parseCsv(text.replace(/^\uFEFF/, ''))
  const names = header.map(h => h.trim().toLowerCase())
  return rows.map(r => Object.fromEntries(names.map((n, i) => [n, (r[i] ?? '').trim()])))
}

// The note Claude reads when the user presses Save.
export function savedNote(l: { id: string; company: string; role: string; location: string; link: string; applyLink: string }): string {
  const where = l.applyLink || l.link
  return `[Job Inbox] The user saved ${l.company} - ${l.role}${l.location ? ` (${l.location})` : ''} from jobs/leads.csv (lead ${l.id}${where ? `, ${where}` : ''}). Run add-job on it when the user next talks to you (together with any other saved leads); add-job marks the lead added.`
}

export function trackerRefs(trackerText: string): JobRef[] {
  return records(trackerText).filter(r => (r.company ?? '') !== '').map(r => ({
    company: r.company, role: r.role ?? '', location: r.location ?? '', link: r.link ?? '', applyLink: r.apply_link ?? '', jobId: r.job_id ?? '',
  }))
}
