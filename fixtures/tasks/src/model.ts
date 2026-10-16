export type Status = 'Todo' | 'Doing' | 'Done';
export type Priority = 'High' | 'Medium' | 'Low';
export interface WorkTask { id: string; title: string; owner: string; status: Status; priority: Priority; due: string; notes: string }
// This workspace uses a fixed reporting date, not the real-time calendar.
export const today = '2026-10-01';
export const statuses: Status[] = ['Todo', 'Doing', 'Done'];
export const priorities: Priority[] = ['High', 'Medium', 'Low'];
export const seed: WorkTask[] = [
  { id: 't01', title: 'Prepare release brief', owner: 'Maya', status: 'Todo', priority: 'Low', due: '2026-10-05', notes: 'Summarize release changes for the support team.' },
  { id: 't02', title: 'Audit supplier contracts', owner: 'Noah', status: 'Todo', priority: 'High', due: '2026-09-28', notes: 'Review renewal clauses and current service levels.' },
  { id: 't03', title: 'Update onboarding checklist', owner: 'Lina', status: 'Todo', priority: 'Medium', due: '2026-10-03', notes: 'Include access requests and mentor assignment.' },
  { id: 't04', title: 'Review accessibility', owner: 'Maya', status: 'Doing', priority: 'High', due: '2026-10-01', notes: 'Check focus order and screen reader labels.' },
  { id: 't05', title: 'Reconcile September invoices', owner: 'Noah', status: 'Doing', priority: 'Medium', due: '2026-09-30', notes: 'Match supplier invoices with purchase orders.' },
  { id: 't06', title: 'Publish team handbook', owner: 'Lina', status: 'Done', priority: 'Low', due: '2026-09-25', notes: 'Approved handbook has been distributed.' },
  { id: 't07', title: 'Verify backup restore', owner: 'Noah', status: 'Done', priority: 'High', due: '2026-09-29', notes: 'Restore drill completed in the staging environment.' },
  { id: 't08', title: 'Schedule design review', owner: 'Maya', status: 'Doing', priority: 'Low', due: '2026-10-07', notes: 'Invite product and engineering stakeholders.' },
];

export function validDueDate(value: string): boolean {
  return value.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= today;
}
export function validTitle(value: string): boolean {
  return value.trim().length >= 3;
}
export function changeStatus(task: WorkTask, status: Status): WorkTask {
  return { ...task, status };
}
export function isOverdue(task: WorkTask): boolean {
  return task.status !== 'Done' && task.due < today;
}
export function priorityRank(priority: Priority): number {
  return { High: 0, Medium: 1, Low: 2 }[priority];
}
