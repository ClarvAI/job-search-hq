// The same shapes as hooks/stats.ts returns (a contract can't import them).
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
  steps: Step[]
  lowest: Step | null
  weeks: Week[]
  levers: Group[]
  bySource: Group[]
  byFit: Group[]
  byPriority: Group[]
  notForMe: { reason: string; count: number }[]
  // What's wrong with the tracker ('' when it reads cleanly).
  problem: string
}

export type View = { stats: Stats | null; today: string; isClosed: boolean; unreadable: string }

declare module 'claude-code' {
  interface PluginState {
    insights: { view: View | null; showMore: boolean }
  }
}
