import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { config } from '../packages/shared/src/config.js'
import { store } from '../packages/shared/src/store.js'
import {
  ArtifactIntegrityError,
  readArtifact,
  saveArtifact
} from '../packages/shared/src/artifacts.js'
import type { Artifact } from '../packages/shared/src/types.js'

test('archived evidence verifies hashes and size; legacy artifacts remain readable', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'patchlab-evidence-'))
  const original = { data: config.data, detail: store.detail, addArtifact: store.addArtifact }
  const artifacts: Artifact[] = []
  try {
    config.data = dir
    store.detail = async () => ({ artifacts }) as Awaited<ReturnType<typeof store.detail>>
    store.addArtifact = async (artifact) => {
      artifacts.push(artifact)
      return artifact
    }
    const artifact = await saveArtifact(
      'task-test',
      'patch',
      'candidate.patch',
      'text/x-diff',
      'original'
    )
    assert.equal(artifact.sha256, createHash('sha256').update('original').digest('hex'))
    assert.equal((await readArtifact(artifact)).toString(), 'original')
    assert.equal((await readArtifact({ ...artifact, sha256: undefined })).toString(), 'original')
    const target = path.join(dir, artifact.path)
    await fs.writeFile(target, 'modified')
    await assert.rejects(readArtifact(artifact), ArtifactIntegrityError)
    await fs.writeFile(target, 'short')
    await assert.rejects(readArtifact({ ...artifact, sha256: undefined }), ArtifactIntegrityError)
    const outside = path.join(dir, 'outside.txt')
    await fs.writeFile(outside, 'original')
    await assert.rejects(readArtifact({ ...artifact, path: '../outside.txt' }))
  } finally {
    Object.assign(config, { data: original.data })
    store.detail = original.detail
    store.addArtifact = original.addArtifact
    await fs.rm(dir, { recursive: true, force: true })
  }
})
