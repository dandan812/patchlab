import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { materializeFixture } from '../fixtures/catalog.js'
import { createSandbox, dockerIsolationArgs } from '../packages/sandbox/src/index.js'
import { config } from '../packages/shared/src/config.js'

test('Docker scope and optional resource slice are validated operator settings', () => {
  assert.deepEqual(dockerIsolationArgs('us-production', 'patchlab.slice'), [
    '--label',
    'patchlab.instance=us-production',
    '--cgroup-parent',
    'patchlab.slice'
  ])
  assert.deepEqual(dockerIsolationArgs('default', ''), ['--label', 'patchlab.instance=default'])
  assert.throws(() => dockerIsolationArgs('other\n--privileged', ''), /instance ID/)
  assert.throws(() => dockerIsolationArgs('default', '../system.slice'), /cgroup parent/)
})

test('browser cancellation drains tracing, is idempotent and releases the app listener', async () => {
  if (config.sandbox !== 'local') return
  const base = path.join(config.data, 'sandbox-tests')
  await fs.mkdir(base, { recursive: true })
  for (const delay of [0, 20, 100]) {
    const dir = await fs.mkdtemp(path.join(base, 'cancel-'))
    const controller = new AbortController()
    let sandbox
    try {
      await materializeFixture('products-pagination', dir)
      sandbox = await createSandbox(dir, controller.signal)
      const navigating = sandbox.page
        .goto(`${sandbox.url}/?cancel=${delay}`, { waitUntil: 'networkidle' })
        .catch(() => {})
      const timer = setTimeout(() => controller.abort(new Error('controlled cancellation')), delay)
      await navigating
      clearTimeout(timer)
      controller.abort(new Error('controlled cancellation'))
      await Promise.all([sandbox.dispose(), sandbox.dispose()])
      assert.equal(sandbox.browser.isConnected(), false)
      await assert.rejects(fetch(sandbox.url, { signal: AbortSignal.timeout(1000) }))
    } finally {
      await sandbox?.dispose()
      if (path.resolve(dir).startsWith(path.resolve(base) + path.sep))
        await fs.rm(dir, { recursive: true, force: true, maxRetries: 3 })
    }
  }
})
