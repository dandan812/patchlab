import fs from 'node:fs/promises'
import path from 'node:path'
import { command } from './process.js'
import { config } from '../../shared/src/config.js'

export async function cleanRecordedProcesses(workspace: string) {
  const base = path.resolve(config.data, 'workspaces')
  if (!path.resolve(workspace).startsWith(base + path.sep))
    throw new Error('Recovery workspace boundary violated')
  for (const name of ['candidate', 'acceptance']) {
    const dir = path.join(workspace, name)
    const record = await fs
      .readFile(path.join(dir, '.runtime.json'), 'utf8')
      .then((text) => JSON.parse(text) as { pid: number; configFile: string })
      .catch(() => null)
    if (
      !record ||
      !Number.isInteger(record.pid) ||
      record.pid <= 0 ||
      path.resolve(record.configFile) !== path.resolve(dir, 'vite.config.ts')
    )
      continue
    let cmdline = ''
    if (process.platform === 'win32') {
      const result = await command(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${record.pid}').CommandLine`
        ],
        config.root
      )
      cmdline = result.output
    } else cmdline = await fs.readFile(`/proc/${record.pid}/cmdline`, 'utf8').catch(() => '')
    // A recycled PID is not enough to justify killing a process.
    if (!cmdline.toLowerCase().includes(record.configFile.toLowerCase())) continue
    if (process.platform === 'win32')
      await command('taskkill', ['/PID', String(record.pid), '/T', '/F'], config.root)
    else {
      try {
        process.kill(-record.pid, 'SIGKILL')
      } catch {}
    }
  }
}
