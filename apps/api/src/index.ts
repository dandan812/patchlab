import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { config } from '../../../packages/shared/src/config.js'
import { store } from '../../../packages/shared/src/store.js'
import { budgets, terminal, type Task } from '../../../packages/shared/src/types.js'
import { ArtifactIntegrityError, readArtifact } from '../../../packages/shared/src/artifacts.js'
import { cases } from '../../../fixtures/catalog.js'
import {
  initAuth,
  authenticated,
  validPassword,
  setSession,
  requireAuth,
  requireSameOrigin
} from './auth.js'

await store.init()
await initAuth()
const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '24kb' }))
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store')
  next()
})
app.use('/api', requireSameOrigin)
const loginAttempts = new Map<string, { count: number; start: number }>()
app.post('/api/login', (req, res) => {
  const key = req.ip || 'local'
  const attempt = loginAttempts.get(key)
  const current =
    !attempt || Date.now() - attempt.start > 10 * 60_000 ? { count: 0, start: Date.now() } : attempt
  current.count++
  loginAttempts.set(key, current)
  if (loginAttempts.size > 1000) loginAttempts.delete(loginAttempts.keys().next().value!)
  if (current.count > 12) {
    res.status(429).json({ error: '登录尝试过多，请稍后重试' })
    return
  }
  const input = z.object({ password: z.string().max(200) }).safeParse(req.body)
  if (!input.success || !validPassword(input.data.password)) {
    res.status(401).json({ error: '密码不正确' })
    return
  }
  loginAttempts.delete(key)
  setSession(res)
  res.json({ ok: true })
})
app.post('/api/logout', (_req, res) => {
  res.clearCookie('patchlab_session', { path: '/' })
  res.json({ ok: true })
})
app.get('/api/meta', (req, res) =>
  res.json({
    version: '0.1.0',
    authenticated: authenticated(req),
    modelConfigured: !!config.apiKey && !!config.model && config.sandbox === 'docker',
    modelCredentialsConfigured: !!config.apiKey && !!config.model,
    sandbox: config.sandbox,
    storage: store.kind,
    replayAvailable: true,
    budgets,
    modelId: config.model || null,
    modelApiType: config.modelApiType
  })
)
app.get('/api/health', async (_req, res) => {
  await store.init()
  res.json({ ok: true, storage: store.kind })
})
app.get('/api/cases', (_req, res) => res.json(cases))
app.get('/api/tasks', async (req, res) => {
  const admin = authenticated(req)
  res.json((await store.listTasks()).filter((t) => admin || t.public))
})
app.post('/api/tasks', requireAuth, async (req, res) => {
  const input = z
    .object({
      caseId: z.string(),
      description: z.string().trim().min(8).max(4000),
      mode: z.enum(['replay', 'model']),
      strategy: z.enum(['A', 'B', 'C']).default('C'),
      public: z.boolean().default(false)
    })
    .parse(req.body)
  if (!cases.some((c) => c.id === input.caseId)) {
    res.status(400).json({ error: '不支持的示例任务' })
    return
  }
  if (input.mode === 'model' && (!config.apiKey || !config.model || config.sandbox !== 'docker')) {
    res.status(409).json({
      error:
        '真实模型运行需要模型密钥（MODEL_API_KEY 或 MODEL_API_KEY_FILE）、MODEL_ID 和 Docker 隔离环境'
    })
    return
  }
  if (input.mode === 'replay' && input.strategy !== 'C') {
    res.status(400).json({ error: '脚本回放不能用作 A/B/C 模型实验' })
    return
  }
  const time = new Date().toISOString()
  const task: Task = {
    id: randomUUID(),
    ...input,
    status: 'queued',
    createdAt: time,
    updatedAt: time,
    cancelRequested: false
  }
  const created = await store.transaction((s) => {
    if (s.tasks.filter((t) => !terminal.has(t.status)).length >= 5) return null
    s.tasks.push(task)
    return task
  })
  if (!created) {
    res.status(429).json({ error: '串行队列已满（最多 5 个未完成任务）' })
    return
  }
  await store.event(task.id, 'task.created', 'Task queued', {
    mode: task.mode,
    strategy: task.strategy
  })
  res.status(201).json(created)
})
async function readable(req: express.Request, res: express.Response) {
  const task = await store.task(String(req.params.id))
  if (!task || (!task.public && !authenticated(req))) {
    res.status(404).json({ error: '任务不存在' })
    return undefined
  }
  return task
}
app.get('/api/tasks/:id', async (req, res) => {
  if (!(await readable(req, res))) return
  const detail = (await store.detail(String(req.params.id)))!
  for (const artifact of detail.artifacts) {
    if (artifact.kind === 'report' && artifact.name === 'acceptance.json')
      detail.report = JSON.parse((await readArtifact(artifact)).toString('utf8'))
    if (artifact.kind === 'patch') detail.patch = (await readArtifact(artifact)).toString('utf8')
  }
  res.json(detail)
})
app.post('/api/tasks/:id/cancel', requireAuth, async (req, res) => {
  const id = String(req.params.id)
  const task = await store.transaction((s) => {
    const current = s.tasks.find((t) => t.id === id)
    if (!current) return undefined
    if (!terminal.has(current.status)) {
      current.cancelRequested = true
      if (current.status === 'queued') current.status = 'cancelled'
      current.updatedAt = new Date().toISOString()
    }
    return current
  })
  if (!task) {
    res.status(404).json({ error: '任务不存在' })
    return
  }
  await store.event(
    id,
    'task.cancel',
    'Cancellation requested; worker will terminate model/browser/processes.'
  )
  res.json(task)
})
app.get('/api/tasks/:id/events', async (req, res) => {
  const task = await readable(req, res)
  if (!task) return
  let cursor = Math.max(0, Number(req.headers['last-event-id'] || req.query.after) || 0)
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
  let closed = false
  let busy = false
  const pump = async () => {
    if (closed || busy) return
    busy = true
    try {
      for (const event of await store.events(task.id, cursor)) {
        if (closed) return
        res.write(`id: ${event.seq}\nevent: event\ndata: ${JSON.stringify(event)}\n\n`)
        cursor = event.seq
      }
      const current = await store.task(task.id)
      if (!closed) {
        res.write(`event: status\ndata: ${JSON.stringify(current)}\n\n`)
        res.write(': heartbeat\n\n')
      }
    } catch {
      if (!closed) res.end()
    } finally {
      busy = false
    }
  }
  const timer = setInterval(() => {
    void pump()
  }, 1000)
  req.on('close', () => {
    closed = true
    clearInterval(timer)
  })
  await pump()
})
app.get('/api/artifacts/:id', async (req, res) => {
  const artifact = await store.artifact(String(req.params.id))
  const task = artifact ? await store.task(artifact.taskId) : undefined
  if (!artifact || !task || (!task.public && !authenticated(req))) {
    res.status(404).json({ error: '产物不存在' })
    return
  }
  const content = await readArtifact(artifact)
  res.setHeader('Content-Type', artifact.mime)
  if (artifact.sha256) res.setHeader('X-Artifact-SHA256', artifact.sha256)
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
  if (artifact.kind !== 'before' && artifact.kind !== 'after')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${artifact.name.replace(/[^\w.-]/g, '_')}"`
    )
  res.send(content)
})
app.get('/api/evaluations', async (req, res) => {
  const dir = path.join(config.data, 'evaluations')
  const names: string[] = await fs.readdir(dir).catch(() => [] as string[])
  const summary = names.includes('summary.json')
    ? JSON.parse(await fs.readFile(path.join(dir, 'summary.json'), 'utf8'))
    : null
  if (summary && !authenticated(req)) delete summary.rows
  res.json({ summary, files: names.filter((n) => n.endsWith('.json') || n.endsWith('.csv')) })
})
const webDir = path.join(config.root, 'dist', 'web')
app.use(express.static(webDir, { index: 'index.html' }))
app.use((req, res) => {
  if (req.path.startsWith('/api')) res.status(404).json({ error: '接口不存在' })
  else res.sendFile(path.join(webDir, 'index.html'))
})
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ArtifactIntegrityError) {
      res.status(409).json({ error: '运行证据完整性校验失败，请联系管理员检查归档文件' })
      return
    }
    if (err instanceof z.ZodError) {
      res
        .status(400)
        .json({ error: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') })
      return
    }
    console.error(err)
    if (!res.headersSent) res.status(500).json({ error: '服务端错误，请检查本地日志' })
  }
)
const server = app.listen(config.port, config.host, () =>
  console.log(`PatchLab API http://${config.host}:${config.port}`)
)
async function shutdown() {
  server.close()
  await store.close()
}
process.once('SIGINT', () => {
  void shutdown()
})
process.once('SIGTERM', () => {
  void shutdown()
})
