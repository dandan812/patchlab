import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { config } from '../packages/shared/src/config.js'
import { store } from '../packages/shared/src/store.js'
import { evaluatePatch } from '../packages/evaluator/src/index.js'
import { readArtifact } from '../packages/shared/src/artifacts.js'
import type { Artifact } from '../packages/shared/src/types.js'

test('acceptance preparation and cancellation failures persist incomplete reports, never rejection', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'patchlab-acceptance-'))
  const original = {
    data: config.data,
    detail: store.detail,
    addArtifact: store.addArtifact,
    event: store.event
  }
  const artifacts: Artifact[] = []
  try {
    config.data = dir
    store.detail = async () => ({ artifacts }) as Awaited<ReturnType<typeof store.detail>>
    store.addArtifact = async (artifact) => {
      artifacts.push(artifact)
      return artifact
    }
    store.event = async () => ({}) as Awaited<ReturnType<typeof store.event>>
    const failed = await evaluatePatch(
      'missing',
      'products-pagination',
      path.join(dir, 'missing-source'),
      [],
      new AbortController().signal
    )
    assert.equal(failed.outcome, 'incomplete')
    assert.equal(failed.phase, 'preparation')
    assert.equal(failed.passed, false)
    assert.equal(failed.cleanEnvironment, false)
    assert.equal(failed.assertions.length, 0)
    const controller = new AbortController()
    controller.abort(new Error('Worker shutting down'))
    const cancelled = await evaluatePatch(
      'cancelled',
      'products-pagination',
      dir,
      [],
      controller.signal
    )
    assert.equal(cancelled.outcome, 'incomplete')
    assert.match(cancelled.error!, /Worker shutting down/)
    assert.equal(artifacts.filter((a) => a.name === 'acceptance.json').length, 2)
    assert.equal(JSON.parse((await readArtifact(artifacts[1]!)).toString()).outcome, 'incomplete')
  } finally {
    config.data = original.data
    store.detail = original.detail
    store.addArtifact = original.addArtifact
    store.event = original.event
    await fs.rm(dir, { recursive: true, force: true })
  }
})
