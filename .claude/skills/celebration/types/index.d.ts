export type Moment = {
  // The accepted job being celebrated ('' when there's none: /celebrate before any offer is accepted).
  company: string
  role: string
  name: string
  applied: number
  interviews: number
  offers: number
  // Days from the first application in the tracker to today (0 when unknown).
  days: number
}

declare module 'claude-code' {
  interface PluginState {
    celebration: { moment: Moment | null; isThanked: boolean }
  }
}
