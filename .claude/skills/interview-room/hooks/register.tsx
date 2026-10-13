import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Clock, Line, Room, Score } from '../types'

// Interview Room: Claude runs a mock interview through four tools
// (interview_start, interview_say, interview_score, interview_end). The pane
// shows the interviewer's line, reads it aloud, runs a clock while the user
// answers out loud (dictation), and keeps a scorecard.

const PANE = 'interview-room'
const KEYS_HINT = 'Keys: Tab moves between buttons, Enter presses one, Esc goes back to typing.'
// Told to Claude when the room can't be seen (a narrow window, or an app that shows no panels).
const NOT_SHOWN = ' The Interview Room is not visible in this window (it needs a wider window, or this app shows no panels). Tell the user once that they can widen the window or type /interview-room to see it, and also write each interviewer line in your reply so they can read it. Reading aloud, the clock and the scorecard still work.'

const room = atom({ plugin: 'interview-room', key: 'room' } as const, null as Room | null)
const line = atom({ plugin: 'interview-room', key: 'line' } as const, null as Line | null)
const clock = atom({ plugin: 'interview-room', key: 'clock' } as const, null as Clock | null)
const now = atom({ plugin: 'interview-room', key: 'now' } as const, 0)
const scores = atom({ plugin: 'interview-room', key: 'scores' } as const, [] as Score[])
const isVoice = atom({ plugin: 'interview-room', key: 'isVoice' } as const, true)
const voiceNote = atom({ plugin: 'interview-room', key: 'voiceNote' } as const, '')
const voiceTip = atom({ plugin: 'interview-room', key: 'voiceTip' } as const, '')

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

function dots(score: number): string {
  const n = Math.max(0, Math.min(5, Math.round(score)))
  return '●'.repeat(n) + '○'.repeat(5 - n)
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
  if (!c || c.stoppedAt !== 0 || at < c.startedAt) return
  const prepMs = (c.prep ?? 0) * 1000
  const total = at - c.startedAt
  const left = c.limit * 1000 - Math.max(0, total - prepMs)
  const cue = (id: string, text: string, sound: string) => {
    if (cues.has(id)) return
    cues.add(id)
    $.ui.toast(text, { timeoutMs: 5000 })
    void Promise.resolve().then(() => $.audio.play({ base64: sound, mime: 'audio/wav' })).catch(() => undefined)
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
  ticker = $.clock.every(1000, () => void tick($).catch(() => undefined))
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

// A downloaded "Premium" or "Enhanced" English voice if `say -v ?` labels one
// (older macOS does); otherwise the user's own System voice. macOS 27 no longer
// labels quality in `say -v ?`, and Siri voices can't be used by `say` at all,
// so we never override the System voice the user picked.
// Looked up at the start of each interview (one quick `say -v ?`).
let chosenVoice: string | undefined
const VOICE_TIP = 'Voice sounds robotic? System Settings → Accessibility → Read & Speak: click the Info (i) button next to System voice, download a higher-quality English voice (not a Siri voice; those can\'t read here), then pick it as the System voice. Older macOS calls this Spoken Content.'

async function pickVoice($: any): Promise<void> {
  chosenVoice = undefined
  await update($, voiceTip, () => '')
  let listing = ''
  try {
    const ran = await $.process.run(['say', '-v', '?'], { timeoutMs: 5000 })
    if (ran.exitCode !== 0) return
    listing = String(ran.stdout ?? '')
  } catch {
    return // not a Mac: Windows uses its own default voice
  }
  const english = listing.split('\n')
    .map(l => /^(.+?)\s+(en_[A-Z]{2})\s+#/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => ({ name: (m[1] ?? '').trim(), locale: m[2] ?? '' }))
  const rank = (v: { name: string; locale: string }) =>
    (/\(Premium\)/i.test(v.name) ? 40 : /\(Enhanced\)/i.test(v.name) ? 20 : 0) + (v.locale === 'en_US' ? 2 : 0)
  const best = english.sort((a, b) => rank(b) - rank(a))[0]
  if (best && rank(best) >= 20) { chosenVoice = best.name; return }
  await update($, voiceTip, () => VOICE_TIP)
}

// Speak with the computer's own voice: macOS `say` through the engine,
// Windows through PowerShell's System.Speech. Silent elsewhere.
// Resolves with the earliest time the reading can have ended.
async function speak($: any, text: string): Promise<number> {
  const began = await $.clock.now()
  if (text.trim() === '' || !(await read($, isVoice))) return began
  const floor = Math.max(began, voiceFreeAt) + readingMs(text)
  voiceFreeAt = floor
  const isSpoken = await speakAloud($, text)
  if (!isSpoken) {
    voiceFreeAt = began
    return began
  }
  return Math.max(await $.clock.now(), floor)
}

async function speakAloud($: any, text: string): Promise<boolean> {
  try {
    await $.audio.speak(text, chosenVoice ? { voice: chosenVoice } : undefined)
    return true
  } catch {
    if (chosenVoice) {
      try { await $.audio.speak(text); return true } catch { /* fall through to Windows */ }
    }
  }
  try {
    const ran = await $.process.run(
      ['powershell', '-NoProfile', '-NonInteractive', '-Command',
        'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak([Console]::In.ReadToEnd())'],
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
    // After a reload mid-answer the clock's ticker is gone but the clock is still running: start it again.
    const running = await read($, clock)
    if (running !== null && running.stoppedAt === 0) {
      ticker?.cancel()
      ticker = $.clock.every(1000, () => void tick($).catch(() => undefined))
    }
    const saved = await $.store.get('isVoice')
    if (typeof saved === 'boolean') await update($, isVoice, () => saved)
    await $.tool.register({
      name: 'interview_start',
      description: 'Mock interviews only. Opens the Interview Room for the user and sets the scene. Call once at the start of /mock-interview.',
      inputSchema: {
        type: 'object',
        properties: {
          company: { type: 'string' },
          role: { type: 'string' },
          interviewer: { type: 'string', description: 'Who you are playing, e.g. "Hiring manager, Operations"' },
          style: { type: 'string', description: 'behavioral, technical, mixed, panel, presentation, ai-screen (live AI interviewer practice), or one-way (recorded video interview practice)' },
          total: { type: 'number', description: 'How many main questions you plan to ask' },
        },
        required: ['company', 'role', 'interviewer', 'total'],
      },
    })
    await $.tool.register({
      name: 'interview_say',
      description: 'Mock interviews only. Say one interviewer line to the user: it is shown in the Interview Room and read aloud. kind "question" or "followup" also starts their answer clock once the line has been read. Call it one line at a time and wait for each call to return; never send two in parallel. Keep lines short and spoken, as a real interviewer talks. Never put feedback in a question line.',
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
    const input = e as unknown as Partial<Room>
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
    await pickVoice($)
    const opened = await $.ui.open({ id: PANE, title: 'Interview Room' })
    return { result: `The Interview Room is open. Now greet the user with interview_say kind "intro", then ask the first question with kind "question".${opened.isPlaced ? '' : NOT_SHOWN}` }
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
    const hidden = opened.isPlaced ? '' : ' The room is not visible in this window: write this line in your reply so the user can read it.'
    return {
      result: isAsking
        ? `Shown and read aloud; the user's clock is running. Stop here and wait for their answer. Do not add commentary in this message.${hidden}`
        : `Shown and read aloud.${hidden}`,
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
    return next({ ...e, context: [...(e.context ?? []), `[Interview Room] The user's answer took about ${mmss(answered)} (target ${mmss(c.limit * 1000)}).`] })
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
    const note = await read($, voiceNote)
    const tip = await read($, voiceTip)

    const toggle = (
      <Button key="voice" label={voice ? 'Stop reading aloud' : 'Read questions aloud'} onPress={async () => {
        const nextValue = !(await read($, isVoice))
        await update($, isVoice, () => nextValue)
        await $.store.set('isVoice', nextValue)
      }} />
    )

    if (r === null) {
      const isTicking = c !== null && c.stoppedAt === 0
      const spent = c === null ? 0 : (isTicking ? Math.max(t, c.startedAt) : c.stoppedAt) - c.startedAt
      const free = c === null ? 0 : c.limit * 1000 - spent
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>Interview Room</Text>
          {e.surface === 'terminal' && <Text dimColor>{KEYS_HINT}</Text>}
          <Text>Type /mock-interview and pick a job. Claude plays the interviewer, reads each question aloud, and times your answer.</Text>
          <Box flexDirection="column">
            <Text bold>How to answer out loud</Text>
            {micSteps(e.surface).map((s, i) => <Text key={`mic-${i}`} wrap="wrap">{s}</Text>)}
          </Box>
          <Box flexDirection="row" gap={1}>
            {isTicking
              ? <Button key="stop" label="Stop clock" variant="primary" onPress={() => stopClock($)} />
              : <Button key="practice" label="Start 2-minute practice clock" onPress={() => startClock($, 120)} />}
            {toggle}
          </Box>
          {c !== null && <Text bold color={free < 0 ? 'error' : free < 30000 ? 'warning' : 'success'}>{`${mmss(spent)} / ${mmss(c.limit * 1000)}${free < 0 ? '   wrap it up' : free < 30000 && c.limit > 30 ? '   under 30 seconds left' : ''}`}</Text>}
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
        <Text dimColor>{r.isOver ? 'Interview over' : `Question ${Math.max(1, r.asked)} of ${r.total} · ${r.interviewer}`}</Text>
        {l !== null && (
          <Box flexDirection="column" borderStyle="round" paddingX={1}>
            <Text dimColor>{l.kind === 'followup' ? 'Follow-up' : l.kind === 'question' ? 'Question' : r.interviewer}</Text>
            <Text bold wrap="wrap">{l.text}</Text>
          </Box>
        )}
        {c !== null && !r.isOver && isListening && (
          <Text bold color="suggestion">Listen to the question. Your clock starts when it ends.</Text>
        )}
        {c !== null && !r.isOver && isPrep && (
          <Text bold color="suggestion">{r.style === 'one-way'
            ? `Think time: ${mmss(prepMs - total)} left. Your answer clock starts automatically (on the real platform, recording starts then). Turn on dictation yourself when it starts.`
            : `Think time: ${mmss(prepMs - total)} left. Your answer clock starts automatically.`}</Text>
        )}
        {c !== null && !r.isOver && !isListening && !isPrep && (
          <Text bold color={color}>{`${mmss(elapsed)} / ${mmss(c.limit * 1000)}${left < 0 ? '   wrap it up' : left < 30000 && c.limit > 30 ? '   under 30 seconds left' : ''}`}</Text>
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
        {!r.isOver && <Text dimColor>"Ask for a hint" and "Ask to end interview" write a message to Claude. Press Enter to send it.</Text>}
        {e.surface === 'terminal' && <Text dimColor>{KEYS_HINT}</Text>}
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {isRunning && !isListening && <Button key="done" label="Done answering" variant="primary" onPress={async () => {
            const took = await stopClock($)
            await $.prompt.fill({ text: `[answered in ${mmss(Math.max(0, took - prepMs))}] `, mode: 'insert' })
          }} />}
          {isQuestion && voice && note === '' && <Button key="repeat" label="Read question again" onPress={async () => { await speak($, l.text) }} />}
          {!r.isOver && <Button key="hint" label="Ask for a hint" onPress={() => $.prompt.fill({ text: 'I\'m stuck on this one. Give me a one-line hint (not the answer), then let me try again.' })} />}
          {!r.isOver && <Button key="end" label="Ask to end interview" onPress={() => $.prompt.fill({ text: 'Let\'s end the interview here. Score what I answered and give me my debrief.' })} />}
          {toggle}
          <Button key="close" label="Close" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
        {list.length > 0 && (
          <Box flexDirection="column">
            <Text bold>{`Scorecard   ${dots(avg)}  ${avg.toFixed(1)} / 5`}</Text>
            {!r.isOver && <Text dimColor>Notes on each answer appear when the interview ends.</Text>}
            {list.map(s => (
              <Box key={`score-${s.n}`} flexDirection="column">
                <Text>{`${dots(s.score)} ${s.score}/5  Q${s.n}: ${s.question}`}</Text>
                {r.isOver && <Text dimColor wrap="wrap">{`      ${s.note}`}</Text>}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
