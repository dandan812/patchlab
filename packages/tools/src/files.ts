import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createTwoFilesPatch } from 'diff'
import { budgets } from '../../shared/src/types.js'

export interface Edit {
  path: string
  content: string
  expectedHash: string
}
export const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex')
export function validateSourcePath(relative: string) {
  if (
    !/^src\/[a-zA-Z0-9_./-]+\.(vue|ts|css)$/.test(relative) ||
    relative.split('/').some((p) => p === '..' || p === '.' || !p)
  )
    throw new Error('Only allowlisted src/**/*.vue, .ts and .css files may be accessed')
  return relative
}
export async function sourceFiles(dir: string): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  async function walk(current: string, prefix: string) {
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) throw new Error('Source symlinks are forbidden')
      const relative = `${prefix}/${entry.name}`
      if (entry.isDirectory()) await walk(path.join(current, entry.name), relative)
      else if (/\.(vue|ts|css)$/.test(entry.name)) {
        validateSourcePath(relative)
        const stat = await fs.stat(path.join(dir, relative))
        if (stat.size > budgets.maxFileBytes) throw new Error('Source file exceeds byte limit')
        result.set(relative, await fs.readFile(path.join(dir, relative), 'utf8'))
      } else throw new Error('Unexpected source file')
    }
  }
  await walk(path.join(dir, 'src'), 'src')
  return result
}
export async function safeFile(dir: string, relative: string, allowlist: Set<string>) {
  validateSourcePath(relative)
  if (!allowlist.has(relative)) throw new Error('File is not part of the approved snapshot')
  const base = await fs.realpath(path.join(dir, 'src'))
  const target = await fs.realpath(path.join(dir, relative))
  if (!target.startsWith(base + path.sep)) throw new Error('Source path escapes task directory')
  const parts = relative.split('/')
  for (let i = 1; i <= parts.length; i++) {
    if ((await fs.lstat(path.join(dir, ...parts.slice(0, i)))).isSymbolicLink())
      throw new Error('Source symlinks are forbidden')
  }
  return target
}
export async function applyEdits(dir: string, edits: Edit[], allowlist: Set<string>) {
  if (!edits.length || edits.length > budgets.maxFiles)
    throw new Error('Patch file budget exceeded')
  if (new Set(edits.map((e) => e.path)).size !== edits.length)
    throw new Error('Duplicate patch paths')
  if (edits.reduce((n, e) => n + Buffer.byteLength(e.content), 0) > budgets.maxPatchBytes)
    throw new Error('Patch byte budget exceeded')
  const checked = []
  for (const edit of edits) {
    const file = await safeFile(dir, edit.path, allowlist)
    if (Buffer.byteLength(edit.content) > budgets.maxFileBytes)
      throw new Error('Patched file too large')
    if (hash(await fs.readFile(file)) !== edit.expectedHash)
      throw new Error(`Stale source hash: ${edit.path}. Read the current file before editing.`)
    checked.push({ file, content: edit.content })
  }
  // Validate the entire batch before touching files; tools are serialized by the runner.
  for (const edit of checked) await fs.writeFile(edit.file, edit.content)
  return edits.map((e) => ({ path: e.path, hash: hash(e.content) }))
}
export async function collectPatch(baseline: Map<string, string>, candidate: string) {
  const files = await sourceFiles(candidate)
  if (files.size !== baseline.size || [...files.keys()].some((key) => !baseline.has(key)))
    throw new Error('Files may not be added or removed')
  const edits = [...files]
    .filter(([file, content]) => baseline.get(file) !== content)
    .map(([file, content]) => ({ path: file, content, expectedHash: hash(baseline.get(file)!) }))
  if (!edits.length) throw new Error('No source changes were submitted')
  if (
    edits.length > budgets.maxFiles ||
    edits.reduce((n, e) => n + Buffer.byteLength(e.content), 0) > budgets.maxPatchBytes
  )
    throw new Error('Patch budget exceeded')
  const patch = edits
    .map((e) =>
      createTwoFilesPatch(`a/${e.path}`, `b/${e.path}`, baseline.get(e.path)!, e.content, '', '')
    )
    .join('\n')
  return {
    edits,
    patch,
    sourceHash: hash([...files].map(([key, value]) => `${key}\0${value}`).join('\0'))
  }
}
