<script setup lang="ts">
import { Pencil, Trash2, CalendarDays } from 'lucide-vue-next';
import { statuses, isOverdue, type WorkTask, type Status } from '../model';
defineProps<{ tasks: WorkTask[] }>();
const emit = defineEmits<{ edit: [task: WorkTask]; move: [id: string, status: Status]; delete: [id: string] }>();
</script>
<template>
  <section class="task-board" aria-label="Delivery board" data-testid="task-board">
    <section v-for="status in statuses" :key="status" class="board-column" :aria-label="status" :data-testid="`column-${status.toLowerCase()}`">
      <header class="column-heading"><h3>{{ status }}</h3><span :data-testid="`count-${status.toLowerCase()}`">{{ tasks.filter(task => task.status === status).length }}</span></header>
      <article v-for="task in tasks.filter(task => task.status === status)" :key="task.id" class="task-card" :data-testid="`task-${task.id}`">
        <div class="card-top"><span class="priority-tag" :class="task.priority.toLowerCase()">{{ task.priority }}</span><button :aria-label="`Edit ${task.title}`" title="Edit task" :data-testid="`edit-${task.id}`" @click="emit('edit', task)"><Pencil :size="15" aria-hidden="true" /></button></div>
        <h4 :data-testid="`title-${task.id}`">{{ task.title }}</h4><p class="task-note">{{ task.notes }}</p>
        <div class="task-meta"><span>{{ task.owner }}</span><span :class="{ overdue: isOverdue(task) }"><CalendarDays :size="13" aria-hidden="true" />{{ task.due }}</span></div>
        <div class="task-actions"><label><span class="sr-only">Status for {{ task.title }}</span><select :value="task.status" :data-testid="`status-${task.id}`" @change="emit('move', task.id, ($event.target as HTMLSelectElement).value as Status)"><option v-for="value in statuses" :key="value">{{ value }}</option></select></label><button :aria-label="`Delete ${task.title}`" title="Delete task" :data-testid="`delete-${task.id}`" @click="emit('delete', task.id)"><Trash2 :size="15" aria-hidden="true" /></button></div>
      </article>
      <p v-if="!tasks.some(task => task.status === status)" class="column-empty">No tasks</p>
    </section>
  </section>
</template>
