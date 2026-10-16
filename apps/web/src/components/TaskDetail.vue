<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronRight,
  Circle,
  Clock3,
  Code2,
  Download,
  ExternalLink,
  FileCheck2,
  FileDiff,
  FileImage,
  FileText,
  FlaskConical,
  Globe,
  ImageOff,
  ListTree,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  X,
  Copy,
  WrapText,
  ZoomIn
} from 'lucide-vue-next'
import { terminal, type CaseInfo, type TaskDetail } from '../../../../packages/shared/src/types'
import { artifactUrl } from '../api'
import {
  artifactLabels,
  bytes,
  dateTime,
  displayValue,
  duration,
  eventTime,
  statusLabels,
  statusTone
} from '../format'
import { assertionName, taskDescription } from '../localization'
import ModalShell from './ModalShell.vue'

const props = defineProps<{
  detail: TaskDetail
  caseInfo?: CaseInfo
  authenticated: boolean
  busy: boolean
  connection: 'idle' | 'connecting' | 'live' | 'reconnecting'
}>()
const emit = defineEmits<{ cancel: []; rerun: []; refresh: []; back: [] }>()
type Tab = 'timeline' | 'diff' | 'evidence' | 'acceptance'
const tab = ref<Tab>('timeline')
const tabs = [
  { id: 'timeline' as const, label: '时间线', icon: ListTree },
  { id: 'diff' as const, label: 'Diff', icon: FileDiff },
  { id: 'evidence' as const, label: '证据', icon: FileImage },
  { id: 'acceptance' as const, label: '验收', icon: ShieldCheck }
]
const task = computed(() => props.detail.task)
const isActive = computed(() => !terminal.has(task.value.status))
const images = computed(() =>
  props.detail.artifacts.filter((item) => item.mime.startsWith('image/'))
)
const files = computed(() =>
  props.detail.artifacts.filter((item) => !item.mime.startsWith('image/'))
)
const patchArtifact = computed(() => props.detail.artifacts.find((item) => item.kind === 'patch'))
const reportArtifact = computed(() => props.detail.artifacts.find((item) => item.kind === 'report'))
const imageErrors = ref(new Set<string>())
const patchText = ref('')
const patchLoading = ref(false)
const patchError = ref('')
const followLatest = ref(true)
const timeline = ref<HTMLElement>()
const wrapDiff = ref(false)
const copyState = ref('')
const previewId = ref('')
const preview = computed(() => images.value.find((image) => image.id === previewId.value))
const passedAssertions = computed(
  () => props.detail.report?.assertions.filter((item) => item.passed).length ?? 0
)
const failuresOnly = ref(false)
const failedAssertions = computed(
  () => props.detail.report?.assertions.filter((item) => !item.passed).length ?? 0
)
const visibleAssertions = computed(
  () => props.detail.report?.assertions.filter((item) => !failuresOnly.value || !item.passed) ?? []
)
const incomplete = computed(() => props.detail.report?.outcome === 'incomplete')
const verdictLabel = computed(() =>
  props.detail.report
    ? incomplete.value
      ? '独立验收未完成'
      : props.detail.report.passed
        ? '独立验收通过'
        : '独立验收未通过'
    : isActive.value
      ? '等待独立验收'
      : '未取得验收结果'
)
const verdictTone = computed(() =>
  !props.detail.report
    ? 'muted'
    : incomplete.value
      ? 'text-warning'
      : props.detail.report.passed
        ? 'text-success'
        : 'text-danger'
)
const phaseLabels = {
  preparation: '快照准备',
  startup: '环境启动',
  assertions: '断言执行',
  evidence: '证据归档'
}
const diffStats = computed(() =>
  patchText.value.split('\n').reduce(
    (stats, line) => {
      if (line.startsWith('+') && !line.startsWith('+++')) stats.added++
      if (line.startsWith('-') && !line.startsWith('---')) stats.removed++
      return stats
    },
    { added: 0, removed: 0 }
  )
)
const stages = [
  { label: '准备', statuses: ['queued', 'preparing'] },
  { label: '定位', statuses: ['investigating'] },
  { label: '修复', statuses: ['repairing'] },
  { label: '检查', statuses: ['checking'] },
  { label: '验收', statuses: ['evaluating'] }
]
const stageIndex = computed(() =>
  task.value.status === 'succeeded'
    ? stages.length
    : props.detail.report
      ? stages.length - 1
      : stages.findIndex((stage) => stage.statuses.includes(task.value.status))
)
async function copyPatch() {
  try {
    await navigator.clipboard.writeText(patchText.value)
    copyState.value = '已复制'
  } catch {
    copyState.value = '复制失败，请下载补丁'
  }
}
let patchController: AbortController | undefined
let patchGeneration = 0

function count(tabId: Tab) {
  if (tabId === 'timeline') return props.detail.events.length
  if (tabId === 'evidence') return props.detail.artifacts.length
  if (tabId === 'acceptance') return props.detail.report?.assertions.length
  return undefined
}

async function loadPatch() {
  const generation = ++patchGeneration
  patchController?.abort()
  patchLoading.value = false
  patchError.value = ''
  patchText.value = props.detail.patch || ''
  if (patchText.value || !patchArtifact.value) return
  patchController = new AbortController()
  patchLoading.value = true
  try {
    const response = await fetch(artifactUrl(patchArtifact.value.id), {
      credentials: 'include',
      signal: patchController.signal
    })
    if (!response.ok) throw new Error(`补丁加载失败 (${response.status})`)
    const text = await response.text()
    if (generation === patchGeneration) patchText.value = text
  } catch (cause) {
    if (
      generation === patchGeneration &&
      !(cause instanceof DOMException && cause.name === 'AbortError')
    ) {
      patchError.value = cause instanceof Error ? cause.message : '补丁加载失败'
    }
  } finally {
    if (generation === patchGeneration) patchLoading.value = false
  }
}

function diffClass(line: string) {
  if (
    line.startsWith('+++') ||
    line.startsWith('---') ||
    line.startsWith('diff ') ||
    line.startsWith('index ')
  )
    return 'diff-file'
  if (line.startsWith('@@')) return 'diff-hunk'
  if (line.startsWith('+')) return 'diff-added'
  if (line.startsWith('-')) return 'diff-removed'
  return ''
}

function markImageError(id: string) {
  imageErrors.value = new Set([...imageErrors.value, id])
}

function tabKey(event: KeyboardEvent, index: number) {
  let next = index
  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
  else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = tabs.length - 1
  else return
  event.preventDefault()
  tab.value = tabs[next]!.id
  document.getElementById(`tab-${tab.value}`)?.focus()
}

watch(
  () => props.detail.task.id,
  () => {
    tab.value = 'timeline'
    followLatest.value = true
    imageErrors.value = new Set()
    previewId.value = ''
    copyState.value = ''
    failuresOnly.value = false
  }
)
watch(
  () => [props.detail.task.id, props.detail.patch, patchArtifact.value?.id],
  () => {
    void loadPatch()
  },
  { immediate: true }
)
watch(
  () => [props.detail.events.length, tab.value, followLatest.value],
  async () => {
    if (!followLatest.value || tab.value !== 'timeline') return
    await nextTick()
    timeline.value?.scrollTo({ top: timeline.value.scrollHeight, behavior: 'auto' })
  }
)
onBeforeUnmount(() => {
  ++patchGeneration
  patchController?.abort()
})
</script>

<template>
  <section class="task-detail">
    <header class="detail-header">
      <div class="breadcrumb">
        <button
          class="icon-button mobile-back"
          title="返回任务列表"
          aria-label="返回任务列表"
          @click="emit('back')"
        >
          <ArrowLeft :size="18" />
        </button>
        <span>任务</span><ChevronRight :size="13" /><code>{{ task.id }}</code>
        <span
          class="visibility-tag"
          :title="task.public ? '未登录访客可查看' : '仅登录管理员可查看'"
        >
          <Globe v-if="task.public" :size="13" /><LockKeyhole v-else :size="13" />
          {{ task.public ? '公开' : '私有' }}
        </span>
      </div>
      <div class="detail-title-row">
        <div class="detail-title">
          <h1>{{ caseInfo?.title || task.caseId }}</h1>
          <p v-if="task.description || caseInfo">{{ taskDescription(task, caseInfo) }}</p>
        </div>
        <span class="status-badge" :class="statusTone(task.status)"
          ><span class="status-dot" />{{ statusLabels[task.status] || task.status }}</span
        >
      </div>
      <div class="task-meta-row">
        <span class="mode-tag" :class="{ 'replay-tag': task.mode === 'replay' }">
          <FlaskConical v-if="task.mode === 'replay'" :size="14" /><Sparkles v-else :size="14" />
          {{ task.mode === 'replay' ? '脚本回放（非 AI 修复）' : 'AI 修复' }}
        </span>
        <span
          >策略 <strong>{{ task.strategy }}</strong></span
        >
        <span class="task-created"><Clock3 :size="13" />{{ dateTime(task.createdAt) }}</span>
      </div>
      <div class="detail-toolbar">
        <div class="connection-state" :class="{ connected: connection === 'live' }" role="status">
          <span class="status-dot" />
          {{
            connection === 'live'
              ? '事件流已连接'
              : connection === 'connecting'
                ? '连接事件流'
                : connection === 'reconnecting'
                  ? '正在重新连接'
                  : isActive
                    ? '等待同步'
                    : '运行已结束'
          }}
        </div>
        <div class="toolbar-actions">
          <button
            class="icon-button"
            title="刷新任务"
            aria-label="刷新任务"
            @click="emit('refresh')"
          >
            <RefreshCw :size="16" />
          </button>
          <button
            v-if="isActive"
            class="button small secondary"
            :disabled="!authenticated || busy || task.cancelRequested"
            :title="!authenticated ? '登录后可取消任务' : '取消当前任务'"
            @click="emit('cancel')"
          >
            <Square :size="13" />{{ task.cancelRequested ? '取消中' : '取消' }}
          </button>
          <button
            class="button small secondary"
            :disabled="!authenticated || busy"
            :title="!authenticated ? '登录后可重跑任务' : '调整配置并重跑'"
            @click="emit('rerun')"
          >
            <RotateCcw :size="14" />重跑
          </button>
        </div>
      </div>
      <p v-if="task.error" class="inline-alert danger task-error" role="alert">
        <AlertCircle :size="16" />{{ task.error }}
      </p>
      <div class="task-overview" aria-label="运行概览">
        <button class="verdict-link" :class="verdictTone" @click="tab = 'acceptance'">
          <ShieldCheck :size="20" /><span
            ><strong>{{ verdictLabel }}</strong
            ><small>{{
              detail.report
                ? `${passedAssertions} / ${detail.report.assertions.length} 项断言通过`
                : '暂无验收报告'
            }}</small></span
          ><ChevronRight :size="16" />
        </button>
        <div class="overview-metrics">
          <span
            >运行耗时<strong>{{
              detail.run ? duration(detail.run.durationMs) : '未记录'
            }}</strong></span
          ><button @click="tab = 'diff'">
            补丁变更<strong
              ><span class="text-success">+{{ diffStats.added }}</span>
              <span class="text-danger">−{{ diffStats.removed }}</span></strong
            ></button
          ><button @click="tab = 'evidence'">
            运行证据<strong>{{ detail.artifacts.length }} 项</strong>
          </button>
        </div>
      </div>
      <ol class="stage-track" aria-label="执行阶段">
        <li
          v-for="(stage, index) in stages"
          :key="stage.label"
          :class="{ complete: index < stageIndex, current: index === stageIndex && isActive }"
          :aria-current="index === stageIndex && isActive ? 'step' : undefined"
        >
          <Check v-if="index < stageIndex" :size="13" /><span v-else class="stage-number">{{
            index + 1
          }}</span
          >{{ stage.label }}
        </li>
      </ol>
    </header>
    <div class="detail-tabs" role="tablist" aria-label="任务详情">
      <button
        v-for="(item, index) in tabs"
        :id="`tab-${item.id}`"
        :key="item.id"
        role="tab"
        :aria-selected="tab === item.id"
        :aria-controls="`panel-${item.id}`"
        :tabindex="tab === item.id ? 0 : -1"
        :class="{ active: tab === item.id }"
        @click="tab = item.id"
        @keydown="tabKey($event, index)"
      >
        <component :is="item.icon" :size="16" /><span>{{ item.label }}</span>
        <span v-if="count(item.id) !== undefined" class="tab-count">{{ count(item.id) }}</span>
      </button>
    </div>

    <section
      v-if="tab === 'timeline'"
      id="panel-timeline"
      class="tab-panel timeline-panel"
      role="tabpanel"
      aria-labelledby="tab-timeline"
    >
      <div class="panel-heading">
        <span class="small-label"
          >执行记录 <span class="mono">{{ detail.events.length }}</span></span
        >
        <label class="checkbox-label compact"
          ><input v-model="followLatest" type="checkbox" /><ArrowDownToLine
            :size="13"
          />跟随最新</label
        >
      </div>
      <div v-if="detail.events.length" ref="timeline" class="timeline-scroll">
        <ol class="timeline">
          <li
            v-for="event in detail.events"
            :key="event.seq"
            :class="{ 'event-error': /error|fail/i.test(event.type) }"
          >
            <span class="event-node"
              ><AlertCircle v-if="/error|fail/i.test(event.type)" :size="12" /><Circle
                v-else
                :size="8"
            /></span>
            <div class="event-body">
              <div class="event-meta">
                <time>{{ eventTime(event.time) }}</time
                ><span>{{ event.type }}</span
                ><code>#{{ event.seq }}</code>
              </div>
              <p>{{ event.message }}</p>
              <details v-if="event.data !== undefined && event.data !== null" class="event-data">
                <summary>事件数据</summary>
                <pre>{{ displayValue(event.data) }}</pre>
              </details>
            </div>
          </li>
        </ol>
      </div>
      <div v-else class="empty-state">
        <ListTree :size="34" :stroke-width="1.4" />
        <h3>尚无执行记录</h3>
        <p>{{ isActive ? '等待工作进程产生事件。' : '此任务未记录执行事件。' }}</p>
      </div>
      <div v-if="detail.run" class="run-strip">
        <span
          ><span class="small-label">耗时</span
          ><strong>{{ duration(detail.run.durationMs) }}</strong></span
        >
        <span
          ><span class="small-label">调用</span><strong>{{ detail.run.calls }}</strong></span
        >
        <span
          ><span class="small-label">补丁尝试</span
          ><strong>{{ detail.run.patchAttempts }}</strong></span
        >
        <span
          ><span class="small-label">输入 / 输出 TOKENS</span
          ><strong
            >{{ detail.run.inputTokens ?? '未记录' }} /
            {{ detail.run.outputTokens ?? '未记录' }}</strong
          ></span
        >
        <span
          ><span class="small-label">费用 USD</span
          ><strong>{{
            detail.run.costUsd === null ? '未记录' : `$${detail.run.costUsd.toFixed(4)}`
          }}</strong></span
        >
      </div>
    </section>

    <section
      v-if="tab === 'diff'"
      id="panel-diff"
      class="tab-panel"
      role="tabpanel"
      aria-labelledby="tab-diff"
    >
      <div class="panel-heading">
        <span class="small-label"
          >补丁变更 <span class="text-success">+{{ diffStats.added }}</span>
          <span class="text-danger">−{{ diffStats.removed }}</span></span
        >
        <div v-if="patchText" class="toolbar-actions">
          <button
            class="icon-button"
            :class="{ active: wrapDiff }"
            title="自动换行"
            aria-label="自动换行"
            :aria-pressed="wrapDiff"
            @click="wrapDiff = !wrapDiff"
          >
            <WrapText :size="16" /></button
          ><button class="icon-button" title="复制补丁" aria-label="复制补丁" @click="copyPatch">
            <Check v-if="copyState === '已复制'" :size="16" /><Copy v-else :size="16" /></button
          ><span v-if="copyState" class="small-label" role="status">{{ copyState }}</span>
        </div>
        <a
          v-if="patchArtifact"
          class="button small secondary"
          :href="artifactUrl(patchArtifact.id)"
          :download="patchArtifact.name"
          ><Download :size="14" />下载补丁</a
        >
      </div>
      <div v-if="patchLoading" class="empty-state">
        <LoaderCircle :size="24" class="spin" />
        <p>正在读取补丁</p>
      </div>
      <div v-else-if="patchError" class="empty-state">
        <AlertCircle :size="30" />
        <p role="alert">{{ patchError }}</p>
        <button class="button secondary" @click="loadPatch"><RefreshCw :size="15" />重试</button>
      </div>
      <div v-else-if="patchText" class="diff-scroll" :class="{ 'diff-wrapped': wrapDiff }">
        <pre
          class="diff-code"
        ><code><span v-for="(line, index) in patchText.split('\n')" :key="index" class="diff-line" :class="diffClass(line)"><span class="line-number" aria-hidden="true">{{ index + 1 }}</span><span>{{ line || ' ' }}</span></span></code></pre>
      </div>
      <div v-else class="empty-state">
        <Code2 :size="34" :stroke-width="1.4" />
        <h3>尚无补丁</h3>
        <p>此任务尚未产生可查看的代码变更。</p>
      </div>
    </section>

    <section
      v-if="tab === 'evidence'"
      id="panel-evidence"
      class="tab-panel evidence-panel"
      role="tabpanel"
      aria-labelledby="tab-evidence"
    >
      <div class="panel-heading">
        <span class="small-label">运行产物</span
        ><span class="muted">{{ detail.artifacts.length }} 项</span>
      </div>
      <div v-if="detail.artifacts.length" class="evidence-content">
        <div v-if="images.length" class="evidence-grid">
          <figure v-for="image in images" :key="image.id" class="evidence-image">
            <figcaption>
              <span class="image-kind"
                ><FileImage :size="14" />{{ artifactLabels[image.kind] }}</span
              ><a
                class="icon-button"
                :href="artifactUrl(image.id)"
                :download="image.name"
                :title="`下载 ${image.name}`"
                :aria-label="`下载 ${image.name}`"
                ><Download :size="15"
              /></a>
            </figcaption>
            <div v-if="imageErrors.has(image.id)" class="image-unavailable">
              <ImageOff :size="28" /><span>截图无法加载</span>
            </div>
            <button
              v-else
              :aria-label="`放大截图：${image.name}`"
              class="image-link"
              @click="previewId = image.id"
            >
              <img
                :src="artifactUrl(image.id)"
                :alt="`${artifactLabels[image.kind]}：${caseInfo?.title || task.caseId}`"
                loading="lazy"
                @error="markImageError(image.id)"
              />
              <span class="image-open"><ZoomIn :size="13" />放大</span>
            </button>
            <div class="image-caption">
              <span :title="image.name">{{ image.name }}</span
              ><span>{{ bytes(image.size) }}</span>
            </div>
          </figure>
        </div>
        <ul v-if="files.length" class="artifact-list">
          <li v-for="file in files" :key="file.id">
            <span class="file-icon"
              ><FileDiff v-if="file.kind === 'patch'" :size="19" /><FileCheck2
                v-else-if="file.kind === 'report'"
                :size="19" /><FileText v-else :size="19"
            /></span>
            <div>
              <strong>{{ file.name }}</strong
              ><span>{{ artifactLabels[file.kind] }} · {{ bytes(file.size) }}</span>
            </div>
            <a
              class="icon-button"
              :href="artifactUrl(file.id)"
              :download="file.name"
              :title="`下载 ${file.name}`"
              :aria-label="`下载 ${file.name}`"
              ><Download :size="17"
            /></a>
          </li>
        </ul>
      </div>
      <div v-else class="empty-state">
        <FileImage :size="34" :stroke-width="1.4" />
        <h3>尚无运行证据</h3>
        <p>截图、Trace 和日志将在生成后显示。</p>
      </div>
    </section>

    <section
      v-if="tab === 'acceptance'"
      id="panel-acceptance"
      class="tab-panel acceptance-panel"
      role="tabpanel"
      aria-labelledby="tab-acceptance"
    >
      <div class="panel-heading">
        <span class="small-label">独立验收</span
        ><a
          v-if="reportArtifact"
          class="button small secondary"
          :href="artifactUrl(reportArtifact.id)"
          :download="reportArtifact.name"
          ><Download :size="14" />下载报告</a
        >
      </div>
      <div v-if="detail.report" class="acceptance-content">
        <div
          class="acceptance-result"
          :class="incomplete ? 'warning' : detail.report.passed ? 'success' : 'danger'"
        >
          <CheckCheck v-if="detail.report.passed" :size="28" /><AlertCircle v-else :size="28" />
          <div>
            <h2>
              {{ incomplete ? '验收未完成' : detail.report.passed ? '验收通过' : '验收未通过' }}
            </h2>
            <p>
              {{ passedAssertions }} / {{ detail.report.assertions.length }} 项断言通过 ·
              {{ duration(detail.report.durationMs) }}
            </p>
          </div>
        </div>
        <div v-if="incomplete" class="inline-alert warning acceptance-diagnostic" role="status">
          <AlertCircle :size="17" />
          <div>
            <strong
              >{{ detail.report.phase ? phaseLabels[detail.report.phase] : '验收' }}阶段中断</strong
            >
            <p>{{ detail.report.error || '未能完成全部验收步骤' }}</p>
          </div>
        </div>
        <div v-if="failedAssertions" class="acceptance-filter">
          <span class="small-label">{{ failedAssertions }} 项失败</span>
          <label class="checkbox-label compact"
            ><input v-model="failuresOnly" type="checkbox" />仅看失败项</label
          >
        </div>
        <ul class="assertion-list">
          <li v-for="(assertion, index) in visibleAssertions" :key="index">
            <Check v-if="assertion.passed" :size="17" class="text-success" /><X
              v-else
              :size="17"
              class="text-danger"
            />
            <div>
              <strong>{{ assertionName(assertion.name) }}</strong>
              <p v-if="assertion.detail">{{ assertion.detail }}</p>
              <div v-if="assertion.viewport || assertion.screenshotId" class="assertion-evidence">
                <span v-if="assertion.viewport" class="small-label mono"
                  >{{ assertion.viewport.width }} × {{ assertion.viewport.height }}</span
                >
                <button
                  v-if="
                    assertion.screenshotId &&
                    images.some((image) => image.id === assertion.screenshotId)
                  "
                  class="button small secondary"
                  @click="previewId = assertion.screenshotId!"
                >
                  <FileImage :size="14" />失败截图
                </button>
              </div>
            </div>
            <span :class="assertion.passed ? 'text-success' : 'text-danger'">{{
              assertion.passed ? '通过' : '失败'
            }}</span>
          </li>
        </ul>
        <details v-if="detail.report.evidenceWarnings?.length" class="evidence-warnings">
          <summary>证据采集异常（{{ detail.report.evidenceWarnings.length }}）</summary>
          <ul>
            <li v-for="(warning, index) in detail.report.evidenceWarnings" :key="index">
              {{ warning }}
            </li>
          </ul>
        </details>
        <dl class="report-meta">
          <div>
            <dt>干净环境</dt>
            <dd>{{ detail.report.cleanEnvironment ? '是' : '否' }}</dd>
          </div>
          <div>
            <dt>验收时间</dt>
            <dd>{{ dateTime(detail.report.evaluatedAt) }}</dd>
          </div>
          <div>
            <dt>源文件哈希</dt>
            <dd class="mono hash-value">{{ detail.report.sourceHash || '未生成' }}</dd>
          </div>
        </dl>
      </div>
      <div v-else class="empty-state">
        <ShieldCheck :size="34" :stroke-width="1.4" />
        <h3>尚未生成验收报告</h3>
        <p>任务状态不能代替独立验收结果。</p>
        <div v-if="caseInfo?.criteria.length" class="pending-criteria">
          <span class="small-label">预期验收条件</span>
          <ul>
            <li v-for="criterion in caseInfo.criteria" :key="criterion">{{ criterion }}</li>
          </ul>
        </div>
      </div>
    </section>
  </section>
  <ModalShell
    v-if="preview"
    :title="`${artifactLabels[preview.kind]} · ${preview.name}`"
    label-id="evidence-preview"
    wide
    @close="previewId = ''"
  >
    <div class="evidence-preview">
      <img :src="artifactUrl(preview.id)" :alt="preview.name" />
      <div class="preview-actions">
        <div class="segmented">
          <button
            v-for="image in images"
            :key="image.id"
            :class="{ selected: image.id === previewId }"
            :aria-pressed="image.id === previewId"
            @click="previewId = image.id"
          >
            {{ artifactLabels[image.kind] }}
          </button>
        </div>
        <a
          class="button small secondary"
          :href="artifactUrl(preview.id)"
          target="_blank"
          rel="noopener"
          ><ExternalLink :size="14" />查看原图</a
        >
      </div>
    </div>
  </ModalShell>
</template>
