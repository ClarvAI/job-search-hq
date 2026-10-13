export type Job = {
  key: string
  company: string
  role: string
  status: string
  nextAction: string
  nextDate: string
  deadline: string
  folder: string
  contact: string
  applyLink: string
  jobId: string
}

// One copyable answer. `copy` is '' when there is nothing safe to copy (missing, placeholder, guidance only).
export type Field = {
  id: string
  label: string
  value: string
  copy: string
  hint: string
  isMissing: boolean
  // True for questions only the user can answer (certifications, attestations, [ASK] items, "Not sure").
  isYours?: boolean
}

export type Section = { title: string; note: string; fields: Field[] }

export type FileItem = { label: string; name: string; status: string; isReady: boolean; fix: string }

export type Kit = {
  today: string
  job: Job | null
  jobs: Job[]
  sections: Section[]
  questions: Field[]
  hasAnswers: boolean
  files: FileItem[]
  followUpDate: string
  // What's wrong with the tracker file ('' when it reads cleanly); "Mark applied" is refused while it is set.
  problem: string
}

export type Notice = { text: string; isError: boolean }

declare module 'claude-code' {
  interface PluginState {
    // isOpen: the pane is showing (the kit is kept current only then); pickerPage: page of the job picker.
    'apply-kit': { kit: Kit | null; chosen: string; armed: boolean; picking: boolean; notice: Notice; isOpen: boolean; pickerPage: number }
  }
}
