import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { cases } from '../fixtures/catalog.js'
import { config } from '../packages/shared/src/config.js'
import { store } from '../packages/shared/src/store.js'
import { terminal, type Strategy, type Task } from '../packages/shared/src/types.js'
import { hash } from '../packages/tools/src/files.js'
import { instructions, promptVersion } from '../packages/agent/src/index.js'
import { executeTask } from '../apps/worker/src/execute.js'

const args = process.argv.slice(2)
const option = (name: string, fallback: string) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') || fallback
const mode = option('mode', 'replay')
const split = option('split', 'dev')
const strategies = option('strategy', 'C') === 'all' ? ['A', 'B', 'C'] : [option('strategy', 'C')]
const repeats = Number(option('repeats', '1'))
if (
  !['replay', 'model'].includes(mode) ||
  !['dev', 'holdout', 'all'].includes(split) ||
  strategies.some((s) => !['A', 'B', 'C'].includes(s)) ||
  !Number.isInteger(repeats) ||
  repeats < 1 ||
  repeats > 3
)
  throw new Error('Invalid evaluation options')
if (mode === 'model' && (!config.apiKey || !config.model || config.sandbox !== 'docker'))
  throw new Error(
    'Real model evaluation requires credentials and Docker. No model request has been sent.'
  )
if (mode === 'replay' && strategies.some((s) => s !== 'C'))
  throw new Error('Scripted replay is not an A/B/C benchmark')
const list = cases.filter(
  (c) =>
    (split === 'all' || c.split === split) && (!option('case', '') || c.id === option('case', ''))
)
if (!list.length) throw new Error('No matching evaluation cases')
const startedAt = new Date().toISOString()
const frozenConfig = {
  promptVersion,
  promptHash: hash(instructions),
  lockHash: hash(await fs.readFile(path.join(config.root, 'package-lock.json'))),
  model: mode === 'model' ? config.model : 'scripted-reference-replay',
  inputPrice: process.env.MODEL_INPUT_PRICE ?? null,
  outputPrice: process.env.MODEL_OUTPUT_PRICE ?? null,
  split,
  repeats,
  strategies,
  cases: list.map((c) => c.id)
}
await store.init()
let release: (() => Promise<void>) | undefined
try {
  release = await store.acquireWorker()
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('Only one')) throw error
}
const rows: {
  taskId: string
  caseId: string
  strategy: string
  repeat: number
  status: string
  passed: boolean
  durationMs: number | null
  calls: number
  inputTokens: number | null
  outputTokens: number | null
  costUsd: number | null
  error: string | null
}[] = []
const out = path.join(config.data, 'evaluations')
await fs.mkdir(out, { recursive: true })
try {
  for (const item of list)
    for (const strategy of strategies)
      for (let repeat = 1; repeat <= repeats; repeat++) {
        const time = new Date().toISOString()
        const task: Task = {
          id: randomUUID(),
          caseId: item.id,
          description: item.description,
          mode: mode as Task['mode'],
          strategy: strategy as Strategy,
          status: release ? 'preparing' : 'queued',
          createdAt: time,
          updatedAt: time,
          cancelRequested: false,
          public: mode === 'replay'
        }
        await store.createTask(task)
        if (release) await executeTask(task)
        else {
          const deadline = Date.now() + 300_000
          while (!terminal.has((await store.task(task.id))!.status)) {
            if (Date.now() > deadline)
              throw new Error(
                `Worker wait timeout: ${task.id}. Task remains in the queue; check the worker.`
              )
            await new Promise((r) => setTimeout(r, 500))
          }
        }
        const detail = (await store.detail(task.id))!
        const row = {
          taskId: task.id,
          caseId: item.id,
          strategy,
          repeat,
          status: detail.task.status,
          passed: detail.task.status === 'succeeded',
          durationMs: detail.run?.durationMs ?? null,
          calls: detail.run?.calls ?? 0,
          inputTokens: detail.run?.inputTokens ?? null,
          outputTokens: detail.run?.outputTokens ?? null,
          costUsd: detail.run?.costUsd ?? null,
          error: detail.task.error ?? null
        }
        rows.push(row)
        console.log(`${row.status} ${item.id} ${strategy} #${repeat} ${row.durationMs}ms`)
        await fs.writeFile(
          path.join(out, 'runs.json'),
          JSON.stringify({ frozenConfig, startedAt, rows }, null, 2)
        )
      }
  const summary = {
    kind: mode === 'model' ? 'model-benchmark' : 'scripted-infrastructure-check',
    startedAt,
    finishedAt: new Date().toISOString(),
    frozenConfig,
    total: rows.length,
    passed: rows.filter((r) => r.passed).length,
    passRate: rows.filter((r) => r.passed).length / rows.length,
    costUsd: rows.every((r) => r.costUsd !== null)
      ? rows.reduce((n, r) => n + r.costUsd!, 0)
      : null,
    byStrategy: strategies.map((strategy) => {
      const group = rows.filter((r) => r.strategy === strategy)
      return { strategy, total: group.length, passed: group.filter((r) => r.passed).length }
    }),
    rows
  }
  await fs.writeFile(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2))
  await fs.writeFile(
    path.join(out, 'runs.csv'),
    [
      'taskId,caseId,strategy,repeat,status,durationMs,inputTokens,outputTokens,costUsd',
      ...rows.map((r) =>
        [
          r.taskId,
          r.caseId,
          r.strategy,
          r.repeat,
          r.status,
          r.durationMs ?? 'unknown',
          r.inputTokens ?? 'unknown',
          r.outputTokens ?? 'unknown',
          r.costUsd ?? 'unknown'
        ].join(',')
      )
    ].join('\n')
  )
  console.log(
    `Saved ${rows.length} real execution records. Kind: ${summary.kind}. NOT a comparative claim.`
  )
  if (rows.some((r) => !r.passed)) process.exitCode = 1
} finally {
  await release?.()
  await store.close()
}
