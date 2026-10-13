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
// Letters of every script count (not only a-z), and accents are dropped, so "Société Générale" =
// "Societe Generale" and names in Japanese, Greek or Arabic don't end up empty.
const letters = (t: string) => t.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N} ]+/gu, ' ')

export function normCompany(name: string): string {
  return letters(name)
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|ag|sa|lp|the)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

export function normRole(title: string): string {
  return letters(title.replace(/\bsr\b\.?/gi, 'senior').replace(/\bjr\b\.?/gi, 'junior'))
    .replace(/\s+/g, ' ').trim()
}

export function normPlace(loc: string): string {
  return letters(loc).replace(/\s+/g, ' ').trim()
}

// Same place when the city parts match word for word from the start: "Denver, CO" = "Denver CO" =
// "Denver"; "New York, NY" = "New York"; but "York" is not "New York" (whole words, not substrings).
// When both name a region after the comma, the regions must agree too (one may add words: "CO" = "CO, USA"):
// "Cambridge, UK" is not "Cambridge, MA", so a second lead there is shown, not hidden as already tracked.
export function samePlace(a: string, b: string): boolean {
  const pa = normPlace(a), pb = normPlace(b)
  if (pa === '' || pb === '' || pa === pb) return true
  const city = (t: string) => normPlace(t.split(/[,;(]/)[0] ?? '').split(' ').filter(Boolean)
  const prefix = (x: string[], y: string[]) => x.length > 0 && x.length <= y.length && x.every((w, i) => w === y[i])
  const region = (t: string) => { const i = t.search(/[,;(]/); return i < 0 ? [] : normPlace(t.slice(i + 1)).split(' ').filter(Boolean) }
  const ra = region(a), rb = region(b)
  if (ra.length > 0 && rb.length > 0 && !prefix(ra, rb) && !prefix(rb, ra)) return false
  const ca = city(a), cb = city(b), wa = pa.split(' '), wb = pb.split(' ')
  return prefix(ca, cb) || prefix(cb, ca) || prefix(wa, wb) || prefix(wb, wa) || prefix(ca, wb) || prefix(cb, wa)
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
  return samePlace(a.location ?? '', b.location ?? '')
}

// The tracker, normalized once and indexed by link and by company, so checking many leads against
// a long tracker stays fast (the same answers as isSamePosting, which every candidate still goes through).
export type TrackerIndex = { byLink: Map<string, JobRef[]>; byCompany: Map<string, JobRef[]> }

export function trackerIndex(refs: JobRef[]): TrackerIndex {
  const byLink = new Map<string, JobRef[]>()
  const byCompany = new Map<string, JobRef[]>()
  const add = (map: Map<string, JobRef[]>, key: string, ref: JobRef) => { if (key !== '') map.set(key, [...(map.get(key) ?? []), ref]) }
  for (const ref of refs) {
    for (const l of new Set([ref.link ?? '', ref.applyLink ?? ''].map(normLink))) add(byLink, l, ref)
    add(byCompany, normCompany(ref.company), ref)
  }
  return { byLink, byCompany }
}

// True when the lead is already a row in the tracker. A match always shares a link or a company
// (isSamePosting needs one of them), so only those rows are compared.
export function isTracked(index: TrackerIndex, lead: JobRef): boolean {
  const seen = new Set<JobRef>()
  for (const l of [lead.link ?? '', lead.applyLink ?? ''].map(normLink)) for (const r of index.byLink.get(l) ?? []) seen.add(r)
  for (const r of index.byCompany.get(normCompany(lead.company)) ?? []) seen.add(r)
  for (const r of seen) if (isSamePosting(lead, r)) return true
  return false
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
