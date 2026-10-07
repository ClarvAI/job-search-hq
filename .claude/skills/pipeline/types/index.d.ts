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
}

export type Summary = {
  today: string
  active: Job[]
  closed: Job[]
  due: Job[]
  counts: Record<string, number>
  drafts: number
  isClosed: boolean
}

export type Notice = { text: string; isError: boolean }

declare module 'claude-code' {
  interface PluginState {
    pipeline: { summary: Summary | null; isHidden: boolean; editing: string; showClosed: boolean; notice: Notice }
  }
}
