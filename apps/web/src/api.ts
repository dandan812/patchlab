import type { CaseInfo, Mode, Strategy, Task, TaskDetail } from '../../../packages/shared/src/types'

export interface Meta {
  authenticated: boolean
  modelConfigured: boolean
  modelCredentialsConfigured?: boolean
  modelId?: string | null
  modelApiType?: 'responses' | 'chat-completions'
  sandbox: string
  storage: string
  replayAvailable: boolean
  budgets: Record<string, unknown>
  version: string
}

export interface EvaluationData {
  summary: Record<string, unknown> | null
  files: string[]
}

export interface CreateTaskInput {
  caseId: string
  description: string
  mode: Mode
  strategy: Strategy
  public: boolean
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const mutation = body !== undefined
  const response = await fetch(`/api${path}`, {
    method: mutation ? 'POST' : 'GET',
    credentials: 'include',
    headers: mutation
      ? { 'Content-Type': 'application/json', 'X-Patchlab-Request': '1' }
      : { Accept: 'application/json' },
    ...(mutation ? { body: JSON.stringify(body) } : {})
  })
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(result?.error || `请求失败 (${response.status})`, response.status)
  }
  return response.json() as Promise<T>
}

export const api = {
  meta: () => request<Meta>('/meta'),
  cases: () => request<CaseInfo[]>('/cases'),
  tasks: () => request<Task[]>('/tasks'),
  detail: (id: string) => request<TaskDetail>(`/tasks/${encodeURIComponent(id)}`),
  evaluations: () => request<EvaluationData>('/evaluations'),
  login: (password: string) => request<{ ok: true }>('/login', { password }),
  logout: () => request<{ ok: true }>('/logout', {}),
  createTask: (input: CreateTaskInput) => request<Task>('/tasks', input),
  cancel: (id: string) => request<Task>(`/tasks/${encodeURIComponent(id)}/cancel`, {})
}

export function artifactUrl(id: string) {
  return `/api/artifacts/${encodeURIComponent(id)}`
}
