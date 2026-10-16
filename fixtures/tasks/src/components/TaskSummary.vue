<script setup lang="ts">
import { computed } from 'vue';
import { isOverdue, today, type WorkTask } from '../model';
const props = defineProps<{ tasks: WorkTask[] }>();
const overdue = computed(() => props.tasks.filter(isOverdue).length);
const completed = computed(() => props.tasks.filter(task => task.status === 'Done').length);
</script>
<template>
  <section class="metrics" aria-label="Task summary"><div><span>Total tasks</span><strong data-testid="total-tasks">{{ tasks.length }}</strong></div><div><span>Completed</span><strong data-testid="completed-tasks">{{ completed }}</strong></div><div><span>Overdue</span><strong class="overdue-count" data-testid="overdue-tasks">{{ overdue }}</strong></div><div><span>Reporting date</span><strong class="reporting-date" data-testid="reporting-date">{{ today }}</strong></div></section>
</template>
