import { expect, test } from 'claude-code/testing'

test('Claude cannot send, reply or forward mail itself', async $ => {
  for (const tool of ['mcp__claude_ai_Gmail__send_message', 'mcp__claude_ai_Gmail__reply', 'mcp__claude_ai_Superhuman_Mail__send_draft']) {
    const ran = await $.tool.call({ tool, to: ['someone@example.com'] } as never)
    expect(ran.deny ?? ran.text ?? '').toContain('The user sends and manages their mail themselves')
  }
})

test('drafting tools are not blocked', async ($, on) => {
  on('tool.call', () => ({ result: { id: 'd1' } }) as never)
  const ran = await $.tool.call({ tool: 'mcp__claude_ai_Gmail__create_draft', to: ['a@b.co'] } as never)
  expect(ran.deny).toBeUndefined()
})

test('connector names with an app prefix are judged like the shared guard does', async ($, on) => {
  on('tool.call', () => ({ result: { ok: true } }) as never)
  for (const tool of ['mcp__connector__gmail_create_draft', 'mcp__connector__gmail_search_emails', 'mcp__claude_ai_Superhuman_Mail__create_or_update_draft', 'mcp__connector__gmail_batch_get_messages']) {
    const ran = await $.tool.call({ tool } as never)
    expect(ran.deny).toBeUndefined()
  }
  for (const tool of ['mcp__connector__gmail_send_message', 'mcp__connector__gmail_reply_to_thread', 'mcp__connector__gmail_trash_message']) {
    const ran = await $.tool.call({ tool } as never)
    expect(ran.deny ?? '').toContain('The user sends and manages their mail themselves')
  }
})

test('the empty Outbox pane draws on terminal and desktop', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'outbox', surface, component: 'Pane', requestId: 'outbox',
      props: { title: 'Outbox', isFocused: true, bodyColumns: 80 } as never,
    })
    expect(await ui.find({ type: 'Text', text: /No drafts waiting/ })).toBeDefined()
    await ui.unmount()
  }
})
