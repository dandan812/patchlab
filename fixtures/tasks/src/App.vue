<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Columns3, Plus } from 'lucide-vue-next';
import TaskFilters from './components/TaskFilters.vue';
import TaskBoard from './components/TaskBoard.vue';
import TaskEditor from './components/TaskEditor.vue';
import TaskSummary from './components/TaskSummary.vue';
import { priorityRank, changeStatus, type WorkTask, type Status } from './model';
import { loadTasks, persistTasks } from './storage';
const tasks = ref<WorkTask[]>(loadTasks());
watch(tasks, persistTasks, { deep: true });
const query = ref('');
const owner = ref('All');
const priority = ref('All');
const sort = ref('manual');
const editing = ref<WorkTask | null>(null);
const editorOpen = ref(false);
const notice = ref('');
const filtered = computed(() => {
  const values = tasks.value.filter(task => task.title.toLowerCase().includes(query.value.trim().toLowerCase()) && (owner.value === 'All' || task.owner === owner.value) && (priority.value === 'All' || task.priority === priority.value));
  return sort.value === 'priority' ? [...values].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)) : values;
});
function resetFilters() {
  query.value = '';
  owner.value = 'All';
  priority.value = 'All';
}
function openEditor(task: WorkTask | null) { editing.value = task; editorOpen.value = true; }
function saveTask(task: WorkTask) {
  const index = tasks.value.findIndex(item => item.id === task.id);
  if (index < 0) tasks.value.push(task);
  else tasks.value[index] = task;
  editorOpen.value = false;
  notice.value = `${task.title} saved`;
}
function moveTask(id: string, status: Status) {
  tasks.value = tasks.value.map(task => task.id === id ? changeStatus(task, status) : task);
  notice.value = `Task moved to ${status}`;
}
function deleteTask(id: string) { tasks.value = tasks.value.filter(task => task.id !== id); notice.value = 'Task deleted'; }
</script>
<template>
  <div class="shell">
    <header class="app-header"><div class="brand"><Columns3 :size="23" aria-hidden="true" /><span>Teamflow</span></div><span class="workspace">Operations / Delivery</span></header>
    <main>
      <div class="page-heading"><div><p class="eyebrow">TEAM WORKSPACE</p><h1>Tasks</h1></div><button class="primary" data-testid="new-task" @click="openEditor(null)"><Plus :size="17" aria-hidden="true" />New task</button></div>
      <TaskSummary :tasks="tasks" />
      <TaskFilters v-model:query="query" v-model:owner="owner" v-model:priority="priority" v-model:sort="sort" @reset="resetFilters" />
      <div class="board-heading"><h2>Delivery board</h2><span data-testid="task-result-count">{{ filtered.length }} tasks</span></div>
      <TaskBoard :tasks="filtered" @edit="openEditor" @move="moveTask" @delete="deleteTask" />
      <p role="status" class="notice">{{ notice }}</p>
    </main>
    <TaskEditor v-if="editorOpen" :task="editing" @save="saveTask" @cancel="editorOpen = false" />
  </div>
</template>
