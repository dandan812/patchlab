import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  terminal,
  type CaseInfo,
  type Event as TaskEvent,
  type Task,
  type TaskDetail
} from '../../../packages/shared/src/types'
import { api, ApiError, type CreateTaskInput, type EvaluationData, type Meta } from './api'

export type View = 'tasks' | 'cases' | 'evaluations' | 'settings'
const views: View[] = ['tasks', 'cases', 'evaluations', 'settings']

function storedSelection() {
  try {
    return localStorage.getItem('patchlab:selected-task') || ''
  } catch {
    return ''
  }
}

function readRoute() {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/')
  const view = views.includes(parts[0] as View) ? (parts[0] as View) : 'tasks'
  let taskId = ''
  try {
    taskId = parts[1] ? decodeURIComponent(parts[1]) : ''
  } catch {
    /* Ignore malformed URLs. */
  }
  return { view, taskId }
}

export function useWorkbench() {
  const initialRoute = readRoute()
  const view = ref<View>(initialRoute.view)
  const selectedId = ref(initialRoute.taskId || storedSelection())
  const meta = ref<Meta | null>(null)
  const cases = ref<CaseInfo[]>([])
  const tasks = ref<Task[]>([])
  const detail = ref<TaskDetail | null>(null)
  const evaluations = ref<EvaluationData | null>(null)
  const loading = ref(true)
  const detailLoading = ref(false)
  const evaluationsLoading = ref(false)
  const error = ref('')
  const detailError = ref('')
  const evaluationsError = ref('')
  const connection = ref<'idle' | 'connecting' | 'live' | 'reconnecting'>('idle')
  const busy = ref(false)
  const authenticated = computed(() => Boolean(meta.value?.authenticated))
  const selectedCase = computed(() =>
    cases.value.find((item) => item.id === detail.value?.task.caseId)
  )
  const activeTasks = computed(() => tasks.value.filter((task) => !terminal.has(task.status)))
  let stream: EventSource | undefined
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let detailTimer: ReturnType<typeof setTimeout> | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let lastSeq = 0
  let retry = 0
  let selectionGeneration = 0
  let authGeneration = 0
  let disposed = false
  let refreshPending = false
  let detailPending = false

  function updateTask(task: Task) {
    const index = tasks.value.findIndex((item) => item.id === task.id)
    if (index === -1) tasks.value = [task, ...tasks.value]
    else tasks.value = tasks.value.map((item) => (item.id === task.id ? task : item))
    tasks.value.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (detail.value?.task.id === task.id) detail.value = { ...detail.value, task }
  }

  function setRoute(nextView: View, id = selectedId.value) {
    const hash = nextView === 'tasks' && id ? `#/tasks/${encodeURIComponent(id)}` : `#/${nextView}`
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash)
  }

  function navigate(nextView: View) {
    view.value = nextView
    setRoute(nextView)
  }

  function selectTask(id: string) {
    view.value = 'tasks'
    selectedId.value = id
    setRoute('tasks', id)
    try {
      localStorage.setItem('patchlab:selected-task', id)
    } catch {
      /* Storage may be disabled. */
    }
  }

  function closeStream() {
    stream?.close()
    stream = undefined
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (detailTimer) clearTimeout(detailTimer)
    reconnectTimer = undefined
    detailTimer = undefined
    connection.value = 'idle'
  }

  function mergeEvents(current: TaskEvent[], incoming: TaskEvent[]) {
    const bySeq = new Map(current.map((event) => [event.seq, event]))
    for (const event of incoming) bySeq.set(event.seq, event)
    return [...bySeq.values()].sort((a, b) => a.seq - b.seq)
  }

  async function refreshDetail(id: string, generation: number) {
    if (detailPending || disposed || id !== selectedId.value) return
    detailPending = true
    try {
      const result = await api.detail(id)
      if (disposed || generation !== selectionGeneration || selectedId.value !== id) return
      const events = mergeEvents(result.events, detail.value?.events || [])
      const currentTask = detail.value?.task
      // A response begun before an SSE update must not roll the status backward.
      if (currentTask && currentTask.updatedAt > result.task.updatedAt) result.task = currentTask
      detail.value = { ...result, events }
      lastSeq = Math.max(lastSeq, ...events.map((event) => event.seq))
      updateTask(result.task)
      detailError.value = ''
      if (terminal.has(result.task.status)) closeStream()
    } catch (cause) {
      if (generation !== selectionGeneration) return
      detailError.value = cause instanceof Error ? cause.message : '任务加载失败'
      if (
        cause instanceof ApiError &&
        (cause.status === 401 || cause.status === 403 || cause.status === 404)
      ) {
        closeStream()
        detail.value = null
      }
    } finally {
      detailPending = false
    }
  }

  function scheduleDetail(id: string, generation: number) {
    if (detailTimer) return
    detailTimer = setTimeout(() => {
      detailTimer = undefined
      void refreshDetail(id, generation)
    }, 500)
  }

  function connect(id: string, generation: number) {
    if (disposed || generation !== selectionGeneration || selectedId.value !== id) return
    connection.value = retry ? 'reconnecting' : 'connecting'
    const source = new EventSource(`/api/tasks/${encodeURIComponent(id)}/events?after=${lastSeq}`, {
      withCredentials: true
    })
    stream = source
    source.onopen = () => {
      if (stream !== source) return
      retry = 0
      connection.value = 'live'
      scheduleDetail(id, generation)
    }
    source.addEventListener('event', (message: MessageEvent<string>) => {
      if (stream !== source || generation !== selectionGeneration || !detail.value) return
      try {
        const event = JSON.parse(message.data) as TaskEvent
        if (event.taskId !== id || !Number.isFinite(event.seq)) return
        detail.value.events = mergeEvents(detail.value.events, [event])
        lastSeq = Math.max(lastSeq, event.seq)
        scheduleDetail(id, generation)
      } catch {
        detailError.value = '收到无法解析的事件，正在重新同步。'
        scheduleDetail(id, generation)
      }
    })
    source.addEventListener('status', (message: MessageEvent<string>) => {
      if (stream !== source || generation !== selectionGeneration) return
      try {
        const task = JSON.parse(message.data) as Task
        if (task.id !== id) return
        updateTask(task)
        scheduleDetail(id, generation)
      } catch {
        scheduleDetail(id, generation)
      }
    })
    source.onerror = () => {
      if (stream !== source || disposed) return
      source.close()
      stream = undefined
      connection.value = 'reconnecting'
      const delay = Math.min(1_000 * 2 ** retry++, 15_000)
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined
        connect(id, generation)
      }, delay)
    }
  }

  async function loadSelection() {
    const generation = ++selectionGeneration
    closeStream()
    retry = 0
    lastSeq = 0
    detail.value = null
    detailError.value = ''
    const id = selectedId.value
    if (!id) {
      detailLoading.value = false
      return
    }
    detailLoading.value = true
    try {
      const result = await api.detail(id)
      if (generation !== selectionGeneration || disposed) return
      detail.value = { ...result, events: mergeEvents([], result.events) }
      lastSeq = Math.max(0, ...result.events.map((event) => event.seq))
      updateTask(result.task)
      if (!terminal.has(result.task.status)) connect(id, generation)
    } catch (cause) {
      if (generation !== selectionGeneration) return
      detailError.value = cause instanceof Error ? cause.message : '任务加载失败'
    } finally {
      if (generation === selectionGeneration) detailLoading.value = false
    }
  }

  async function refresh() {
    if (refreshPending || disposed) return
    const generation = authGeneration
    refreshPending = true
    try {
      const [nextMeta, nextCases, nextTasks] = await Promise.all([
        api.meta(),
        api.cases(),
        api.tasks()
      ])
      if (disposed || generation !== authGeneration) return
      const authorizationChanged =
        meta.value !== null && meta.value.authenticated !== nextMeta.authenticated
      meta.value = nextMeta
      cases.value = nextCases
      tasks.value = nextTasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      error.value = ''
      if (authorizationChanged) {
        ++selectionGeneration
        closeStream()
        detail.value = null
        evaluations.value = null
        const visibleId = tasks.value.some((task) => task.id === selectedId.value)
          ? selectedId.value
          : tasks.value[0]?.id || ''
        if (visibleId === selectedId.value) void loadSelection()
        else selectedId.value = visibleId
        setRoute(view.value, visibleId)
        if (view.value === 'evaluations') void loadEvaluations()
      }
      if (!selectedId.value && tasks.value.length) selectTask(tasks.value[0]!.id)
    } catch (cause) {
      if (generation === authGeneration)
        error.value = cause instanceof Error ? cause.message : '服务连接失败'
    } finally {
      refreshPending = false
      loading.value = false
    }
  }

  async function loadEvaluations() {
    const generation = authGeneration
    evaluationsLoading.value = true
    evaluationsError.value = ''
    try {
      const result = await api.evaluations()
      if (generation === authGeneration && !disposed) evaluations.value = result
    } catch (cause) {
      if (generation === authGeneration)
        evaluationsError.value = cause instanceof Error ? cause.message : '评估结果加载失败'
    } finally {
      evaluationsLoading.value = false
    }
  }

  async function syncAuth() {
    ++authGeneration
    ++selectionGeneration
    closeStream()
    detail.value = null
    tasks.value = []
    evaluations.value = null
    // Fetch fresh authorization-scoped lists even if the periodic refresh is in flight.
    const [nextMeta, nextTasks] = await Promise.all([api.meta(), api.tasks()])
    meta.value = nextMeta
    tasks.value = nextTasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const id = tasks.value.some((task) => task.id === selectedId.value)
      ? selectedId.value
      : tasks.value[0]?.id || ''
    if (selectedId.value === id) await loadSelection()
    else selectedId.value = id
    setRoute(view.value, id)
    try {
      if (id) localStorage.setItem('patchlab:selected-task', id)
      else localStorage.removeItem('patchlab:selected-task')
    } catch {
      /* Storage may be disabled. */
    }
    if (view.value === 'evaluations') await loadEvaluations()
  }

  async function login(password: string) {
    busy.value = true
    try {
      await api.login(password)
      await syncAuth()
    } finally {
      busy.value = false
    }
  }

  async function logout() {
    busy.value = true
    try {
      await api.logout()
      if (meta.value) meta.value = { ...meta.value, authenticated: false }
      await syncAuth()
    } finally {
      busy.value = false
    }
  }

  async function createTask(input: CreateTaskInput) {
    busy.value = true
    try {
      const task = await api.createTask(input)
      updateTask(task)
      selectTask(task.id)
      return task
    } finally {
      busy.value = false
    }
  }

  async function cancelTask() {
    if (!detail.value) return
    busy.value = true
    try {
      updateTask(await api.cancel(detail.value.task.id))
    } finally {
      busy.value = false
    }
  }

  function handleHash() {
    const route = readRoute()
    view.value = route.view
    if (route.view === 'tasks' && route.taskId) selectTask(route.taskId)
  }

  watch(selectedId, () => {
    void loadSelection()
  })
  watch(view, (next) => {
    if (next === 'evaluations') void loadEvaluations()
  })
  onMounted(async () => {
    window.addEventListener('hashchange', handleHash)
    if (selectedId.value) void loadSelection()
    await refresh()
    if (view.value === 'evaluations') void loadEvaluations()
    pollTimer = setInterval(() => {
      void refresh()
      if (detail.value && !terminal.has(detail.value.task.status)) {
        void refreshDetail(selectedId.value, selectionGeneration)
      }
    }, 10_000)
  })
  onBeforeUnmount(() => {
    disposed = true
    ++selectionGeneration
    closeStream()
    if (pollTimer) clearInterval(pollTimer)
    window.removeEventListener('hashchange', handleHash)
  })

  return {
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
    activeTasks,
    navigate,
    selectTask,
    refresh,
    loadSelection,
    loadEvaluations,
    login,
    logout,
    createTask,
    cancelTask
  }
}
