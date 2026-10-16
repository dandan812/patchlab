import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { config } from '../packages/shared/src/config.js'
import { killTree } from '../packages/sandbox/src/process.js'

const children = new Set<ChildProcess>()
let stopping = false
let workerRestarts = 0
async function stop(code = 0) {
  if (stopping) return
  stopping = true
  await Promise.all([...children].map(killTree))
  process.exit(code)
}
function start(name: 'api' | 'worker' | 'web', script: string) {
  const args =
    name === 'web' ? [script, '--config', 'apps/web/vite.config.ts'] : ['--import', 'tsx', script]
  const child = spawn(process.execPath, args, {
    cwd: config.root,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
    env: process.env
  })
  child.stdout?.on('data', (data) => process.stdout.write(`[${name}] ${data}`))
  child.stderr?.on('data', (data) => process.stderr.write(`[${name}] ${data}`))
  child.on('error', (error) => {
    console.error(error)
    void stop(1)
  })
  child.on('exit', (code) => {
    children.delete(child)
    if (stopping) return
    console.error(`${name} exited (${code})`)
    if (name === 'worker' && workerRestarts++ < 3) {
      console.error('Restarting worker from a clean snapshot; API and UI remain available.')
      setTimeout(() => {
        if (!stopping) start(name, script)
      }, 1000)
    } else if (name !== 'worker') void stop(code || 1)
    else
      console.error('Worker restart budget exhausted. Restart npm run dev after inspecting logs.')
  })
  children.add(child)
}
for (const [name, script] of [
  ['api', 'apps/api/src/index.ts'],
  ['worker', 'apps/worker/src/index.ts'],
  ['web', 'node_modules/vite/bin/vite.js']
] as const)
  start(name, script)
process.once('SIGINT', () => {
  void stop()
})
process.once('SIGTERM', () => {
  void stop()
})
console.log(`PatchLab development processes started from ${path.basename(config.root)}`)
