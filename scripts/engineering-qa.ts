import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { cases, getReferenceEdits, materializeFixture } from '../fixtures/catalog.js'
import { config } from '../packages/shared/src/config.js'
import { store } from '../packages/shared/src/store.js'
import { readArtifact } from '../packages/shared/src/artifacts.js'
import type { Task, Report } from '../packages/shared/src/types.js'
import { executeTask } from '../apps/worker/src/execute.js'
import { evaluatePatch } from '../packages/evaluator/src/index.js'
import { hash } from '../packages/tools/src/files.js'

// This maintainer check must use a separate data directory and never a live queue.
if (!process.env.PATCHLAB_DATA || config.databaseUrl || config.sandbox !== 'local')
  throw new Error('Use an isolated PATCHLAB_DATA with local sandbox and no DATABASE_URL')
await store.init()
const release = await store.acquireWorker()
async function task(caseId: string) {
  const time = new Date().toISOString()
  return store.createTask({
    id: randomUUID(),
    caseId,
    description: cases.find((c) => c.id === caseId)!.description,
    mode: 'replay',
    strategy: 'C',
    status: 'preparing',
    createdAt: time,
    updatedAt: time,
    cancelRequested: false,
    public: true
  } satisfies Task)
}
async function report(id: string) {
  const detail = (await store.detail(id))!
  const artifact = detail.artifacts.find((a) => a.name === 'acceptance.json')
  assert.ok(artifact)
  return JSON.parse((await readArtifact(artifact)).toString()) as Report
}
try {
  const good = await task('products-pagination')
  await executeTask(good)
  assert.equal((await store.task(good.id))?.status, 'succeeded')
  assert.equal((await report(good.id)).outcome, 'passed')

  const bad = await task('products-toolbar')
  const edits = await getReferenceEdits(bad.caseId)
  edits[0]!.content += '\n.product-toolbar [data-testid="reset-products"] { display: none; }\n'
  await executeTask(bad, undefined, edits)
  const rejected = await report(bad.id)
  assert.equal((await store.task(bad.id))?.status, 'failed')
  assert.equal(rejected.outcome, 'rejected')
  const failures = rejected.assertions.filter((a) => !a.passed)
  assert.ok(failures.length > 0)
  assert.ok(failures.every((a) => a.screenshotId && a.viewport))
  for (const assertion of failures) {
    const artifact = (await store.detail(bad.id))!.artifacts.find(
      (a) => a.id === assertion.screenshotId
    )!
    assert.ok(artifact.sha256)
    assert.ok((await readArtifact(artifact)).length > 1000)
  }
  const broken = await task('products-pagination')
  const original = path.join(config.data, 'workspaces', broken.id, 'original')
  await materializeFixture(broken.caseId, original)
  const brokenReport = await evaluatePatch(
    broken.id,
    broken.caseId,
    original,
    [
      {
        path: 'src/App.vue',
        expectedHash: hash(await fs.readFile(path.join(original, 'src/App.vue'))),
        content: '<script setup>const = invalid syntax</script>'
      }
    ],
    AbortSignal.timeout(60_000)
  )
  assert.equal(brokenReport.outcome, 'incomplete')
  assert.equal(brokenReport.phase, 'startup')
  assert.equal(brokenReport.assertions.length, 0)
  await store.patchTask(broken.id, { status: 'failed', error: brokenReport.error })
  const result = {
    passed: good.id,
    rejected: bad.id,
    incomplete: broken.id,
    failureScreenshots: failures.length
  }
  await fs.writeFile(path.join(config.data, 'engineering-qa.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} finally {
  await release()
  await store.close()
}
