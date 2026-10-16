import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from '../packages/shared/src/config.js'
import { command } from '../packages/sandbox/src/process.js'
import type { TaskDetail } from '../packages/shared/src/types.js'

// Explicit maintainer test: only the local development supervisor's worker may
// be killed. Never use this script against a deployed or shared instance.
const supervisor = Number(process.env.PATCHLAB_QA_SUPERVISOR_PID)
assert.ok(
  process.platform === 'win32' && Number.isInteger(supervisor) && supervisor > 0,
  'Set PATCHLAB_QA_SUPERVISOR_PID to the local Windows dev supervisor PID'
)
const api = `http://127.0.0.1:${config.port}`
const password = await fs.readFile(path.join(config.data, 'local-password.txt'), 'utf8')
const login = await fetch(`${api}/api/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Patchlab-Request': '1' },
  body: JSON.stringify({ password })
})
assert.equal(login.status, 200)
const cookie = login.headers.get('set-cookie')!.split(';')[0]
const headers = { Cookie: cookie, 'Content-Type': 'application/json', 'X-Patchlab-Request': '1' }
const created = await fetch(`${api}/api/tasks`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    caseId: 'products-pagination',
    mode: 'replay',
    strategy: 'C',
    description: '[Maintainer crash recovery test, NOT AI] Restart from a clean snapshot.',
    public: false
  })
})
assert.equal(created.status, 201)
const { id } = (await created.json()) as { id: string }
const workspace = path.resolve(config.data, 'workspaces', id)
let fixturePid = 0
const deadline = Date.now() + 90_000
while (Date.now() < deadline) {
  const record = await fs
    .readFile(path.join(workspace, 'candidate', '.runtime.json'), 'utf8')
    .then((text) => JSON.parse(text) as { pid: number })
    .catch(() => null)
  if (record) {
    fixturePid = record.pid
    break
  }
  await new Promise((r) => setTimeout(r, 50))
}
assert.ok(fixturePid > 0, 'A real live candidate process must be recorded before crashing worker')
const lookup = await command(
  'powershell.exe',
  [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${supervisor}' | Where-Object { $_.CommandLine -match 'apps/worker/src/index\\.ts' } | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`
  ],
  config.root
)
assert.ok(lookup.passed)
const worker = JSON.parse(lookup.output.trim()) as { ProcessId: number; CommandLine: string }
assert.ok(
  Number.isInteger(worker.ProcessId) &&
    worker.CommandLine.includes('--import tsx apps/worker/src/index.ts')
)
const stopped = await command('taskkill', ['/PID', String(worker.ProcessId), '/F'], config.root)
assert.ok(stopped.passed, 'Only the worker, not its fixture child tree, is deliberately killed')
let interrupted: TaskDetail | undefined
while (Date.now() < deadline) {
  assert.equal((await fetch(`${api}/api/health`)).status, 200, 'API survives worker crash')
  assert.equal((await fetch('http://127.0.0.1:5173')).status, 200, 'UI survives worker crash')
  const detail = (await (await fetch(`${api}/api/tasks/${id}`, { headers })).json()) as TaskDetail
  const gone = await fs
    .stat(workspace)
    .then(() => false)
    .catch(() => true)
  if (detail.task.status === 'interrupted' && gone) {
    interrupted = detail
    break
  }
  await new Promise((r) => setTimeout(r, 200))
}
assert.ok(interrupted, 'Restarted worker marks interruption and removes recorded workspace')
const remaining = await command(
  'powershell.exe',
  [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${fixturePid}').CommandLine`
  ],
  config.root
)
assert.ok(
  !remaining.output.includes(path.join(workspace, 'candidate', 'vite.config.ts')),
  'Recovery terminates the orphaned fixture, not merely its workspace'
)
const result = {
  date: new Date().toISOString(),
  taskId: id,
  workerPid: worker.ProcessId,
  fixturePid,
  apiSurvived: true,
  uiSurvived: true,
  interrupted: true,
  workspaceCleaned: true,
  orphanTerminated: true
}
await fs.mkdir(path.join(config.data, 'qa'), { recursive: true })
await fs.writeFile(path.join(config.data, 'qa', 'recovery.json'), JSON.stringify(result, null, 2))
console.log(`PASS controlled worker crash recovery: ${id}`)
