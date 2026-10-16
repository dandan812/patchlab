import fs from 'node:fs/promises'
import path from 'node:path'
import { store } from '../../../packages/shared/src/store.js'
import { config } from '../../../packages/shared/src/config.js'
import { command } from '../../../packages/sandbox/src/process.js'
import { executeTask } from './execute.js'
import { cleanRecordedProcesses } from '../../../packages/sandbox/src/recovery.js'

const shutdown = new AbortController()
process.once('SIGINT', () => shutdown.abort(new Error('Worker shutting down')))
process.once('SIGTERM', () => shutdown.abort(new Error('Worker shutting down')))
const release = await store.acquireWorker()
try {
  for (const task of await store.interrupt()) {
    await store.event(
      task.id,
      'run.interrupted',
      'Previous worker ended unexpectedly; source workspace discarded.'
    )
    const workspace = path.resolve(config.data, 'workspaces', task.id)
    await cleanRecordedProcesses(workspace)
    if (workspace.startsWith(path.resolve(config.data, 'workspaces') + path.sep))
      await fs.rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
  if (config.sandbox === 'docker') {
    const filters = [
      '--filter',
      'label=patchlab=managed',
      '--filter',
      `label=patchlab.instance=${config.instanceId}`
    ]
    const residual = await command('docker', ['ps', '-aq', ...filters], config.root)
    if (!residual.passed) throw new Error('Docker is not available to the worker')
    for (const id of residual.output
      .trim()
      .split(/\s+/)
      .filter((id) => /^[a-f0-9]{12,64}$/.test(id)))
      await command('docker', ['rm', '-f', id], config.root)
    const networks = await command('docker', ['network', 'ls', '-q', ...filters], config.root)
    for (const id of networks.output
      .trim()
      .split(/\s+/)
      .filter((id) => /^[a-f0-9]{12,64}$/.test(id)))
      await command('docker', ['network', 'rm', id], config.root)
  }
  console.log(`PatchLab serial worker ready (${store.kind}, ${config.sandbox})`)
  while (!shutdown.signal.aborted) {
    const task = await store.claim()
    if (task) await executeTask(task, shutdown.signal)
    else await new Promise((r) => setTimeout(r, 500))
  }
} finally {
  await release()
  await store.close()
}
