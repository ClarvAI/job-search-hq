import { expect, mock, test } from 'claude-code/testing'

// Nothing plays sound or speech until the user opts in: voice (reading aloud) and sounds (the clock's
// beeps) are off in a new folder, the choice is kept per folder, and every line is shown as text.

const PANE = { component: 'Pane', requestId: 'interview-room', props: { title: 'Interview Room', isFocused: true, bodyColumns: 90 } } as const
const START = { tool: 'mcp__interview-room__interview_start', company: 'Globex', role: 'Data Analyst', interviewer: 'Hiring manager', style: 'behavioral', total: 2 }
const MAC = 'Albert              en_US    # Hello!\nAnna                de_DE    # Hallo! Ich heiße Anna.\nMonica              es_ES    # Hola, me llamo Mónica.\nPaulina             es_MX    # Hola, me llamo Paulina.\n'

function setup(on: any, opts: { store?: Record<string, unknown>; root?: string; listing?: string; isMac?: boolean; winVoices?: string } = {}) {
  const time = mock.clock(on)
  const kept: Record<string, unknown> = { ...(opts.store ?? {}) }
  const spoken: Array<{ text: string; voice?: string }> = []
  const played: string[] = []
  const runs: string[][] = []
  const toasts: string[] = []
  // Runs inside each utterance (a test presses a button there, as a user would mid-sentence).
  const hooks: { onSpeak?: (text: string) => unknown } = {}
  on('store.get', (_$: any, e: any) => ({ value: kept[e.key] }) as never)
  on('store.set', (_$: any, e: any) => { kept[e.key] = e.value; return { value: undefined } as never })
  on('session.root', () => ({ value: opts.root ?? '/folder-a' }) as never)
  on('audio.speak', async (_$: any, e: any) => { spoken.push({ text: e.text, voice: e.voice }); await hooks.onSpeak?.(e.text); return { value: { via: 'system' } } as never })
  on('audio.play', (_$: any, e: any) => { played.push(String(e.mime ?? 'clip')); return { value: undefined } as never })
  on('ui.toast', (_$: any, e: any) => { toasts.push(e.text); return { value: undefined } as never })
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('process.run', (_$: any, e: any) => {
    const argv = (e.argv ?? e.command ?? []) as string[]
    runs.push(argv)
    if (argv[0] === 'say') {
      if (opts.isMac === false) throw new Error('ENOENT: say')
      return { value: { exitCode: 0, stdout: opts.listing ?? MAC, stderr: '', isStdoutTruncated: false } } as never
    }
    if (argv[0] === 'powershell') return { value: { exitCode: 0, stdout: /GetInstalledVoices/.test(argv.join(' ')) ? (opts.winVoices ?? '') : '', stderr: '', isStdoutTruncated: false } } as never
    throw new Error('unexpected command')
  })
  return { time, kept, spoken, played, runs, toasts, hooks }
}

async function begin($: any, root = '/folder-a') {
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true } as never)
}

test('a fresh folder opens the room silently: no speech, no beeps; every line shows as text and Claude is told voice is off', async ($, on) => {
  const { time, spoken, played, toasts } = setup(on)
  await begin($)
  const ui = await $.ui.mount({ plugin: 'interview-room', surface: 'terminal', ...PANE } as never)
  const started: any = await $.tool.call({ ...START } as never)
  expect(String(started.result ?? started.text ?? JSON.stringify(started))).toContain('Reading aloud is off')
  const said: any = await $.tool.call({ tool: 'mcp__interview-room__interview_say', text: 'Tell me about a time you improved a process.', kind: 'question', seconds: 40 } as never)
  expect(JSON.stringify(said)).toContain('Shown on screen (reading aloud is off)')
  await time.advance(45000)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Tell me about a time you improved a process.')
  expect(drawn).toContain('"key":"voice","label":"Turn on voice"')
  expect(drawn).toContain('"key":"sounds","label":"Turn on sounds"')
  expect(drawn).toContain('Press \\"Turn on voice\\" to have them read aloud too')
  expect(spoken).toEqual([])
  // The clock's turning points still show as notices, without a sound.
  expect(toasts.join(' ')).toContain('Time is up')
  expect(played).toEqual([])
  await ui.unmount()
})

test('voice starts only after the button; the choice is kept for this folder only; turning it off stops the reading', async ($, on) => {
  const { kept, spoken, hooks } = setup(on, { store: { isVoice: true } })
  await begin($)
  const ui = await $.ui.mount({ plugin: 'interview-room', surface: 'terminal', ...PANE } as never)
  await $.tool.call({ ...START } as never)
  // An old folder-less "isVoice" value is not an opt-in for this folder.
  await $.tool.call({ tool: 'mcp__interview-room__interview_say', text: 'Hello.', kind: 'intro' } as never)
  expect(spoken).toEqual([])
  await ui.press({ key: 'voice' })
  expect(kept['voice:/folder-a']).toBe(true)
  expect(JSON.stringify(await ui.drawn())).toContain('"key":"voice","label":"Turn off voice"')
  await $.tool.call({ tool: 'mcp__interview-room__interview_say', text: 'Welcome. First question.', kind: 'intro' } as never)
  expect(spoken.map(s => s.text)).toEqual(['Welcome.', 'First question.'])
  hooks.onSpeak = undefined
  await ui.press({ key: 'voice' })
  expect(kept['voice:/folder-a']).toBe(false)
  await $.tool.call({ tool: 'mcp__interview-room__interview_say', text: 'One. Two. Three.', kind: 'intro' } as never)
  expect(spoken.length).toBe(2)
  await ui.unmount()
})

test('turning voice off between sentences stops the rest of the line at once', async ($, on) => {
  const { spoken, hooks } = setup(on, { store: { 'voice:/folder-a': true } })
  await begin($)
  const ui = await $.ui.mount({ plugin: 'interview-room', surface: 'terminal', ...PANE } as never)
  await $.tool.call({ ...START } as never)
  let pressed = false
  hooks.onSpeak = async () => { if (!pressed) { pressed = true; await ui.press({ key: 'voice' }) } }
  await $.tool.call({ tool: 'mcp__interview-room__interview_say', text: 'First sentence. Second sentence. Third sentence.', kind: 'intro' } as never)
  expect(spoken.map(s => s.text)).toEqual(['First sentence.'])
  expect(JSON.stringify(await ui.drawn())).toContain('Third sentence.')
  await ui.unmount()
})

test('a remembered choice is per folder: on in one folder, still off in another', async ($, on) => {
  const { spoken } = setup(on, { store: { 'voice:/folder-a': true, 'sounds:/folder-a': true }, root: '/folder-b' })
  await begin($, '/folder-b')
  await $.tool.call({ ...START } as never)
  await $.tool.call({ tool: 'mcp__interview-room__interview_say', text: 'Hello.', kind: 'intro' } as never)
  expect(spoken).toEqual([])
})

test('voice: true from Claude (after the user said yes) turns voice on and is remembered; sounds: true turns on the beeps', async ($, on) => {
  const { time, kept, spoken, played } = setup(on)
  await begin($)
  const started: any = await $.tool.call({ ...START, voice: true, sounds: true } as never)
  expect(JSON.stringify(started)).not.toContain('Reading aloud is off')
  expect(kept['voice:/folder-a']).toBe(true)
  expect(kept['sounds:/folder-a']).toBe(true)
  await $.tool.call({ tool: 'mcp__interview-room__interview_say', text: 'Why this role?', kind: 'question', seconds: 40 } as never)
  expect(spoken.map(s => s.text)).toEqual(['Why this role?'])
  await time.advance(45000)
  expect(played.length).toBeGreaterThan(0)
})

test('an interview in another language uses a voice for it when one is installed (region first), else says so', async ($, on) => {
  const { spoken } = setup(on, { store: { 'voice:/folder-a': true } })
  await begin($)
  await $.tool.call({ ...START, language: 'de' } as never)
  await $.tool.call({ tool: 'mcp__interview-room__interview_say', text: 'Guten Tag.', kind: 'intro' } as never)
  expect(spoken[0]?.voice).toBe('Anna')
  await $.tool.call({ ...START, language: 'es-MX' } as never)
  await $.tool.call({ tool: 'mcp__interview-room__interview_say', text: 'Hola.', kind: 'intro' } as never)
  expect(spoken[1]?.voice).toBe('Paulina')
  const ja: any = await $.tool.call({ ...START, language: 'ja' } as never)
  expect(JSON.stringify(ja)).toContain('No voice for \\"ja\\" is installed')
  await $.tool.call({ tool: 'mcp__interview-room__interview_say', text: 'Konnichiwa.', kind: 'intro' } as never)
  expect(spoken[2]?.voice).toBeUndefined()
})

test('on Windows, an installed voice for the language is used through System.Speech', async ($, on) => {
  const { spoken, runs } = setup(on, { store: { 'voice:/folder-a': true }, isMac: false, winVoices: 'en-US|Microsoft Zira Desktop\r\nde-DE|Microsoft Hedda Desktop\r\n' })
  await begin($)
  const started: any = await $.tool.call({ ...START, language: 'de-DE' } as never)
  expect(JSON.stringify(started)).toContain('Reading aloud in Microsoft Hedda Desktop')
  await $.tool.call({ tool: 'mcp__interview-room__interview_say', text: 'Guten Tag.', kind: 'intro' } as never)
  expect(spoken).toEqual([])
  const speakRun = runs.find(r => r[0] === 'powershell' && /Speak\(/.test(r.join(' ')))
  expect((speakRun ?? []).join(' ')).toContain("$s.SelectVoice('Microsoft Hedda Desktop')")
})
