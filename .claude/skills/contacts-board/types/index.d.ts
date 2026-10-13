export type Contact = {
  key: string
  name: string
  company: string
  title: string
  relationship: string
  lastContact: string
  nextFollowup: string
  status: string
  touches: number
  job: string
  // Status of the linked job's row in jobs/tracker.csv ('' when none is linked or found).
  jobStatus: string
  // True when the linked job is applied or later: the job row owns the follow-up date, not this contact.
  jobOwnsFollowup: boolean
}

export type Summary = {
  today: string
  contacts: Contact[]
  due: Contact[]
  counts: Record<string, number>
  hasFile: boolean
  // What's wrong with contacts.csv ('' when it reads cleanly); nothing is saved while it is set.
  problem: string
}

export type Notice = { text: string; isError: boolean }

declare module 'claude-code' {
  interface PluginState {
    // pages: which page each group (a status, 'cold', 'other') is on; long groups are paged.
    'contacts-board': { summary: Summary | null; isHidden: boolean; armed: string; showCold: boolean; notice: Notice; pages: Record<string, number> }
  }
}
