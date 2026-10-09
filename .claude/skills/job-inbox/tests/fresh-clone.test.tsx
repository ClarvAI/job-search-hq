import { expect, mock, test } from 'claude-code/testing'

// A fresh download before the first run: none of the user's files or folders exist yet
// (profile/, jobs/, contacts/, outbox/, history/ are created by the first-run script).
// Reads and listings fail the way the real file system does; nothing may be written.
function freshClone(on: any) {
  const writes: string[] = []
  mock.clock(on, { now: new Date(2026, 9, 6, 9, 0).getTime() } as never)
  on('fs.exists', () => ({ value: false }) as never)
  on('fs.read', (_$: any, e: any) => { throw new Error(`ENOENT: no such file or directory, open '${e.path}'`) })
  on('fs.list', (_$: any, e: any) => { throw new Error(`ENOENT: no such file or directory, scandir '${e.path}'`) })
  on('fs.write', (_$: any, e: any) => { writes.push(e.path); return { value: undefined } as never })
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('session.append', () => ({ deny: 'recorded by the test' }) as never)  // newer test kits require next() for a value answer; a deny is ignored by the panels
  on('command.register', () => ({ value: undefined }) as never)
  return { writes }
}
const clean = (s: string) => !/undefined|NaN|\[object Object\]|ENOENT/.test(s)

for (const surface of ['terminal', 'desktop'] as const) {
  test(`fresh download, nothing set up yet: the Job Inbox pane opens and draws on ${surface}`, async ($, on) => {
    const { writes } = freshClone(on)
    await $.command.run({ command: 'job-inbox', args: '' } as never)
    const ui = await $.ui.mount({ plugin: 'job-inbox', surface, component: 'Pane', requestId: 'job-inbox',
      props: { title: 'Job Inbox', isFocused: true, bodyColumns: 90 } } as never)
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn.length).toBeGreaterThan(20)
    expect(clean(drawn)).toBe(true)
    expect(writes).toEqual([])
    await ui.unmount()
  })
}

test('fresh download: the Job Inbox band above the prompt draws nothing broken', async ($, on) => {
  const { writes } = freshClone(on)
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  await $.command.run({ command: 'job-inbox', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'job-inbox', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 90 } } as never)
  const drawn = JSON.stringify(await ui.drawn() ?? '')
  expect(clean(drawn)).toBe(true)
  expect(drawn).not.toContain('Job search:')
  expect(writes).toEqual([])
  await ui.unmount()
})
