import { expect, mock, test } from 'claude-code/testing'

// Today is 2026-10-22 (a Thursday) in every test.
const NOW = new Date(2026, 9, 22, 9, 0).getTime()
const LOG = '# Routine results\n\n'
  + '- 2026-10-12 08:00 · morning scan · set up (weekdays 8:00)\n'
  + '- 2026-10-16 08:00 · morning scan · 3 new leads (Job Inbox)\n'
  + '- 2026-10-21 07:30 · inbox check · 1 update (tracker)\n'
  + '- 2026-10-19 08:30 · posting watch · set up (weekly, Monday 8:30)\n'
  + '- 2026-10-19 08:35 · posting watch · all 4 still open\n'
  + '- 2026-10-01 16:00 · weekly review · paused\n'
  + '- 2026-10-22 08:05 · routines · offered\n'

const PANE = { component: 'Pane', requestId: 'routines-board', props: { title: 'Routines', isFocused: true, bodyColumns: 90 } } as const
const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 90 } } as const

function setup(on: any, log: string | null = LOG, opts: { notes?: string[]; fills?: string[]; notPlaced?: boolean; failWrite?: boolean } = {}) {
  const files: Record<string, string> = {}
  if (log !== null) files['history/routines.md'] = log
  mock.clock(on, { now: NOW } as never)
  const rel = (p: string) => p.replace(/^.*\/routines-board\//, '')
  on('fs.exists', (_$: any, e: any) => ({ value: rel(e.path) in files }) as never)
  on('fs.read', (_$: any, e: any) => ({ value: files[rel(e.path)] ?? '' }) as never)
  on('fs.write', (_$: any, e: any) => { if (opts.failWrite) throw new Error('EBUSY: resource busy or locked'); files[rel(e.path)] = e.text; return { value: undefined } as never })
  on('fs.list', () => ({ value: [] }) as never)
  on('ui.open', () => ({ value: opts.notPlaced ? { isPlaced: false, reason: 'no attached surface places panes' } : { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('prompt.fill', (_$: any, e: any) => { opts.fills?.push(e.text); return { isFilled: true } as never })
  on('session.append', (_$: any, e: any) => { opts.notes?.push(JSON.stringify(e.message)); return { deny: 'recorded by the test' } as never })
  on('command.register', () => ({ value: undefined }) as never)
  return { files }
}

test('the board shows each routine, the stopped one first, by the startup note’s rules', async ($, on) => {
  setup(on)
  await $.command.run({ command: 'routines-board', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'routines-board', surface: 'terminal', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('2 running · 1 seems to have stopped')
  expect(drawn).toContain('Seems to have stopped: last ran 2026-10-16')
  expect(drawn).toContain('Last result: 3 new leads (Job Inbox)')
  expect(drawn).toContain('Running: last ran 2026-10-21')
  expect(drawn).toContain('Paused or deleted (as you said)')
  expect(drawn).not.toContain('routines ·')
  expect(drawn.indexOf('morning scan · weekdays')).toBeLessThan(drawn.indexOf('inbox check · every day'))
  expect(drawn).toContain('Keys: Ctrl+X then Tab')
  await ui.unmount()
})

test('"I paused it" logs the change once, notes it for Claude, and the routine stops being flagged', async ($, on) => {
  const notes: string[] = []
  const { files } = setup(on, LOG, { notes })
  await $.command.run({ command: 'routines-board', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'routines-board', surface: 'desktop', ...PANE } as never)
  await ui.press({ key: 'morning scan:paused' })
  expect(files['history/routines.md']).toContain('- 2026-10-22 09:00 · morning scan · paused\n')
  expect(files['history/activity.md']).toContain('· Routines panel (Claude) · morning scan: marked paused')
  expect(notes.join('')).toContain('[Routines]')
  expect(notes.join('')).toContain("don't log it again")
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Saved: morning scan marked paused.')
  expect(drawn).not.toContain('Seems to have stopped')
  await ui.unmount()
})

test('"Help me fix it" writes a message for Claude without sending it', async ($, on) => {
  const fills: string[] = []
  const { files } = setup(on, LOG, { fills })
  await $.command.run({ command: 'routines-board', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'routines-board', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'morning scan:help' })
  expect(fills).toEqual(['My morning scan routine seems to have stopped running. Help me find out why.'])
  expect(Object.keys(files)).toEqual(['history/routines.md'])
  await ui.unmount()
})

test('a log that can’t be written shows a plain message and changes nothing', async ($, on) => {
  const { files } = setup(on, LOG, { failWrite: true })
  await $.command.run({ command: 'routines-board', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'routines-board', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'inbox check:deleted' })
  expect(JSON.stringify(await ui.drawn())).toContain('Not done:')
  expect(files['history/routines.md']).toBe(LOG)
  await ui.unmount()
})

test('no routines yet: the board offers to set them up', async ($, on) => {
  const fills: string[] = []
  setup(on, null, { fills })
  await $.command.run({ command: 'routines-board', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'routines-board', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('No automatic checks yet')
  await ui.press({ key: 'setup' })
  expect(fills).toEqual(['Set up automatic checks'])
  await ui.unmount()
})

test('the band shows only while a routine has stopped, and hides', async ($, on) => {
  setup(on)
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  await $.command.run({ command: 'routines-board', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'routines-board', surface: 'terminal', ...BAND } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('Routines: 1 seems to have stopped running')
  await ui.press({ key: 'hide-routines' })
  expect(JSON.stringify(await ui.drawn() ?? '')).not.toContain('Routines:')
  await ui.unmount()
})

test('nothing stopped: no band', async ($, on) => {
  setup(on, '- 2026-10-21 08:00 · morning scan · 2 new leads\n')
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  await $.command.run({ command: 'routines-board', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'routines-board', surface: 'terminal', ...BAND } as never)
  expect(JSON.stringify(await ui.drawn() ?? '')).not.toContain('Routines:')
  await ui.unmount()
})

test('where panes can’t show, the command answers in the chat', async ($, on) => {
  setup(on, LOG, { notPlaced: true })
  const out: any = await $.command.run({ command: 'routines-board', args: '' } as never)
  expect(JSON.stringify(out)).toContain('show my routines')
})
