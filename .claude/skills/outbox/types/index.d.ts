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
    outbox: { drafts: Draft[]; waiting: Draft[]; broken: string[]; armed: string; notice: Notice; mode: string; signature: string; hasSignature: boolean; fileMode: string; unsure: string[] }
  }
}
