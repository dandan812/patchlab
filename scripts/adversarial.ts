import { randomUUID } from 'node:crypto'
import { getReferenceEdits, cases } from '../fixtures/catalog.js'
import { store } from '../packages/shared/src/store.js'
import { executeTask } from '../apps/worker/src/execute.js'
import type { Task } from '../packages/shared/src/types.js'

await store.init()
let release: (() => Promise<void>) | undefined
try {
  release = await store.acquireWorker()
} catch (error) {
  throw new Error(
    'Stop the worker before running this maintainer-only adversarial acceptance test. No task was created.',
    { cause: error }
  )
}
try {
  const item = cases.find((c) => c.id === 'products-toolbar')!
  const edits = await getReferenceEdits(item.id)
  // Reviewed CSS-only negative candidate: fixing width while deleting the Reset
  // control passes a scrollbar-only oracle but must fail functional acceptance.
  edits[0].content += '\n.product-toolbar [data-testid="reset-products"] { display: none; }\n'
  const time = new Date().toISOString()
  const task: Task = {
    id: randomUUID(),
    caseId: item.id,
    description:
      '[维护者受控错误补丁测试，非 AI] 修正筛选栏宽度但隐藏 Reset 控件。预期独立验收拒绝，不能判定为成功修复。',
    mode: 'replay',
    strategy: 'C',
    status: 'preparing',
    createdAt: time,
    updatedAt: time,
    cancelRequested: false,
    public: true
  }
  await store.createTask(task)
  await store.event(
    task.id,
    'test.adversarial',
    'Maintainer-only reviewed CSS negative test; not an observed model failure.'
  )
  const detail = await executeTask(task, undefined, edits)
  if (detail?.task.status !== 'failed' || !detail.artifacts.some((a) => a.kind === 'report'))
    throw new Error('Incorrect repair was not rejected through independent acceptance')
  console.log(`Verified rejection of wrong patch. Public task: ${task.id}`)
} finally {
  await release()
  await store.close()
}
