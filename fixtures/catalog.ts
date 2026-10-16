import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CaseInfo } from '../packages/shared/src/types.js'

const root = dirname(fileURLToPath(import.meta.url))
interface Mutation {
  path: string
  from: string
  to: string
}
interface Entry {
  info: CaseInfo
  mutation: Mutation
}
function entry(
  id: string,
  app: CaseInfo['app'],
  split: CaseInfo['split'],
  category: CaseInfo['category'],
  title: string,
  description: string,
  steps: string[],
  criteria: string[],
  path: string,
  from: string,
  to: string
): Entry {
  return {
    info: { id, app, split, category, title, description, steps, criteria },
    mutation: { path, from, to }
  }
}

// Supervisor-only catalog. Materialization copies the wrapper and src, never this file.
const entries: Entry[] = [
  entry(
    'products-pagination',
    'products',
    'dev',
    'state',
    '在第三页筛选后结果为空',
    '在库存列表第三页进行筛选后，结果区域变为空白。修改搜索条件或产品类别时，应回到筛选结果的第一页，正确显示匹配产品，并保持分页功能正常。',
    [
      '打开 Inventory（库存）页面，点击 Next page（下一页）翻到第 3 页。',
      '在 Category（类别）中选择 Equipment（设备）。',
      '点击 Reset（重置）清除筛选，再搜索 Grid Notebook（网格笔记本）。'
    ],
    ['修改搜索条件或类别筛选后，均回到第 1 页。', '匹配产品正常显示，分页状态与翻页操作保持一致。'],
    'src/App.vue',
    'watch([query, category], () => { page.value = 1; });',
    'watch([query, category], () => { /* Keep the current page. */ });'
  ),
  entry(
    'products-price',
    'products',
    'dev',
    'form',
    '产品价格不能为零',
    '产品编辑器允许保存价格为零的产品。价格必须是大于零的有限数值；无效修改不能保存，正数小数价格仍应正常保存。',
    [
      '编辑 Studio Monitor（显示器）产品。',
      '在 Price ($)（美元价格）中输入 0，点击 Save product（保存产品）。',
      '将价格改为 19.95，再点击 Save product（保存产品）。'
    ],
    [
      '价格为零或负数时显示错误提示，且编辑器不关闭。',
      '正数小数价格可以保存，并正确显示在库存列表中。'
    ],
    'src/components/ProductEditor.vue',
    'Number(draft.price) <= 0',
    'Number(draft.price) < 0'
  ),
  entry(
    'products-cancel',
    'products',
    'dev',
    'state',
    '取消编辑应丢弃产品草稿',
    '修改产品字段后，即使取消编辑，库存行也会被意外更新。取消或关闭编辑器时必须丢弃草稿；点击 Save product（保存产品）时仍应正常提交修改。',
    [
      '编辑 Studio Monitor（显示器），修改 Name（名称）和 Price ($)（美元价格）。',
      '点击 Cancel（取消），检查对应的库存行。',
      '重新打开编辑器，修改字段后按 Escape 键关闭。'
    ],
    ['取消或关闭编辑器后，草稿修改不会影响库存数据。', '保存修改时，只更新正在编辑的产品。'],
    'src/components/ProductEditor.vue',
    'const draft = reactive({ ...(props.product ?? blank) });',
    'const draft = reactive(props.product ?? blank);'
  ),
  entry(
    'products-order-total',
    'products',
    'dev',
    'state',
    '采购订单金额应随数量变化',
    '采购订单金额没有随订购数量增加。每项金额应等于单价乘以数量，订单总额应等于所有订单项金额之和。',
    [
      '将 Grid Notebook（网格笔记本）加入订单。',
      '将该产品的订购数量改为 3。',
      '将 Cable Organizer（理线器）加入订单，再移除 Grid Notebook（网格笔记本）订单项。'
    ],
    ['修改数量后，订单项金额和订单总额均正确更新。', '移除订单项后，剩余订单总额仍然正确。'],
    'src/model.ts',
    'return price * quantity;',
    'return price;'
  ),
  entry(
    'products-toolbar',
    'products',
    'dev',
    'layout',
    '手机端库存筛选栏溢出',
    '在窄屏手机上，库存筛选栏超出页面宽度。搜索框、类别筛选和 Reset（重置）按钮应保持可见且可操作，不能通过隐藏溢出内容来掩盖问题，并应保留桌面端工具栏的正常布局。',
    [
      '将视口宽度设为 375 像素，查看 Inventory（库存）页面。',
      '搜索 Lamp（台灯关键字），并在 Category（类别）中选择 Equipment（设备）。',
      '点击 Reset（重置），再切换到桌面尺寸检查库存页面。'
    ],
    ['页面没有横向溢出。', '手机端和桌面端的所有筛选控件及重置按钮均可见、可操作。'],
    'src/styles/toolbar.css',
    '.product-toolbar { width: 100%; }',
    '.product-toolbar { width: 680px; }'
  ),
  entry(
    'products-editor-scroll',
    'products',
    'dev',
    'layout',
    '产品编辑器底部控件被裁切',
    '产品编辑器的底部字段和保存按钮被裁切，较矮屏幕上尤为明显。表单应能在视口内滚动，使库存、备注、取消和保存控件均可访问，不能隐藏内容。',
    [
      '将视口设为 375 × 667 像素，打开产品编辑器。',
      '滚动表单，查看并操作 Stock（库存）、Notes（备注）和 Save product（保存产品）。',
      '修改 Supplier（供应商）并保存，再在桌面尺寸下打开编辑器检查保存结果。'
    ],
    [
      '所有编辑字段和操作按钮都能完整滚动到可见区域。',
      '手机端可以正常保存和取消，桌面端编辑器也保持正常。'
    ],
    'src/styles/editor.css',
    'max-height: calc(100dvh - 32px); overflow-y: auto;',
    'height: 240px; overflow: hidden;'
  ),
  entry(
    'tasks-due-date',
    'tasks',
    'dev',
    'form',
    '新任务不能使用过去的截止日期',
    '新建任务允许使用早于固定统计基准日 2026 年 10 月 1 日的截止日期。新建任务或调整截止日期时，应拒绝早于基准日的日期；基准日当天及之后的日期可以保存，已有任务未修改的历史截止日期也应允许保留。',
    [
      '点击 New task（新建任务），填写标题，并将 Due date（截止日期）设为 2026-09-30。',
      '点击 Save task（保存任务）尝试保存，再将截止日期改为 2026-10-01 并保存。',
      '编辑已有逾期任务的 Notes（备注），保持其原有截止日期不变并保存。'
    ],
    [
      '新建任务或调整截止日期时，早于基准日的日期会被拒绝。',
      '基准日当天及之后的日期可以保存，已有任务未改动的历史截止日期可以保留。'
    ],
    'src/model.ts',
    '&& value >= today;',
    ';'
  ),
  entry(
    'tasks-cancel',
    'tasks',
    'dev',
    'state',
    '取消编辑应丢弃任务草稿',
    '任务尚未保存，编辑内容就已影响交付看板，取消后也无法恢复。每次编辑都应使用独立草稿；点击 Cancel（取消）或按 Escape 键关闭后，看板上的原任务卡片应保持不变。',
    [
      '编辑 Prepare release brief（准备发布简报）任务。',
      '修改 Title（标题）、Owner（负责人）和 Notes（备注），然后点击 Cancel（取消）。',
      '重新打开编辑器，修改 Priority（优先级），再按 Escape 键关闭。'
    ],
    ['丢弃草稿不会改变原任务卡片。', '保存时，所有修改字段都正确提交到对应任务卡片。'],
    'src/components/TaskEditor.vue',
    'const draft = reactive({ ...(props.task ?? blank) });',
    'const draft = reactive(props.task ?? blank);'
  ),
  entry(
    'tasks-status',
    'tasks',
    'dev',
    'state',
    '任务状态变更应同步看板列',
    '修改任务卡片状态后，卡片没有正确移动到对应看板列。应将所选状态应用到该任务，同步更新各列数量和已完成数量，且不影响其他任务。',
    [
      '将 Prepare release brief（准备发布简报）的状态从 Todo（待办）改为 Doing（进行中）。',
      '将同一任务的状态改为 Done（已完成）。',
      '再将其状态改回 Todo（待办）。'
    ],
    [
      '每次修改状态后，卡片都移动到所选状态对应的列。',
      '各列数量和已完成数量同步更新，其他任务卡片保持不变。'
    ],
    'src/model.ts',
    'return { ...task, status };',
    'return { ...task };'
  ),
  entry(
    'tasks-filter-reset',
    'tasks',
    'dev',
    'state',
    '重置应清除所有任务筛选',
    '点击 Reset（重置）只清除了搜索和负责人条件，却仍保留优先级限制。组合使用这三种筛选后，重置应恢复完整看板，且不能删除或修改任何任务。',
    [
      '在 Owner（负责人）中选择 Noah，并在 Priority（优先级）中选择 High（高）。',
      '在任务搜索框中输入 Audit（审查关键字）。',
      '点击 Reset（重置）。'
    ],
    [
      '搜索框清空，负责人和优先级筛选均恢复为不限制。',
      '原有 8 个任务全部重新显示，筛选功能仍可继续使用。'
    ],
    'src/App.vue',
    "  priority.value = 'All';",
    '  priority.value = priority.value;'
  ),
  entry(
    'tasks-toolbar',
    'tasks',
    'dev',
    'layout',
    '手机端任务筛选栏溢出',
    '任务搜索框使筛选栏超出手机屏幕宽度。窄屏下，搜索、负责人、优先级、排序和重置控件都应可访问，页面不能出现横向滚动，也不能隐藏控件。',
    [
      '将视口宽度设为 375 像素，查看任务看板。',
      '搜索 Audit（审查关键字），并使用 Owner（负责人）和 Priority（优先级）筛选。',
      '点击 Reset（重置），再切换到桌面尺寸。'
    ],
    ['五个筛选控件均能容纳在视口内，并可正常操作。', '桌面端筛选栏仍可正常筛选和重置。'],
    'src/styles/toolbar.css',
    '.task-toolbar .task-search { flex: 1 1 100%; min-width: 0; }',
    '.task-toolbar .task-search { flex: 1 1 100%; min-width: 560px; }'
  ),
  entry(
    'tasks-editor-width',
    'tasks',
    'dev',
    'layout',
    '任务编辑弹窗应适配手机宽度',
    '任务编辑器在手机上仍保留桌面端最小宽度，导致字段和保存按钮超出屏幕。弹窗应适配视口，字段保持清晰可读，保存与取消按钮均可访问，桌面端行为保持不变。',
    [
      '将视口设为 375 × 667 像素，点击 New task（新建任务）。',
      '填写 Title（标题）、Due date（截止日期）和 Notes（备注）。',
      '点击 Save task（保存任务），再在桌面尺寸下打开任务编辑器。'
    ],
    ['弹窗和表单控件均位于视口范围内。', '保存与取消按钮均可见、可操作，且功能正常。'],
    'src/styles/editor.css',
    'width: 480px; max-width: 100%;',
    'width: 480px; min-width: 600px; max-width: 100%;'
  ),
  entry(
    'products-sku-search',
    'products',
    'holdout',
    'state',
    '库存搜索应匹配商品编码',
    '库存搜索可以匹配产品名称，却无法匹配商品编码。应同时搜索名称和商品编码，忽略大小写与首尾空格，并支持输入部分编码进行匹配。',
    [
      '搜索 ac-103（商品编码），并在输入内容前后添加空格。',
      '搜索 EQ-1（部分商品编码）。',
      '点击 Reset（重置），再搜索 Lamp（台灯关键字）。'
    ],
    ['使用完整或部分商品编码搜索时，只显示匹配的产品行。', '原有的名称搜索和类别筛选仍正常工作。'],
    'src/model.ts',
    '`${product.name} ${product.sku}`.toLowerCase().includes(needle)',
    'product.name.toLowerCase().includes(needle)'
  ),
  entry(
    'products-stock-integer',
    'products',
    'holdout',
    'form',
    '库存数量必须为非负整数',
    '库存允许保存小数数量。库存数量必须是非负整数；小数和负数应被拒绝，且不能提交草稿，零和正整数则应正常保存。',
    [
      '编辑 Studio Monitor（显示器），将 Stock（库存）改为 2.5，点击 Save product（保存产品）。',
      '将库存改为负数，再尝试保存。',
      '先将库存设为 0 并保存，再设为正整数并保存。'
    ],
    ['小数和负数库存会触发校验提示。', '零和正整数库存可以正确保存。'],
    'src/components/ProductEditor.vue',
    '!Number.isInteger(Number(draft.stock))',
    '!Number.isFinite(Number(draft.stock))'
  ),
  entry(
    'products-bulk-selection',
    'products',
    'holdout',
    'state',
    '批量删除应覆盖全部选中产品',
    '勾选多个产品后，批量删除只移除了其中一个。应按选中的产品标识精确删除全部选中项，包括其他页面上的选中项，同时保留未选中的产品和正常分页。',
    [
      '勾选 Studio Monitor（显示器）和 Grid Notebook（网格笔记本）。',
      '点击 Next page（下一页），再勾选 USB Dock（扩展坞）。',
      '点击 Delete selected（删除选中项），检查删除前选中过产品的两个页面。'
    ],
    ['所有选中产品均被删除，且每个产品只删除一次。', '未选中的产品保留，选中状态清空。'],
    'src/model.ts',
    '!ids.includes(product.id)',
    'product.id !== ids[0]'
  ),
  entry(
    'products-table-actions',
    'products',
    'holdout',
    'layout',
    '手机端应能访问库存行操作',
    '库存表格较宽，手机端最右侧的列被裁切，无法编辑产品或加入订单。表格应能在自身区域内横向滚动，页面本身适配视口，并使每行操作均可访问。',
    [
      '将视口宽度设为 375 像素，查看 Inventory（库存）页面。',
      '横向滚动表格，找到 Actions（操作）列。',
      '使用 Edit Studio Monitor（编辑显示器）按钮编辑产品，再使用 Add Studio Monitor to order（加入订单）按钮将其加入订单。'
    ],
    [
      '表格可以滚动到编辑和加入订单控件完整可见、可操作的位置。',
      '桌面端所有产品行和操作控件仍可正常访问。'
    ],
    'src/styles/table.css',
    'overflow-x: auto;',
    'overflow-x: hidden;'
  ),
  entry(
    'tasks-priority-sort',
    'tasks',
    'holdout',
    'state',
    '任务应按优先级从高到低排序',
    '优先级排序将低优先级任务排在紧急任务之前。每个看板列内应按高、中、低优先级排序，同优先级任务保持原有顺序，且排序应与筛选兼容。',
    [
      '在 Sort（排序）中选择 Priority（按优先级）。',
      '检查 Todo（待办）列的任务顺序。',
      '在 Owner（负责人）中选择 Maya，再点击 Reset（重置）清除筛选。'
    ],
    ['高优先级任务排在中、低优先级任务之前。', '同优先级任务的顺序保持稳定，其他控件仍正常工作。'],
    'src/model.ts',
    'return { High: 0, Medium: 1, Low: 2 }[priority];',
    'return { High: 2, Medium: 1, Low: 0 }[priority];'
  ),
  entry(
    'tasks-title-trim',
    'tasks',
    'holdout',
    'form',
    '任务标题应去除首尾空白后校验',
    '仅含空白或用首尾空格凑足长度的短标题也能保存。去除首尾空白后，标题应至少包含 3 个字符；无效标题应显示校验提示，有效标题应去除首尾空白后保存。',
    [
      '点击 New task（新建任务），将 Title（标题）设为三个空格并尝试保存。',
      '尝试保存首尾带空格、去除空格后仅有两个字符的标题。',
      '输入首尾带空格的有效标题，点击 Save task（保存任务）。'
    ],
    [
      '仅含空白或去除首尾空白后不足 3 个字符的标题会被拒绝。',
      '有效标题保存后不含首尾空白，且仍可通过搜索找到。'
    ],
    'src/model.ts',
    'return value.trim().length >= 3;',
    'return value.length >= 3;'
  ),
  entry(
    'tasks-overdue-summary',
    'tasks',
    'holdout',
    'state',
    '逾期统计不应包含已完成任务',
    '逾期汇总将截止日期较早的已完成任务也计入逾期。只有未完成且截止日期严格早于固定统计基准日 2026 年 10 月 1 日的任务才算逾期；基准日当天到期及已完成的任务均应排除。',
    [
      '查看逾期任务数和已完成任务数。',
      '将 Audit supplier contracts（审查供应商合同）的状态改为 Done（已完成）。',
      '将同一任务的状态改回 Todo（待办），再次检查汇总数量。'
    ],
    [
      '初始状态下，逾期的未完成任务恰好为 2 个。',
      '完成逾期任务或将其恢复为未完成状态后，汇总数量均正确更新。'
    ],
    'src/model.ts',
    "return task.status !== 'Done' && task.due < today;",
    'return task.due < today;'
  ),
  entry(
    'tasks-board-columns',
    'tasks',
    'holdout',
    'layout',
    '手机端应能访问全部看板列',
    '交付看板在手机上仍使用三个固定宽度的列，导致进行中和已完成列无法访问。应通过纵向堆叠或其他适配方式容纳全部列，不能隐藏卡片，并保留桌面端的三列布局。',
    [
      '将视口宽度设为 375 像素，查看任务看板。',
      '找到并操作 Doing（进行中）列和 Done（已完成）列中的任务卡片。',
      '将一张 Doing（进行中）卡片的状态改为 Done（已完成），再检查桌面端各列。'
    ],
    [
      '全部三列及其卡片操作均可访问，页面没有溢出。',
      '桌面端保留可用的三列布局，任务状态变更和跨列移动正常。'
    ],
    'src/styles/board.css',
    '.task-board { grid-template-columns: minmax(0, 1fr); }',
    '.task-board { grid-template-columns: repeat(3, 320px); }'
  )
]

export const cases: CaseInfo[] = entries.map(({ info }) => info)
function lookup(caseId: string): Entry {
  const result = entries.find(({ info }) => info.id === caseId)
  if (!result) throw new Error(`Unknown PatchLab case: ${caseId}`)
  return result
}
async function source(entry: Entry): Promise<string> {
  return readFile(resolve(root, entry.info.app, entry.mutation.path), 'utf8')
}
function defective(entry: Entry, content: string): string {
  const { from, to } = entry.mutation
  if (from === to || content.split(from).length !== 2)
    throw new Error(`Mutation must match exactly once: ${entry.info.id}`)
  return content.replace(from, to)
}
async function snapshot(entry: Entry, dest: string): Promise<void> {
  const target = resolve(dest)
  const insideCatalog = relative(root, target)
  if (!insideCatalog || (!insideCatalog.startsWith('..') && !isAbsolute(insideCatalog)))
    throw new Error('Fixture destination must be outside the trusted fixtures directory')
  await mkdir(target, { recursive: true })
  // Only fixed wrapper files and app src cross the trust boundary.
  for (const name of ['package.json', 'index.html', 'tsconfig.json', 'vite.config.ts']) {
    await cp(resolve(root, 'wrapper', name), resolve(target, name))
  }
  await cp(resolve(root, entry.info.app, 'src'), resolve(target, 'src'), { recursive: true })
}
export async function materializeFixture(caseId: string, dest: string): Promise<void> {
  const entry = lookup(caseId)
  const content = defective(entry, await source(entry))
  await snapshot(entry, dest)
  await writeFile(resolve(dest, entry.mutation.path), content, 'utf8')
}
export async function materializeReference(caseId: string, dest: string): Promise<void> {
  await snapshot(lookup(caseId), dest)
}
export async function getReferenceEdits(
  caseId: string
): Promise<Array<{ path: string; content: string }>> {
  const entry = lookup(caseId)
  return [{ path: entry.mutation.path, content: await source(entry) }]
}

export async function validateCatalog(): Promise<void> {
  if (
    new Set(cases.map((info) => info.id)).size !== 20 ||
    cases.filter((info) => info.split === 'dev').length !== 12 ||
    cases.filter((info) => info.split === 'holdout').length !== 8
  )
    throw new Error('Expected 20 unique cases, split 12/8')
  for (const entry of entries) {
    if (!entry.mutation.path.startsWith('src/')) throw new Error('Mutations must be src-only')
    defective(entry, await source(entry))
    const files = await readdir(resolve(root, entry.info.app, 'src'))
    if (!files.includes('main.ts')) throw new Error('Missing generic entry point')
  }
}
