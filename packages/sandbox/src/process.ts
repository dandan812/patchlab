import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { config } from '../../shared/src/config.js'

export async function killTree(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null) return
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const kill = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore'
      })
      kill.once('error', () => {
        child.kill()
        resolve()
      })
      kill.once('exit', () => resolve())
    })
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
}
export function launch(command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv) {
  return spawn(command, args, {
    cwd,
    shell: false,
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: env || {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      HOME: process.env.HOME,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      NODE_ENV: 'development'
    }
  })
}
export async function command(
  command: string,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
  timeoutMs = 45_000
) {
  signal?.throwIfAborted()
  const child = launch(command, args, cwd)
  let output = ''
  const append = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-16_000)
  }
  child.stdout?.on('data', append)
  child.stderr?.on('data', append)
  let timeout = false
  const stop = () => {
    void killTree(child)
  }
  const timer = setTimeout(() => {
    timeout = true
    stop()
  }, timeoutMs)
  signal?.addEventListener('abort', stop, { once: true })
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('close', resolve)
      child.once('error', reject)
    })
    signal?.throwIfAborted()
    return { code, output, timedOut: timeout, passed: code === 0 && !timeout }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', stop)
    await killTree(child)
  }
}
export const bin = (name: 'vite' | 'vue-tsc') =>
  path.join(config.root, 'node_modules', name, name === 'vite' ? 'bin/vite.js' : 'bin/vue-tsc.js')
