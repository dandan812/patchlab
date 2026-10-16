import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { config } from '../../../packages/shared/src/config.js'
import { store } from '../../../packages/shared/src/store.js'
import { budgets, terminal, type Run, type Task } from '../../../packages/shared/src/types.js'
import { saveArtifact } from '../../../packages/shared/src/artifacts.js'
import { createSandbox, redact, type Sandbox } from '../../../packages/sandbox/src/index.js'
import { sourceFiles, collectPatch, hash } from '../../../packages/tools/src/files.js'
import { TaskTools } from '../../../packages/tools/src/index.js'
import { runAgent, promptVersion } from '../../../packages/agent/src/index.js'
import { evaluatePatch } from '../../../packages/evaluator/src/index.js'
import { reproduceCase } from '../../../packages/evaluator/src/assertions.js'
import { materializeFixture, getReferenceEdits } from '../../../fixtures/catalog.js'

export async function executeTask(
  task: Task,
  parent?: AbortSignal,
  reviewedAdversarialEdits?: Array<{ path: string; content: string }>
) {
  const controller = new AbortController()
  const signal = controller.signal
  const abortParent = () => controller.abort(parent?.reason || new Error('Worker shutting down'))
  parent?.addEventListener('abort', abortParent, { once: true })
  if (parent?.aborted) abortParent()
  const timeout = setTimeout(
    () => controller.abort(new Error('Task exceeded total wall-time budget')),
    budgets.timeoutMs
  )
  let polling = false
  const cancelPoll = setInterval(async () => {
    if (polling) return
    polling = true
    try {
      if ((await store.task(task.id))?.cancelRequested)
        controller.abort(new Error('User cancelled task'))
    } catch (error) {
      controller.abort(error)
    } finally {
      polling = false
    }
  }, 400)
  const run: Run = {
    id: randomUUID(),
    taskId: task.id,
    model:
      task.mode === 'replay'
        ? reviewedAdversarialEdits
          ? 'scripted-adversarial-test (NOT AI)'
          : 'scripted-reference-replay (NOT AI)'
        : config.model || 'unconfigured',
    strategy: task.strategy,
    sandbox: config.sandbox,
    startedAt: new Date().toISOString(),
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    calls: 0,
    patchAttempts: 0,
    environment: {
      node: process.version,
      os: process.platform,
      promptVersion,
      aiSDK: '7.0.123',
      playwright: '1.63.0',
      vue: '3.5.43',
      fixtureVersion: 'v1',
      ...(task.mode === 'model' ? { modelApiType: config.modelApiType } : {})
    }
  }
  let sandbox: Sandbox | undefined
  let tools: TaskTools | undefined
  const workspace = path.join(config.data, 'workspaces', task.id)
  try {
    signal.throwIfAborted()
    if (reviewedAdversarialEdits && task.mode !== 'replay')
      throw new Error('Adversarial supervisor edits are forbidden in model mode')
    if ((await store.task(task.id))?.cancelRequested) throw new Error('User cancelled task')
    await store.addRun(run)
    await store.patchTask(task.id, { status: 'preparing', runId: run.id })
    await store.event(
      task.id,
      'run.start',
      task.mode === 'replay'
        ? 'Scripted reference replay: infrastructure demonstration, not an AI repair result.'
        : 'Starting bounded model-driven repair',
      { budgets, mode: task.mode, strategy: task.strategy, environment: run.environment }
    )
    const original = path.join(workspace, 'original')
    const candidate = path.join(workspace, 'candidate')
    await materializeFixture(task.caseId, original)
    await fs.cp(original, candidate, { recursive: true, errorOnExist: true, force: false })
    const baseline = await sourceFiles(original)
    await saveArtifact(
      task.id,
      'log',
      'snapshot-manifest.json',
      'application/json',
      JSON.stringify(
        {
          caseId: task.caseId,
          files: [...baseline].map(([file, content]) => ({ path: file, sha256: hash(content) }))
        },
        null,
        2
      )
    )
    sandbox = await createSandbox(candidate, signal)
    await store.patchTask(task.id, { status: 'investigating' })
    if (task.mode === 'replay') await reproduceCase(task.caseId, sandbox.page)
    await saveArtifact(
      task.id,
      'before',
      'before.png',
      'image/png',
      await sandbox.page.screenshot({ fullPage: true })
    )
    tools = new TaskTools({
      task,
      sandbox,
      signal,
      allowlist: new Set(baseline.keys()),
      patchAttempts: 0,
      submitted: false,
      evidenceSeen: false
    })
    if (task.mode === 'replay') {
      if (task.strategy !== 'C')
        throw new Error('Scripted replay only demonstrates C; it is not an A/B/C model benchmark')
      await tools.call('browser_observe', {})
      const edits = []
      for (const reference of reviewedAdversarialEdits || (await getReferenceEdits(task.caseId))) {
        const read = (await tools.call('read_file', { path: reference.path, lines: 240 })) as {
          hash: string
          ok: boolean
        }
        if (!read.ok) throw new Error('Replay source read failed')
        edits.push({ ...reference, expectedHash: read.hash })
      }
      const applied = (await tools.call('apply_patch', { edits })) as { ok: boolean }
      if (!applied.ok) throw new Error('Replay patch rejected')
      const check = (await tools.call('run_check', { command: 'build' })) as { ok: boolean }
      if (!check.ok) throw new Error('Development build failed')
      await tools.call('submit_patch', {})
    } else await runAgent(tools, run)
    signal.throwIfAborted()
    const sealed = await collectPatch(baseline, candidate)
    await saveArtifact(task.id, 'patch', 'candidate.patch', 'text/x-diff', sealed.patch)
    const trace = path.join(workspace, 'repair-trace.zip')
    await sandbox.context.tracing.stop({ path: trace })
    await saveArtifact(
      task.id,
      'trace',
      'repair-trace.zip',
      'application/zip',
      await fs.readFile(trace)
    )
    await sandbox.dispose()
    sandbox = undefined
    await store.patchTask(task.id, { status: 'evaluating' })
    const report = await evaluatePatch(task.id, task.caseId, original, sealed.edits, signal)
    signal.throwIfAborted()
    if (report.outcome === 'incomplete')
      throw new Error(`Independent acceptance incomplete (${report.phase}): ${report.error}`)
    if (report.sourceHash !== sealed.sourceHash)
      throw new Error('Independent source hash did not match sealed candidate')
    await store.transaction((s) => {
      const current = s.tasks.find((t) => t.id === task.id)!
      current.status = current.cancelRequested
        ? 'cancelled'
        : report.passed
          ? 'succeeded'
          : 'failed'
      if (current.cancelRequested) current.error = 'User cancelled task'
      else if (!report.passed) current.error = 'Independent acceptance rejected the candidate'
      current.updatedAt = new Date().toISOString()
    })
  } catch (error) {
    const current = await store.task(task.id)
    const message = redact(error instanceof Error ? error.message : String(error))
    const status = current?.cancelRequested
      ? 'cancelled'
      : parent?.aborted
        ? 'interrupted'
        : 'failed'
    if (!current || !terminal.has(current.status))
      await store.patchTask(task.id, { status, error: message })
    await store.event(task.id, 'run.error', message, { status })
  } finally {
    clearTimeout(timeout)
    clearInterval(cancelPoll)
    parent?.removeEventListener('abort', abortParent)
    await sandbox?.dispose()
    run.finishedAt = new Date().toISOString()
    run.durationMs = Date.now() - Date.parse(run.startedAt)
    run.patchAttempts = tools?.context.patchAttempts || 0
    if ((await store.detail(task.id))?.run)
      await store.patchRun(run.id, {
        finishedAt: run.finishedAt,
        durationMs: run.durationMs,
        patchAttempts: run.patchAttempts
      })
    const detail = await store.detail(task.id)
    await saveArtifact(
      task.id,
      'log',
      'execution.json',
      'application/json',
      JSON.stringify({ task: detail?.task, run: detail?.run, events: detail?.events }, null, 2)
    ).catch(() => {})
    await store.event(task.id, 'run.end', `Run finished: ${detail?.task.status}`, {
      durationMs: run.durationMs
    })
    // Source workspaces are disposable; evidence remains in the separate archive.
    const resolved = path.resolve(workspace)
    if (resolved.startsWith(path.resolve(config.data, 'workspaces') + path.sep))
      await fs.rm(resolved, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  }
  return store.detail(task.id)
}
