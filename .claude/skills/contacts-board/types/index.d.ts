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
}

export type Notice = { text: string; isError: boolean }

declare module 'claude-code' {
  interface PluginState {
    'contacts-board': { summary: Summary | null; isHidden: boolean; armed: string; showCold: boolean; notice: Notice }
  }
}
