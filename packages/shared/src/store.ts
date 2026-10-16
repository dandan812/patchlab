import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { config } from './config.js'
import {
  terminal,
  type Task,
  type Run,
  type Event,
  type Artifact,
  type TaskDetail
} from './types.js'

interface State {
  tasks: Task[]
  runs: Run[]
  events: Event[]
  artifacts: Artifact[]
}
const empty = (): State => ({ tasks: [], runs: [], events: [], artifacts: [] })
const tables = ['tasks', 'runs', 'events', 'artifacts'] as const
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export class Store {
  private pool?: pg.Pool
  private ready?: Promise<void>
  constructor(
    private dir = config.data,
    url = config.databaseUrl
  ) {
    if (url) this.pool = new pg.Pool({ connectionString: url, max: 5 })
  }
  get kind() {
    return this.pool ? 'postgresql' : 'local-json'
  }
  init() {
    return (this.ready ??= (async () => {
      await fs.mkdir(this.dir, { recursive: true })
      if (this.pool) {
        const client = await this.pool.connect()
        try {
          await client.query('BEGIN')
          await client.query('SELECT pg_advisory_xact_lock(73194310)')
          for (const table of tables) {
            await client.query(`CREATE TABLE IF NOT EXISTS ${table} (
              id text PRIMARY KEY, task_id text, status text, seq integer, payload jsonb NOT NULL
            )`)
          }
          await client.query(
            'CREATE UNIQUE INDEX IF NOT EXISTS events_task_seq ON events(task_id, seq)'
          )
          await client.query('CREATE INDEX IF NOT EXISTS tasks_status ON tasks(status)')
          await client.query('COMMIT')
        } catch (error) {
          await client.query('ROLLBACK').catch(() => {})
          throw error
        } finally {
          client.release()
        }
      }
    })())
  }
  private async localLock() {
    const lock = path.join(this.dir, '.state-lock')
    for (let attempt = 0; attempt < 200; attempt++) {
      try {
        await fs.mkdir(lock)
        await fs.writeFile(path.join(lock, 'owner'), String(process.pid))
        return async () => {
          await fs.rm(lock, { recursive: true, force: true })
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
        const owner = await fs.readFile(path.join(lock, 'owner'), 'utf8').catch(() => '')
        const stat = await fs.stat(lock).catch(() => null)
        if (
          (owner && !alive(Number(owner))) ||
          (!owner && stat && Date.now() - stat.mtimeMs > 10_000)
        ) {
          await fs.rm(lock, { recursive: true, force: true })
        }
        await sleep(25)
      }
    }
    throw new Error('Timed out acquiring local state lock')
  }
  async transaction<T>(fn: (state: State) => T): Promise<T> {
    await this.init()
    if (this.pool) {
      const client = await this.pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock(73194311)')
        const state = empty()
        for (const table of tables)
          state[table] = (await client.query(`SELECT payload FROM ${table}`)).rows.map(
            (r) => r.payload
          ) as never
        const before = structuredClone(state)
        const result = fn(state)
        for (const table of tables) {
          const previous = new Map(before[table].map((row) => [row.id, JSON.stringify(row)]))
          for (const row of state[table]) {
            if (previous.get(row.id) === JSON.stringify(row)) continue
            await client.query(
              `INSERT INTO ${table}(id,task_id,status,seq,payload) VALUES($1,$2,$3,$4,$5)
              ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status, payload=EXCLUDED.payload`,
              [
                row.id,
                'taskId' in row ? row.taskId : row.id,
                'status' in row ? row.status : null,
                'seq' in row ? row.seq : null,
                JSON.stringify(row)
              ]
            )
          }
        }
        await client.query('COMMIT')
        return structuredClone(result)
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw err
      } finally {
        client.release()
      }
    }
    const unlock = await this.localLock()
    try {
      const file = path.join(this.dir, 'state.json')
      const raw = await fs.readFile(file, 'utf8').catch((err) => {
        if (err.code === 'ENOENT') return null
        throw err
      })
      const state: State = raw ? JSON.parse(raw) : empty()
      const result = fn(state)
      const temp = `${file}.${process.pid}.tmp`
      await fs.writeFile(temp, JSON.stringify(state))
      await fs.rename(temp, file)
      return structuredClone(result)
    } finally {
      await unlock()
    }
  }
  listTasks() {
    return this.transaction((s) => s.tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
  }
  task(id: string) {
    return this.transaction((s) => s.tasks.find((t) => t.id === id))
  }
  createTask(task: Task) {
    return this.transaction((s) => {
      s.tasks.push(task)
      return task
    })
  }
  patchTask(id: string, update: Partial<Task>) {
    return this.transaction((s) => {
      const task = s.tasks.find((t) => t.id === id)
      if (!task) throw new Error('Task not found')
      Object.assign(task, update, { updatedAt: new Date().toISOString() })
      return task
    })
  }
  claim() {
    return this.transaction((s) => {
      const task = s.tasks
        .filter((t) => t.status === 'queued' && !t.cancelRequested)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
      if (task) Object.assign(task, { status: 'preparing', updatedAt: new Date().toISOString() })
      return task
    })
  }
  addRun(run: Run) {
    return this.transaction((s) => {
      s.runs.push(run)
      return run
    })
  }
  patchRun(id: string, update: Partial<Run>) {
    return this.transaction((s) => {
      const run = s.runs.find((r) => r.id === id)
      if (!run) throw new Error('Run not found')
      Object.assign(run, update)
      return run
    })
  }
  event(taskId: string, type: string, message: string, data?: unknown) {
    return this.transaction((s) => {
      const event: Event = {
        id: randomUUID(),
        taskId,
        seq:
          s.events.filter((e) => e.taskId === taskId).reduce((n, e) => Math.max(n, e.seq), 0) + 1,
        time: new Date().toISOString(),
        type,
        message,
        data
      }
      s.events.push(event)
      return event
    })
  }
  events(taskId: string, after = 0) {
    return this.transaction((s) =>
      s.events.filter((e) => e.taskId === taskId && e.seq > after).sort((a, b) => a.seq - b.seq)
    )
  }
  artifact(id: string) {
    return this.transaction((s) => s.artifacts.find((a) => a.id === id))
  }
  addArtifact(artifact: Artifact) {
    return this.transaction((s) => {
      s.artifacts.push(artifact)
      return artifact
    })
  }
  detail(id: string): Promise<TaskDetail | undefined> {
    return this.transaction((s) => {
      const task = s.tasks.find((t) => t.id === id)
      if (!task) return undefined
      return {
        task,
        run: s.runs.find((r) => r.id === task.runId),
        events: s.events.filter((e) => e.taskId === id).sort((a, b) => a.seq - b.seq),
        artifacts: s.artifacts.filter((a) => a.taskId === id)
      }
    })
  }
  interrupt() {
    return this.transaction((s) => {
      const tasks = s.tasks.filter((t) => !terminal.has(t.status) && t.status !== 'queued')
      for (const task of tasks)
        Object.assign(task, {
          status: 'interrupted',
          error: 'Worker restarted; rerun from a clean snapshot.',
          updatedAt: new Date().toISOString()
        })
      for (const run of s.runs.filter(
        (r) => tasks.some((t) => t.id === r.taskId) && !r.finishedAt
      )) {
        run.finishedAt = new Date().toISOString()
        run.durationMs = Date.now() - Date.parse(run.startedAt)
      }
      return tasks
    })
  }
  async acquireWorker() {
    await this.init()
    if (this.pool) {
      const client = await this.pool.connect()
      const result = await client.query('SELECT pg_try_advisory_lock(73194312) AS acquired')
      if (!result.rows[0].acquired) {
        client.release()
        throw new Error('Only one serial worker may run')
      }
      client.on('error', () => {
        console.error('Worker database lease lost')
        process.exit(1)
      })
      return async () => {
        await client.query('SELECT pg_advisory_unlock(73194312)')
        client.release()
      }
    }
    const file = path.join(this.dir, 'worker.pid')
    try {
      await fs.writeFile(file, String(process.pid), { flag: 'wx' })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      const pid = Number(await fs.readFile(file, 'utf8'))
      if (alive(pid)) throw new Error('Only one serial worker may run')
      await fs.unlink(file)
      await fs.writeFile(file, String(process.pid), { flag: 'wx' })
    }
    return async () => {
      await fs.unlink(file).catch(() => {})
    }
  }
  async close() {
    await this.pool?.end()
  }
}
export const store = new Store()
