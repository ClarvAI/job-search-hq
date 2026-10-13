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
  // attach: file names from the optional `attach:` header (comma-separated), '' when none.
  attach: string
  // Fingerprint of the file's whole text as read: an action is refused when the file no longer matches.
  sig: string
}

// link: an "Open in Gmail" address for the draft just made ('' when Gmail didn't give one).
export type Notice = { text: string; isError: boolean; link?: string }

// A file to attach to a Gmail draft: a PDF in the draft's own job folder (checked before it is shown).
export type AttachFile = { name: string; path: string; size: number; mtimeMs: number }
// What "Create Gmail draft" will attach for one draft, shown before the user confirms. problems: why
// a file the message mentions won't be attached (the user attaches it in Gmail instead).
export type AttachPlan = { file: string; isWanted: boolean; files: AttachFile[]; problems: string[] }

declare module 'claude-code' {
  interface PluginState {
    // sendMark: the preferences lines that turned send mode on, as last read (a new one asks again).
    // gmail: 'connected', 'missing' or 'unknown' (couldn't tell); gmailServer: the connector to call.
    // page / waitingPage: which page of drafts and of "Waiting in Gmail" is showing.
    // attachPlan: the attachments shown in the open confirm row (null when none is open).
    outbox: { attachPlan: AttachPlan | null; drafts: Draft[]; waiting: Draft[]; broken: string[]; armed: string; notice: Notice; mode: string; signature: string; hasSignature: boolean; fileMode: string; unsure: string[]; sendMark: string; gmail: string; gmailServer: string; page: number; waitingPage: number }
  }
}
