import { expect, mock, test } from 'claude-code/testing'

const PANE = { component: 'Pane', requestId: 'interview-room', props: { title: 'Interview Room', isFocused: true, bodyColumns: 90 } } as const

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a full mock round draws on ${surface}`, async ($, on) => {
    const time = mock.clock(on)
    on('audio.speak', () => ({ value: { synthesizer: 'system' } }) as never)
    const filled: string[] = []
    on('prompt.fill', (_$, e) => { filled.push((e as { text: string }).text); return { isFilled: true } as never })
    on('ui.open', () => ({ value: { isPlaced: true } }) as never)
    const ui = await $.ui.mount({ plugin: 'interview-room', surface, ...PANE } as never)
    expect(JSON.stringify(await ui.drawn())).toContain('/mock-interview')

    await $.tool.call({ tool: 'mcp__interview-room__interview_start', company: 'Globex', role: 'Data Analyst', interviewer: 'Hiring manager', style: 'behavioral', total: 3 } as never)
    // The mocked voice reports done at once; 9 words still take 2.7 s to read at 200 wpm.
    await $.tool.call({ tool: 'mcp__interview-room__interview_say', text: 'Tell me about a time you improved a process.', kind: 'question', seconds: 120 } as never)
    await time.advance(1000)
    let drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('Question 1 of 3')
    expect(drawn).toContain('Tell me about a time you improved a process.')
    expect(drawn).toContain('Your clock starts when it ends')
    expect(drawn).toContain('How to answer out loud')
    expect(drawn).toContain(surface === 'terminal' ? '/voice' : 'microphone')

    await time.advance(4000)
    drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('0:02 / 2:00')
    expect(drawn).not.toContain('Your clock starts when it ends')

    await ui.press({ key: 'done' })
    expect(filled[0]).toContain('answered in 0:02')
    await $.tool.call({ tool: 'mcp__interview-room__interview_score', question: 'Process improvement', score: 4, note: 'Strong result; add the before/after number first.' } as never)
    await $.tool.call({ tool: 'mcp__interview-room__interview_end' } as never)
    drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('Scorecard')
    expect(drawn).toContain('Interview over')
    await ui.unmount()
  })
}

test('one-way mode counts think time first, then the answer', async ($, on) => {
  const time = mock.clock(on)
  on('audio.speak', () => ({ value: { synthesizer: 'system' } }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  const ui = await $.ui.mount({ plugin: 'interview-room', surface: 'terminal', ...PANE } as never)
  await $.tool.call({ tool: 'mcp__interview-room__interview_start', company: 'Initech', role: 'Operations Analyst', interviewer: 'Recorded video', style: 'one-way', total: 2 } as never)
  await $.tool.call({ tool: 'mcp__interview-room__interview_say', text: 'Why this field?', kind: 'question', seconds: 90, prep_seconds: 30 } as never)
  await time.advance(10000)
  expect(JSON.stringify(await ui.drawn())).toContain('Think time: 0:20 left')
  // 3 words take 0.9 s to read, so the answer clock starts at 30.9 s.
  await time.advance(26000)
  expect(JSON.stringify(await ui.drawn())).toContain('0:05 / 1:30')
  await ui.unmount()
})

test('a downloaded Premium voice is picked automatically; without one, a tip shows', async ($, on) => {
  mock.clock(on)
  const voices: (string | undefined)[] = []
  on('audio.speak', (_$, e) => { voices.push((e as { voice?: string }).voice); return { value: { via: 'system' } } as never })
  let listing = 'Albert              en_US    # Hello! My name is Albert.\nAva (Premium)       en_US    # Hello! My name is Ava.\nSamantha            en_US    # Hello! My name is Samantha.\n'
  on('process.run', () => ({ value: { exitCode: 0, stdout: listing, stderr: '', isStdoutTruncated: false } }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  const ui = await $.ui.mount({ plugin: 'interview-room', surface: 'terminal', ...PANE } as never)
  await $.tool.call({ tool: 'mcp__interview-room__interview_start', company: 'Acme', role: 'Analyst', interviewer: 'Maria', style: 'behavioral', total: 1 } as never)
  await $.tool.call({ tool: 'mcp__interview-room__interview_say', text: 'Hi Alex.', kind: 'intro' } as never)
  expect(voices[0]).toBe('Ava (Premium)')
  expect(JSON.stringify(await ui.drawn())).not.toContain('Read & Speak')

  listing = 'Albert              en_US    # Hello!\nSamantha            en_US    # Hello!\n'
  await $.tool.call({ tool: 'mcp__interview-room__interview_start', company: 'Acme', role: 'Analyst', interviewer: 'Maria', style: 'behavioral', total: 1 } as never)
  await $.tool.call({ tool: 'mcp__interview-room__interview_say', text: 'Hi again.', kind: 'intro' } as never)
  expect(voices[1]).toBeUndefined()
  expect(JSON.stringify(await ui.drawn())).toContain('Read & Speak')
  await ui.unmount()
})

test('a question asked before interview_start is still shown', async ($, on) => {
  mock.clock(on)
  on('audio.speak', () => ({ value: { via: 'system' } }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  const ui = await $.ui.mount({ plugin: 'interview-room', surface: 'terminal', ...PANE } as never)
  await $.tool.call({ tool: 'mcp__interview-room__interview_say', text: 'Walk me through your resume.', kind: 'question', seconds: 90 } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('Walk me through your resume.')
  await ui.unmount()
})

test('think time says recording starts only for one-way practice, and the answer gets a sound and a notice at its turning points', async ($, on) => {
  const time = mock.clock(on)
  const played: string[] = []
  const toasts: string[] = []
  on('audio.speak', () => ({ value: { synthesizer: 'system' } }) as never)
  on('audio.play', (_$, e) => { const clip = (e as { clip: { base64?: string; mime?: string } }).clip; played.push(`${clip.mime}:${(clip.base64 ?? '').length > 2000 ? 'pair' : 'one'}`); return { value: undefined } as never })
  on('ui.toast', (_$, e) => { toasts.push((e as { text: string }).text); return { value: undefined } as never })
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  const ui = await $.ui.mount({ plugin: 'interview-room', surface: 'terminal', ...PANE } as never)
  await $.tool.call({ tool: 'mcp__interview-room__interview_start', company: 'Initech', role: 'Analyst', interviewer: 'Maria', style: 'behavioral', total: 1 } as never)
  await $.tool.call({ tool: 'mcp__interview-room__interview_say', text: 'Why this field?', kind: 'question', seconds: 60, prep_seconds: 10 } as never)
  await time.advance(3000)
  let drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Your answer clock starts automatically.')
  expect(drawn).not.toContain('recording')
  await time.advance(9000)
  expect(toasts).toContain('Think time is over. Start answering now.')
  await time.advance(32000)
  expect(toasts).toContain('30 seconds left.')
  await time.advance(30000)
  expect(toasts).toContain('Time is up. Finish your sentence.')
  expect(toasts.filter(t => t === '30 seconds left.').length).toBe(1)
  expect(played).toEqual(['audio/wav:one', 'audio/wav:one', 'audio/wav:pair'])

  await $.tool.call({ tool: 'mcp__interview-room__interview_start', company: 'Initech', role: 'Analyst', interviewer: 'Recorded video', style: 'one-way', total: 1 } as never)
  await $.tool.call({ tool: 'mcp__interview-room__interview_say', text: 'Why this field?', kind: 'question', seconds: 60, prep_seconds: 30 } as never)
  await time.advance(3000)
  drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('recording starts then')
  expect(drawn).toContain('Turn on dictation yourself')
  await ui.unmount()
})

test('sending an answer stops the clock and tells Claude how long it took', async ($, on) => {
  const time = mock.clock(on)
  on('audio.speak', () => ({ value: { synthesizer: 'system' } }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text, context: e.context }) as never)
  const ui = await $.ui.mount({ plugin: 'interview-room', surface: 'terminal', ...PANE } as never)
  await $.tool.call({ tool: 'mcp__interview-room__interview_start', company: 'Acme', role: 'Analyst', interviewer: 'Maria', style: 'behavioral', total: 1 } as never)
  await $.tool.call({ tool: 'mcp__interview-room__interview_say', text: 'Why us?', kind: 'question', seconds: 120 } as never)
  await time.advance(46000)
  const sent: any = await $.prompt.submit({ text: 'Because I like your products.' } as never)
  expect(JSON.stringify(sent)).toContain('took about 0:45')
  await time.advance(10000)
  expect(JSON.stringify(await ui.drawn())).toContain('0:45 / 2:00')
  await ui.unmount()
})

test('where the room can\'t be seen, Claude is told to write each line in the chat too', async ($, on) => {
  mock.clock(on)
  on('audio.speak', () => ({ value: { synthesizer: 'system' } }) as never)
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'opened unasked under 144 columns (80 now)' } }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  const started: any = await $.tool.call({ tool: 'mcp__interview-room__interview_start', company: 'Globex', role: 'Data Analyst', interviewer: 'Hiring manager', style: 'behavioral', total: 3 } as never)
  expect(JSON.stringify(started)).toContain('not visible in this window')
  const said: any = await $.tool.call({ tool: 'mcp__interview-room__interview_say', text: 'Why this role?', kind: 'question' } as never)
  expect(JSON.stringify(said)).toContain('write this line in your reply')
  const out: any = await $.command.run({ command: 'interview-room', args: '' } as never)
  expect(String(out.text)).toContain("can't show in this window")
})

test('the clock says in words when under 30 seconds are left; the closing line is shown and read; the voice choice is kept', async ($, on) => {
  const time = mock.clock(on)
  const spoken: string[] = []
  on('audio.speak', (_$, e) => { spoken.push((e as { text: string }).text); return { value: { synthesizer: 'system' } } as never })
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('audio.play', () => ({ value: undefined }) as never)
  const kept: Record<string, unknown> = {}
  on('store.get', (_$: any, e: any) => ({ value: kept[e.key] }) as never)
  on('store.set', (_$: any, e: any) => { kept[e.key] = e.value; return { value: undefined } as never })
  const ui = await $.ui.mount({ plugin: 'interview-room', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'practice' })
  await time.advance(95000)
  expect(JSON.stringify(await ui.drawn())).toContain('under 30 seconds left')
  await ui.press({ key: 'stop' })
  await $.tool.call({ tool: 'mcp__interview-room__interview_start', company: 'Globex', role: 'Data Analyst', interviewer: 'Hiring manager', style: 'behavioral', total: 1 } as never)
  await $.tool.call({ tool: 'mcp__interview-room__interview_end', closing: 'Thanks for your time today.' } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('Thanks for your time today.')
  expect(spoken).toContain('Thanks for your time today.')
  await ui.press({ key: 'voice' })
  expect(JSON.stringify(await ui.drawn())).toContain('Read questions aloud')
  expect(kept.isVoice).toBe(false)
  await ui.unmount()
})
