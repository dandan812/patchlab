import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { Store } from '../packages/shared/src/store.js'
import type { Task } from '../packages/shared/src/types.js'

const task = (): Task => {
  const time = new Date().toISOString()
  return {
    id: randomUUID(),
    caseId: 'products-pagination',
    description: 'reproduce the bug',
    mode: 'replay',
    strategy: 'C',
    status: 'queued',
    createdAt: time,
    updatedAt: time,
    cancelRequested: false,
    public: true
  }
}
test('two store clients serialize event sequence and task claims durably', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'patchlab-store-'))
  const a = new Store(dir, '')
  const b = new Store(dir, '')
  try {
    const t = await a.createTask(task())
    await Promise.all(
      Array.from({ length: 20 }, (_, n) => (n % 2 ? a : b).event(t.id, 'test', String(n)))
    )
    assert.deepEqual(
      (await a.events(t.id)).map((e) => e.seq),
      Array.from({ length: 20 }, (_, n) => n + 1)
    )
    const claims = await Promise.all([a.claim(), b.claim()])
    assert.equal(claims.filter(Boolean).length, 1)
    const c = new Store(dir, '')
    assert.equal((await c.task(t.id))?.status, 'preparing')
    const interrupted = await c.interrupt()
    assert.equal(interrupted.length, 1)
    assert.equal((await a.task(t.id))?.status, 'interrupted')
  } finally {
    await a.close()
    await b.close()
    await fs.rm(dir, { recursive: true, force: true })
  }
})
test('queued cancellation prevents worker claim and leader is exclusive', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'patchlab-leader-'))
  const a = new Store(dir, '')
  const b = new Store(dir, '')
  try {
    const t = await a.createTask(task())
    await a.patchTask(t.id, { cancelRequested: true, status: 'cancelled' })
    assert.equal(await b.claim(), undefined)
    const release = await a.acquireWorker()
    await assert.rejects(b.acquireWorker(), /Only one/)
    await release()
    const releaseB = await b.acquireWorker()
    await releaseB()
  } finally {
    await a.close()
    await b.close()
    await fs.rm(dir, { recursive: true, force: true })
  }
})
