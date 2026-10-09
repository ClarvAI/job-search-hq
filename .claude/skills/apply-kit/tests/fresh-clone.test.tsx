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
  test(`fresh download, nothing set up yet: the Apply Kit pane opens and draws on ${surface}`, async ($, on) => {
    const { writes } = freshClone(on)
    await $.command.run({ command: 'apply-kit', args: '' } as never)
    const ui = await $.ui.mount({ plugin: 'apply-kit', surface, component: 'Pane', requestId: 'apply-kit',
      props: { title: 'Apply Kit', isFocused: true, bodyColumns: 90 } } as never)
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn.length).toBeGreaterThan(20)
    expect(clean(drawn)).toBe(true)
    expect(writes).toEqual([])
    await ui.unmount()
  })
}
