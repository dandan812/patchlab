import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cases } from '../fixtures/catalog.js'
import { assertionName, taskDescription } from '../apps/web/src/localization.js'
import type { Task } from '../packages/shared/src/types.js'

test('known legacy case text is localized without rewriting original tasks or custom descriptions', () => {
  const legacy =
    'Filtering inventory while viewing page three leaves an empty result view. A changed search or category should start on the first matching page, with accurate results and usable pagination.'
  const task = { caseId: 'products-pagination', description: legacy } as Task
  const info = cases.find((item) => item.id === task.caseId)!
  assert.equal(taskDescription(task, info), info.description)
  assert.equal(task.description, legacy)
  assert.equal(taskDescription(task), legacy)
  const custom = { ...task, description: `${legacy} Additional task-specific evidence.` }
  assert.equal(taskDescription(custom, info), custom.description)
})

test('legacy assertion display preserves unknown names and underlying results', () => {
  assert.equal(
    assertionName('Regression: name search and category filters'),
    '回归：产品名称搜索与类别筛选'
  )
  assert.equal(assertionName('Unknown original assertion'), 'Unknown original assertion')
})
