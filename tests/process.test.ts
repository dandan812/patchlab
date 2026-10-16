import { test } from 'node:test'
import assert from 'node:assert/strict'
import { command } from '../packages/sandbox/src/process.js'
import { config } from '../packages/shared/src/config.js'

test('fixed-command timeout kills the running process and returns a failed result', async () => {
  const result = await command(
    process.execPath,
    ['-e', 'setInterval(()=>{},1000)'],
    config.root,
    undefined,
    300
  )
  assert.equal(result.timedOut, true)
  assert.equal(result.passed, false)
})
test('abort propagates its real reason instead of a success result', async () => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('test cancellation')), 300)
  try {
    await assert.rejects(
      command(process.execPath, ['-e', 'setInterval(()=>{},1000)'], config.root, controller.signal),
      /test cancellation/
    )
  } finally {
    clearTimeout(timer)
  }
})
