import { expect, mock, test } from 'claude-code/testing'

const HEAD = 'company,role,status,next_action_date,next_action,deadline,priority,fit,location,date_found,date_applied,contact,salary_range,source,link,apply_link,job_id,followups,folder,notes'
const BEFORE = HEAD + '\n'
  + 'Globex,Data Analyst,offer,2026-10-22,Respond to offer,2026-10-25,A,5,Denver CO,2026-08-20,2026-08-25,,,,,,,0,globex-da,\n'
  + 'Initech,Analyst,rejected,,,,B,4,Remote,2026-08-20,2026-08-26,,,,,,,1,initech-a,Interview 2026-09-10\n'
  + 'Acme Corp,Analyst,applied,2026-10-30,Follow up,,B,4,Austin TX,2026-09-01,2026-09-02,,,,,,,0,acme-a,\n'
const AFTER = BEFORE.replace('Globex,Data Analyst,offer,2026-10-22,Respond to offer,2026-10-25', 'Globex,Data Analyst,accepted,,,2026-10-25')
const TURN = { answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'end_turn', text: '' }
const PANE = { component: 'Pane', requestId: 'celebration', props: { title: 'Congratulations', isFocused: true, bodyColumns: 90 } } as const

function setup(on: any, files: Record<string, string>, store: Record<string, unknown> = {}, opts: { opens?: any[]; fills?: string[]; placed?: boolean } = {}) {
  mock.clock(on, { now: new Date(2026, 9, 22, 9, 0).getTime() } as never)
  mock.store(on, store as never)
  const rel = (p: string) => p.replace(/^.*\/celebration\//, '')
  const writes: string[] = []
  on('session.root', () => ({ value: '/project' }) as never)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }) as never)
  on('fs.exists', (_$: any, e: any) => ({ value: rel(e.path) in files }) as never)
  on('fs.read', (_$: any, e: any) => ({ value: files[rel(e.path)] ?? '' }) as never)
  on('fs.write', (_$: any, e: any) => { writes.push(e.path); return { value: undefined } as never })
  on('ui.open', (_$: any, e: any) => { opts.opens?.push(e); return { value: opts.placed === false ? { isPlaced: false, reason: 'not wide enough' } : { isPlaced: true } } as never })
  on('ui.close', () => ({ value: undefined }) as never)
  on('prompt.fill', (_$: any, e: any) => { opts.fills?.push(e.text); return { isFilled: true } as never })
  on('command.register', () => ({ value: undefined }) as never)
  return { writes }
}

test('a job newly accepted opens the congratulations once, without taking the keyboard', async ($, on) => {
  const files: Record<string, string> = { 'jobs/tracker.csv': BEFORE, 'profile/preferences.md': 'name: Alex Rivera\n' }
  const opens: any[] = []
  const { writes } = setup(on, files, {}, { opens })
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true } as never)
  expect(opens).toEqual([])   // the first look at a folder only notes what's there
  files['jobs/tracker.csv'] = AFTER
  await ($ as any).turn.complete(TURN).catch(() => undefined)
  expect(opens.length).toBe(1)
  expect(opens[0].focus).toBeUndefined()
  const ui = await $.ui.mount({ plugin: 'celebration', surface: 'desktop', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('You got the job, Alex! Congratulations.')
  expect(drawn).toContain('Data Analyst at Globex')
  expect(drawn).toContain('Your search in numbers: 3 applications, 2 interviews, 1 offer, over about 8 weeks.')
  await ui.unmount()
  await ($ as any).turn.complete(TURN).catch(() => undefined)
  expect(opens.length).toBe(1)   // once per job
  expect(writes).toEqual([])
})

test('in a window too narrow for the pane, a pop-up points to /celebrate and the moment waits until it is seen', async ($, on) => {
  const files: Record<string, string> = { 'jobs/tracker.csv': BEFORE }
  const toasts: string[] = []
  setup(on, files, {}, { placed: false })
  on('ui.toast', (_$: any, e: any) => { toasts.push(String(e.text)); return { value: undefined } as never })
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true } as never)
  files['jobs/tracker.csv'] = AFTER
  await ($ as any).turn.complete(TURN).catch(() => undefined)
  await ($ as any).turn.complete(TURN).catch(() => undefined)
  expect(toasts).toEqual(['Congratulations on the job at Globex! Type /celebrate when you have a moment.'])
  const ui = await $.ui.mount({ plugin: 'celebration', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('You got the job')
  await ui.unmount()
})

test('a new acceptance listed above an older accepted job is the one celebrated', async ($, on) => {
  const older = HEAD + '\n' + 'Initech,Analyst,offer,2026-10-22,Respond to offer,,B,4,Remote,2026-08-20,2026-08-26,,,,,,,0,initech-a,\n'
    + 'Globex,Data Analyst,accepted,,,,A,5,Denver CO,2026-08-20,2026-08-25,,,,,,,0,globex-da,\n'
  const files: Record<string, string> = { 'jobs/tracker.csv': older }
  const fills: string[] = []
  setup(on, files, {}, { fills })
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true } as never)
  files['jobs/tracker.csv'] = older.replace('Initech,Analyst,offer,2026-10-22,Respond to offer', 'Initech,Analyst,accepted,,')
  await ($ as any).turn.complete(TURN).catch(() => undefined)
  const ui = await $.ui.mount({ plugin: 'celebration', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('Analyst at Initech')
  await ui.press({ key: 'wrap-up' })
  expect(fills[0]).toContain('at Initech')
  await ui.unmount()
  await $.command.run({ command: 'celebrate', args: '' } as never)
  const again = await $.ui.mount({ plugin: 'celebration', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await again.drawn())).toContain('Analyst at Initech')
  await again.unmount()
})

test('an offer accepted before the folder was first seen never pops up', async ($, on) => {
  const opens: any[] = []
  setup(on, { 'jobs/tracker.csv': AFTER }, {}, { opens })
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true } as never)
  await ($ as any).turn.complete(TURN).catch(() => undefined)
  expect(opens).toEqual([])
})

test('never in the sample workspace', async ($, on) => {
  const files: Record<string, string> = { 'jobs/tracker.csv': BEFORE, '.sample-workspace': '' }
  const opens: any[] = []
  setup(on, files, { 'celebrated:/project': { keys: [] } }, { opens })
  files['jobs/tracker.csv'] = AFTER
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true } as never)
  await ($ as any).turn.complete(TURN).catch(() => undefined)
  expect(opens).toEqual([])
})

test('the buttons write messages for Claude: wrap up, and share what worked', async ($, on) => {
  const fills: string[] = []
  setup(on, { 'jobs/tracker.csv': AFTER }, {}, { fills })
  await $.command.run({ command: 'celebrate', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'celebration', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('Keys: Ctrl+X then Tab')
  await ui.press({ key: 'wrap-up' })
  await ui.press({ key: 'share' })
  expect(fills).toEqual(['I accepted the job (Data Analyst) at Globex. Help me close out my search.', '/share-lessons'])
  expect(JSON.stringify(await ui.drawn())).toContain('press Enter to start')
  await ui.unmount()
})

test('/celebrate with nothing accepted yet says so kindly', async ($, on) => {
  setup(on, { 'jobs/tracker.csv': BEFORE })
  await $.command.run({ command: 'celebrate', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'celebration', surface: 'terminal', ...PANE } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('Nothing to celebrate yet')
  await ui.unmount()
})

test('fresh download: nothing exists, nothing breaks, nothing is written', async ($, on) => {
  mock.clock(on, { now: new Date(2026, 9, 6, 9, 0).getTime() } as never)
  mock.store(on, {} as never)
  const writes: string[] = []
  on('session.root', () => ({ value: '/project' }) as never)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }) as never)
  on('fs.exists', () => ({ value: false }) as never)
  on('fs.read', (_$: any, e: any) => { throw new Error(`ENOENT: no such file or directory, open '${e.path}'`) })
  on('fs.write', (_$: any, e: any) => { writes.push(e.path); return { value: undefined } as never })
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true } as never)
  await $.command.run({ command: 'celebrate', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'celebration', surface: 'desktop', ...PANE } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Nothing to celebrate yet')
  expect(/undefined|NaN|ENOENT/.test(drawn)).toBe(false)
  expect(writes).toEqual([])
  await ui.unmount()
})
