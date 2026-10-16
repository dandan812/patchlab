import fs from 'node:fs/promises'
import path from 'node:path'
import net from 'node:net'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { config } from '../../shared/src/config.js'
import { command, launch, killTree, bin } from './process.js'

export interface Diagnostic {
  type: string
  message: string
}
export interface Sandbox {
  dir: string
  url: string
  browser: Browser
  context: BrowserContext
  page: Page
  diagnostics: Diagnostic[]
  check(
    kind: 'build' | 'typecheck'
  ): Promise<{ code: number | null; output: string; passed: boolean; timedOut: boolean }>
  dispose(): Promise<void>
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
export async function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port
      server.close(() => resolve(port))
    })
  })
}
export async function attachDependencies(dir: string) {
  const target = path.join(dir, 'node_modules')
  try {
    await fs.symlink(
      path.join(config.root, 'node_modules'),
      target,
      process.platform === 'win32' ? 'junction' : 'dir'
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
}
export function permittedURL(request: string, allowed: string) {
  try {
    const url = new URL(request)
    return (
      (url.protocol === 'http:' || url.protocol === 'ws:') &&
      url.origin.replace('ws:', 'http:') === new URL(allowed).origin &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}
export function redact(value: string, maxLength = 2000) {
  const safe = config.apiKey ? value.split(config.apiKey).join('[redacted]') : value
  return safe
    .replace(/\bsk-[a-zA-Z0-9_-]{16,}\b/g, '[redacted]')
    .replace(/((?:cookie|authorization)\s*:\s*)[^\r\n]+/gi, '$1[redacted]')
    .replace(/(patchlab_session=)[^\s;]+/gi, '$1[redacted]')
    .replace(/(bearer\s+)[\w.-]+/gi, '$1[redacted]')
    .replace(/(api[_-]?key|password|token|secret)(["'\s:=]+)[^\s"',;&]+/gi, '$1$2[redacted]')
    .slice(0, maxLength)
}
export function dockerIsolationArgs(instanceId: string, cgroupParent: string) {
  if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(instanceId)) throw new Error('Invalid PatchLab instance ID')
  if (cgroupParent && !/^[a-z][a-z0-9-]*\.slice$/.test(cgroupParent))
    throw new Error('Invalid PatchLab cgroup parent')
  return [
    '--label',
    `patchlab.instance=${instanceId}`,
    ...(cgroupParent ? ['--cgroup-parent', cgroupParent] : [])
  ]
}
export async function createSandbox(
  dir: string,
  signal: AbortSignal,
  production = false
): Promise<Sandbox> {
  signal.throwIfAborted()
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  const id = `patchlab-${randomUUID().slice(0, 12)}`
  let child: ReturnType<typeof launch> | undefined
  let bridge: net.Server | undefined
  const connections = new Set<net.Socket>()
  const tunnels = new Set<ChildProcess>()
  let browser: Browser | undefined
  let context: BrowserContext | undefined
  let container = false
  let disposal: Promise<void> | undefined
  const dispose = () =>
    (disposal ??= (async () => {
      signal.removeEventListener('abort', onAbort)
      // Drain tracing before closing the entire transport. Closing a live context
      // separately can race pending network-response channel disposal.
      if (context) {
        for (const page of context.pages()) {
          page.removeAllListeners('response')
          page.removeAllListeners('requestfailed')
        }
        await context.tracing.stop().catch(() => {})
      }
      await browser?.close().catch(() => {})
      if (child) await killTree(child)
      for (const socket of connections) socket.destroy()
      await Promise.all([...tunnels].map(killTree))
      if (bridge) await new Promise<void>((resolve) => bridge!.close(() => resolve()))
      if (container) await command('docker', ['rm', '-f', id], config.root).catch(() => {})
      await fs.unlink(path.join(dir, '.runtime.json')).catch(() => {})
    })())
  const onAbort = () => {
    void dispose()
  }
  const check = async (kind: 'build' | 'typecheck') => {
    signal.throwIfAborted()
    const typeArgs =
      config.sandbox === 'docker'
        ? ['exec', id, 'node', '/app/node_modules/vue-tsc/bin/vue-tsc.js', '--noEmit']
        : [bin('vue-tsc'), '--noEmit']
    const result = await command(
      config.sandbox === 'docker' ? 'docker' : process.execPath,
      typeArgs,
      dir,
      signal
    )
    if (!result.passed || kind === 'typecheck') return result
    const args =
      config.sandbox === 'docker'
        ? [
            'exec',
            id,
            'node',
            '/app/node_modules/vite/bin/vite.js',
            'build',
            '--configLoader',
            'native',
            '--outDir',
            '/tmp/build',
            '--emptyOutDir'
          ]
        : [bin('vite'), 'build', '--outDir', 'dist', '--emptyOutDir']
    return command(config.sandbox === 'docker' ? 'docker' : process.execPath, args, dir, signal)
  }
  try {
    if (config.sandbox === 'docker') {
      container = true
      const run = await command(
        'docker',
        [
          'run',
          '-d',
          '--name',
          id,
          '--label',
          'patchlab=managed',
          '--network',
          'none',
          ...dockerIsolationArgs(config.instanceId, config.cgroupParent),
          '--memory',
          '768m',
          '--cpus',
          '1',
          '--pids-limit',
          '128',
          '--cap-drop',
          'ALL',
          '--security-opt',
          'no-new-privileges',
          '--read-only',
          '--user',
          '1000:1000',
          '--tmpfs',
          '/tmp:rw,nosuid,size=268435456',
          '--mount',
          `type=bind,src=${config.hostData ? path.join(config.hostData, path.relative(config.data, dir), 'src') : path.join(dir, 'src')},dst=/app/src,readonly`,
          config.image,
          'node',
          ...(production
            ? ['-e', 'setInterval(() => {}, 60000)']
            : [
                '/app/node_modules/vite/bin/vite.js',
                '--configLoader',
                'native',
                '--host',
                '0.0.0.0',
                '--port',
                '5173',
                '--strictPort'
              ])
        ],
        config.root,
        signal
      )
      if (!run.passed) throw new Error(`Docker startup failed: ${run.output}`)
      // A fixed stdio tunnel exposes only the fixture HTTP server. The container
      // itself has no network interface or Docker socket and cannot dial out.
      bridge = net.createServer((socket) => {
        connections.add(socket)
        const tunnel = spawnTunnel(id)
        tunnels.add(tunnel)
        socket.pipe(tunnel.stdin!)
        tunnel.stdout!.pipe(socket)
        tunnel.stderr?.resume()
        socket.setTimeout(30_000, () => socket.destroy())
        tunnel.on('error', () => socket.destroy())
        tunnel.on('exit', () => {
          tunnels.delete(tunnel)
          socket.destroy()
        })
        socket.on('error', () => {})
        socket.on('close', () => {
          connections.delete(socket)
          void killTree(tunnel)
        })
      })
      bridge.maxConnections = 32
      await new Promise<void>((resolve, reject) => {
        bridge!.once('error', reject)
        bridge!.listen(port, '127.0.0.1', resolve)
      })
      if (production) {
        const result = await check('build')
        if (!result.passed) throw new Error(`Candidate build failed: ${result.output}`)
        const preview = await command(
          'docker',
          [
            'exec',
            '-d',
            id,
            'node',
            '/app/node_modules/vite/bin/vite.js',
            'preview',
            '--configLoader',
            'native',
            '--outDir',
            '/tmp/build',
            '--host',
            '0.0.0.0',
            '--port',
            '5173',
            '--strictPort'
          ],
          config.root,
          signal
        )
        if (!preview.passed) throw new Error(preview.output)
      }
    } else {
      await attachDependencies(dir)
      signal.throwIfAborted()
      if (production) {
        const result = await check('build')
        if (!result.passed) throw new Error(`Candidate build failed: ${result.output}`)
      }
      signal.throwIfAborted()
      const configFile = path.join(dir, 'vite.config.ts')
      child = launch(
        process.execPath,
        [
          bin('vite'),
          ...(production ? ['preview'] : []),
          '--config',
          configFile,
          '--host',
          '127.0.0.1',
          '--port',
          String(port),
          '--strictPort'
        ],
        dir
      )
      if (child.pid)
        await fs.writeFile(
          path.join(dir, '.runtime.json'),
          JSON.stringify({ pid: child.pid, configFile })
        )
      let log = ''
      child.stdout?.on('data', (chunk) => {
        log = (log + chunk).slice(-4000)
      })
      child.stderr?.on('data', (chunk) => {
        log = (log + chunk).slice(-4000)
      })
      child.on('error', (err) => {
        log += err.message
      })
      if (child.exitCode !== null) throw new Error(`Fixture process exited: ${log}`)
    }
    for (let attempt = 0; attempt < 150; attempt++) {
      signal.throwIfAborted()
      if (child && child.exitCode !== null)
        throw new Error('Fixture process exited before readiness')
      try {
        if ((await fetch(url, { signal: AbortSignal.timeout(500) })).ok) break
      } catch {}
      if (attempt === 149) throw new Error('Fixture startup timed out')
      await sleep(100)
    }
    signal.throwIfAborted()
    browser = await chromium.launch({
      headless: true,
      timeout: 10_000,
      env: {
        PATH: process.env.PATH || '',
        SystemRoot: process.env.SystemRoot || '',
        HOME: process.env.HOME || '',
        TEMP: process.env.TEMP || '',
        TMP: process.env.TMP || '',
        LANG: 'C.UTF-8'
      }
    })
    signal.throwIfAborted()
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      serviceWorkers: 'block',
      acceptDownloads: false
    })
    signal.throwIfAborted()
    signal.addEventListener('abort', onAbort, { once: true })
    context.setDefaultTimeout(5000)
    await context.route('**/*', (route) =>
      permittedURL(route.request().url(), url) ? route.continue() : route.abort('blockedbyclient')
    )
    await context.routeWebSocket(/.*/, (ws) => {
      if (permittedURL(ws.url(), url)) ws.connectToServer()
      else ws.close()
    })
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false })
    const page = await context.newPage()
    const diagnostics: Diagnostic[] = []
    const push = (item: Diagnostic) => {
      diagnostics.push(item)
      if (diagnostics.length > 40) diagnostics.shift()
    }
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        push({ type: message.type(), message: redact(message.text()) })
    })
    page.on('pageerror', (error) => push({ type: 'pageerror', message: redact(error.message) }))
    page.on('requestfailed', (request) =>
      push({
        type: 'requestfailed',
        message: redact(`${new URL(request.url()).pathname} ${request.failure()?.errorText}`)
      })
    )
    page.on('response', (response) => {
      if (response.status() >= 400)
        push({ type: 'http', message: `${response.status()} ${new URL(response.url()).pathname}` })
    })
    await page.goto(url, { waitUntil: 'networkidle' })
    signal.throwIfAborted()
    return { dir, url, browser, context, page, diagnostics, check, dispose }
  } catch (error) {
    await dispose()
    throw error
  }
}

function spawnTunnel(id: string) {
  return spawn(
    'docker',
    [
      'exec',
      '-i',
      id,
      'node',
      '-e',
      "const s=require('node:net').connect(5173,'127.0.0.1');process.stdin.pipe(s);s.pipe(process.stdout);s.on('error',()=>process.exit(1));"
    ],
    {
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, HOME: process.env.HOME }
    }
  )
}
