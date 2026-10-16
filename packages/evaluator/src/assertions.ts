import { strict as assert } from 'node:assert'
import type { Locator, Page } from 'playwright'
import type { Assertion } from '../../shared/src/types.js'

type Check = {
  name: string
  run: (page: Page) => Promise<void>
  viewport?: { width: number; height: number }
}
const desktop = { width: 1280, height: 900 }
const phone = { width: 375, height: 667 }
const compact = { width: 320, height: 568 }
const id = (page: Page, name: string): Locator => page.getByTestId(name)
const check = (name: string, run: Check['run'], viewport = desktop): Check => ({
  name,
  run,
  viewport
})

async function text(locator: Locator, expected: string): Promise<void> {
  const until = Date.now() + 2200
  let actual = ''
  do {
    actual = (await locator.textContent({ timeout: 2200 }))?.trim() ?? ''
    if (actual === expected) return
    await new Promise((resolve) => setTimeout(resolve, 40))
  } while (Date.now() < until)
  assert.equal(actual, expected)
}
async function count(locator: Locator, expected: number): Promise<void> {
  const until = Date.now() + 2200
  let actual = 0
  do {
    actual = await locator.count()
    if (actual === expected) return
    await new Promise((resolve) => setTimeout(resolve, 40))
  } while (Date.now() < until)
  assert.equal(actual, expected)
}
async function value(locator: Locator, expected: string): Promise<void> {
  assert.equal(await locator.inputValue(), expected)
}
async function noPageOverflow(page: Page): Promise<void> {
  const sizes = await page.evaluate(() => ({
    viewport: window.innerWidth,
    content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
  }))
  assert.ok(
    sizes.content <= sizes.viewport + 1,
    `Page overflows: ${sizes.content}px content / ${sizes.viewport}px viewport`
  )
}

// Visibility alone is insufficient: reject offscreen, clipped and covered controls.
async function actionable(locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded({ timeout: 2200 })
  const result = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect()
    let left = Math.max(0, box.left),
      top = Math.max(0, box.top)
    let right = Math.min(innerWidth, box.right),
      bottom = Math.min(innerHeight, box.bottom)
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent)
      const bounds = parent.getBoundingClientRect()
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
        left = Math.max(left, bounds.left + parent.clientLeft)
        right = Math.min(right, bounds.left + parent.clientLeft + parent.clientWidth)
      }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
        top = Math.max(top, bounds.top + parent.clientTop)
        bottom = Math.min(bottom, bounds.top + parent.clientTop + parent.clientHeight)
      }
    }
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return {
      width: box.width,
      height: box.height,
      visibleWidth: Math.max(0, right - left),
      visibleHeight: Math.max(0, bottom - top),
      hit: !!hit && (hit === element || element.contains(hit)),
      hidden: getComputedStyle(element).visibility !== 'visible'
    }
  })
  assert.ok(result.width > 0 && result.height > 0 && !result.hidden, 'Control has no visible area')
  assert.ok(
    result.visibleWidth >= result.width - 2 && result.visibleHeight >= result.height - 2,
    `Control is clipped or offscreen: ${JSON.stringify(result)}`
  )
  assert.ok(result.hit, 'Control is obscured by another element')
  await locator.click({ trial: true, timeout: 2200 })
}
async function nonClippingRegion(locator: Locator, axis: 'x' | 'y'): Promise<void> {
  const style = await locator.evaluate((element, requested) => {
    const computed = getComputedStyle(element)
    return requested === 'x' ? computed.overflowX : computed.overflowY
  }, axis)
  assert.ok(
    !['hidden', 'clip'].includes(style),
    `Critical content is concealed by overflow-${axis}: ${style}`
  )
}
async function row(page: Page, product: string): Promise<void> {
  await id(page, `product-row-${product}`).waitFor({ state: 'visible' })
}
async function editProduct(page: Page, product = 'p01'): Promise<void> {
  await id(page, `edit-${product}`).click()
  await id(page, 'product-editor').waitFor({ state: 'visible' })
}
async function editTask(page: Page, task = 't01'): Promise<void> {
  await id(page, `edit-${task}`).click()
  await id(page, 'task-editor').waitFor({ state: 'visible' })
}
async function productError(page: Page, message: string): Promise<void> {
  await id(page, 'save-product').click()
  await text(id(page, 'product-error'), message)
  await id(page, 'product-editor').waitFor({ state: 'visible' })
}
async function taskError(page: Page, message: string): Promise<void> {
  await id(page, 'save-task').click()
  await text(id(page, 'task-error'), message)
  await id(page, 'task-editor').waitFor({ state: 'visible' })
}
async function newTask(page: Page, title: string, due = '2026-10-08'): Promise<void> {
  await id(page, 'new-task').click()
  await id(page, 'task-title').fill(title)
  await id(page, 'task-due').fill(due)
}
async function newProduct(page: Page, name: string, sku = 'QA-900'): Promise<void> {
  await id(page, 'new-product').click()
  await id(page, 'product-name').fill(name)
  await id(page, 'product-sku').fill(sku)
  await id(page, 'product-price').fill('31.25')
  await id(page, 'product-stock').fill('6')
}

const productRegression: Check[] = [
  check('回归：库存列表、分页和未选中产品行', async (page) => {
    await text(id(page, 'product-count'), '15')
    await count(page.locator('[data-testid^="product-row-"]'), 5)
    await row(page, 'p01')
    await id(page, 'next-page').click()
    await row(page, 'p06')
    await text(id(page, 'page-status'), 'Page 2 of 3')
    await id(page, 'previous-page').click()
    await row(page, 'p01')
  }),
  check('回归：产品名称搜索与类别筛选', async (page) => {
    await id(page, 'product-search').fill('  lAmP  ')
    await count(page.locator('[data-testid^="product-row-"]'), 1)
    await row(page, 'p04')
    await id(page, 'product-category').selectOption('Stationery')
    await text(id(page, 'result-count'), '0 results')
    await id(page, 'reset-products').click()
    await text(id(page, 'result-count'), '15 results')
  }),
  check('回归：创建、编辑有效产品并加入订单', async (page) => {
    await newProduct(page, 'Quality Sample')
    await id(page, 'product-supplier').fill('QA Supply')
    await id(page, 'save-product').click()
    await text(id(page, 'product-count'), '16')
    await id(page, 'product-search').fill('Quality Sample')
    const result = page.locator('[data-testid^="product-row-"]')
    await count(result, 1)
    await result.getByRole('button', { name: 'Edit Quality Sample', exact: true }).click()
    await value(id(page, 'product-supplier'), 'QA Supply')
    await id(page, 'product-name').fill('Quality Sample Revised')
    await id(page, 'product-price').fill('40.50')
    await id(page, 'save-product').click()
    await result.getByText('Quality Sample Revised', { exact: true }).waitFor()
    await result
      .getByRole('button', { name: 'Add Quality Sample Revised to order', exact: true })
      .click()
    await text(id(page, 'order-total'), '$40.50')
    await page
      .getByRole('button', { name: 'Remove Quality Sample Revised from order', exact: true })
      .click()
    await text(id(page, 'order-total'), '$0.00')
  })
]
const taskRegression: Check[] = [
  check('回归：初始看板、负责人筛选与任务名称搜索', async (page) => {
    await text(id(page, 'total-tasks'), '8')
    await text(id(page, 'completed-tasks'), '2')
    await text(id(page, 'count-todo'), '3')
    await text(id(page, 'count-doing'), '3')
    await text(id(page, 'count-done'), '2')
    await id(page, 'task-owner-filter').selectOption('Maya')
    await text(id(page, 'task-result-count'), '3 tasks')
    await id(page, 'task-search').fill('  ACCESSIBILITY  ')
    await text(id(page, 'task-result-count'), '1 tasks')
    await id(page, 'task-t04').waitFor()
  }),
  check('回归：创建有效任务并保存编辑结果', async (page) => {
    await newTask(page, 'Quality review')
    await id(page, 'task-owner').selectOption('Noah')
    await id(page, 'task-priority').selectOption('High')
    await id(page, 'task-notes').fill('Review release readiness.')
    await id(page, 'save-task').click()
    await text(id(page, 'total-tasks'), '9')
    await id(page, 'task-search').fill('Quality review')
    const card = page.locator('[data-testid^="task-new-"]')
    await count(card, 1)
    await card.getByRole('button', { name: 'Edit Quality review', exact: true }).click()
    await value(id(page, 'task-owner'), 'Noah')
    await value(id(page, 'task-priority'), 'High')
    await value(id(page, 'task-notes'), 'Review release readiness.')
    await id(page, 'task-title').fill('Quality review revised')
    await id(page, 'save-task').click()
    await card.getByText('Quality review revised', { exact: true }).waitFor()
  }),
  check('回归：删除单个任务不影响其他任务', async (page) => {
    await id(page, 'delete-t03').click()
    await text(id(page, 'total-tasks'), '7')
    await count(id(page, 'task-t03'), 0)
    for (const task of ['t01', 't02', 't04', 't05', 't06', 't07', 't08'])
      await id(page, `task-${task}`).waitFor()
    await text(id(page, 'completed-tasks'), '2')
  }),
  check('回归：新建任务和状态修改在刷新后保留', async (page) => {
    await newTask(page, 'Persisted delivery review')
    await id(page, 'task-owner').selectOption('Noah')
    await id(page, 'task-priority').selectOption('High')
    await id(page, 'task-notes').fill('Carry these changes across a refresh.')
    await id(page, 'save-task').click()
    await text(id(page, 'total-tasks'), '9')
    const card = page.locator('[data-testid^="task-new-"]')
    await count(card, 1)
    const taskId = (await card.getAttribute('data-testid'))!.slice('task-'.length)
    await id(page, `status-${taskId}`).selectOption('Doing')
    await id(page, 'column-doing').getByTestId(`task-${taskId}`).waitFor()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await text(id(page, 'total-tasks'), '9')
    await id(page, 'column-doing').getByTestId(`task-${taskId}`).waitFor()
    await text(id(page, `title-${taskId}`), 'Persisted delivery review')
    await id(page, `edit-${taskId}`).click()
    await value(id(page, 'task-owner'), 'Noah')
    await value(id(page, 'task-priority'), 'High')
    await value(id(page, 'task-due'), '2026-10-08')
    await value(id(page, 'task-notes'), 'Carry these changes across a refresh.')
    await id(page, 'cancel-task').click()
    await id(page, `delete-${taskId}`).click()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await text(id(page, 'total-tasks'), '8')
    await count(id(page, `task-${taskId}`), 0)
  }),
  check('回归：存储数据无效时安全恢复初始任务', async (page) => {
    for (const payload of ['not json', '{}', '[{"id":"broken"}]']) {
      await page.evaluate((value) => localStorage.setItem('teamflow.tasks.v1', value), payload)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await text(id(page, 'total-tasks'), '8')
      await text(id(page, 'title-t01'), 'Prepare release brief')
    }
    await page.evaluate(() => localStorage.setItem('teamflow.tasks.v1', '[]'))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await text(id(page, 'total-tasks'), '0')
  })
]

async function productToolbar(page: Page): Promise<void> {
  await noPageOverflow(page)
  for (const name of ['product-search', 'product-category', 'reset-products', 'new-product'])
    await actionable(id(page, name))
  await id(page, 'product-search').fill('Lamp')
  await id(page, 'product-category').selectOption('Equipment')
  await text(id(page, 'result-count'), '1 results')
  await row(page, 'p04')
  await actionable(id(page, 'reset-products'))
  await id(page, 'reset-products').click()
  await text(id(page, 'result-count'), '15 results')
  await noPageOverflow(page)
}
async function productDialog(page: Page): Promise<void> {
  await id(page, 'new-product').click()
  await noPageOverflow(page)
  await nonClippingRegion(id(page, 'product-editor'), 'y')
  for (const name of [
    'product-name',
    'product-sku',
    'editor-category',
    'product-price',
    'product-stock',
    'product-supplier',
    'product-note',
    'cancel-product',
    'save-product'
  ])
    await actionable(id(page, name))
  await id(page, 'product-name').fill('Mobile Product')
  await id(page, 'product-sku').fill('MB-001')
  await id(page, 'product-price').fill('21.50')
  await id(page, 'product-stock').fill('4')
  await id(page, 'product-supplier').fill('Mobile Supply')
  await id(page, 'save-product').click()
  await text(id(page, 'product-count'), '16')
  await id(page, 'product-search').fill('Mobile Product')
  const result = page.locator('[data-testid^="product-row-"]')
  await result.getByRole('button', { name: 'Edit Mobile Product', exact: true }).click()
  await value(id(page, 'product-supplier'), 'Mobile Supply')
  await actionable(id(page, 'cancel-product'))
  await id(page, 'cancel-product').click()
  await count(id(page, 'product-editor'), 0)
}
async function productTable(page: Page): Promise<void> {
  await noPageOverflow(page)
  await nonClippingRegion(id(page, 'product-table-scroll'), 'x')
  await actionable(id(page, 'edit-p01'))
  await id(page, 'edit-p01').click()
  await value(id(page, 'product-name'), 'Studio Monitor')
  await id(page, 'cancel-product').click()
  await actionable(id(page, 'order-p01'))
  await id(page, 'order-p01').click()
  await text(id(page, 'order-total'), '$249.00')
  await actionable(id(page, 'select-p01'))
  await id(page, 'select-p01').check()
  await text(id(page, 'selected-count'), '1 selected')
  await noPageOverflow(page)
}
async function taskToolbar(page: Page): Promise<void> {
  await noPageOverflow(page)
  for (const name of [
    'task-search',
    'task-owner-filter',
    'task-priority-filter',
    'task-sort',
    'reset-tasks',
    'new-task'
  ])
    await actionable(id(page, name))
  await id(page, 'task-search').fill('Audit')
  await id(page, 'task-owner-filter').selectOption('Noah')
  await id(page, 'task-priority-filter').selectOption('High')
  await text(id(page, 'task-result-count'), '1 tasks')
  await id(page, 'task-sort').selectOption('priority')
  await id(page, 'reset-tasks').click()
  await text(id(page, 'task-result-count'), '8 tasks')
  await noPageOverflow(page)
}
async function taskDialog(page: Page): Promise<void> {
  await id(page, 'new-task').click()
  await noPageOverflow(page)
  await nonClippingRegion(id(page, 'task-editor'), 'y')
  for (const name of [
    'task-title',
    'task-owner',
    'task-priority',
    'task-status',
    'task-due',
    'task-notes',
    'cancel-task',
    'save-task'
  ])
    await actionable(id(page, name))
  await id(page, 'task-title').fill('Mobile planning')
  await id(page, 'task-due').fill('2026-10-06')
  await id(page, 'task-notes').fill('Discuss next release.')
  await id(page, 'save-task').click()
  await text(id(page, 'total-tasks'), '9')
  await id(page, 'task-search').fill('Mobile planning')
  await page.getByRole('button', { name: 'Edit Mobile planning', exact: true }).click()
  await value(id(page, 'task-notes'), 'Discuss next release.')
  await actionable(id(page, 'cancel-task'))
  await id(page, 'cancel-task').click()
  await count(id(page, 'task-editor'), 0)
}
async function taskBoard(page: Page): Promise<void> {
  await noPageOverflow(page)
  for (const task of ['t01', 't04', 't06']) {
    await actionable(id(page, `edit-${task}`))
    await actionable(id(page, `status-${task}`))
    await actionable(id(page, `delete-${task}`))
  }
  await id(page, 'status-t04').selectOption('Done')
  await id(page, 'column-done').getByTestId('task-t04').waitFor()
  await text(id(page, 'count-doing'), '2')
  await text(id(page, 'count-done'), '3')
  await actionable(id(page, 'edit-t04'))
  await id(page, 'edit-t04').click()
  await value(id(page, 'task-status'), 'Done')
  await id(page, 'cancel-task').click()
  await noPageOverflow(page)
  if ((page.viewportSize()?.width ?? 0) > 700) {
    const boxes = await Promise.all(
      ['todo', 'doing', 'done'].map((status) => id(page, `column-${status}`).boundingBox())
    )
    assert.ok(boxes.every(Boolean), 'Missing desktop columns')
    assert.ok(
      Math.abs(boxes[0]!.y - boxes[1]!.y) <= 2 && Math.abs(boxes[1]!.y - boxes[2]!.y) <= 2,
      'Desktop columns must remain side by side'
    )
    assert.ok(
      boxes[0]!.x < boxes[1]!.x && boxes[1]!.x < boxes[2]!.x,
      'Desktop column order changed'
    )
  }
}
function layoutChecks(label: string, run: Check['run']): Check[] {
  return [
    check(`${label}：375 像素宽手机`, run, phone),
    check(`${label}：320 像素宽矮屏手机`, run, compact),
    check(`${label}：桌面端回归`, run, desktop)
  ]
}

// Independent behavioral oracle: no template predicates, mutation data or reference imports.
const acceptance: Record<string, Check[]> = {
  'products-pagination': [
    check('在第三页按类别筛选后，显示第一页匹配产品', async (page) => {
      await id(page, 'next-page').click()
      await id(page, 'next-page').click()
      await text(id(page, 'page-status'), 'Page 3 of 3')
      await id(page, 'product-category').selectOption('Equipment')
      await text(id(page, 'page-status'), 'Page 1 of 1')
      for (const product of ['p01', 'p04', 'p07', 'p10', 'p13']) await row(page, product)
      await text(id(page, 'result-count'), '5 results')
      assert.ok(await id(page, 'next-page').isDisabled())
    }),
    check('在第三页搜索后回到第一页，清除筛选后恢复分页', async (page) => {
      await id(page, 'next-page').click()
      await id(page, 'next-page').click()
      await id(page, 'product-search').fill('Grid Notebook')
      await text(id(page, 'page-status'), 'Page 1 of 1')
      await row(page, 'p02')
      await id(page, 'reset-products').click()
      await text(id(page, 'page-status'), 'Page 1 of 3')
      await id(page, 'next-page').click()
      await row(page, 'p06')
    })
  ],
  'products-price': [
    check('拒绝零和负数价格，不提交修改', async (page) => {
      await editProduct(page)
      for (const price of ['0', '-1']) {
        await id(page, 'product-price').fill(price)
        await productError(page, 'Price must be greater than zero')
      }
      await id(page, 'cancel-product').click()
      await text(id(page, 'price-p01'), '$249.00')
    }),
    check('正数小数价格可以保存，重新编辑时正确显示', async (page) => {
      await editProduct(page)
      await id(page, 'product-price').fill('19.95')
      await id(page, 'save-product').click()
      await text(id(page, 'price-p01'), '$19.95')
      await editProduct(page)
      await value(id(page, 'product-price'), '19.95')
    })
  ],
  'products-cancel': [
    check('取消编辑后丢弃产品名称、价格和库存修改', async (page) => {
      await editProduct(page)
      await id(page, 'product-name').fill('Discarded product')
      await id(page, 'product-price').fill('8.75')
      await id(page, 'product-stock').fill('3')
      await id(page, 'cancel-product').click()
      await id(page, 'product-row-p01').getByText('Studio Monitor', { exact: true }).waitFor()
      await text(id(page, 'price-p01'), '$249.00')
      await text(id(page, 'stock-p01'), '12')
      await editProduct(page)
      await value(id(page, 'product-name'), 'Studio Monitor')
    }),
    check('按 Escape 键或点击关闭按钮均丢弃各自草稿', async (page) => {
      await editProduct(page)
      await id(page, 'product-name').fill('Escape draft')
      await page.keyboard.press('Escape')
      await count(id(page, 'product-editor'), 0)
      await editProduct(page)
      await value(id(page, 'product-name'), 'Studio Monitor')
      await id(page, 'product-price').fill('5')
      await id(page, 'close-product-editor').click()
      await text(id(page, 'price-p01'), '$249.00')
    })
  ],
  'products-order-total': [
    check('修改数量或移除订单项后，单项金额与订单总额正确更新', async (page) => {
      await id(page, 'order-p02').click()
      await id(page, 'quantity-p02').fill('3')
      await text(id(page, 'line-total-p02'), '$36.00')
      await text(id(page, 'order-total'), '$36.00')
      await id(page, 'order-p03').click()
      await id(page, 'quantity-p03').fill('2')
      await text(id(page, 'line-total-p03'), '$36.00')
      await text(id(page, 'order-total'), '$72.00')
      await id(page, 'remove-order-p02').click()
      await text(id(page, 'order-total'), '$36.00')
      await id(page, 'remove-order-p03').click()
      await text(id(page, 'order-total'), '$0.00')
    }),
    check('重复加入同一产品时增加原订单项数量', async (page) => {
      await id(page, 'order-p02').click()
      await id(page, 'order-p02').click()
      await value(id(page, 'quantity-p02'), '2')
      await text(id(page, 'order-total'), '$24.00')
      await count(page.locator('[data-testid^="order-line-"]'), 1)
    })
  ],
  'products-toolbar': layoutChecks('库存筛选控件可用性', productToolbar),
  'products-editor-scroll': layoutChecks('产品表单控件可访问性', productDialog),
  'tasks-due-date': [
    check('新任务拒绝早于基准日或为空的截止日期，允许基准日当天', async (page) => {
      await newTask(page, 'Plan supplier review', '2026-09-30')
      await taskError(page, 'Due date must be 2026-10-01 or later')
      await id(page, 'task-due').fill('')
      await taskError(page, 'Due date must be 2026-10-01 or later')
      await id(page, 'task-due').fill('2026-10-01')
      await id(page, 'save-task').click()
      await text(id(page, 'total-tasks'), '9')
      await page.getByText('Plan supplier review', { exact: true }).waitFor()
    }),
    check('调整截止日期时拒绝过去日期，保留历史日期时允许编辑', async (page) => {
      await editTask(page, 't02')
      await id(page, 'task-notes').fill('Contract review pending.')
      await id(page, 'save-task').click()
      await id(page, 'task-t02').getByText('Contract review pending.', { exact: true }).waitFor()
      await editTask(page, 't02')
      await id(page, 'task-due').fill('2026-09-27')
      await taskError(page, 'Due date must be 2026-10-01 or later')
      await id(page, 'task-due').fill('2026-10-09')
      await id(page, 'save-task').click()
      await id(page, 'task-t02').getByText('2026-10-09', { exact: true }).waitFor()
    })
  ],
  'tasks-cancel': [
    check('取消编辑后丢弃任务标题、负责人和备注修改', async (page) => {
      await editTask(page)
      await id(page, 'task-title').fill('Discarded task')
      await id(page, 'task-owner').selectOption('Noah')
      await id(page, 'task-notes').fill('Draft notes')
      await id(page, 'cancel-task').click()
      await text(id(page, 'title-t01'), 'Prepare release brief')
      await editTask(page)
      await value(id(page, 'task-owner'), 'Maya')
      await value(id(page, 'task-notes'), 'Summarize release changes for the support team.')
    }),
    check('按 Escape 键后丢弃任务优先级和截止日期修改', async (page) => {
      await editTask(page)
      await id(page, 'task-priority').selectOption('High')
      await id(page, 'task-due').fill('2026-10-20')
      await page.keyboard.press('Escape')
      await count(id(page, 'task-editor'), 0)
      await editTask(page)
      await value(id(page, 'task-priority'), 'Low')
      await value(id(page, 'task-due'), '2026-10-05')
    })
  ],
  'tasks-status': [
    check('修改状态只移动对应卡片，并更新统计数量', async (page) => {
      await id(page, 'status-t01').selectOption('Doing')
      await id(page, 'column-doing').getByTestId('task-t01').waitFor()
      await text(id(page, 'count-todo'), '2')
      await text(id(page, 'count-doing'), '4')
      await id(page, 'status-t01').selectOption('Done')
      await id(page, 'column-done').getByTestId('task-t01').waitFor()
      await text(id(page, 'completed-tasks'), '3')
      await text(id(page, 'count-doing'), '3')
      await id(page, 'status-t01').selectOption('Todo')
      await id(page, 'column-todo').getByTestId('task-t01').waitFor()
      await text(id(page, 'completed-tasks'), '2')
      await text(id(page, 'total-tasks'), '8')
      await count(page.locator('[data-testid="task-t01"]'), 1)
      await id(page, 'column-todo').getByTestId('task-t02').waitFor()
    }),
    check('编辑器保存的状态与看板直接修改的状态保持一致', async (page) => {
      await editTask(page)
      await id(page, 'task-status').selectOption('Doing')
      await id(page, 'save-task').click()
      await id(page, 'column-doing').getByTestId('task-t01').waitFor()
      await id(page, 'status-t01').selectOption('Done')
      await editTask(page)
      await value(id(page, 'task-status'), 'Done')
    })
  ],
  'tasks-filter-reset': [
    check('重置清除组合筛选，并恢复全部初始任务卡片', async (page) => {
      await id(page, 'task-owner-filter').selectOption('Noah')
      await id(page, 'task-priority-filter').selectOption('High')
      await id(page, 'task-search').fill('Audit')
      await text(id(page, 'task-result-count'), '1 tasks')
      await id(page, 'reset-tasks').click()
      await value(id(page, 'task-search'), '')
      await value(id(page, 'task-owner-filter'), 'All')
      await value(id(page, 'task-priority-filter'), 'All')
      await text(id(page, 'task-result-count'), '8 tasks')
      for (let number = 1; number <= 8; number++) await id(page, `task-t0${number}`).waitFor()
    }),
    check('无匹配结果时重置恢复任务，筛选仍可再次使用', async (page) => {
      await id(page, 'task-search').fill('not a task')
      await id(page, 'task-priority-filter').selectOption('Low')
      await text(id(page, 'task-result-count'), '0 tasks')
      await id(page, 'reset-tasks').click()
      await text(id(page, 'task-result-count'), '8 tasks')
      await id(page, 'task-priority-filter').selectOption('Medium')
      await text(id(page, 'task-result-count'), '2 tasks')
    })
  ],
  'tasks-toolbar': layoutChecks('任务筛选控件可用性', taskToolbar),
  'tasks-editor-width': layoutChecks('任务表单控件可访问性', taskDialog),
  'products-sku-search': [
    check('商品编码搜索忽略首尾空白和大小写', async (page) => {
      await id(page, 'product-search').fill('  ac-103  ')
      await text(id(page, 'result-count'), '1 results')
      await row(page, 'p03')
      await count(page.locator('[data-testid^="product-row-"]'), 1)
    }),
    check('部分商品编码搜索可与类别筛选组合，名称搜索仍有效', async (page) => {
      await id(page, 'product-search').fill('EQ-1')
      await text(id(page, 'result-count'), '5 results')
      for (const product of ['p01', 'p04', 'p07', 'p10', 'p13']) await row(page, product)
      await id(page, 'product-category').selectOption('Stationery')
      await text(id(page, 'result-count'), '0 results')
      await id(page, 'reset-products').click()
      await id(page, 'product-search').fill('Lamp')
      await row(page, 'p04')
    })
  ],
  'products-stock-integer': [
    check('拒绝小数和负数库存，不更新库存数据', async (page) => {
      await editProduct(page)
      for (const stock of ['2.5', '-1']) {
        await id(page, 'product-stock').fill(stock)
        await productError(page, 'Stock must be a non-negative whole number')
      }
      await id(page, 'cancel-product').click()
      await text(id(page, 'stock-p01'), '12')
    }),
    check('零库存时禁用加入订单，正整数库存时恢复操作', async (page) => {
      await editProduct(page)
      await id(page, 'product-stock').fill('0')
      await id(page, 'save-product').click()
      await text(id(page, 'stock-p01'), '0')
      assert.ok(await id(page, 'order-p01').isDisabled())
      await editProduct(page)
      await id(page, 'product-stock').fill('7')
      await id(page, 'save-product').click()
      await text(id(page, 'stock-p01'), '7')
      assert.ok(await id(page, 'order-p01').isEnabled())
    })
  ],
  'products-bulk-selection': [
    check('批量删除移除全部跨页选中产品，不影响其他产品', async (page) => {
      await id(page, 'select-p01').check()
      await id(page, 'select-p02').check()
      await id(page, 'next-page').click()
      await id(page, 'select-p07').check()
      await text(id(page, 'selected-count'), '3 selected')
      await id(page, 'delete-selected').click()
      await text(id(page, 'product-count'), '12')
      await count(id(page, 'selected-count'), 0)
      for (const sku of ['EQ-101', 'ST-102', 'EQ-107']) {
        await id(page, 'product-search').fill(sku)
        await text(id(page, 'result-count'), '0 results')
      }
      for (const sku of ['AC-103', 'EQ-104', 'AC-115']) {
        await id(page, 'product-search').fill(sku)
        await text(id(page, 'result-count'), '1 results')
      }
      await id(page, 'reset-products').click()
      await text(id(page, 'page-status'), 'Page 1 of 3')
      await id(page, 'next-page').click()
      await count(page.locator('[data-testid^="product-row-"]'), 5)
    }),
    check('清空选择和取消勾选后，未选中产品不会被删除', async (page) => {
      await id(page, 'select-p01').check()
      await id(page, 'select-p02').check()
      await id(page, 'select-p01').uncheck()
      await text(id(page, 'selected-count'), '1 selected')
      await id(page, 'delete-selected').click()
      await text(id(page, 'product-count'), '14')
      await row(page, 'p01')
      await count(id(page, 'product-row-p02'), 0)
      await id(page, 'select-p01').check()
      await page.getByRole('button', { name: 'Clear selection', exact: true }).click()
      await count(id(page, 'delete-selected'), 0)
      assert.ok(!(await id(page, 'select-p01').isChecked()))
    })
  ],
  'products-table-actions': layoutChecks('库存表格行操作可访问性', productTable),
  'tasks-priority-sort': [
    check('每个看板列内按高、中、低优先级排序', async (page) => {
      await id(page, 'task-sort').selectOption('priority')
      for (const [column, expected] of [
        ['todo', ['task-t02', 'task-t03', 'task-t01']],
        ['doing', ['task-t04', 'task-t05', 'task-t08']],
        ['done', ['task-t07', 'task-t06']]
      ] as Array<[string, string[]]>) {
        const actual = await id(page, `column-${column}`)
          .locator('article')
          .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-testid')))
        assert.deepEqual(actual, expected)
      }
      await id(page, 'task-owner-filter').selectOption('Maya')
      await text(id(page, 'task-result-count'), '3 tasks')
      await id(page, 'task-t04').waitFor()
    }),
    check('同优先级任务顺序稳定，且可恢复原看板顺序', async (page) => {
      await newTask(page, 'Another urgent task')
      await id(page, 'task-priority').selectOption('High')
      await id(page, 'save-task').click()
      await id(page, 'task-sort').selectOption('priority')
      const titles = await id(page, 'column-todo').locator('h4').allTextContents()
      assert.deepEqual(titles, [
        'Audit supplier contracts',
        'Another urgent task',
        'Update onboarding checklist',
        'Prepare release brief'
      ])
      await id(page, 'task-sort').selectOption('manual')
      assert.deepEqual(await id(page, 'column-todo').locator('h4').allTextContents(), [
        'Prepare release brief',
        'Audit supplier contracts',
        'Update onboarding checklist',
        'Another urgent task'
      ])
    })
  ],
  'tasks-title-trim': [
    check('拒绝仅含空白或靠首尾空格凑长的短标题', async (page) => {
      await newTask(page, '   ')
      await taskError(page, 'Title must contain at least 3 non-padding characters')
      await id(page, 'task-title').fill('  AB  ')
      await taskError(page, 'Title must contain at least 3 non-padding characters')
      await id(page, 'cancel-task').click()
      await text(id(page, 'total-tasks'), '8')
    }),
    check('有效标题去除首尾空白后保存，且仍可搜索', async (page) => {
      await newTask(page, '  Draft review  ')
      await id(page, 'save-task').click()
      await text(id(page, 'total-tasks'), '9')
      await id(page, 'task-search').fill('draft review')
      const title = page.locator('[data-testid^="task-new-"] h4')
      assert.equal(await title.textContent(), 'Draft review')
      await page.getByRole('button', { name: 'Edit Draft review', exact: true }).click()
      await value(id(page, 'task-title'), 'Draft review')
    })
  ],
  'tasks-overdue-summary': [
    check('逾期统计排除已完成任务和基准日当天到期的任务', async (page) => {
      await text(id(page, 'reporting-date'), '2026-10-01')
      await text(id(page, 'overdue-tasks'), '2')
      await text(id(page, 'completed-tasks'), '2')
      await count(id(page, 'task-t04').locator('.overdue'), 0)
      await count(id(page, 'task-t06').locator('.overdue'), 0)
      await count(id(page, 'task-t02').locator('.overdue'), 1)
    }),
    check('完成历史任务或恢复为未完成后，重新计算逾期汇总', async (page) => {
      await id(page, 'status-t02').selectOption('Done')
      await text(id(page, 'overdue-tasks'), '1')
      await text(id(page, 'completed-tasks'), '3')
      await id(page, 'status-t02').selectOption('Todo')
      await text(id(page, 'overdue-tasks'), '2')
      await id(page, 'status-t06').selectOption('Doing')
      await text(id(page, 'overdue-tasks'), '3')
      await text(id(page, 'completed-tasks'), '1')
    })
  ],
  'tasks-board-columns': layoutChecks('全部看板列及卡片操作可访问性', taskBoard)
}

function baseURL(page: Page): string {
  const url = new URL(page.url())
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Acceptance requires a page already navigated to the running fixture URL')
  return new URL('/', url).href
}
async function resetScenario(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 })
}

export async function evaluateCase(
  caseId: string,
  page: Page,
  options: {
    signal?: AbortSignal
    onResult?: (assertion: Assertion) => void
    onFailure?: (assertion: Assertion, index: number, page: Page) => Promise<void>
  } = {}
): Promise<Assertion[]> {
  options.signal?.throwIfAborted()
  const specific = acceptance[caseId]
  if (!specific)
    return [{ name: '验收案例有效性', passed: false, detail: `Unknown case: ${caseId}` }]
  let url: string
  try {
    url = baseURL(page)
  } catch (error) {
    return [{ name: '示例应用地址有效性', passed: false, detail: String(error) }]
  }
  const results: Assertion[] = []
  const checks = [
    ...specific,
    ...(caseId.startsWith('products-') ? productRegression : taskRegression)
  ]
  const previousViewport = page.viewportSize()
  page.setDefaultTimeout(2500)
  try {
    for (const current of checks) {
      options.signal?.throwIfAborted()
      let result: Assertion
      try {
        await page.setViewportSize(current.viewport ?? desktop)
        await resetScenario(page, url)
        await id(page, caseId.startsWith('products-') ? 'new-product' : 'new-task').waitFor()
        await current.run(page)
        options.signal?.throwIfAborted()
        result = { name: current.name, passed: true, viewport: current.viewport ?? desktop }
      } catch (error) {
        options.signal?.throwIfAborted()
        if (page.isClosed() || !page.context().browser()?.isConnected()) throw error
        result = {
          name: current.name,
          passed: false,
          viewport: current.viewport ?? desktop,
          detail:
            error instanceof Error ? error.message.slice(0, 3000) : String(error).slice(0, 3000)
        }
        await options.onFailure?.(result, results.length, page)
      }
      results.push(result)
      options.onResult?.(result)
    }
  } finally {
    if (previousViewport && !page.isClosed()) {
      await page.setViewportSize(previousViewport).catch(() => undefined)
    }
  }
  return results
}

export async function reproduceCase(caseId: string, page: Page): Promise<void> {
  if (!acceptance[caseId]) throw new Error(`Unknown acceptance case: ${caseId}`)
  const mobile = [
    'products-toolbar',
    'products-editor-scroll',
    'products-table-actions',
    'tasks-toolbar',
    'tasks-editor-width',
    'tasks-board-columns'
  ].includes(caseId)
  await page.setViewportSize(mobile ? phone : desktop)
  await resetScenario(page, baseURL(page))
  switch (caseId) {
    case 'products-pagination':
      await id(page, 'next-page').click()
      await id(page, 'next-page').click()
      await id(page, 'product-category').selectOption('Equipment')
      break
    case 'products-price':
      await editProduct(page)
      await id(page, 'product-price').fill('0')
      await id(page, 'save-product').click()
      break
    case 'products-cancel':
      await editProduct(page)
      await id(page, 'product-name').fill('Draft monitor')
      await id(page, 'product-price').fill('8.75')
      await id(page, 'cancel-product').click()
      break
    case 'products-order-total':
      await id(page, 'order-p02').click()
      await id(page, 'quantity-p02').fill('3')
      await id(page, 'order-p03').click()
      break
    case 'products-toolbar':
      break
    case 'products-editor-scroll':
      await editProduct(page)
      break
    case 'products-sku-search':
      await id(page, 'product-search').fill('  ac-103  ')
      break
    case 'products-stock-integer':
      await editProduct(page)
      await id(page, 'product-stock').fill('2.5')
      await id(page, 'save-product').click()
      break
    case 'products-bulk-selection':
      await id(page, 'select-p01').check()
      await id(page, 'select-p02').check()
      await id(page, 'delete-selected').click()
      break
    case 'products-table-actions':
      await id(page, 'product-table-scroll').evaluate((element) => {
        element.scrollLeft = element.scrollWidth
      })
      break
    case 'tasks-due-date':
      await newTask(page, 'Plan supplier review', '2026-09-30')
      await id(page, 'save-task').click()
      break
    case 'tasks-cancel':
      await editTask(page)
      await id(page, 'task-title').fill('Draft release task')
      await id(page, 'cancel-task').click()
      break
    case 'tasks-status':
      await id(page, 'status-t01').selectOption('Doing')
      break
    case 'tasks-filter-reset':
      await id(page, 'task-owner-filter').selectOption('Noah')
      await id(page, 'task-priority-filter').selectOption('High')
      await id(page, 'task-search').fill('Audit')
      await id(page, 'reset-tasks').click()
      break
    case 'tasks-toolbar':
      break
    case 'tasks-editor-width':
      await id(page, 'new-task').click()
      break
    case 'tasks-priority-sort':
      await id(page, 'task-sort').selectOption('priority')
      break
    case 'tasks-title-trim':
      await newTask(page, '   ')
      await id(page, 'save-task').click()
      break
    case 'tasks-overdue-summary':
      break
    case 'tasks-board-columns':
      break
  }
}
