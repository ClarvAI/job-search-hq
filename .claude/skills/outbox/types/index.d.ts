export type Draft = {
  file: string
  channel: string
  kind: string
  to: string
  cc: string
  subject: string
  job: string
  contact: string
  created: string
  status: string
  replyTo: string
  body: string
}

export type Notice = { text: string; isError: boolean }

declare module 'claude-code' {
  interface PluginState {
    // sendMark: the preferences lines that turned send mode on, as last read (a new one asks again).
    // gmail: 'connected', 'missing' or 'unknown' (couldn't tell); gmailServer: the connector to call.
    // page / waitingPage: which page of drafts and of "Waiting in Gmail" is showing.
    outbox: { drafts: Draft[]; waiting: Draft[]; broken: string[]; armed: string; notice: Notice; mode: string; signature: string; hasSignature: boolean; fileMode: string; unsure: string[]; sendMark: string; gmail: string; gmailServer: string; page: number; waitingPage: number }
  }
}
