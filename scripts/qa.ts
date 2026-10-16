import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { config } from '../packages/shared/src/config.js'
import { terminal, type TaskDetail } from '../packages/shared/src/types.js'
import { redact } from '../packages/sandbox/src/index.js'

const web = process.env.PATCHLAB_QA_WEB || 'http://127.0.0.1:5173'
const out = path.join(config.data, 'qa')
await fs.mkdir(out, { recursive: true })
const password =
  process.env.PATCHLAB_ADMIN_PASSWORD ||
  (await fs.readFile(path.join(config.data, 'local-password.txt'), 'utf8'))
const resolvedIP = process.env.PATCHLAB_QA_RESOLVED_IP
const browser = await chromium.launch({
  headless: true,
  ...(resolvedIP
    ? { args: [`--host-resolver-rules=MAP ${new URL(web).hostname} ${resolvedIP}`] }
    : {})
})
const recordVideo = process.env.PATCHLAB_QA_VIDEO === '1'
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ...(recordVideo
    ? { recordVideo: { dir: path.join(out, 'video'), size: { width: 1440, height: 900 } } }
    : {})
})
const anonymous = await browser.newContext()
const page = await context.newPage()
const consoleErrors: string[] = []
page.on('pageerror', (e) => consoleErrors.push(e.message))
const checks: { name: string; passed: boolean; detail?: string }[] = []
let publicTask = ''
async function check(name: string, action: () => Promise<void>) {
  try {
    await action()
    checks.push({ name, passed: true })
    console.log(`PASS ${name}`)
  } catch (error) {
    const detail = redact(error instanceof Error ? error.message : String(error))
    checks.push({ name, passed: false, detail })
    console.error(`FAIL ${name}: ${detail}`)
    await page.keyboard.press('Escape').catch(() => {})
  }
}
const headers = { 'X-Patchlab-Request': '1' }
async function waitTask(id: string, predicate: (d: TaskDetail) => boolean, maxMs = 90_000) {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    const response = await context.request.get(`${web}/api/tasks/${id}`)
    assert.equal(response.status(), 200)
    const detail = (await response.json()) as TaskDetail
    if (predicate(detail)) return detail
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Task ${id} did not reach expected state`)
}
async function fits() {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth
  }))
  assert.ok(
    dimensions.scroll <= dimensions.width + 1,
    `Page overflow: ${JSON.stringify(dimensions)}`
  )
  const overflowing = await page
    .locator('button')
    .evaluateAll((nodes) =>
      nodes
        .filter((n) => n.getBoundingClientRect().width > 0 && n.scrollWidth > n.clientWidth + 2)
        .map((n) => n.textContent)
    )
  assert.deepEqual(overflowing, [], 'Button labels overflow their controls')
}
try {
  await check('anonymous writes denied and cross-origin login denied', async () => {
    const denied = await anonymous.request.post(`${web}/api/tasks`, {
      headers,
      data: {
        caseId: 'products-pagination',
        description: 'Unauthorized test',
        mode: 'replay',
        strategy: 'C'
      }
    })
    assert.equal(denied.status(), 401)
    const csrf = await anonymous.request.post(`${web}/api/login`, {
      headers: { ...headers, Origin: 'https://attacker.invalid' },
      data: { password: 'not-the-password' }
    })
    assert.equal(csrf.status(), 403)
  })
  await page.goto(web, { waitUntil: 'networkidle' })
  await check('administrator logs in through the real dialog', async () => {
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.getByLabel('管理员密码').fill(password)
    await page.getByRole('dialog').getByRole('button', { name: '登录', exact: true }).click()
    await page.getByRole('button', { name: '退出登录', exact: true }).waitFor()
  })
  await check('real task creation dialog, disabled AI mode and refresh durability', async () => {
    await page.getByRole('button', { name: '新建任务', exact: true }).first().click()
    const modal = page.getByRole('dialog')
    await modal.getByRole('combobox').selectOption('products-pagination')
    const meta = await (await context.request.get(`${web}/api/meta`)).json()
    if (!meta.modelConfigured)
      assert.ok(await modal.locator('input[type="radio"][value="model"]').isDisabled())
    await modal.getByRole('checkbox', { name: '公开案例' }).check()
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/api/tasks') && r.request().method() === 'POST'
    )
    await modal.getByRole('button', { name: '创建并运行' }).click()
    const created = await (await response).json()
    publicTask = created.id
    assert.ok(publicTask)
    await page.reload({ waitUntil: 'networkidle' })
    assert.ok(page.url().includes(publicTask))
    const detail = await waitTask(
      publicTask,
      (d) => terminal.has(d.task.status) && !!d.run?.finishedAt
    )
    assert.equal(detail.task.status, 'succeeded')
    assert.equal(detail.report?.passed, true)
    const sequences = detail.events.map((e) => e.seq)
    assert.equal(new Set(sequences).size, sequences.length)
    assert.ok(
      detail.artifacts.some((a) => a.kind === 'before') &&
        detail.artifacts.some((a) => a.kind === 'after')
    )
    await page.getByRole('button', { name: '刷新任务', exact: true }).click()
  })
  if (publicTask) {
    await check('diff, evidence, acceptance and actual image assets', async () => {
      await page.getByRole('tab', { name: 'Diff' }).click()
      await page.locator('.diff-code').waitFor()
      assert.match(await page.locator('.diff-code').innerText(), /page\.value = 1/)
      await page.getByRole('tab', { name: /^证据/ }).click()
      const images = page.locator('.evidence-grid img')
      assert.ok((await images.count()) >= 2)
      for (const image of await images.all()) {
        await image.scrollIntoViewIfNeeded()
        await image.evaluate(async (img) => {
          if (!(img as HTMLImageElement).complete)
            await new Promise<void>((resolve, reject) => {
              img.addEventListener('load', () => resolve(), { once: true })
              img.addEventListener('error', reject, { once: true })
            })
        })
        assert.ok(await image.evaluate((img) => (img as HTMLImageElement).naturalWidth > 0))
      }
      await fits()
      await page.screenshot({ path: path.join(out, 'desktop-evidence.png'), fullPage: true })
      await page.getByRole('tab', { name: /^验收/ }).click()
      await page.getByRole('heading', { name: '验收通过', exact: true }).waitFor()
      await fits()
      await page.screenshot({ path: path.join(out, 'desktop-acceptance.png'), fullPage: true })
    })
  }
  await check('private task and its artifacts remain invisible to visitors', async () => {
    const response = await context.request.post(`${web}/api/tasks`, {
      headers,
      data: {
        caseId: 'tasks-status',
        description: 'Private reviewed replay for authorization verification.',
        mode: 'replay',
        strategy: 'C'
      }
    })
    assert.equal(response.status(), 201)
    const created = await response.json()
    assert.equal((await anonymous.request.get(`${web}/api/tasks/${created.id}`)).status(), 404)
    const detail = await waitTask(
      created.id,
      (d) => terminal.has(d.task.status) && !!d.run?.finishedAt
    )
    assert.equal(detail.task.status, 'succeeded')
    for (const artifact of detail.artifacts)
      assert.equal(
        (await anonymous.request.get(`${web}/api/artifacts/${artifact.id}`)).status(),
        404
      )
    assert.equal(
      (await anonymous.request.post(`${web}/api/tasks/${created.id}/cancel`, { headers })).status(),
      401
    )
  })
  await check(
    process.env.PATCHLAB_QA_REMOTE === '1'
      ? 'active remote cancellation completes (filesystem checked separately on host)'
      : 'active cancellation closes execution and cleans workspace',
    async () => {
      const response = await context.request.post(`${web}/api/tasks`, {
        headers,
        data: {
          caseId: 'products-editor-scroll',
          description: 'Reviewed cancellation integration test; no model is called.',
          mode: 'replay',
          strategy: 'C',
          public: false
        }
      })
      const created = await response.json()
      await waitTask(
        created.id,
        (d) =>
          d.task.status === 'investigating' ||
          d.task.status === 'repairing' ||
          d.task.status === 'checking'
      )
      await context.request.post(`${web}/api/tasks/${created.id}/cancel`, { headers })
      const result = await waitTask(
        created.id,
        (d) => d.task.status === 'cancelled' && !!d.run?.finishedAt
      )
      assert.equal(result.report?.passed, undefined)
      await new Promise((r) => setTimeout(r, 500))
      if (process.env.PATCHLAB_QA_REMOTE !== '1') {
        assert.equal(
          await fs
            .stat(path.join(config.data, 'workspaces', created.id))
            .then(() => true)
            .catch(() => false),
          false
        )
      }
    }
  )
  await check('desktop navigation and searchable twenty-case library', async () => {
    await page.getByRole('button', { name: '案例', exact: true }).click()
    assert.equal(await page.locator('.case-item').count(), 20)
    await page.getByLabel('搜索案例').fill('products-pagination')
    assert.equal(await page.locator('.case-item').count(), 1)
    await page.getByLabel('搜索案例').fill('')
    await page.getByLabel('案例类别').selectOption('layout')
    assert.equal(await page.locator('.case-item').count(), 6)
    await fits()
    await page.screenshot({ path: path.join(out, 'desktop-cases.png'), fullPage: true })
    await page.getByRole('button', { name: '评估', exact: true }).click()
    await page.getByRole('heading', { name: '评估记录' }).waitFor()
    await fits()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('heading', { name: '工作区设置' }).waitFor()
    await fits()
  })
  await check('390px mobile details, tabs and create modal fit', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${web}/#/tasks/${publicTask}`, { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: /^验收/ }).click()
    await page.getByRole('heading', { name: '验收通过', exact: true }).waitFor()
    await fits()
    await page.screenshot({ path: path.join(out, 'mobile-acceptance.png'), fullPage: true })
    await page.getByRole('button', { name: '新建任务', exact: true }).first().click()
    await page.getByRole('dialog').waitFor()
    await fits()
    await page.screenshot({ path: path.join(out, 'mobile-create.png'), fullPage: true })
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  })
  const negativeTask = process.env.PATCHLAB_QA_NEGATIVE_TASK
  if (negativeTask) {
    await check('maintainer wrong patch is shown as rejected, never successful', async () => {
      assert.match(negativeTask, /^[a-f0-9-]{36}$/)
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(`${web}/#/tasks/${negativeTask}`, { waitUntil: 'networkidle' })
      await page.getByRole('tab', { name: /^验收/ }).click()
      const detail = (await (
        await context.request.get(`${web}/api/tasks/${negativeTask}`)
      ).json()) as TaskDetail
      assert.equal(detail.task.status, 'failed')
      assert.equal(detail.report?.passed, false)
      await page.getByRole('heading', { name: '验收未通过', exact: true }).waitFor()
      await fits()
      await page.screenshot({ path: path.join(out, 'desktop-rejected.png'), fullPage: true })
      await page.waitForTimeout(2500)
    })
  }
  await check('no uncaught browser JavaScript errors', async () => {
    assert.deepEqual(consoleErrors, [])
  })
} finally {
  await fs.writeFile(
    path.join(out, 'report.json'),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        web,
        publicTask,
        remote: process.env.PATCHLAB_QA_REMOTE === '1',
        resolvedIP: resolvedIP || null,
        negativeTask: process.env.PATCHLAB_QA_NEGATIVE_TASK || null,
        video: recordVideo ? 'video/workbench-replay-demo.webm' : null,
        checks,
        consoleErrors
      },
      null,
      2
    )
  )
  await context.close()
  if (recordVideo) await page.video()!.saveAs(path.join(out, 'video', 'workbench-replay-demo.webm'))
  await anonymous.close()
  await browser.close()
}
console.log(`Browser QA: ${checks.filter((c) => c.passed).length}/${checks.length}`)
if (checks.some((c) => !c.passed)) process.exitCode = 1
