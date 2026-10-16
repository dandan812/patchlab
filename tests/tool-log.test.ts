import { test } from 'node:test'
import assert from 'node:assert/strict'
import { config } from '../packages/shared/src/config.js'
import { store } from '../packages/shared/src/store.js'
import { redactToolLog, TaskTools, type ToolContext } from '../packages/tools/src/index.js'

test('structured tool logs redact credentials without mutating execution arguments', () => {
  const original = config.apiKey
  try {
    config.apiKey = 'test-provider-credential-not-real'
    const input = {
      edits: [{ content: 'x'.repeat(5000) + config.apiKey }],
      token: 'hidden-value',
      query: 'sk-12345678901234567890'
    }
    const logged = JSON.stringify(redactToolLog(input))
    assert.ok(
      !logged.includes(config.apiKey) &&
        !logged.includes('hidden-value') &&
        !logged.includes(input.query)
    )
    assert.ok(logged.includes('x'.repeat(5000)))
    assert.ok(input.edits[0].content.includes(config.apiKey))
    assert.equal(input.token, 'hidden-value')
    assert.deepEqual(redactToolLog({ ok: true, count: 3, data: null }), {
      ok: true,
      count: 3,
      data: null
    })
  } finally {
    config.apiKey = original
  }
})

test('tool event persistence receives only redacted input and result copies', async () => {
  const originalKey = config.apiKey
  const originalEvent = store.event
  const events: unknown[] = []
  try {
    config.apiKey = 'test-provider-credential-not-real'
    store.event = async (taskId, type, message, data) => {
      events.push(data)
      return { id: 'memory-only', taskId, type, message, data, seq: events.length, time: 'test' }
    }
    const tools = new TaskTools({
      task: { id: 'test-memory-only' },
      signal: new AbortController().signal,
      sandbox: { dir: 'unused' },
      allowlist: new Set(),
      patchAttempts: 0,
      submitted: false,
      evidenceSeen: false
    } as ToolContext)
    const result = await tools.call('search_code', { query: config.apiKey })
    assert.deepEqual(result, { ok: true, files: [], matches: [], truncated: false })
    assert.equal(events.length, 2)
    assert.equal((events[0] as { query: string }).query, '[redacted]')
    assert.ok(!JSON.stringify(events).includes(config.apiKey))
  } finally {
    config.apiKey = originalKey
    store.event = originalEvent
  }
})
