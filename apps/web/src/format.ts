import type { ArtifactKind, TaskStatus } from '../../../packages/shared/src/types'

export const statusLabels: Record<TaskStatus, string> = {
  queued: '排队中',
  preparing: '准备环境',
  investigating: '调查中',
  repairing: '修复中',
  checking: '检查中',
  evaluating: '验收中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断'
}

export const artifactLabels: Record<ArtifactKind, string> = {
  before: '修复前',
  after: '修复后',
  patch: '补丁',
  report: '验收报告',
  trace: '浏览器 Trace',
  log: '运行日志'
}

export function statusTone(status: TaskStatus) {
  if (status === 'succeeded') return 'success'
  if (status === 'failed' || status === 'interrupted') return 'danger'
  if (status === 'cancelled') return 'neutral'
  if (status === 'queued') return 'warning'
  return 'info'
}

export function dateTime(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
}

export function eventTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString('zh-CN', { hour12: false })
}

export function duration(ms?: number) {
  if (ms === undefined) return '—'
  if (ms < 1_000) return `${Math.round(ms)} ms`
  const seconds = Math.round(ms / 1_000)
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}

export function bytes(value: number) {
  if (value < 1_024) return `${value} B`
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`
  return `${(value / 1_048_576).toFixed(1)} MB`
}

export function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '未记录'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}
