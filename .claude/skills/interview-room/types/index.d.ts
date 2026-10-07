export type Line = { kind: string; text: string }

export type Clock = { startedAt: number; stoppedAt: number; limit: number; prep: number }

export type Score = { n: number; question: string; score: number; note: string }

export type Room = {
  company: string
  role: string
  interviewer: string
  style: string
  total: number
  asked: number
  isOver: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'interview-room': {
      room: Room | null
      line: Line | null
      clock: Clock | null
      now: number
      scores: Score[]
      isVoice: boolean
      voiceNote: string
      voiceTip: string
    }
  }
}
