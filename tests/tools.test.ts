import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { z } from 'zod'
import { store } from '../packages/shared/src/store.js'
import { TaskTools, type ToolContext } from '../packages/tools/src/index.js'
import { validateCatalog } from '../fixtures/catalog.js'

test('advertised tools reject the same out-of-budget arguments as direct execution', async () => {
  const originalEvent = store.event
  store.event = async (taskId, type, message, data) => ({
    id: 'test-only',
    taskId,
    type,
    message,
    data,
    seq: 1,
    time: ''
  })
  try {
    const tools = new TaskTools({
      task: { id: 'test-only', strategy: 'C', mode: 'replay' },
      signal: new AbortController().signal,
      sandbox: {},
      allowlist: new Set(),
      patchAttempts: 0,
      submitted: false,
      evidenceSeen: false
    } as ToolContext)
    const advertised = tools.aiTools()
    for (const [name, input] of [
      ['read_file', { path: 'src/App.vue', startLine: 10001 }],
      ['apply_patch', { edits: [{ path: 'src/App.vue', content: '', expectedHash: 'short' }] }],
      ['browser_observe', { selector: 'x'.repeat(301) }],
      ['browser_act', { action: 'viewport', width: 319 }]
    ] as const) {
      const schema = advertised[name]!.inputSchema as z.ZodType
      assert.equal(schema.safeParse(input).success, false, name)
      assert.equal(((await tools.call(name, input)) as { ok: boolean }).ok, false, name)
    }
  } finally {
    store.event = originalEvent
  }
})

test('all twenty frozen fixture mutations still match their reviewed source', validateCatalog)
