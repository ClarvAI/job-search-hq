// The same shapes as hooks/status.ts returns (a contract can't import them).
export type Routine = {
  key: string
  name: string
  state: 'ok' | 'stalled' | 'stopped' | 'inactive'
  last: 'run' | 'setup'
  date: string
  cadence: 'daily' | 'weekdays' | 'weekly' | 'fortnightly'
  result: string
  time: string
  ref: string
  limit: number
}
export type RunLine = { date: string; time: string; name: string; result: string }

export type Board = {
  today: string
  // Whether history/routines.md exists (no log: nothing has been set up or run yet).
  hasLog: boolean
  routines: Routine[]
  // The latest runs, newest first (at most 10).
  recent: RunLine[]
}

export type Notice = { text: string; isError: boolean }

declare module 'claude-code' {
  interface PluginState {
    'routines-board': { board: Board | null; isHidden: boolean; notice: Notice; showRuns: boolean }
  }
}
