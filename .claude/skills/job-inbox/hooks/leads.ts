// Plain helpers for jobs/leads.csv: CSV in and out, dates, and the duplicate check.
// No engine calls here, so the tests can use them directly.

export const LEAD_COLUMNS = ['id', 'found_date', 'company', 'role', 'location', 'remote', 'pay', 'posted', 'link', 'apply_link', 'job_id', 'source', 'fit_guess', 'why', 'concerns', 'status', 'reason', 'decided_date']

// CSV, plain characters and dates: csvdate.ts, the same rules as the Pipeline panel (a quote opens a
// quoted cell only at its start; a date is read only when its meaning is certain).
export { daysBetween, dateOrder, isIso, localDate, orderFor, parseCsv, plain, readCsv, toCsv, toIso } from './csvdate'
export type { DateOrder } from './csvdate'
import { parseCsv } from './csvdate'

// A link reduced to what identifies the posting: no scheme, www, tracking parameters, fragment or trailing slash.
export function normLink(url: string): string {
  let u = url.trim().toLowerCase()
  if (u === '') return ''
  u = u.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/#.*$/, '')
  const [path = '', query = ''] = u.split('?')
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

// Same posting if: both have a job ID and the IDs match (two known, different IDs are always separate
// openings, even when a link matches, e.g. a shared careers page); else a link matches; else the same
// company and title at the same place (a blank location on either side counts as the same place).
export function isSamePosting(a: JobRef, b: JobRef): boolean {
  const linksA = [a.link ?? '', a.applyLink ?? ''].map(normLink).filter(Boolean)
  const linksB = [b.link ?? '', b.applyLink ?? ''].map(normLink).filter(Boolean)
  const sameLink = linksA.some(l => linksB.includes(l))
  const sameCompany = normCompany(a.company) !== '' && normCompany(a.company) === normCompany(b.company)
  const idA = (a.jobId ?? '').trim().toLowerCase(), idB = (b.jobId ?? '').trim().toLowerCase()
  if (idA !== '' && idB !== '') return idA === idB && (sameCompany || sameLink)
  if (sameLink) return true
  if (!sameCompany) return false
  if (normRole(a.role) === '' || normRole(a.role) !== normRole(b.role)) return false
  const pa = normPlace(a.location ?? ''), pb = normPlace(b.location ?? '')
  return pa === '' || pb === '' || pa === pb || pa.includes(pb) || pb.includes(pa)
}

// Read a CSV into objects keyed by lowercase header name.
export function records(text: string): Record<string, string>[] {
  const [header = [], ...rows] = parseCsv(text)
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
    company: r.company ?? '', role: r.role ?? '', location: r.location ?? '', link: r.link ?? '', applyLink: r.apply_link ?? '', jobId: r.job_id ?? '',
  }))
}
