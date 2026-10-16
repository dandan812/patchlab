import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from '../../shared/src/config.js'
import { store } from '../../shared/src/store.js'
import { saveArtifact } from '../../shared/src/artifacts.js'
import type { Assertion, Report } from '../../shared/src/types.js'
import { createSandbox, redact, type Sandbox } from '../../sandbox/src/index.js'
import { applyEdits, sourceFiles, hash, type Edit } from '../../tools/src/files.js'
import { evaluateCase, reproduceCase } from './assertions.js'

export async function evaluatePatch(
  taskId: string,
  caseId: string,
  original: string,
  edits: Edit[],
  signal: AbortSignal
): Promise<Report> {
  const clean = path.join(config.data, 'workspaces', taskId, 'acceptance')
  const started = Date.now()
  let sandbox: Sandbox | undefined
  let sourceHash = ''
  let phase: NonNullable<Report['phase']> = 'preparation'
  const assertions: Assertion[] = []
  const evidenceWarnings: string[] = []
  let report: Report
  try {
    signal.throwIfAborted()
    await fs.mkdir(path.dirname(clean), { recursive: true })
    await fs.cp(original, clean, { recursive: true, errorOnExist: true, force: false })
    const baseline = await sourceFiles(clean)
    await applyEdits(clean, edits, new Set(baseline.keys()))
    const files = await sourceFiles(clean)
    sourceHash = hash([...files].map(([key, value]) => `${key}\0${value}`).join('\0'))
    await store.event(
      taskId,
      'acceptance.start',
      'Applying guarded patch to a fresh snapshot; private acceptance tests are not mounted.'
    )
    phase = 'startup'
    sandbox = await createSandbox(clean, signal, true)
    phase = 'assertions'
    let failureScreenshots = 0
    await evaluateCase(caseId, sandbox.page, {
      signal,
      onResult: (assertion) => assertions.push(assertion),
      onFailure: async (assertion, index, page) => {
        assertion.detail = redact(assertion.detail || '')
        if (failureScreenshots >= 6) return
        failureScreenshots++
        try {
          const screenshot = await page.screenshot({ fullPage: false, timeout: 3000 })
          const artifact = await saveArtifact(
            taskId,
            'after',
            `assertion-${index + 1}-failed.png`,
            'image/png',
            screenshot
          )
          assertion.screenshotId = artifact.id
        } catch (error) {
          evidenceWarnings.push(
            redact(
              `Failure screenshot unavailable: ${error instanceof Error ? error.message : String(error)}`
            ).slice(0, 1000)
          )
        }
      }
    })
    signal.throwIfAborted()
    phase = 'evidence'
    const acceptanceSandbox = sandbox
    await reproduceCase(caseId, sandbox.page).catch(async () => {
      await acceptanceSandbox.page.goto(acceptanceSandbox.url)
    })
    await saveArtifact(
      taskId,
      'after',
      'after.png',
      'image/png',
      await sandbox.page.screenshot({ fullPage: true })
    )
    const trace = path.join(path.dirname(clean), 'acceptance-trace.zip')
    await sandbox.context.tracing.stop({ path: trace })
    await saveArtifact(
      taskId,
      'trace',
      'acceptance-trace.zip',
      'application/zip',
      await fs.readFile(trace)
    )
    signal.throwIfAborted()
    const passed = assertions.length > 0 && assertions.every((a) => a.passed)
    report = {
      caseId,
      passed,
      outcome: passed ? 'passed' : 'rejected',
      assertions,
      durationMs: Date.now() - started,
      cleanEnvironment: true,
      sourceHash,
      evaluatedAt: new Date().toISOString(),
      evidenceWarnings
    }
  } catch (error) {
    report = {
      caseId,
      passed: false,
      outcome: 'incomplete',
      phase,
      assertions,
      sourceHash,
      cleanEnvironment: !!sandbox,
      durationMs: Date.now() - started,
      evaluatedAt: new Date().toISOString(),
      error: redact(
        String(signal.aborted ? signal.reason : error instanceof Error ? error.message : error)
      ).slice(0, 3000),
      evidenceWarnings
    }
  } finally {
    await sandbox
      ?.dispose()
      .catch((error) => evidenceWarnings.push(redact(`Cleanup: ${String(error)}`).slice(0, 1000)))
  }
  await saveArtifact(
    taskId,
    'report',
    'acceptance.json',
    'application/json',
    JSON.stringify(report, null, 2)
  )
  await store.event(
    taskId,
    'acceptance.result',
    report.outcome === 'incomplete'
      ? 'Independent acceptance incomplete'
      : report.passed
        ? 'Independent acceptance passed'
        : 'Independent acceptance rejected the candidate',
    report
  )
  return report
}
