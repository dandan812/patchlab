import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {
  validateSourcePath,
  hash,
  sourceFiles,
  applyEdits,
  collectPatch
} from '../packages/tools/src/files.js'
import { permittedURL, redact } from '../packages/sandbox/src/index.js'
import { cost } from '../packages/agent/src/index.js'
import { config } from '../packages/shared/src/config.js'

test('source boundary rejects traversal, configs, tests and shell-looking paths', () => {
  for (const bad of [
    '../x.ts',
    'src/../x.ts',
    'src/./x.ts',
    'src//x.ts',
    'package.json',
    'src/x.spec.js',
    'src/x;echo.ts',
    'C:/src/x.ts',
    'src\\x.ts',
    'src/x.ts:stream'
  ])
    assert.throws(() => validateSourcePath(bad))
  assert.equal(validateSourcePath('src/components/Form.vue'), 'src/components/Form.vue')
})
test('browser origin boundary rejects external origins, schemes and credentials', () => {
  const allowed = 'http://127.0.0.1:5001'
  for (const bad of [
    'http://localhost:5001',
    'http://127.0.0.1:5002',
    'file:///etc/passwd',
    'http://user:pass@127.0.0.1:5001',
    'https://example.com',
    'http://127.0.0.1:5001.evil.test',
    'data:text/html,hi'
  ])
    assert.equal(permittedURL(bad, allowed), false)
  assert.equal(permittedURL(`${allowed}/products?q=1`, allowed), true)
  assert.equal(permittedURL('ws://127.0.0.1:5001', allowed), true)
})
test('patch batches enforce hashes and validate all edits before writes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'patchlab-test-'))
  try {
    await fs.mkdir(path.join(dir, 'src'))
    await fs.writeFile(path.join(dir, 'src/a.ts'), 'a')
    await fs.writeFile(path.join(dir, 'src/b.ts'), 'b')
    const baseline = await sourceFiles(dir)
    const allow = new Set(baseline.keys())
    await assert.rejects(
      applyEdits(
        dir,
        [
          { path: 'src/a.ts', content: 'changed', expectedHash: hash('a') },
          { path: 'src/b.ts', content: 'oops', expectedHash: hash('stale') }
        ],
        allow
      ),
      /Stale/
    )
    assert.equal(await fs.readFile(path.join(dir, 'src/a.ts'), 'utf8'), 'a')
    await assert.rejects(
      applyEdits(dir, [{ path: 'package.json', content: '{}', expectedHash: hash('') }], allow)
    )
    await assert.rejects(
      applyEdits(dir, [{ path: 'src/new.ts', content: '', expectedHash: hash('') }], allow)
    )
    await assert.rejects(
      applyEdits(
        dir,
        [{ path: 'src/a.ts', content: 'a'.repeat(65000), expectedHash: hash('a') }],
        allow
      )
    )
    await applyEdits(dir, [{ path: 'src/a.ts', content: 'fixed', expectedHash: hash('a') }], allow)
    const sealed = await collectPatch(baseline, dir)
    assert.equal(sealed.edits.length, 1)
    assert.match(sealed.patch, /\+fixed/)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
test('source symlinks cannot expose external files', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'patchlab-symlink-'))
  try {
    await fs.mkdir(path.join(dir, 'src'))
    await fs.mkdir(path.join(dir, 'secret'))
    await fs.writeFile(path.join(dir, 'secret/token.ts'), 'secret')
    await fs.symlink(
      path.join(dir, 'secret'),
      path.join(dir, 'src/link'),
      process.platform === 'win32' ? 'junction' : 'dir'
    )
    await assert.rejects(sourceFiles(dir))
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
test('missing prices and missing tokens never report zero cost', () => {
  const a = process.env.MODEL_INPUT_PRICE
  const b = process.env.MODEL_OUTPUT_PRICE
  try {
    delete process.env.MODEL_INPUT_PRICE
    delete process.env.MODEL_OUTPUT_PRICE
    assert.equal(cost(100, 200), null)
    process.env.MODEL_INPUT_PRICE = '1'
    process.env.MODEL_OUTPUT_PRICE = '2'
    assert.equal(cost(null, 200), null)
    assert.equal(cost(1_000_000, 500_000), 2)
    process.env.MODEL_INPUT_PRICE = ''
    assert.equal(cost(1_000_000, 500_000), null)
  } finally {
    if (a === undefined) delete process.env.MODEL_INPUT_PRICE
    else process.env.MODEL_INPUT_PRICE = a
    if (b === undefined) delete process.env.MODEL_OUTPUT_PRICE
    else process.env.MODEL_OUTPUT_PRICE = b
  }
})
test('diagnostics redact bearer credentials and named secrets', () => {
  const output = redact('Authorization: Bearer abc.def token=secret123 password:hunter2')
  assert.ok(
    !output.includes('abc.def') && !output.includes('secret123') && !output.includes('hunter2')
  )
})
test('diagnostics redact standalone keys and the configured provider credential', () => {
  const original = config.apiKey
  try {
    config.apiKey = 'custom-provider-credential-not-real'
    const output = redact(
      'Rejected custom-provider-credential-not-real and sk-12345678901234567890'
    )
    assert.ok(!output.includes(config.apiKey) && !output.includes('sk-12345678901234567890'))
    assert.equal(output, 'Rejected [redacted] and [redacted]')
  } finally {
    config.apiKey = original
  }
})
