import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { config } from './config.js'
import { store } from './store.js'
import { budgets, type Artifact, type ArtifactKind } from './types.js'

export const artifactDir = (taskId: string) => path.join(config.data, 'artifacts', taskId)
export async function saveArtifact(
  taskId: string,
  kind: ArtifactKind,
  name: string,
  mime: string,
  content: string | Buffer
) {
  const detail = await store.detail(taskId)
  const size = Buffer.byteLength(content)
  if (
    (detail?.artifacts.reduce((sum, a) => sum + a.size, 0) || 0) + size >
    budgets.maxArtifactsBytes
  )
    throw new Error('Artifact byte budget exceeded')
  const dir = artifactDir(taskId)
  await fs.mkdir(dir, { recursive: true })
  const id = randomUUID()
  const filename = `${id}-${path.basename(name)}`
  await fs.writeFile(path.join(dir, filename), content)
  return store.addArtifact({
    id,
    taskId,
    kind,
    name,
    mime,
    path: path.join('artifacts', taskId, filename),
    size,
    sha256: createHash('sha256').update(content).digest('hex'),
    createdAt: new Date().toISOString()
  })
}
export async function resolveArtifact(relative: string) {
  const base = await fs.realpath(path.join(config.data, 'artifacts'))
  const resolved = await fs.realpath(path.join(config.data, relative))
  if (!resolved.startsWith(base + path.sep)) throw new Error('Invalid artifact path')
  return resolved
}

export class ArtifactIntegrityError extends Error {
  constructor() {
    super('Artifact integrity check failed')
  }
}

export async function readArtifact(artifact: Artifact): Promise<Buffer> {
  const file = await fs.open(await resolveArtifact(artifact.path), 'r')
  try {
    const info = await file.stat()
    if (!info.isFile() || info.size !== artifact.size || info.size > budgets.maxArtifactsBytes)
      throw new ArtifactIntegrityError()
    const content = await file.readFile()
    if (
      content.length !== artifact.size ||
      (artifact.sha256 && createHash('sha256').update(content).digest('hex') !== artifact.sha256)
    )
      throw new ArtifactIntegrityError()
    return content
  } finally {
    await file.close()
  }
}
