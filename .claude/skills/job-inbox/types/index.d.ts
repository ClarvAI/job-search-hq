export type Lead = {
  id: string
  foundDate: string
  company: string
  role: string
  location: string
  remote: string
  pay: string
  posted: string
  link: string
  applyLink: string
  jobId: string
  source: string
  fitGuess: string
  why: string
  concerns: string
  status: string
  reason: string
  decidedDate: string
  isTracked: boolean
}

export type Inbox = {
  today: string
  fresh: Lead[]
  older: Lead[]
  saved: Lead[]
  counts: Record<string, number>
  hasFile: boolean
  // New leads held back because their id is blank or used twice (a press changes a lead by its id).
  badIds: number
  // What's wrong with leads.csv ('' when it reads cleanly); nothing is saved while it is set.
  problem: string
  // Fingerprint of the file's text as last read: a save is refused when the file no longer matches it.
  sig: string
}

export type Notice = { text: string; isError: boolean; undoId: string; undoStatus: string }

// One decision made in the panel, waiting to be written to history/activity.md as one line per sitting.
export type Decision = { id: string; label: string; status: string; reason: string }

declare module 'claude-code' {
  interface PluginState {
    // page: which page of the lead cards is showing (long inboxes are paged).
    'job-inbox': { inbox: Inbox | null; asking: string; notice: Notice; pending: Decision[]; page: number }
  }
}
