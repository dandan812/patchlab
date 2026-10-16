import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { tool } from 'ai'
import { z } from 'zod'
import { config } from '../packages/shared/src/config.js'
import { store } from '../packages/shared/src/store.js'
import { runAgent } from '../packages/agent/src/index.js'
import type { TaskTools } from '../packages/tools/src/index.js'
import type { Run } from '../packages/shared/src/types.js'

test('real AI SDK executes tools, preserves unknown usage and stops at sealed submission (fake HTTP provider, NOT model evaluation)', async () => {
  let requests = 0
  const server = http.createServer(async (req, res) => {
    for await (const _chunk of req) {
      /* Drain the SDK request. */
    }
    requests++
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        id: `test-${requests}`,
        object: 'chat.completion',
        created: 1,
        model: 'test-only',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: `call-${requests}`,
                  type: 'function',
                  function: {
                    name: requests === 1 ? 'browser_observe' : 'submit_patch',
                    arguments: '{}'
                  }
                }
              ]
            },
            finish_reason: 'tool_calls'
          }
        ],
        ...(requests === 1
          ? { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }
          : {})
      })
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const old = {
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
    sandbox: config.sandbox,
    modelApiType: config.modelApiType,
    patchRun: store.patchRun,
    event: store.event
  }
  const run: Run = {
    id: 'sdk-test',
    taskId: 'sdk-test',
    model: 'test-only',
    strategy: 'C',
    sandbox: 'stub',
    startedAt: new Date().toISOString(),
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    calls: 0,
    patchAttempts: 1,
    environment: {}
  }
  const context = {
    task: { id: 'sdk-test', strategy: 'C', description: 'A unit-test-only model transport' },
    allowlist: new Set(['src/App.vue']),
    submitted: false,
    patchAttempts: 1,
    signal: new AbortController().signal
  }
  const calls: string[] = []
  const tools = {
    context,
    aiTools: () => ({
      browser_observe: tool({
        inputSchema: z.object({}),
        execute: async () => {
          calls.push('observe')
          return { snapshot: 'button Save' }
        }
      }),
      submit_patch: tool({
        inputSchema: z.object({}),
        execute: async () => {
          calls.push('submit')
          context.submitted = true
          return { ok: true }
        }
      })
    })
  } as unknown as TaskTools
  try {
    config.apiKey = 'test-only-not-a-secret'
    config.model = 'test-only'
    config.sandbox = 'docker'
    config.modelApiType = 'chat-completions'
    config.baseUrl = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/v1`
    store.patchRun = async (_id, update) => Object.assign(run, update)
    store.event = async () => ({
      id: 'test',
      taskId: 'test',
      seq: 1,
      time: '',
      type: '',
      message: ''
    })
    await runAgent(tools, run)
    assert.deepEqual(calls, ['observe', 'submit'])
    assert.equal(requests, 2)
    assert.equal(run.calls, 2)
    assert.equal(run.inputTokens, null)
    assert.equal(run.costUsd, null)
  } finally {
    Object.assign(config, {
      apiKey: old.apiKey,
      model: old.model,
      baseUrl: old.baseUrl,
      sandbox: old.sandbox,
      modelApiType: old.modelApiType
    })
    store.patchRun = old.patchRun
    store.event = old.event
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('Responses API forwards tool results, disables provider storage and seals submission (fake HTTP provider, NOT model evaluation)', async () => {
  const requests: Array<{ path: string; body: Record<string, unknown> }> = []
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    requests.push({ path: req.url || '', body: JSON.parse(Buffer.concat(chunks).toString('utf8')) })
    const number = requests.length
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        id: `resp-test-${number}`,
        object: 'response',
        created_at: 1,
        model: 'test-only',
        status: 'completed',
        error: null,
        incomplete_details: null,
        output: [
          {
            type: 'function_call',
            id: `fc-${number}`,
            call_id: `call-${number}`,
            name: number === 1 ? 'browser_observe' : 'submit_patch',
            arguments: '{}',
            status: 'completed'
          }
        ],
        ...(number === 1 ? { usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } } : {})
      })
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const old = {
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
    sandbox: config.sandbox,
    modelApiType: config.modelApiType,
    patchRun: store.patchRun,
    event: store.event
  }
  const run: Run = {
    id: 'responses-test',
    taskId: 'responses-test',
    model: 'test-only',
    strategy: 'C',
    sandbox: 'stub',
    startedAt: new Date().toISOString(),
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    calls: 0,
    patchAttempts: 1,
    environment: {}
  }
  const context = {
    task: {
      id: 'responses-test',
      strategy: 'C',
      description: 'A unit-test-only Responses transport'
    },
    allowlist: new Set(['src/App.vue']),
    submitted: false,
    patchAttempts: 1,
    signal: new AbortController().signal
  }
  const calls: string[] = []
  const tools = {
    context,
    aiTools: () => ({
      browser_observe: tool({
        inputSchema: z.object({}),
        execute: async () => {
          calls.push('observe')
          return { snapshot: 'button Save' }
        }
      }),
      submit_patch: tool({
        inputSchema: z.object({}),
        execute: async () => {
          calls.push('submit')
          context.submitted = true
          return { ok: true }
        }
      })
    })
  } as unknown as TaskTools
  try {
    config.apiKey = 'test-only-not-a-secret'
    config.model = 'test-only'
    config.sandbox = 'docker'
    config.modelApiType = 'responses'
    config.baseUrl = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/v1`
    store.patchRun = async (_id, update) => Object.assign(run, update)
    store.event = async () => ({
      id: 'test',
      taskId: 'test',
      seq: 1,
      time: '',
      type: '',
      message: ''
    })
    await runAgent(tools, run)
    assert.deepEqual(calls, ['observe', 'submit'])
    assert.equal(requests.length, 2)
    for (const request of requests) {
      assert.equal(request.path, '/v1/responses')
      assert.equal(request.body.store, false)
      assert.equal(request.body.parallel_tool_calls, false)
      assert.equal(request.body.model, 'test-only')
    }
    const history = requests[1]!.body.input as Array<Record<string, unknown>>
    const feedback = history.find(
      (item) => item.type === 'function_call_output' && item.call_id === 'call-1'
    )
    assert.ok(feedback, 'The next model step must receive the real tool result')
    assert.match(String(feedback.output), /button Save/)
    assert.equal(run.calls, 2)
    assert.equal(run.inputTokens, null)
    assert.equal(run.costUsd, null)
  } finally {
    Object.assign(config, {
      apiKey: old.apiKey,
      model: old.model,
      baseUrl: old.baseUrl,
      sandbox: old.sandbox,
      modelApiType: old.modelApiType
    })
    store.patchRun = old.patchRun
    store.event = old.event
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
