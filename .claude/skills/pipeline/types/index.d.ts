export type Job = {
  key: string
  company: string
  role: string
  status: string
  nextAction: string
  nextDate: string
  folder: string
  location: string
  deadline: string
  // A second dated commitment from "Also: <what> <date>" at the start of the notes ('' when none).
  also: string
  alsoDate: string
  // The posting watch's latest check of this job's posting (history/posting-watch.md): 'open', 'closed',
  // "couldn't check", or '' when never checked; with its date and reason.
  postingState: string
  postingDate: string
  postingReason: string
}

export type Summary = {
  today: string
  active: Job[]
  closed: Job[]
  due: Job[]
  counts: Record<string, number>
  drafts: number
  // Jobs still to apply to whose posting looks closed (the posting watch).
  closedPostings: number
  isClosed: boolean
  // What's wrong with the tracker file ('' when it reads cleanly); nothing is saved while it is set.
  problem: string
  // Fingerprint of the file's text as last read: a save is refused when the file no longer matches it.
  sig: string
}

export type Notice = { text: string; isError: boolean }

declare module 'claude-code' {
  interface PluginState {
    // page / closedPage: which page of the open and closed lists is showing (long lists are paged).
    pipeline: { summary: Summary | null; isHidden: boolean; editing: string; showClosed: boolean; notice: Notice; page: number; closedPage: number }
  }
}
