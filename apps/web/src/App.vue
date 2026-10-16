<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Activity,
  AlertCircle,
  Boxes,
  Check,
  ChevronRight,
  ClipboardList,
  Database,
  FileText,
  FolderKanban,
  Globe,
  LayoutList,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  X,
  Moon,
  Sun
} from 'lucide-vue-next'
import type { CaseInfo, Task } from '../../../packages/shared/src/types'
import { terminal } from '../../../packages/shared/src/types'
import { dateTime, displayValue, duration, statusLabels, statusTone } from './format'
import { useWorkbench, type View } from './useWorkbench'
import { taskDescription } from './localization'
import LoginModal from './components/LoginModal.vue'
import TaskModal from './components/TaskModal.vue'
import TaskDetailView from './components/TaskDetail.vue'

const workbench = useWorkbench()
const {
  view,
  selectedId,
  meta,
  cases,
  tasks,
  detail,
  evaluations,
  loading,
  detailLoading,
  evaluationsLoading,
  error,
  detailError,
  evaluationsError,
  connection,
  busy,
  authenticated,
  selectedCase,
  activeTasks
} = workbench
const navItems = [
  { id: 'tasks' as View, label: '任务', english: 'Tasks', icon: FolderKanban },
  { id: 'cases' as View, label: '案例', english: 'Cases', icon: Boxes },
  { id: 'evaluations' as View, label: '评估', english: 'Evaluations', icon: Activity },
  { id: 'settings' as View, label: '设置', english: 'Settings', icon: Settings2 }
]
const taskSearch = ref('')
const taskFilter = ref<'all' | 'active' | 'ended'>('all')
const outcomeFilter = ref('all')
const modeFilter = ref('all')
const dark = ref(
  localStorage.getItem('patchlab-theme') === 'dark' ||
    (!localStorage.getItem('patchlab-theme') &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
)
document.documentElement.dataset.theme = dark.value ? 'dark' : 'light'
function toggleTheme() {
  dark.value = !dark.value
  document.documentElement.dataset.theme = dark.value ? 'dark' : 'light'
  localStorage.setItem('patchlab-theme', dark.value ? 'dark' : 'light')
}
const caseSearch = ref('')
const categoryFilter = ref('all')
const loginOpen = ref(false)
const taskModalOpen = ref(false)
const modalCaseId = ref('')
const previousTask = ref<Task>()
const mobileDetail = ref(Boolean(window.location.hash.match(/^#\/tasks\/.+/)))
const actionError = ref('')
const filteredTasks = computed(() => {
  const term = taskSearch.value.trim().toLowerCase()
  return tasks.value.filter((task) => {
    if (taskFilter.value === 'active' && terminal.has(task.status)) return false
    if (taskFilter.value === 'ended' && !terminal.has(task.status)) return false
    if (outcomeFilter.value !== 'all' && task.status !== outcomeFilter.value) return false
    if (modeFilter.value !== 'all' && task.mode !== modeFilter.value) return false
    const caseTitle = cases.value.find((item) => item.id === task.caseId)?.title || ''
    return (
      !term ||
      `${task.id} ${task.caseId} ${caseTitle} ${task.description}`.toLowerCase().includes(term)
    )
  })
})
function clearTaskFilters() {
  taskSearch.value = ''
  taskFilter.value = 'all'
  outcomeFilter.value = 'all'
  modeFilter.value = 'all'
}
const filteredCases = computed(() => {
  const term = caseSearch.value.trim().toLowerCase()
  return cases.value.filter(
    (item) =>
      (categoryFilter.value === 'all' || item.category === categoryFilter.value) &&
      (!term || `${item.id} ${item.title} ${item.description}`.toLowerCase().includes(term))
  )
})
const evaluationEntries = computed(() => Object.entries(evaluations.value?.summary || {}))
const categoryLabels: Record<string, string> = { state: '状态', form: '表单', layout: '布局' }
const budgetLabels: Record<string, string> = {
  timeoutMs: '单次超时',
  maxCalls: '模型调用上限',
  maxPatches: '补丁尝试上限',
  maxFiles: '修改文件上限',
  maxFileBytes: '单文件字节上限',
  maxPatchBytes: '补丁字节上限',
  maxOutput: '输出上限',
  maxArtifactsBytes: '产物字节上限'
}

function caseTitle(task: Task) {
  return cases.value.find((item) => item.id === task.caseId)?.title || task.caseId
}
function caseDescription(task: Task) {
  return taskDescription(
    task,
    cases.value.find((item) => item.id === task.caseId)
  )
}
function chooseTask(id: string) {
  workbench.selectTask(id)
  mobileDetail.value = true
}
function navigate(nextView: View) {
  workbench.navigate(nextView)
  if (nextView === 'tasks') mobileDetail.value = false
}
function openCreate(caseId = '', task?: Task) {
  if (!authenticated.value) {
    loginOpen.value = true
    return
  }
  modalCaseId.value = caseId
  previousTask.value = task
  taskModalOpen.value = true
}
function created() {
  taskModalOpen.value = false
  mobileDetail.value = true
}
async function perform(action: () => Promise<unknown>) {
  actionError.value = ''
  try {
    await action()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : '操作失败'
  }
}
function budgetValue(key: string, value: unknown) {
  if (key === 'timeoutMs' && typeof value === 'number') return duration(value)
  return displayValue(value)
}
function startCase(item: CaseInfo) {
  openCreate(item.id)
}
</script>

<template>
  <div class="app-shell">
    <aside class="app-nav" aria-label="主导航">
      <a
        href="#/tasks"
        class="brand"
        aria-label="PatchLab 工作台"
        @click.prevent="navigate('tasks')"
      >
        <img src="/favicon.svg" alt="" width="32" height="32" />
        <span>PatchLab<span class="brand-subtitle">修复工作台</span></span>
      </a>
      <span class="nav-section-label">工作空间</span>
      <nav>
        <button
          v-for="item in navItems"
          :key="item.id"
          class="nav-item"
          :class="{ active: view === item.id }"
          :aria-current="view === item.id ? 'page' : undefined"
          :title="item.english"
          @click="navigate(item.id)"
        >
          <component :is="item.icon" :size="18" /><span>{{ item.label }}</span>
          <span v-if="item.id === 'tasks' && activeTasks.length" class="nav-count">{{
            activeTasks.length
          }}</span>
        </button>
      </nav>
      <div class="nav-footer">
        <div class="workspace-indicator">
          <span class="status-dot" :class="meta ? 'dot-success' : 'dot-warning'" /><span>{{
            meta ? '自托管工作区' : '等待服务连接'
          }}</span>
        </div>
        <div class="nav-version">
          <span>{{ meta?.version ? `v${meta.version}` : 'PatchLab' }}</span
          ><span>LOCAL</span>
        </div>
      </div>
    </aside>

    <div class="app-main">
      <header class="topbar">
        <div class="topbar-title">
          <TerminalSquare :size="17" /><strong>{{
            navItems.find((item) => item.id === view)?.label
          }}</strong
          ><span class="topbar-divider">/</span><span class="topbar-context">前端修复工作区</span>
        </div>
        <div class="topbar-actions">
          <button
            class="icon-button"
            :aria-label="dark ? '切换浅色模式' : '切换深色模式'"
            :title="dark ? '切换浅色模式' : '切换深色模式'"
            @click="toggleTheme"
          >
            <Sun v-if="dark" :size="18" /><Moon v-else :size="18" />
          </button>
          <span
            v-if="meta"
            class="service-state"
            :class="meta.modelConfigured ? 'text-success' : 'muted'"
            ><span class="status-dot" />{{ meta.modelConfigured ? 'AI 已配置' : 'AI 未启用' }}</span
          >
          <button
            v-if="authenticated"
            class="button small secondary"
            :disabled="busy"
            title="退出管理员会话"
            @click="perform(workbench.logout)"
          >
            <LogOut :size="14" /><span>退出登录</span>
          </button>
          <button v-else class="button small secondary" :disabled="busy" @click="loginOpen = true">
            <LogIn :size="14" /><span>登录</span>
          </button>
          <button
            class="button small primary"
            :disabled="!meta || busy"
            :title="authenticated ? '创建修复任务' : '登录后创建修复任务'"
            @click="openCreate()"
          >
            <Plus :size="16" /><span>新建任务</span>
          </button>
        </div>
      </header>

      <div v-if="error || actionError" class="global-alert" role="alert">
        <AlertCircle :size="17" /><span>{{ actionError || error }}</span>
        <button v-if="error" class="button small secondary" @click="workbench.refresh">
          <RefreshCw :size="13" />重试
        </button>
        <button
          v-if="actionError"
          class="icon-button"
          title="关闭错误提示"
          aria-label="关闭错误提示"
          @click="actionError = ''"
        >
          <X :size="15" />
        </button>
      </div>

      <main
        v-if="view === 'tasks'"
        class="tasks-workspace"
        :class="{ 'show-mobile-detail': mobileDetail }"
      >
        <section class="task-sidebar" aria-label="任务列表">
          <div class="sidebar-title">
            <h2>
              全部任务 <span>{{ tasks.length }}</span>
            </h2>
            <button
              class="icon-button"
              title="刷新任务列表"
              aria-label="刷新任务列表"
              :disabled="loading"
              @click="workbench.refresh"
            >
              <RefreshCw :size="16" :class="{ spin: loading }" />
            </button>
          </div>
          <div class="task-search">
            <Search :size="15" /><input
              v-model="taskSearch"
              aria-label="搜索任务"
              placeholder="搜索任务或案例…"
            /><button
              v-if="taskSearch"
              class="icon-button"
              aria-label="清除搜索"
              title="清除搜索"
              @click="taskSearch = ''"
            >
              <X :size="13" />
            </button>
          </div>
          <div class="task-filter segmented" aria-label="任务状态筛选">
            <button
              :class="{ selected: taskFilter === 'all' }"
              :aria-pressed="taskFilter === 'all'"
              @click="taskFilter = 'all'"
            >
              全部
            </button>
            <button
              :class="{ selected: taskFilter === 'active' }"
              :aria-pressed="taskFilter === 'active'"
              @click="taskFilter = 'active'"
            >
              进行中
            </button>
            <button
              :class="{ selected: taskFilter === 'ended' }"
              :aria-pressed="taskFilter === 'ended'"
              @click="taskFilter = 'ended'"
            >
              已结束
            </button>
          </div>
          <div class="task-facets">
            <select v-model="outcomeFilter" aria-label="筛选任务结果">
              <option value="all">全部结果</option>
              <option value="succeeded">已成功</option>
              <option value="failed">已失败</option>
              <option value="cancelled">已取消</option>
              <option value="interrupted">已中断</option>
            </select>
            <select v-model="modeFilter" aria-label="筛选执行模式">
              <option value="all">全部模式</option>
              <option value="replay">脚本回放</option>
              <option value="model">AI 修复</option>
            </select>
          </div>
          <div class="list-count" aria-live="polite">
            {{ filteredTasks.length }} 条结果
            <button
              v-if="
                taskSearch ||
                taskFilter !== 'all' ||
                outcomeFilter !== 'all' ||
                modeFilter !== 'all'
              "
              class="text-button"
              @click="clearTaskFilters"
            >
              清除筛选
            </button>
          </div>
          <div v-if="loading && !tasks.length" class="sidebar-empty">
            <LoaderCircle :size="22" class="spin" />
            <p>正在加载任务</p>
          </div>
          <div v-else-if="!filteredTasks.length" class="sidebar-empty">
            <ClipboardList :size="30" :stroke-width="1.4" />
            <h3>
              {{ tasks.length ? '没有匹配的任务' : authenticated ? '还没有任务' : '暂无公开任务' }}
            </h3>
            <p>
              {{
                tasks.length
                  ? '调整搜索或状态筛选。'
                  : authenticated
                    ? '从案例创建第一个修复任务。'
                    : '登录后可查看私有任务。'
              }}
            </p>
            <button
              v-if="!tasks.length"
              class="button small secondary"
              @click="authenticated ? openCreate() : (loginOpen = true)"
            >
              <Plus v-if="authenticated" :size="14" /><LogIn v-else :size="14" />{{
                authenticated ? '新建任务' : '管理员登录'
              }}
            </button>
          </div>
          <ul v-else class="task-list">
            <li v-for="task in filteredTasks" :key="task.id">
              <button
                class="task-list-item"
                :class="{ selected: selectedId === task.id }"
                :aria-current="selectedId === task.id ? 'true' : undefined"
                @click="chooseTask(task.id)"
              >
                <div class="task-item-heading">
                  <span class="status-dot" :class="`dot-${statusTone(task.status)}`" /><strong>{{
                    caseTitle(task)
                  }}</strong
                  ><ChevronRight :size="14" />
                </div>
                <p>{{ caseDescription(task) }}</p>
                <div class="task-item-meta">
                  <span :class="`text-${statusTone(task.status)}`">{{
                    statusLabels[task.status] || task.status
                  }}</span
                  ><span
                    >{{ task.mode === 'replay' ? '回放 · 非 AI' : 'AI' }} ·
                    {{ task.strategy }}</span
                  ><LockKeyhole v-if="!task.public" :size="12" title="私有任务" /><Globe
                    v-else
                    :size="12"
                    title="公开任务"
                  />
                </div>
                <time>{{ dateTime(task.createdAt) }}</time>
              </button>
            </li>
          </ul>
          <div class="sidebar-bottom">
            <span class="status-dot" :class="authenticated ? 'dot-success' : 'dot-neutral'" />{{
              authenticated ? '管理员 · 全部可见任务' : '访客 · 仅公开任务'
            }}
          </div>
        </section>
        <div class="detail-workspace">
          <div v-if="detailLoading" class="empty-state">
            <LoaderCircle :size="28" class="spin" />
            <h3>正在加载任务</h3>
          </div>
          <template v-else-if="detail">
            <p v-if="detailError" class="detail-load-alert inline-alert warning" role="alert">
              <AlertCircle :size="15" />{{ detailError }}
            </p>
            <TaskDetailView
              :detail="detail"
              :case-info="selectedCase"
              :authenticated="authenticated"
              :busy="busy"
              :connection="connection"
              @cancel="perform(workbench.cancelTask)"
              @rerun="openCreate('', detail.task)"
              @refresh="workbench.loadSelection"
              @back="mobileDetail = false"
            />
          </template>
          <div v-else-if="detailError" class="empty-state">
            <AlertCircle :size="32" />
            <h3>无法读取任务</h3>
            <p role="alert">{{ detailError }}</p>
            <div class="empty-actions">
              <button class="button secondary" @click="mobileDetail = false">
                <LayoutList :size="15" />任务列表</button
              ><button class="button secondary" @click="workbench.loadSelection">
                <RefreshCw :size="15" />重试
              </button>
            </div>
          </div>
          <div v-else class="workspace-empty">
            <div class="empty-workspace-symbol">
              <FileText :size="38" :stroke-width="1.2" /><span><Plus :size="14" /></span>
            </div>
            <span class="small-label">PATCHLAB / TASKS</span>
            <h1>修复，从一个案例开始。</h1>
            <p>
              {{
                tasks.length
                  ? '选择任务查看执行记录与验收结果。'
                  : '当前工作区没有可查看的修复记录。'
              }}
            </p>
            <div class="empty-actions">
              <button class="button primary" :disabled="!meta || busy" @click="openCreate()">
                <Plus :size="16" />{{ authenticated ? '新建任务' : '登录并创建任务' }}</button
              ><button class="button secondary" @click="navigate('cases')">
                <Boxes :size="16" />查看案例
              </button>
            </div>
            <div class="workspace-readiness">
              <span
                ><span
                  class="status-dot"
                  :class="meta?.replayAvailable ? 'dot-success' : 'dot-neutral'"
                />脚本回放（非 AI 修复）<strong>{{
                  meta?.replayAvailable ? '可用' : '不可用'
                }}</strong></span
              >
              <span
                ><span
                  class="status-dot"
                  :class="meta?.modelConfigured ? 'dot-success' : 'dot-neutral'"
                />AI 修复<strong>{{
                  meta?.modelConfigured ? '已就绪' : '需要模型与 Docker'
                }}</strong></span
              >
            </div>
          </div>
        </div>
      </main>

      <main v-else-if="view === 'cases'" class="page-content">
        <header class="page-header">
          <div>
            <span class="small-label">CASE LIBRARY</span>
            <h1>修复案例</h1>
            <p>
              {{ cases.length }} 个案例 ·
              {{ cases.filter((item) => item.split === 'dev').length }} 个开发集 /
              {{ cases.filter((item) => item.split === 'holdout').length }} 个留出集
            </p>
          </div>
          <Boxes :size="28" :stroke-width="1.3" class="muted" />
        </header>
        <div class="page-controls">
          <div class="task-search">
            <Search :size="16" /><input
              v-model="caseSearch"
              aria-label="搜索案例"
              placeholder="搜索案例…"
            />
          </div>
          <label class="filter-select"
            ><SlidersHorizontal :size="15" /><select v-model="categoryFilter" aria-label="案例类别">
              <option value="all">全部类别</option>
              <option value="state">状态</option>
              <option value="form">表单</option>
              <option value="layout">布局</option>
            </select></label
          >
        </div>
        <div v-if="loading" class="empty-state">
          <LoaderCircle :size="26" class="spin" />
          <p>正在加载案例</p>
        </div>
        <div v-else-if="!filteredCases.length" class="empty-state">
          <Boxes :size="32" />
          <h3>{{ cases.length ? '没有匹配的案例' : '暂无案例' }}</h3>
          <p>{{ cases.length ? '调整搜索或类别筛选。' : '案例目录尚未提供可用记录。' }}</p>
        </div>
        <div v-else class="case-grid">
          <article v-for="item in filteredCases" :key="item.id" class="case-item">
            <div class="case-item-top">
              <span class="category-tag">{{ categoryLabels[item.category] || item.category }}</span
              ><span class="split-tag" :class="{ holdout: item.split === 'holdout' }">{{
                item.split === 'holdout' ? '留出集' : '开发集'
              }}</span>
            </div>
            <h2>{{ item.title }}</h2>
            <p class="case-description">{{ item.description }}</p>
            <details class="case-details">
              <summary>
                复现步骤 <span>{{ item.steps.length }}</span>
              </summary>
              <ol>
                <li v-for="(step, index) in item.steps" :key="index">{{ step }}</li>
              </ol>
            </details>
            <details class="case-details">
              <summary>
                验收条件 <span>{{ item.criteria.length }}</span>
              </summary>
              <ul>
                <li v-for="(criterion, index) in item.criteria" :key="index">{{ criterion }}</li>
              </ul>
            </details>
            <footer>
              <code>{{ item.id }}</code
              ><button
                class="button small secondary"
                :disabled="!meta || busy"
                :title="authenticated ? '使用此案例创建任务' : '登录后创建任务'"
                @click="startCase(item)"
              >
                <Plus :size="14" />运行案例
              </button>
            </footer>
          </article>
        </div>
      </main>

      <main v-else-if="view === 'evaluations'" class="page-content">
        <header class="page-header">
          <div>
            <span class="small-label">EVALUATION</span>
            <h1>评估记录</h1>
            <p>基于已保存评估产物的真实结果</p>
          </div>
          <button
            class="button secondary"
            :disabled="evaluationsLoading"
            @click="workbench.loadEvaluations"
          >
            <RefreshCw :size="15" :class="{ spin: evaluationsLoading }" />刷新
          </button>
        </header>
        <p v-if="evaluationsError" class="inline-alert danger" role="alert">
          <AlertCircle :size="16" />{{ evaluationsError }}
        </p>
        <div v-if="evaluationsLoading && !evaluations" class="empty-state">
          <LoaderCircle :size="28" class="spin" />
          <p>正在读取评估记录</p>
        </div>
        <div v-else-if="!evaluations?.summary" class="evaluation-empty">
          <Activity :size="38" :stroke-width="1.3" />
          <h2>尚无评估汇总</h2>
          <p>未找到已保存的评估结果，不展示推测的成功率或费用。</p>
        </div>
        <section v-else class="evaluation-summary" aria-label="评估汇总">
          <h2 class="section-title">评估汇总</h2>
          <dl class="summary-grid">
            <div v-for="[key, value] in evaluationEntries" :key="key">
              <dt>{{ key }}</dt>
              <dd :class="{ 'summary-structured': value && typeof value === 'object' }">
                <pre v-if="value && typeof value === 'object'">{{ displayValue(value) }}</pre>
                <span v-else>{{ displayValue(value) }}</span>
              </dd>
            </div>
          </dl>
        </section>
        <section class="evaluation-files">
          <h2 class="section-title">
            评估文件 <span class="muted">{{ evaluations?.files.length || 0 }}</span>
          </h2>
          <ul v-if="evaluations?.files.length" class="artifact-list">
            <li v-for="file in evaluations.files" :key="file">
              <FileText :size="20" class="muted" />
              <div>
                <strong>{{ file }}</strong>
              </div>
            </li>
          </ul>
          <p v-else class="section-empty">没有评估文件。</p>
        </section>
      </main>

      <main v-else class="page-content settings-page">
        <header class="page-header">
          <div>
            <span class="small-label">ENVIRONMENT</span>
            <h1>工作区设置</h1>
            <p>当前服务配置与执行边界</p>
          </div>
          <button class="button secondary" :disabled="loading" @click="workbench.refresh">
            <RefreshCw :size="15" :class="{ spin: loading }" />刷新
          </button>
        </header>
        <div v-if="!meta" class="empty-state">
          <Server :size="32" />
          <h3>服务配置尚不可用</h3>
          <p>连接 API 后显示当前配置。</p>
        </div>
        <template v-else>
          <section class="settings-section">
            <h2 class="section-title"><Server :size="18" />运行环境</h2>
            <dl class="settings-rows">
              <div>
                <dt>服务版本</dt>
                <dd class="mono">{{ meta.version }}</dd>
              </div>
              <div>
                <dt>沙箱</dt>
                <dd class="mono">{{ meta.sandbox }}</dd>
              </div>
              <div>
                <dt>存储</dt>
                <dd class="mono">{{ meta.storage }}</dd>
              </div>
              <div>
                <dt>脚本回放（非 AI 修复）</dt>
                <dd :class="meta.replayAvailable ? 'text-success' : 'muted'">
                  <Check v-if="meta.replayAvailable" :size="14" />{{
                    meta.replayAvailable ? '可用' : '不可用'
                  }}
                </dd>
              </div>
              <div>
                <dt>AI 修复</dt>
                <dd :class="meta.modelConfigured ? 'text-success' : 'text-warning'">
                  <Sparkles :size="14" />{{
                    meta.modelConfigured ? '已配置，尚需实际运行验证' : '需要模型配置与 Docker'
                  }}
                </dd>
              </div>
              <div v-if="meta.modelCredentialsConfigured !== undefined">
                <dt>模型凭据</dt>
                <dd>{{ meta.modelCredentialsConfigured ? '已配置' : '未配置' }}</dd>
              </div>
              <div v-if="meta.modelId">
                <dt>模型</dt>
                <dd class="mono">{{ meta.modelId }}</dd>
              </div>
              <div v-if="meta.modelId && meta.modelApiType">
                <dt>模型接口</dt>
                <dd>
                  {{ meta.modelApiType === 'responses' ? 'Responses API' : 'Chat Completions API' }}
                </dd>
              </div>
            </dl>
          </section>
          <section class="settings-section">
            <h2 class="section-title"><ShieldCheck :size="18" />执行预算</h2>
            <dl class="settings-rows">
              <div v-for="[key, value] in Object.entries(meta.budgets || {})" :key="key">
                <dt>{{ budgetLabels[key] || key }}</dt>
                <dd class="mono">{{ budgetValue(key, value) }}</dd>
              </div>
            </dl>
            <p v-if="!Object.keys(meta.budgets || {}).length" class="section-empty">
              服务未提供预算配置。
            </p>
          </section>
          <section class="settings-section">
            <h2 class="section-title"><LockKeyhole :size="18" />访问权限</h2>
            <dl class="settings-rows">
              <div>
                <dt>当前身份</dt>
                <dd>{{ authenticated ? '管理员' : '访客' }}</dd>
              </div>
              <div>
                <dt>任务可见范围</dt>
                <dd>{{ authenticated ? '私有与公开任务' : '仅公开任务' }}</dd>
              </div>
              <div>
                <dt>新任务默认可见性</dt>
                <dd>私有</dd>
              </div>
            </dl>
            <div class="settings-actions">
              <button
                v-if="authenticated"
                class="button secondary"
                :disabled="busy"
                @click="perform(workbench.logout)"
              >
                <LogOut :size="15" />退出登录</button
              ><button v-else class="button primary" @click="loginOpen = true">
                <LogIn :size="15" />管理员登录
              </button>
            </div>
          </section>
        </template>
      </main>
      <footer class="app-statusbar">
        <span><Database :size="12" />{{ meta?.storage || '存储未连接' }}</span
        ><span
          >{{ activeTasks.length }} 个进行中<span class="statusbar-separator">·</span
          >{{ authenticated ? '管理员' : '只读访客' }}</span
        >
      </footer>
    </div>
    <LoginModal
      v-if="loginOpen"
      :busy="busy"
      :submit="workbench.login"
      @close="loginOpen = false"
      @authenticated="loginOpen = false"
    />
    <TaskModal
      v-if="taskModalOpen"
      :cases="cases"
      :meta="meta"
      :busy="busy"
      :initial-case-id="modalCaseId"
      :previous-task="previousTask"
      :submit="workbench.createTask"
      @close="taskModalOpen = false"
      @created="created"
    />
  </div>
</template>
