<script setup lang="ts">
import { Search, RotateCcw } from 'lucide-vue-next';
defineProps<{ query: string; owner: string; priority: string; sort: string }>();
const emit = defineEmits<{ 'update:query': [value: string]; 'update:owner': [value: string]; 'update:priority': [value: string]; 'update:sort': [value: string]; reset: [] }>();
</script>
<template>
  <section class="task-toolbar" aria-label="Task filters" data-testid="task-toolbar">
    <label class="task-search"><Search :size="16" aria-hidden="true" /><span class="sr-only">Search tasks</span><input :value="query" data-testid="task-search" placeholder="Search tasks" @input="emit('update:query', ($event.target as HTMLInputElement).value)" /></label>
    <label>Owner<select :value="owner" data-testid="task-owner-filter" @change="emit('update:owner', ($event.target as HTMLSelectElement).value)"><option>All</option><option>Maya</option><option>Noah</option><option>Lina</option></select></label>
    <label>Priority<select :value="priority" data-testid="task-priority-filter" @change="emit('update:priority', ($event.target as HTMLSelectElement).value)"><option>All</option><option>High</option><option>Medium</option><option>Low</option></select></label>
    <label>Sort<select :value="sort" data-testid="task-sort" @change="emit('update:sort', ($event.target as HTMLSelectElement).value)"><option value="manual">Board order</option><option value="priority">Priority</option></select></label>
    <button data-testid="reset-tasks" @click="emit('reset')"><RotateCcw :size="16" aria-hidden="true" />Reset</button>
  </section>
</template>
