<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';
import { X, Check } from 'lucide-vue-next';
import { validDueDate, validTitle, today, statuses, priorities, type WorkTask } from '../model';
const props = defineProps<{ task: WorkTask | null }>();
const emit = defineEmits<{ save: [task: WorkTask]; cancel: [] }>();
const blank: WorkTask = { id: `new-${Date.now()}`, title: '', owner: 'Maya', status: 'Todo', priority: 'Medium', due: today, notes: '' };
const draft = reactive({ ...(props.task ?? blank) });
const error = ref('');
const titleInput = ref<HTMLInputElement>();
const previousFocus = document.activeElement as HTMLElement | null;
onMounted(() => nextTick(() => titleInput.value?.focus()));
onUnmounted(() => previousFocus?.focus());
function save() {
  error.value = '';
  if (!validTitle(draft.title)) { error.value = 'Title must contain at least 3 non-padding characters'; return; }
  if (!validDueDate(draft.due) && draft.due !== props.task?.due) { error.value = `Due date must be ${today} or later`; return; }
  emit('save', { ...draft, title: draft.title.trim(), notes: draft.notes.trim() });
}
function trap(event: KeyboardEvent) {
  if (event.key !== 'Tab') return;
  const elements = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button, input, select, textarea')];
  const first = elements[0], last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
</script>
<template>
  <div class="modal-backdrop" @click.self="emit('cancel')">
    <section class="task-editor" role="dialog" aria-modal="true" aria-labelledby="task-editor-title" data-testid="task-editor" @keydown.esc="emit('cancel')" @keydown="trap">
      <header class="dialog-heading"><h2 id="task-editor-title">{{ task ? 'Edit task' : 'New task' }}</h2><button aria-label="Close task editor" title="Close" data-testid="close-task-editor" @click="emit('cancel')"><X :size="18" aria-hidden="true" /></button></header>
      <form novalidate @submit.prevent="save">
        <label>Title<input ref="titleInput" v-model="draft.title" data-testid="task-title" /></label>
        <label>Owner<select v-model="draft.owner" data-testid="task-owner"><option>Maya</option><option>Noah</option><option>Lina</option></select></label>
        <div class="form-pair"><label>Priority<select v-model="draft.priority" data-testid="task-priority"><option v-for="value in priorities" :key="value">{{ value }}</option></select></label><label>Status<select v-model="draft.status" data-testid="task-status"><option v-for="value in statuses" :key="value">{{ value }}</option></select></label></div>
        <label>Due date<input v-model="draft.due" type="date" data-testid="task-due" /></label>
        <label>Notes<textarea v-model="draft.notes" rows="5" data-testid="task-notes"></textarea></label>
        <p v-if="error" role="alert" data-testid="task-error">{{ error }}</p>
        <footer class="dialog-actions"><button type="button" data-testid="cancel-task" @click="emit('cancel')">Cancel</button><button class="primary" type="submit" data-testid="save-task"><Check :size="16" aria-hidden="true" />Save task</button></footer>
      </form>
    </section>
  </div>
</template>
