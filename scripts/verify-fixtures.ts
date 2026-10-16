import fs from 'node:fs/promises'
import path from 'node:path'
import { cases, materializeFixture, materializeReference } from '../fixtures/catalog.js'
import { evaluateCase, reproduceCase } from '../packages/evaluator/src/assertions.js'
import { createSandbox } from '../packages/sandbox/src/index.js'
import { config } from '../packages/shared/src/config.js'

const selected = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const list = selected.length ? cases.filter((c) => selected.includes(c.id)) : cases
if (!list.length) throw new Error('No matching fixture cases')
const out = path.join(config.data, 'evaluations')
await fs.mkdir(out, { recursive: true })
const records = []
for (const item of list) {
  const record: {
    caseId: string
    defectRejected: boolean
    referencePassed: boolean
    error?: string
    versions: unknown[]
  } = { caseId: item.id, defectRejected: false, referencePassed: false, versions: [] }
  for (const variant of ['defect', 'reference'] as const) {
    const dir = path.join(config.data, 'verification', `${item.id}-${variant}-${Date.now()}`)
    let sandbox
    try {
      await (variant === 'defect' ? materializeFixture : materializeReference)(item.id, dir)
      sandbox = await createSandbox(dir, AbortSignal.timeout(90_000), true)
      const assertions = await evaluateCase(item.id, sandbox.page)
      const passed = assertions.length > 0 && assertions.every((a) => a.passed)
      if (variant === 'defect') record.defectRejected = !passed
      else record.referencePassed = passed
      record.versions.push({ variant, assertions })
      await reproduceCase(item.id, sandbox.page).catch(() => {})
      await sandbox.page.screenshot({
        path: path.join(out, `${item.id}-${variant}.png`),
        fullPage: true
      })
    } catch (error) {
      record.error = `${variant}: ${error instanceof Error ? error.message : String(error)}`
      record.versions.push({ variant, error: record.error })
    } finally {
      await sandbox?.dispose()
      if (path.resolve(dir).startsWith(path.resolve(config.data, 'verification') + path.sep))
        await fs.rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
    }
  }
  records.push(record)
  console.log(
    `${record.defectRejected && record.referencePassed && !record.error ? 'PASS' : 'FAIL'} ${item.id} defectRejected=${record.defectRejected} referencePassed=${record.referencePassed}${record.error ? ` ${record.error}` : ''}`
  )
  await fs.writeFile(
    path.join(out, 'fixture-verification.json'),
    JSON.stringify(
      {
        kind: 'fixture-validation-not-model-evaluation',
        date: new Date().toISOString(),
        environment: { node: process.version, playwright: '1.63.0', sandbox: config.sandbox },
        records
      },
      null,
      2
    )
  )
}
const valid = records.filter((r) => r.defectRejected && r.referencePassed && !r.error).length
console.log(`Fixture validation: ${valid}/${records.length}`)
if (valid !== records.length) process.exitCode = 1
