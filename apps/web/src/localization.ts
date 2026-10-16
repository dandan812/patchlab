import type { CaseInfo, Task } from '../../../packages/shared/src/types.js'

const legacyDescriptions: Record<string, string> = {
  'products-pagination':
    'Filtering inventory while viewing page three leaves an empty result view. A changed search or category should start on the first matching page, with accurate results and usable pagination.'
}
const legacyAssertions: Record<string, string> = {
  'Category filter on page three shows page-one matching rows':
    '在第三页按类别筛选后，显示第一页匹配产品',
  'Search from page three resets and clearing restores pagination':
    '在第三页搜索后回到第一页，清除筛选后恢复分页',
  'Regression: inventory, pagination and unselected rows': '回归：库存列表、分页和未选中产品行',
  'Regression: name search and category filters': '回归：产品名称搜索与类别筛选',
  'Regression: create, edit and order a valid product': '回归：创建、编辑有效产品并加入订单',
  'Inventory filter controls: 375px phone': '库存筛选控件可用性：375 像素宽手机',
  'Inventory filter controls: 320px short phone': '库存筛选控件可用性：320 像素宽矮屏手机',
  'Inventory filter controls: desktop regression': '库存筛选控件可用性：桌面端回归'
}

export function taskDescription(task: Task, caseInfo?: CaseInfo): string {
  if (caseInfo && task.description === legacyDescriptions[task.caseId]) return caseInfo.description
  return task.description || caseInfo?.description || task.caseId
}

export function assertionName(name: string): string {
  return legacyAssertions[name] || name
}
