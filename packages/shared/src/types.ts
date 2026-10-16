export type TaskStatus =
  | 'queued'
  | 'preparing'
  | 'investigating'
  | 'repairing'
  | 'checking'
  | 'evaluating'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
export type Mode = 'replay' | 'model'
export type Strategy = 'A' | 'B' | 'C'
export type ArtifactKind = 'before' | 'after' | 'patch' | 'report' | 'trace' | 'log'
export interface CaseInfo {
  id: string
  app: 'products' | 'tasks'
  title: string
  description: string
  category: 'state' | 'form' | 'layout'
  split: 'dev' | 'holdout'
  steps: string[]
  criteria: string[]
}
export interface Task {
  id: string
  caseId: string
  description: string
  mode: Mode
  strategy: Strategy
  status: TaskStatus
  createdAt: string
  updatedAt: string
  cancelRequested: boolean
  public: boolean
  error?: string
  runId?: string
}
export interface Run {
  id: string
  taskId: string
  model: string
  strategy: Strategy
  sandbox: string
  startedAt: string
  finishedAt?: string
  durationMs?: number
  inputTokens: number | null
  outputTokens: number | null
  costUsd: number | null
  calls: number
  patchAttempts: number
  environment: Record<string, string>
}
export interface Event {
  id: string
  taskId: string
  seq: number
  time: string
  type: string
  message: string
  data?: unknown
}
export interface Artifact {
  id: string
  taskId: string
  kind: ArtifactKind
  name: string
  mime: string
  path: string
  size: number
  createdAt: string
  sha256?: string
}
export interface Assertion {
  name: string
  passed: boolean
  detail?: string
  viewport?: { width: number; height: number }
  screenshotId?: string
}
export interface Report {
  caseId: string
  passed: boolean
  assertions: Assertion[]
  durationMs: number
  cleanEnvironment: boolean
  sourceHash: string
  evaluatedAt: string
  outcome?: 'passed' | 'rejected' | 'incomplete'
  phase?: 'preparation' | 'startup' | 'assertions' | 'evidence'
  error?: string
  evidenceWarnings?: string[]
}
export interface TaskDetail {
  task: Task
  run?: Run
  events: Event[]
  artifacts: Artifact[]
  report?: Report
  patch?: string
}
export const terminal = new Set<TaskStatus>(['succeeded', 'failed', 'cancelled', 'interrupted'])
export const budgets = Object.freeze({
  timeoutMs: 240_000,
  maxCalls: 18,
  maxPatches: 3,
  maxFiles: 8,
  maxFileBytes: 64_000,
  maxPatchBytes: 160_000,
  maxOutput: 12_000,
  maxArtifactsBytes: 32_000_000
})
