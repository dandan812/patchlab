import fs from 'node:fs/promises'
import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { Sandbox } from '../../sandbox/src/index.js'
import { permittedURL, redact } from '../../sandbox/src/index.js'
import { budgets, type Task } from '../../shared/src/types.js'
import { store } from '../../shared/src/store.js'
import { saveArtifact } from '../../shared/src/artifacts.js'
import { safeFile, applyEdits, hash } from './files.js'

// Model declarations and execution validate the same tool contract.
const schemas = {
  read_file: z.object({
    path: z.string(),
    startLine: z.number().int().min(1).max(10000).optional(),
    lines: z.number().int().min(1).max(240).optional()
  }),
  search_code: z.object({ query: z.string().min(1).max(100) }),
  apply_patch: z.object({
    edits: z
      .array(
        z.object({ path: z.string(), content: z.string(), expectedHash: z.string().length(64) })
      )
      .min(1)
      .max(budgets.maxFiles)
  }),
  browser_observe: z.object({ selector: z.string().max(300).optional() }),
  browser_act: z.object({
    action: z.enum(['click', 'fill', 'select', 'press', 'navigate', 'viewport']),
    selector: z.string().max(300).optional(),
    value: z.string().max(1000).optional(),
    width: z.number().int().min(320).max(1920).optional(),
    height: z.number().int().min(480).max(1200).optional()
  }),
  run_check: z.object({ command: z.enum(['build', 'typecheck']) }),
  submit_patch: z.object({}),
  get_diagnostics: z.object({})
}

export interface ToolContext {
  task: Task
  sandbox: Sandbox
  signal: AbortSignal
  allowlist: Set<string>
  patchAttempts: number
  submitted: boolean
  evidenceSeen: boolean
}
export function redactToolLog(value: unknown): unknown {
  if (typeof value === 'string') return redact(value, value.length)
  if (Array.isArray(value)) return value.map(redactToolLog)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /^(?:api[_-]?key|password|token|secret|cookie|authorization)$/i.test(key)
          ? '[redacted]'
          : redactToolLog(item)
      ])
    )
  return value
}
export class TaskTools {
  private chain: Promise<unknown> = Promise.resolve()
  constructor(public context: ToolContext) {}
  async call(name: string, input: unknown) {
    const action = this.chain.then(() => this.execute(name, input))
    this.chain = action.catch(() => {})
    return action
  }
  private async execute(name: string, input: unknown) {
    const ctx = this.context
    ctx.signal.throwIfAborted()
    if (ctx.submitted)
      return { ok: false, error: 'Candidate already submitted. No further changes allowed.' }
    const inputText = JSON.stringify(redactToolLog(input))
    const rawInput =
      inputText.length > 4000
        ? await saveArtifact(
            ctx.task.id,
            'log',
            `tool-input-${name}-${Date.now()}.json`,
            'application/json',
            inputText
          )
        : undefined
    await store.event(
      ctx.task.id,
      'tool.call',
      name,
      rawInput
        ? { summary: inputText.slice(0, 4000), truncated: true, artifactId: rawInput.id }
        : JSON.parse(inputText)
    )
    let result: unknown
    try {
      switch (name) {
        case 'read_file': {
          const { path, startLine = 1, lines = 180 } = schemas.read_file.parse(input)
          const text = await fs.readFile(
            await safeFile(ctx.sandbox.dir, path, ctx.allowlist),
            'utf8'
          )
          const rows = text.split('\n')
          result = {
            ok: true,
            path,
            hash: hash(text),
            totalLines: rows.length,
            content: rows
              .slice(startLine - 1, startLine - 1 + lines)
              .map((row, i) => `${startLine + i}: ${row}`)
              .join('\n')
              .slice(0, budgets.maxOutput)
          }
          break
        }
        case 'search_code': {
          const { query } = schemas.search_code.parse(input)
          const matches = []
          for (const relative of ctx.allowlist) {
            const text = await fs.readFile(
              await safeFile(ctx.sandbox.dir, relative, ctx.allowlist),
              'utf8'
            )
            const rows = text.split('\n')
            for (let i = 0; i < rows.length; i++) {
              if (rows[i].toLowerCase().includes(query.toLowerCase()))
                matches.push({ path: relative, line: i + 1, text: rows[i].slice(0, 280) })
              if (matches.length >= 40) break
            }
            if (matches.length >= 40) break
          }
          result = { ok: true, files: [...ctx.allowlist], matches, truncated: matches.length >= 40 }
          break
        }
        case 'apply_patch': {
          if (ctx.task.strategy === 'C' && !ctx.evidenceSeen && ctx.task.mode === 'model')
            throw new Error('Observe the browser before changing code')
          if (
            ctx.patchAttempts >= budgets.maxPatches ||
            (ctx.task.strategy === 'A' && ctx.patchAttempts >= 1)
          )
            throw new Error('Repair attempt budget exhausted')
          const { edits } = schemas.apply_patch.parse(input)
          const changed = await applyEdits(ctx.sandbox.dir, edits, ctx.allowlist)
          ctx.patchAttempts++
          await store.patchTask(ctx.task.id, { status: 'repairing' })
          result = { ok: true, changed, attemptsRemaining: budgets.maxPatches - ctx.patchAttempts }
          break
        }
        case 'browser_observe': {
          const { selector } = schemas.browser_observe.parse(input)
          ctx.evidenceSeen = true
          const page = ctx.sandbox.page
          const snapshot = await page.locator('body').ariaSnapshot()
          const boxes = await page
            .locator(selector || 'button,input,select,main,[data-testid]')
            .evaluateAll((nodes) =>
              nodes.slice(0, 40).map((node) => {
                const box = node.getBoundingClientRect()
                const style = getComputedStyle(node)
                return {
                  tag: node.tagName,
                  testid: node.getAttribute('data-testid'),
                  text: (node.textContent || '').trim().slice(0, 100),
                  x: Math.round(box.x),
                  y: Math.round(box.y),
                  width: Math.round(box.width),
                  height: Math.round(box.height),
                  display: style.display,
                  overflow: style.overflow,
                  visibility: style.visibility
                }
              })
            )
          const screenshot = await saveArtifact(
            ctx.task.id,
            ctx.patchAttempts ? 'after' : 'before',
            `observation-${Date.now()}.png`,
            'image/png',
            await page.screenshot({ fullPage: true })
          )
          result = {
            ok: true,
            url: page.url(),
            viewport: page.viewportSize(),
            snapshot: snapshot.slice(0, 8000),
            elements: boxes,
            screenshotId: screenshot.id
          }
          break
        }
        case 'browser_act': {
          const action = schemas.browser_act.parse(input)
          const page = ctx.sandbox.page
          if (action.action === 'viewport')
            await page.setViewportSize({ width: action.width || 390, height: action.height || 844 })
          else if (action.action === 'navigate') {
            const url = new URL(action.value || '/', ctx.sandbox.url).href
            if (!permittedURL(url, ctx.sandbox.url))
              throw new Error('Browser navigation outside the task application is forbidden')
            await page.goto(url, { waitUntil: 'networkidle' })
          } else {
            if (!action.selector) throw new Error('A selector is required')
            const locator = page.locator(action.selector)
            if ((await locator.count()) !== 1)
              throw new Error('Selector must resolve to exactly one element')
            if (action.action === 'click') await locator.click()
            else if (action.action === 'fill') await locator.fill(action.value || '')
            else if (action.action === 'select') await locator.selectOption(action.value || '')
            else {
              if (
                !['Enter', 'Escape', 'Tab', 'ArrowDown', 'ArrowUp', 'Space'].includes(
                  action.value || ''
                )
              )
                throw new Error('Key not allowlisted')
              await locator.press(action.value!)
            }
          }
          result = { ok: true, action: action.action, url: page.url() }
          break
        }
        case 'get_diagnostics':
          result = { ok: true, diagnostics: ctx.sandbox.diagnostics.slice(-20) }
          break
        case 'run_check': {
          const { command } = schemas.run_check.parse(input)
          if (ctx.task.strategy === 'A')
            throw new Error('Single-shot baseline has no execution feedback')
          await store.patchTask(ctx.task.id, { status: 'checking' })
          const check = await ctx.sandbox.check(command)
          const artifact = await saveArtifact(
            ctx.task.id,
            'log',
            `${command}-${Date.now()}.txt`,
            'text/plain',
            redact(check.output, 16_000)
          )
          result = {
            ok: check.passed,
            code: check.code,
            output: redact(check.output, budgets.maxOutput),
            timedOut: check.timedOut,
            artifactId: artifact.id
          }
          break
        }
        case 'submit_patch':
          if (ctx.patchAttempts === 0) throw new Error('No patch was applied')
          ctx.submitted = true
          result = {
            ok: true,
            message: 'Candidate sealed. Only the independent evaluator decides success.'
          }
          break
        default:
          throw new Error('Unknown tool')
      }
    } catch (error) {
      ctx.signal.throwIfAborted()
      result = { ok: false, error: redact(error instanceof Error ? error.message : String(error)) }
    }
    ctx.signal.throwIfAborted()
    await store.event(ctx.task.id, 'tool.result', name, redactToolLog(result))
    return result
  }
  aiTools(): ToolSet {
    const define = <S extends z.ZodType>(name: string, description: string, inputSchema: S) =>
      tool({
        description,
        inputSchema,
        execute: async (input: z.infer<S>) => this.call(name, input)
      })
    const tools: ToolSet = {
      read_file: define(
        'read_file',
        'Read allowlisted source with line numbers and SHA256. Read more ranges if truncated.',
        schemas.read_file
      ),
      search_code: define(
        'search_code',
        'Literal code search and source file listing. No regex or shell.',
        schemas.search_code
      ),
      apply_patch: define(
        'apply_patch',
        'Replace source file contents with hash preconditions. Entire source file contents required. Max 3 batches, no config/test edits.',
        schemas.apply_patch
      ),
      submit_patch: define(
        'submit_patch',
        'Seal candidate for independent acceptance. Does not claim success.',
        schemas.submit_patch
      )
    }
    if (this.context.task.strategy !== 'A')
      tools.run_check = define(
        'run_check',
        'Fixed development build or typecheck. These are not independent acceptance tests.',
        schemas.run_check
      )
    if (this.context.task.strategy === 'C') {
      tools.browser_observe = define(
        'browser_observe',
        'Structured ARIA tree, layout, viewport and evidence screenshot of current application.',
        schemas.browser_observe
      )
      tools.browser_act = define(
        'browser_act',
        'Structured browser interactions, confined to this application.',
        schemas.browser_act
      )
      tools.get_diagnostics = define(
        'get_diagnostics',
        'Bounded redacted console errors and failed network requests.',
        schemas.get_diagnostics
      )
    }
    return tools
  }
}
