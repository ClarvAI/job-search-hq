import { addDays, columnsOf, daysBetween, isIso, orderFor, readCsv, toIso } from './csvdate'
import type { DateOrder } from './csvdate'

// The numbers on the Insights board, from jobs/tracker.csv (and the "not for me" reasons in jobs/leads.csv).
// Counts come from each job's current stage and its notes, so a job that has closed still counts for the
// stages it reached when its notes say so. /weekly-review reads more (the activity log, interview notes).
// Small numbers are noise: a rate is shown only from MIN_RATE jobs up (the weekly review's "about 10").

export const MIN_RATE = 10

export type Group = { label: string; applied: number; replied: number; interviews: number }
export type Step = { from: string; to: string; had: number; got: number }
export type Week = { start: string; applied: number }
export type Stats = {
  total: number
  applied: number
  replied: number
  interviews: number
  offers: number
  rejected: number
  rejectedAfterInterview: number
  ghosted: number
  withdrawn: number
  waiting: number
  // From applied to replied, replied to interview, interview to offer: the one with the lowest share,
  // among steps with at least MIN_RATE jobs in them ('' when none has enough yet).
  steps: Step[]
  lowest: Step | null
  weeks: Week[]
  // What tends to move outcomes: a named contact or not, and applying soon after finding the job or later.
  levers: Group[]
  bySource: Group[]
  byFit: Group[]
  byPriority: Group[]
  notForMe: { reason: string; count: number }[]
  problem: string
}

const AFTER_APPLY = ['applied', 'screening', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn', 'ghosted']
const REPLIED = ['screening', 'interviewing', 'offer', 'accepted', 'rejected']
const REACHED_INTERVIEW = ['interviewing', 'offer', 'accepted']
const REACHED_OFFER = ['offer', 'accepted']

type Job = { status: string; applied: boolean; replied: boolean; interview: boolean; offer: boolean; dateApplied: string; dateFound: string; contact: boolean; source: string; fit: string; priority: string }

function readJobs(text: string, order: DateOrder): { jobs: Job[]; problem: string } {
  const { rows: [header = [], ...rows], problem } = readCsv(text)
  if (problem !== '') return { jobs: [], problem }
  const col = columnsOf(header)
  const at = (r: string[], name: string) => { const i = col(name); return i >= 0 ? (r[i] ?? '').trim() : '' }
  const jobs = rows.filter(r => at(r, 'company') !== '').map(r => {
    const status = at(r, 'status').toLowerCase()
    const said = `${at(r, 'notes')} ${at(r, 'next_action')}`
    const dateApplied = toIso(at(r, 'date_applied'), orderFor(r, order))
    const dateFound = toIso(at(r, 'date_found'), orderFor(r, order))
    const applied = AFTER_APPLY.includes(status) || isIso(dateApplied)
    // A closed job counts for an interview or an offer only when its notes say it got that far.
    const interview = REACHED_INTERVIEW.includes(status) || (['rejected', 'withdrawn', 'ghosted'].includes(status) && /interview/i.test(said))
    const offer = REACHED_OFFER.includes(status) || (status === 'withdrawn' && /\boffer\b/i.test(said))
    return {
      status, applied, dateApplied, dateFound, interview, offer,
      // A contact named on the row, or a referral in its notes (the weekly review counts a referral only when one is recorded).
      contact: at(r, 'contact') !== '' || /\breferr/i.test(at(r, 'notes')),
      replied: applied && (REPLIED.includes(status) || interview),
      source: at(r, 'source'), fit: at(r, 'fit'), priority: at(r, 'priority').toUpperCase(),
    }
  })
  return { jobs, problem }
}

function groups(jobs: Job[], label: (j: Job) => string, order?: string[]): Group[] {
  const map = new Map<string, Group>()
  for (const j of jobs) {
    if (!j.applied) continue
    const k = label(j)
    const g = map.get(k) ?? { label: k, applied: 0, replied: 0, interviews: 0 }
    g.applied++; if (j.replied) g.replied++; if (j.interview) g.interviews++
    map.set(k, g)
  }
  const list = [...map.values()]
  if (order) return list.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label))
  return list.sort((a, b) => b.applied - a.applied || a.label.localeCompare(b.label))
}

// Monday of the week a date falls in.
function weekStart(iso: string): string {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number)
  const wd = (new Date(y, m - 1, d).getDay() + 6) % 7
  return addDays(iso, -wd)
}

export function insights(tracker: string, leads: string, today: string, order: DateOrder): Stats {
  const { jobs, problem } = readJobs(tracker, order)
  const applied = jobs.filter(j => j.applied)
  const count = (f: (j: Job) => boolean) => applied.filter(f).length
  const replied = count(j => j.replied)
  const interviews = count(j => j.interview)
  const offers = count(j => j.offer)
  const steps: Step[] = [
    { from: 'applied', to: 'heard back', had: applied.length, got: replied },
    { from: 'heard back', to: 'an interview', had: replied, got: interviews },
    { from: 'an interview', to: 'an offer', had: interviews, got: offers },
  ]
  const ready = steps.filter(s => s.had >= MIN_RATE)
  const lowest = ready.length === 0 ? null : ready.reduce((a, b) => (b.got / b.had < a.got / a.had ? b : a))
  // The last 8 weeks, Monday first, oldest first.
  const thisWeek = weekStart(today)
  const weeks: Week[] = []
  for (let i = 7; i >= 0; i--) weeks.push({ start: addDays(thisWeek, -7 * i), applied: 0 })
  for (const j of applied) {
    if (!isIso(j.dateApplied) || j.dateApplied > today) continue
    const w = weeks.find(x => x.start === weekStart(j.dateApplied))
    if (w) w.applied++
  }
  // Not-for-me reasons from the Job Inbox ("other: <their words>" counts as other).
  const reasons = new Map<string, number>()
  const { rows: [lh = [], ...lrows], problem: lp } = readCsv(leads)
  if (lp === '') {
    const col = columnsOf(lh)
    const at = (r: string[], n: string) => { const i = col(n); return i >= 0 ? (r[i] ?? '').trim() : '' }
    for (const r of lrows) {
      if (at(r, 'status').toLowerCase() !== 'not-for-me') continue
      const reason = (at(r, 'reason').toLowerCase().split(':')[0] ?? '').trim() || 'no reason given'
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1)
    }
  }
  return {
    total: jobs.length,
    applied: applied.length, replied, interviews, offers,
    rejected: count(j => j.status === 'rejected'),
    rejectedAfterInterview: count(j => j.status === 'rejected' && j.interview),
    ghosted: count(j => j.status === 'ghosted'),
    withdrawn: count(j => j.status === 'withdrawn'),
    waiting: count(j => j.status === 'applied'),
    steps, lowest, weeks,
    levers: [
      ...groups(jobs, j => (j.contact ? 'with a contact or referral' : 'without a contact'), ['with a contact or referral', 'without a contact']),
      ...groups(jobs.filter(j => isIso(j.dateFound) && isIso(j.dateApplied) && j.dateApplied >= j.dateFound),
        j => (daysBetween(j.dateFound, j.dateApplied) <= 3 ? 'applied within 3 days of finding it' : 'applied after more than 3 days'),
        ['applied within 3 days of finding it', 'applied after more than 3 days']),
    ],
    bySource: groups(jobs, j => j.source || 'not recorded').slice(0, 6),
    byFit: groups(jobs, j => (/^[1-5]$/.test(j.fit) ? `fit ${j.fit}` : 'no fit score'), ['fit 5', 'fit 4', 'fit 3', 'fit 2', 'fit 1', 'no fit score']),
    byPriority: groups(jobs, j => (/^[ABC]$/.test(j.priority) ? `priority ${j.priority}` : 'no priority'), ['priority A', 'priority B', 'priority C', 'no priority']),
    notForMe: [...reasons.entries()].map(([reason, n]) => ({ reason, count: n })).sort((a, b) => b.count - a.count).slice(0, 5),
    problem,
  }
}

// "3 of 12 (25%)", or "3 of 4" while the group is too small for a share to mean much.
export function share(got: number, had: number): string {
  if (had === 0) return 'none yet'
  return had >= MIN_RATE ? `${got} of ${had} (${Math.round((100 * got) / had)}%)` : `${got} of ${had}`
}
