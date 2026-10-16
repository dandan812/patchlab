import assert from 'node:assert/strict'
import { config } from '../packages/shared/src/config.js'
import { redact } from '../packages/sandbox/src/index.js'

try {
  assert.ok(config.apiKey && config.model, 'Configure a server-side model key and MODEL_ID first')
  const base = new URL(config.baseUrl || 'https://api.openai.com/v1')
  assert.equal(base.protocol, 'https:', 'Model discovery requires HTTPS')
  assert.ok(
    !base.username && !base.password && !base.search && !base.hash,
    'Invalid model base URL'
  )
  const url = new URL(`${base.pathname.replace(/\/$/, '')}/models`, base.origin)
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.apiKey}`, Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000)
  })
  assert.equal(response.status, 200, `Model discovery returned HTTP ${response.status}`)
  const body = (await response.json()) as { data?: Array<{ id?: string }> }
  assert.ok(Array.isArray(body.data), 'Model discovery did not return a model list')
  assert.ok(
    body.data.some((item) => item.id === config.model),
    'The configured model is not advertised for this key'
  )
  console.log(
    JSON.stringify({
      provider: base.origin,
      model: config.model,
      apiType: config.modelApiType,
      credentialsAccepted: true,
      modelAdvertised: true,
      inferenceTested: false,
      toolsTested: false
    })
  )
} catch (error) {
  console.error(redact(error instanceof Error ? error.message : String(error)))
  process.exitCode = 1
}
