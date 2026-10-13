import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Clock, Line, Room, Score } from '../types'

// Interview Room: Claude runs a mock interview through four tools
// (interview_start, interview_say, interview_score, interview_end). The pane
// shows the interviewer's line, runs a clock while the user answers out loud
// (dictation), and keeps a scorecard. Nothing makes a sound until the user opts in:
// reading aloud ("Turn on voice") and the clock's beeps ("Turn on sounds") are off in
// a new folder, and the choice is kept per folder. Every spoken line is also shown.

const PANE = 'interview-room'
// The same words, in the same place (right under the panel's first line), in every panel.
const KEYS_HINT = 'Keys: Ctrl+X then Tab moves into this panel. Tab moves between buttons, Enter presses one, Esc goes back to typing.'
// Told to Claude when the room can't be seen (a narrow window, or an app that shows no panels).
const NOT_SHOWN = ' The Interview Room is not visible in this window (it needs a wider window, or this app shows no panels). Tell the user once that they can widen the window or type /interview-room to see it, and also write each interviewer line in your reply so they can read it. Reading aloud, the clock and the scorecard still work.'

const room = atom({ plugin: 'interview-room', key: 'room' } as const, null as Room | null)
const line = atom({ plugin: 'interview-room', key: 'line' } as const, null as Line | null)
const clock = atom({ plugin: 'interview-room', key: 'clock' } as const, null as Clock | null)
const now = atom({ plugin: 'interview-room', key: 'now' } as const, 0)
const scores = atom({ plugin: 'interview-room', key: 'scores' } as const, [] as Score[])
// Off until the user turns it on (the room's button, or interview_start's `voice: true`, which Claude
// passes only after the user said yes in chat). Kept per folder in the plugin's store.
const isVoice = atom({ plugin: 'interview-room', key: 'isVoice' } as const, false)
// The clock's beeps at its turning points: off until the user turns them on, kept per folder too.
const isSound = atom({ plugin: 'interview-room', key: 'isSound' } as const, false)
const voiceNote = atom({ plugin: 'interview-room', key: 'voiceNote' } as const, '')
const voiceTip = atom({ plugin: 'interview-room', key: 'voiceTip' } as const, '')
// The answer clock can be turned off (WCAG 2.2.1 and 2.2.2): then no countdown is drawn, nothing
// redraws every second, and no beeps or notices come. The user's choice is kept across sessions.
const isTimed = atom({ plugin: 'interview-room', key: 'isTimed' } as const, true)

let ticker: { cancel: () => void } | undefined

// macOS `say` reads about 175–200 words a minute. The user's clock never starts before
// a line could have been read at 200, counted from the end of any line queued
// ahead of it, in case the voice reports done early or two lines overlap.
const WORDS_PER_MINUTE = 200
let voiceFreeAt = 0

function readingMs(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.round((words / WORDS_PER_MINUTE) * 60000)
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// How to answer out loud, per surface. The engine has no dictation call, so the
// pane can only explain the steps.
function micSteps(surface: string): string[] {
  if (surface === 'terminal') {
    return [
      '1. Type /voice and press Enter. You only do this once.',
      '2. When your clock starts, hold the Space bar and talk. Let go when you finish.',
      '3. Read over the text, then press Enter to send.',
    ]
  }
  return [
    '1. Click the microphone in the message box below. No microphone there? Use your computer’s dictation: Mac, your Dictation shortcut (turn it on and see or choose the shortcut in System Settings > Keyboard > Dictation); Windows, press Win + H.',
    '2. When your clock starts, talk. Click the microphone (or use the same dictation shortcut) again when you finish.',
    '3. Read over the text, then press Enter to send.',
  ]
}

function micHint(surface: string): string {
  return surface === 'terminal'
    ? 'Speak your answer: hold Space while you talk. Situation, Task, Action, Result.'
    : 'Speak your answer: click the microphone (or Mac: your Dictation shortcut; Windows: Win + H). Situation, Task, Action, Result.'
}

// A picture of the score, always drawn after the number in words ("3 out of 5"), so a screen reader
// reads the meaning first and the symbols never carry it alone.
function dots(score: number): string {
  const n = Math.max(0, Math.min(5, Math.round(score)))
  return '●'.repeat(n) + '○'.repeat(5 - n)
}

// Moves the keyboard focus onto a button the next drawing shows (after the pressed one went away).
// Refused when the panel doesn't hold the keyboard (a mouse press): then nothing happens.
function focusOn($: any, key: string): void {
  void Promise.resolve().then(() => $.ui.focus({ requestId: PANE, key })).catch(() => undefined)
}

// One sound and one on-screen notice at each turning point of an answer (never one every second):
// think time over, 30 seconds left, time up. For a user who can't watch the clock (voice only, screen
// reader). A tone, not speech, so it never ends up in the user's dictated answer. Which cues this
// answer has had is a module variable: a reload just drops it.
let cues = new Set<string>()

// A short beep as a WAV file, made here (8-bit, 8 kHz) so the mod ships no sound files: one tone for
// "start" and "30 seconds left", a falling pair for "time is up".
function beep(freqs: number[]): string {
  const rate = 8000
  const samples: number[] = []
  freqs.forEach((f, k) => {
    const n = Math.round(rate * 0.16)
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / (rate * 0.01), (n - i) / (rate * 0.03))
      samples.push(Math.round(128 + 70 * env * Math.sin((2 * Math.PI * f * i) / rate)))
    }
    if (k < freqs.length - 1) for (let i = 0; i < rate * 0.08; i++) samples.push(128)
  })
  const bytes: number[] = []
  const str = (t: string) => { for (const ch of t) bytes.push(ch.charCodeAt(0)) }
  const u32 = (v: number) => bytes.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255)
  const u16 = (v: number) => bytes.push(v & 255, (v >>> 8) & 255)
  str('RIFF'); u32(36 + samples.length); str('WAVE'); str('fmt '); u32(16); u16(1); u16(1); u32(rate); u32(rate); u16(1); u16(8)
  str('data'); u32(samples.length)
  bytes.push(...samples)
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0, b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += (abc[(n >>> 18) & 63] ?? '') + (abc[(n >>> 12) & 63] ?? '') + (i + 1 < bytes.length ? abc[(n >>> 6) & 63] ?? '' : '=') + (i + 2 < bytes.length ? abc[n & 63] ?? '' : '=')
  }
  return out
}
const CUE = beep([880])
const TIME_UP = beep([660, 440])

async function tick($: any): Promise<void> {
  const at = await $.clock.now()
  await update($, now, () => at)
  const c = await read($, clock)
  if (!c || c.stoppedAt !== 0 || at < c.startedAt || !(await read($, isTimed))) return
  const prepMs = (c.prep ?? 0) * 1000
  const total = at - c.startedAt
  const left = c.limit * 1000 - Math.max(0, total - prepMs)
  const cue = (id: string, text: string, sound: string) => {
    if (cues.has(id)) return
    cues.add(id)
    $.ui.toast(text, { timeoutMs: 5000 })
    // The notice always shows; the beep only when the user turned sounds on.
    void Promise.resolve().then(async () => { if (await read($, isSound)) await $.audio.play({ base64: sound, mime: 'audio/wav' }) }).catch(() => undefined)
  }
  if (prepMs > 0 && total >= prepMs && total < prepMs + 5000) cue('start', 'Think time is over. Start answering now.', CUE)
  if (left <= 0) cue('time', 'Time is up. Finish your sentence.', TIME_UP)
  else if (left <= 30000 && c.limit > 30) cue('30', '30 seconds left.', CUE)
}

// `from` may be in the future: the clock shows 0:00 (and the pane says "listen")
// until then.
async function startClock($: any, limit: number, prep = 0, from = 0): Promise<void> {
  const at = await $.clock.now()
  await update($, clock, () => ({ startedAt: Math.max(at, from), stoppedAt: 0, limit, prep }))
  await update($, now, () => at)
  cues = new Set<string>()
  ticker?.cancel()
  ticker = undefined
  // With the clock off nothing ticks: the start time is still kept, so "Done answering" works.
  if (await read($, isTimed)) ticker = $.clock.every(1000, () => void tick($).catch(() => undefined))
}

async function setTimed($: any, on: boolean): Promise<void> {
  await update($, isTimed, () => on)
  await Promise.resolve().then(() => $.store.set('isTimed', on)).catch(() => undefined)
  ticker?.cancel()
  ticker = undefined
  const c = await read($, clock)
  if (on && c !== null && c.stoppedAt === 0) {
    // Turning the clock back on mid-answer plays no catch-up beeps for turning points already past.
    const at = await $.clock.now()
    const prepMs = (c.prep ?? 0) * 1000
    const left = c.limit * 1000 - Math.max(0, at - c.startedAt - prepMs)
    if (at - c.startedAt >= prepMs) cues.add('start')
    if (left <= 30000) cues.add('30')
    if (left <= 0) cues.add('time')
    await tick($).catch(() => undefined)
    ticker = $.clock.every(1000, () => void tick($).catch(() => undefined))
  }
}

async function stopClock($: any): Promise<number> {
  ticker?.cancel()
  ticker = undefined
  const at = await $.clock.now()
  let took = 0
  await update($, clock, c => {
    if (!c) return c
    const end = c.stoppedAt === 0 ? Math.max(at, c.startedAt) : c.stoppedAt
    took = end - c.startedAt
    return { ...c, stoppedAt: end }
  })
  return took
}

// The plugin's store is shared by every folder on this computer, so the voice and sound choices are
// kept per folder (like the Outbox's send mode). An old folder-less "isVoice" value is never trusted.
async function folderKey($: any, name: string): Promise<string> {
  const root: string = await Promise.resolve().then(() => $.session.root()).then((r: unknown) => String(r ?? ''), () => '')
  return `${name}:${root}`
}

// The same choice as a module value: a reading in progress checks it between sentences, and $.state
// reads within one call see one moment, so a press mid-reading would not show there. Set again from
// the store at every session start (a reload runs that too).
let voiceNow = false

async function setVoice($: any, on: boolean): Promise<void> {
  voiceNow = on
  await update($, isVoice, () => on)
  await Promise.resolve().then(async () => $.store.set(await folderKey($, 'voice'), on)).catch(() => undefined)
}

async function setSound($: any, on: boolean): Promise<void> {
  await update($, isSound, () => on)
  await Promise.resolve().then(async () => $.store.set(await folderKey($, 'sounds'), on)).catch(() => undefined)
}

// Which voice reads aloud. English (or no language given): a downloaded "Premium" or "Enhanced"
// English voice if `say -v ?` labels one (older macOS does); otherwise the user's own System voice.
// macOS 27 no longer labels quality in `say -v ?`, and Siri voices can't be used by `say` at all, so
// we never override the System voice the user picked. Another language (BCP-47, "de", "es-MX"): a
// system voice for that language (the region's own first, then any), on macOS from `say -v ?`, on
// Windows from System.Speech's installed voices; none installed: the default voice, and Claude and the
// user are told. Looked up at the start of each interview.
let chosenVoice: string | undefined
// A Windows (System.Speech) voice for the interview's language; '' for the default voice.
let winVoice = ''
const VOICE_TIP = 'Voice sounds robotic? System Settings → Accessibility → Read & Speak: click the Info (i) button next to System voice, download a higher-quality English voice (not a Siri voice; those can\'t read here), then pick it as the System voice. Older macOS calls this Spoken Content.'

function langOf(raw: string): { lang: string; region: string } {
  const m = /^\s*([A-Za-z]{2,3})(?:[-_]([A-Za-z0-9]{2,4}))?/.exec(raw)
  return { lang: (m?.[1] ?? '').toLowerCase(), region: (m?.[2] ?? '').toUpperCase() }
}

// Returns a note for Claude ('' when nothing needs saying).
async function pickVoice($: any, language = ''): Promise<string> {
  chosenVoice = undefined
  winVoice = ''
  await update($, voiceTip, () => '')
  const { lang, region } = langOf(language)
  const isEnglish = lang === '' || lang === 'en'
  const missing = `No voice for "${language}" is installed on this computer, so lines are read in the default voice, which will sound wrong in that language. Tell the user once: they can add a voice for it (Mac: System Settings → Accessibility → Read & Speak → System voice; Windows: Settings → Time & language → Speech), or press "Turn off voice".`
  let listing = ''
  try {
    const ran = await $.process.run(['say', '-v', '?'], { timeoutMs: 5000 })
    if (ran.exitCode !== 0) throw new Error('no say')
    listing = String(ran.stdout ?? '')
  } catch {
    // Not a Mac. Windows: its default voice for English; for another language, an installed voice for it.
    if (isEnglish) return ''
    try {
      const ran = await $.process.run(['powershell', '-NoProfile', '-NonInteractive', '-Command',
        'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Culture.Name + \'|\' + $_.VoiceInfo.Name }'], { timeoutMs: 10000 })
      const voices = String(ran.stdout ?? '').split(/\r?\n/).map(l => /^([A-Za-z]{2,3})(?:-([A-Za-z0-9]{2,4}))?[^|]*\|(.+)$/.exec(l.trim())).filter((m): m is RegExpExecArray => m !== null)
        .map(m => ({ lang: (m[1] ?? '').toLowerCase(), region: (m[2] ?? '').toUpperCase(), name: (m[3] ?? '').trim() }))
        .filter(v => v.lang === lang && v.name !== '' && !/['\r\n]/.test(v.name))
        .sort((a, b) => Number(b.region === region) - Number(a.region === region))
      if (voices[0]) { winVoice = voices[0].name; return `Reading aloud in ${winVoice}.` }
    } catch { /* no PowerShell either */ }
    await update($, voiceTip, () => `No voice for "${language}" is installed, so lines are read in the default voice. Add one in Settings → Time & language → Speech, or turn voice off.`)
    return missing
  }
  const all = listing.split('\n')
    .map(l => /^(.+?)\s+([a-z]{2,3})_([A-Za-z0-9]{2,4})\s+#/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => ({ name: (m[1] ?? '').trim(), lang: m[2] ?? '', region: (m[3] ?? '').toUpperCase() }))
  const quality = (v: { name: string }) => (/\(Premium\)/i.test(v.name) ? 40 : /\(Enhanced\)/i.test(v.name) ? 20 : 0)
  if (isEnglish) {
    const rank = (v: { name: string; region: string }) => quality(v) + (v.region === (region || 'US') ? 2 : 0)
    const best = all.filter(v => v.lang === 'en').sort((a, b) => rank(b) - rank(a))[0]
    if (best && rank(best) >= 20) { chosenVoice = best.name; return '' }
    await update($, voiceTip, () => VOICE_TIP)
    return ''
  }
  const rank = (v: { name: string; region: string }) => quality(v) + (region !== '' && v.region === region ? 10 : 0)
  const best = all.filter(v => v.lang === lang).sort((a, b) => rank(b) - rank(a))[0]
  if (best) { chosenVoice = best.name; return `Reading aloud in ${best.name}.` }
  await update($, voiceTip, () => `No voice for "${language}" is installed, so lines are read in the default voice. Add one in System Settings → Accessibility → Read & Speak, or turn voice off.`)
  return missing
}

// Speak with the computer's own voice: macOS `say` through the engine,
// Windows through PowerShell's System.Speech. Silent elsewhere.
// Resolves with the earliest time the reading can have ended.
// Read a sentence at a time, checking the setting before each, so "Turn off voice" stops the reading
// after the sentence being spoken (the engine has no way to cut off a sentence midway).
async function speak($: any, text: string): Promise<number> {
  const began = await $.clock.now()
  if (text.trim() === '' || !(await read($, isVoice))) return began
  const floor = Math.max(began, voiceFreeAt) + readingMs(text)
  voiceFreeAt = floor
  const parts = text.match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g)?.map(p => p.trim()).filter(Boolean) ?? [text]
  for (const part of parts) {
    if (!voiceNow) { voiceFreeAt = began; return await $.clock.now() }
    const isSpoken = await speakAloud($, part)
    if (!isSpoken) {
      voiceFreeAt = began
      return began
    }
  }
  return Math.max(await $.clock.now(), floor)
}

async function speakAloud($: any, text: string): Promise<boolean> {
  // A Windows voice picked for the interview's language goes straight to System.Speech.
  if (winVoice === '') {
    try {
      await $.audio.speak(text, chosenVoice ? { voice: chosenVoice } : undefined)
      return true
    } catch {
      if (chosenVoice) {
        try { await $.audio.speak(text); return true } catch { /* fall through to Windows */ }
      }
    }
  }
  try {
    const select = winVoice !== '' ? `$s.SelectVoice('${winVoice.replace(/'/g, "''")}'); ` : ''
    const ran = await $.process.run(
      ['powershell', '-NoProfile', '-NonInteractive', '-Command',
        `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ${select}$s.Speak([Console]::In.ReadToEnd())`],
      { stdin: text, timeoutMs: 120000 },
    )
    if (ran.exitCode === 0) return true
  } catch {
    // no PowerShell either
  }
  await update($, voiceNote, () => 'Voice is not available on this computer, so questions show on screen only.')
  return false
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'interview-room', description: 'Open the mock interview room (start one with /mock-interview)' })
    // Voice and sounds: this folder's remembered choice, else off (an old folder-less value is ignored).
    const voiceSaved = await Promise.resolve().then(async () => $.store.get(await folderKey($, 'voice'))).catch(() => undefined)
    voiceNow = voiceSaved === true
    await update($, isVoice, () => voiceNow)
    const soundSaved = await Promise.resolve().then(async () => $.store.get(await folderKey($, 'sounds'))).catch(() => undefined)
    await update($, isSound, () => soundSaved === true)
    const timed = await Promise.resolve().then(() => $.store.get('isTimed')).catch(() => undefined)
    if (typeof timed === 'boolean') await update($, isTimed, () => timed)
    // After a reload mid-answer the clock's ticker is gone but the clock is still running: start it again.
    const running = await read($, clock)
    if (running !== null && running.stoppedAt === 0 && (await read($, isTimed))) {
      ticker?.cancel()
      ticker = $.clock.every(1000, () => void tick($).catch(() => undefined))
    }
    await $.tool.register({
      name: 'interview_start',
      description: 'Mock interviews only. Opens the Interview Room for the user and sets the scene. Call once at the start of /mock-interview. The room is silent until the user opts in to voice (reading aloud) and sounds (beeps): ask them first; pass voice/sounds true only after a clear yes.',
      inputSchema: {
        type: 'object',
        properties: {
          company: { type: 'string' },
          role: { type: 'string' },
          interviewer: { type: 'string', description: 'Who you are playing, e.g. "Hiring manager, Operations"' },
          style: { type: 'string', description: 'behavioral, technical, mixed, panel, presentation, ai-screen (live AI interviewer practice), or one-way (recorded video interview practice)' },
          total: { type: 'number', description: 'How many main questions you plan to ask' },
          language: { type: 'string', description: 'The interview\'s language as a BCP-47 tag ("de", "es-MX"), when it is not English: a system voice for it is used if one is installed' },
          voice: { type: 'boolean', description: 'true turns on reading lines aloud in this folder. Set it ONLY after the user said yes in chat to having questions read aloud; never set it without asking. Leave it out otherwise: the room stays silent unless the user turned voice on before here. false turns it off.' },
          sounds: { type: 'boolean', description: 'true turns on the answer clock\'s beeps in this folder. Same rule: only after the user said yes in chat; never set it without asking.' },
        },
        required: ['company', 'role', 'interviewer', 'total'],
      },
    })
    await $.tool.register({
      name: 'interview_say',
      description: 'Mock interviews only. Say one interviewer line to the user: it is shown in the Interview Room, and read aloud if the user turned voice on. kind "question" or "followup" also starts their answer clock once the line has been read. Call it one line at a time and wait for each call to return; never send two in parallel. Keep lines short and spoken, as a real interviewer talks. Never put feedback in a question line.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          kind: { type: 'string', enum: ['intro', 'question', 'followup', 'closing'] },
          seconds: { type: 'number', description: 'Target answer length for a question: behavioral 120, technical 180, quick follow-up 60' },
          prep_seconds: { type: 'number', description: 'Think time before the answer clock starts: 30 for one-way practice; also any question or follow-up for accommodations' },
        },
        required: ['text', 'kind'],
      },
    })
    await $.tool.register({
      name: 'interview_score',
      description: 'Mock interviews only. Record your score for the user\'s answer to one main question (1-5) with a one-line note naming the single biggest fix. Shown on their scorecard.',
      inputSchema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question, shortened to a few words' },
          score: { type: 'number', minimum: 1, maximum: 5 },
          note: { type: 'string', description: 'One line: what worked or the one fix' },
        },
        required: ['question', 'score', 'note'],
      },
    })
    await $.tool.register({
      name: 'interview_end',
      description: 'Mock interviews only. Close the Interview Room round and show the user their final scorecard. Call after the last answer, then write the debrief file.',
      inputSchema: { type: 'object', properties: { closing: { type: 'string', description: 'Optional spoken goodbye line' } } },
    })
    return next(e)
  })

  on('tool.call', { tool: 'mcp__interview-room__interview_start' }, async ($, e) => {
    const input = e as unknown as Partial<Room> & { language?: string; voice?: boolean; sounds?: boolean }
    // Only an explicit true/false changes the folder's choice (Claude sets it only after asking the user).
    if (input.voice === true || input.voice === false) await setVoice($, input.voice)
    if (input.sounds === true || input.sounds === false) await setSound($, input.sounds)
    await update($, room, () => ({
      company: String(input.company ?? ''), role: String(input.role ?? ''),
      interviewer: String(input.interviewer ?? 'Interviewer'), style: String(input.style ?? 'mixed'),
      total: Number(input.total) > 0 ? Number(input.total) : 5, asked: 0, isOver: false,
    }))
    await update($, scores, () => [])
    await update($, line, () => null)
    await update($, clock, () => null)
    await update($, voiceNote, () => '')
    voiceFreeAt = 0
    const language = String(input.language ?? '').trim().slice(0, 35)
    const voiceText = await pickVoice($, language).catch(() => '')
    const voiceOn = await read($, isVoice)
    const silent = voiceOn
      ? (voiceText ? ` ${voiceText}` : '')
      : ' Reading aloud is off (the user has not turned voice on in this folder), so lines show on screen only. If they might like questions read aloud, ask them; they can press "Turn on voice" in the room. Never pass voice: true without their yes.'
    const opened = await $.ui.open({ id: PANE, title: 'Interview Room' })
    return { result: `The Interview Room is open. Now greet the user with interview_say kind "intro", then ask the first question with kind "question".${silent}${opened.isPlaced ? '' : NOT_SHOWN}` }
  }).catch(($, e, next) => (next.called ? next(e) : { result: 'The Interview Room had a problem opening. Run the mock interview in chat instead (the mock-interview skill\'s chat version).' }))

  on('tool.call', { tool: 'mcp__interview-room__interview_say' }, async ($, e) => {
    const input = e as unknown as { text?: string; kind?: string; seconds?: number; prep_seconds?: number }
    const text = String(input.text ?? '').trim()
    const kind = String(input.kind ?? 'question')
    // If interview_start was skipped (or lost on resume), open a plain room so the line is still shown.
    if ((await read($, room)) === null) await update($, room, () => ({ company: '', role: '', interviewer: 'Interviewer', style: 'mixed', total: 5, asked: 0, isOver: false }))
    await update($, line, () => ({ kind, text }))
    if (kind === 'question') await update($, room, r => (r ? { ...r, asked: r.asked + 1 } : r))
    await stopClock($)
    await update($, clock, () => null)  // don't show the last answer's time under the new question
    const opened = await $.ui.open({ id: PANE, title: 'Interview Room' })
    // Read the line aloud first; the answer clock (or one-way think time) starts when the reading ends.
    const readAt = await speak($, text)
    if (kind === 'question' || kind === 'followup') {
      await startClock($, Number(input.seconds) > 0 ? Number(input.seconds) : kind === 'followup' ? 60 : 120, Number(input.prep_seconds) > 0 ? Number(input.prep_seconds) : 0, readAt)
    }
    const isAsking = kind === 'question' || kind === 'followup'
    const shown = (await read($, isVoice)) ? 'Shown and read aloud' : 'Shown on screen (reading aloud is off)'
    const hidden = opened.isPlaced ? '' : ' The room is not visible in this window: write this line in your reply so the user can read it.'
    const untimed = await read($, isTimed)
      ? ''
      : ' The user turned the answer clock off: never mention time or answer length, and give them as long as they need.'
    return {
      result: isAsking
        ? `${shown}; ${untimed ? 'the clock is off' : "the user's clock is running"}. Stop here and wait for their answer. Do not add commentary in this message.${hidden}${untimed}`
        : `${shown}.${hidden}${untimed}`,
    }
  }).catch(($, e, next) => (next.called ? next(e) : { result: 'The Interview Room could not show this line. Write it in your reply and carry on in chat.' }))

  on('tool.call', { tool: 'mcp__interview-room__interview_score' }, async ($, e) => {
    const input = e as unknown as { question?: string; score?: number; note?: string }
    await update($, scores, list => [...list, {
      n: list.length + 1, question: String(input.question ?? ''), score: Number(input.score) || 0, note: String(input.note ?? ''),
    }])
    return { result: 'Scored on the user\'s scorecard.' }
  }).catch(($, e, next) => (next.called ? next(e) : { result: 'The score could not be shown on the scorecard. Keep it for the written debrief.' }))

  on('tool.call', { tool: 'mcp__interview-room__interview_end' }, async ($, e) => {
    const input = e as unknown as { closing?: string }
    await stopClock($)
    await update($, room, r => (r ? { ...r, isOver: true } : r))
    const closing = String(input.closing ?? '').trim()
    if (closing !== '') {
      await update($, line, () => ({ kind: 'closing', text: closing }))
      void speak($, closing)
    }
    const list = await read($, scores)
    const avg = list.length ? (list.reduce((a, s) => a + s.score, 0) / list.length).toFixed(1) : 'n/a'
    return { result: `Round closed. Average ${avg} over ${list.length} scored answers. Now write the debrief to interviews/ and give the user their top 3 fixes.` }
  }).catch(($, e, next) => (next.called ? next(e) : { result: 'Round closed. Now write the debrief to interviews/ and give the user their top 3 fixes.' }))

  // Sending the answer (without pressing "Done answering") stops the clock too, and Claude is told how
  // long the answer took, for the debrief.
  on('prompt.submit', async ($, e, next) => {
    const r = await read($, room)
    const c = await read($, clock)
    if (r === null || r.isOver || c === null || c.stoppedAt !== 0 || (e as { origin?: unknown }).origin !== undefined) return next(e)
    const at = await $.clock.now()
    if (at < c.startedAt) return next(e)
    const took = await stopClock($)
    const answered = Math.max(0, took - (c.prep ?? 0) * 1000)
    const said = (await read($, isTimed))
      ? `[Interview Room] The user's answer took about ${mmss(answered)} (target ${mmss(c.limit * 1000)}).`
      : '[Interview Room] The user has the answer clock turned off: do not comment on how long the answer was.'
    return next({ ...e, context: [...(e.context ?? []), said] })
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'interview-room' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: 'Interview Room', focus: true })
    if (!opened.isPlaced) {
      return {
        text: 'The Interview Room can\'t show in this window. You can still practice: type /mock-interview and Claude will run it here in the chat.',
        context: ['The Interview Room panel is not visible in this app or window. For a mock interview, use the chat version in the mock-interview skill.'],
      }
    }
    return { text: 'Interview Room opened. Start a practice round with /mock-interview.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const r = await read($, room)
    const l = await read($, line)
    const c = await read($, clock)
    const t = await read($, now)
    const list = await read($, scores)
    const voice = await read($, isVoice)
    const sounds = await read($, isSound)
    const note = await read($, voiceNote)
    const tip = await read($, voiceTip)
    const timed = await read($, isTimed)

    // Same key either way, so the focus stays on it after a press. Turning voice off stops the reading
    // after the sentence being spoken; nothing is read until it is turned on.
    const toggle = (
      <Button key="voice" label={voice ? 'Turn off voice' : 'Turn on voice'} onPress={async () => { await setVoice($, !(await read($, isVoice))) }} />
    )
    const soundToggle = timed && (
      <Button key="sounds" label={sounds ? 'Turn off sounds' : 'Turn on sounds'} onPress={async () => { await setSound($, !(await read($, isSound))) }} />
    )
    const silentNote = !voice && <Text wrap="wrap">Questions show here as text. Press "Turn on voice" to have them read aloud too{timed ? ', and "Turn on sounds" for a beep at the clock\'s turning points' : ''}.</Text>
    // Same key either way, so the focus stays on it after a press.
    const clockToggle = (
      <Button key="timer" label={timed ? 'Turn off the clock' : 'Turn on the clock'} onPress={() => setTimed($, !timed)} />
    )
    const keys = e.surface === 'terminal' && <Text>{KEYS_HINT}</Text>
    const clockOff = <Text bold>Clock off. Take the time you need, then send your answer.</Text>

    if (r === null) {
      const isTicking = c !== null && c.stoppedAt === 0
      const spent = c === null ? 0 : (isTicking ? Math.max(t, c.startedAt) : c.stoppedAt) - c.startedAt
      const free = c === null ? 0 : c.limit * 1000 - spent
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>Interview Room</Text>
          {keys}
          <Text>Type /mock-interview and pick a job. Claude plays the interviewer, shows each question here (and reads it aloud if you turn voice on), and times your answer. You can turn the clock off.</Text>
          {silentNote}
          <Box flexDirection="column">
            <Text bold>How to answer out loud</Text>
            {micSteps(e.surface).map((s, i) => <Text key={`mic-${i}`} wrap="wrap">{s}</Text>)}
          </Box>
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            {timed && (isTicking
              ? <Button key="stop" label="Stop clock" variant="primary" onPress={async () => { await stopClock($); focusOn($, 'practice') }} />
              : <Button key="practice" label="Start 2-minute practice clock" onPress={async () => { await startClock($, 120); focusOn($, 'stop') }} />)}
            {clockToggle}
            {toggle}
            {soundToggle}
          </Box>
          {timed && c !== null && <Text bold color={free < 0 ? 'error' : free < 30000 ? 'warning' : 'success'}>{`Time: ${mmss(spent)} of ${mmss(c.limit * 1000)}${free < 0 ? '. Time is up: wrap it up' : free < 30000 && c.limit > 30 ? '. Under 30 seconds left' : ''}`}</Text>}
        </Box>
      )
    }

    const isRunning = c !== null && c.stoppedAt === 0
    const isListening = isRunning && t < c.startedAt
    const total = c === null ? 0 : (isRunning ? Math.max(t, c.startedAt) : c.stoppedAt) - c.startedAt
    const prepMs = c === null ? 0 : (c.prep ?? 0) * 1000
    const isPrep = isRunning && !isListening && total < prepMs
    const elapsed = Math.max(0, total - prepMs)
    const left = c === null ? 0 : c.limit * 1000 - elapsed
    const color = left < 0 ? 'error' : left < 30000 ? 'warning' : 'success'
    const avg = list.length ? list.reduce((a, s) => a + s.score, 0) / list.length : 0
    const isQuestion = l !== null && (l.kind === 'question' || l.kind === 'followup')

    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>{`${r.company} · ${r.role} · ${r.style}`}</Text>
        {keys}
        <Text dimColor>{r.isOver ? 'Interview over' : `Question ${Math.max(1, r.asked)} of ${r.total} · ${r.interviewer}`}</Text>
        {l !== null && (
          <Box flexDirection="column" borderStyle="round" paddingX={1}>
            <Text dimColor>{l.kind === 'followup' ? 'Follow-up' : l.kind === 'question' ? 'Question' : r.interviewer}</Text>
            <Text bold wrap="wrap">{l.text}</Text>
          </Box>
        )}
        {!timed && isQuestion && !r.isOver && clockOff}
        {timed && c !== null && !r.isOver && isListening && (
          <Text bold color="suggestion">Listen to the question. Your clock starts when it ends.</Text>
        )}
        {timed && c !== null && !r.isOver && isPrep && (
          <Text bold color="suggestion">{r.style === 'one-way'
            ? `Think time: ${mmss(prepMs - total)} left. Your answer clock starts automatically (on the real platform, recording starts then). Turn on dictation yourself when it starts.`
            : `Think time: ${mmss(prepMs - total)} left. Your answer clock starts automatically.`}</Text>
        )}
        {timed && c !== null && !r.isOver && !isListening && !isPrep && (
          <Text bold color={color}>{`Time: ${mmss(elapsed)} of ${mmss(c.limit * 1000)}${left < 0 ? '. Time is up: wrap it up' : left < 30000 && c.limit > 30 ? '. Under 30 seconds left' : ''}`}</Text>
        )}
        {!r.isOver && list.length === 0 && (
          <Box flexDirection="column">
            <Text bold>How to answer out loud</Text>
            {micSteps(e.surface).map((s, i) => <Text key={`mic-${i}`} wrap="wrap">{s}</Text>)}
          </Box>
        )}
        {isQuestion && isRunning && !isListening && !isPrep && list.length > 0 && <Text dimColor>{micHint(e.surface)}</Text>}
        {note !== '' && <Text color="warning">{note}</Text>}
        {note === '' && voice && tip !== '' && <Text dimColor wrap="wrap">{tip}</Text>}
        {!r.isOver && silentNote}
        {!r.isOver && <Text>"Ask for a hint", "Ask for more time" and "Ask to end interview" write a message to Claude. Press Enter to send it.</Text>}
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {timed && isRunning && !isListening && <Button key="done" label="Done answering" variant="primary" onPress={async () => {
            const took = await stopClock($)
            await $.prompt.fill({ text: `[answered in ${mmss(Math.max(0, took - prepMs))}] `, mode: 'insert' })
          }} />}
          {isQuestion && voice && note === '' && <Button key="repeat" label="Read question again" onPress={async () => {
            // The answer clock pauses while the question is read again: the replay's time is added back.
            const began = await $.clock.now()
            const until = await speak($, l.text)
            await update($, clock, c => (c === null || c.stoppedAt !== 0 ? c
              : began < c.startedAt ? { ...c, startedAt: Math.max(c.startedAt, until) }
              : { ...c, startedAt: c.startedAt + Math.max(0, until - began) }))
          }} />}
          {!r.isOver && <Button key="hint" label="Ask for a hint" onPress={() => $.prompt.fill({ text: 'I\'m stuck on this one. Give me a one-line hint (not the answer), then let me try again.' })} />}
          {!r.isOver && <Button key="more-time" label="Ask for more time" onPress={() => $.prompt.fill({ text: 'I need more time for my answers. Give me longer from now on, or turn off the time target.' })} />}
          {!r.isOver && <Button key="end" label="Ask to end interview" onPress={() => $.prompt.fill({ text: 'Let\'s end the interview here. Score what I answered and give me my debrief.' })} />}
          {clockToggle}
          {toggle}
          {soundToggle}
          <Button key="close" label="Close" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
        {list.length > 0 && (
          <Box flexDirection="column">
            <Text bold>{`Scorecard: average ${avg.toFixed(1)} out of 5   ${dots(avg)}`}</Text>
            {!r.isOver && <Text dimColor>Notes on each answer appear when the interview ends.</Text>}
            {list.map(s => (
              <Box key={`score-${s.n}`} flexDirection="column">
                <Text>{`Question ${s.n}: ${s.score} out of 5. ${s.question}   ${dots(s.score)}`}</Text>
                {r.isOver && <Text dimColor wrap="wrap">{`      ${s.note}`}</Text>}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
