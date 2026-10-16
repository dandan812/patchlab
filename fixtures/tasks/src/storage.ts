import { priorities, seed, statuses, type WorkTask } from './model';

const key = 'teamflow.tasks.v1';
function initialTasks(): WorkTask[] { return seed.map(task => ({ ...task })); }
function validTask(value: unknown): value is WorkTask {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const task = value as Record<string, unknown>;
  if (typeof task.id !== 'string' || !task.id.trim() || typeof task.title !== 'string' || task.title.trim().length < 3) return false;
  if (typeof task.owner !== 'string' || !['Maya', 'Noah', 'Lina'].includes(task.owner) || typeof task.notes !== 'string') return false;
  if (!statuses.includes(task.status as WorkTask['status']) || !priorities.includes(task.priority as WorkTask['priority'])) return false;
  if (typeof task.due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(task.due)) return false;
  const parsed = new Date(`${task.due}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === task.due;
}

export function loadTasks(): WorkTask[] {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return initialTasks();
    const tasks: unknown = JSON.parse(stored);
    if (!Array.isArray(tasks) || !tasks.every(validTask) || new Set(tasks.map(task => task.id)).size !== tasks.length) return initialTasks();
    return tasks.map(({ id, title, owner, status, priority, due, notes }) => ({ id, title, owner, status, priority, due, notes }));
  } catch {
    return initialTasks();
  }
}

export function persistTasks(tasks: WorkTask[]): void {
  try { localStorage.setItem(key, JSON.stringify(tasks)); }
  catch { /* Storage may be unavailable or full; in-memory work remains usable. */ }
}
