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
}

export type Notice = { text: string; isError: boolean }

declare module 'claude-code' {
  interface PluginState {
    'apply-kit': { kit: Kit | null; chosen: string; armed: boolean; picking: boolean; notice: Notice }
  }
}
