<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';
import { X, Check } from 'lucide-vue-next';
import { categories, type Product } from '../model';
const props = defineProps<{ product: Product | null }>();
const emit = defineEmits<{ save: [product: Product]; cancel: [] }>();
const blank: Product = { id: `new-${Date.now()}`, sku: '', name: '', category: 'Equipment', price: 1, stock: 0, supplier: '', note: '' };
const draft = reactive({ ...(props.product ?? blank) });
const error = ref('');
const nameInput = ref<HTMLInputElement>();
const previousFocus = document.activeElement as HTMLElement | null;
onMounted(() => nextTick(() => nameInput.value?.focus()));
onUnmounted(() => previousFocus?.focus());
function save() {
  error.value = '';
  if (!draft.name.trim() || !draft.sku.trim()) { error.value = 'Name and SKU are required'; return; }
  if (!Number.isFinite(Number(draft.price)) || Number(draft.price) <= 0) { error.value = 'Price must be greater than zero'; return; }
  if (!Number.isInteger(Number(draft.stock)) || Number(draft.stock) < 0) { error.value = 'Stock must be a non-negative whole number'; return; }
  emit('save', { ...draft, name: draft.name.trim(), sku: draft.sku.trim(), price: Number(draft.price), stock: Number(draft.stock) });
}
function trap(event: KeyboardEvent) {
  if (event.key !== 'Tab') return;
  const elements = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button, input, select, textarea')].filter(item => !item.hasAttribute('disabled'));
  const first = elements[0], last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
</script>
<template>
  <div class="modal-backdrop" @click.self="emit('cancel')">
    <section class="product-editor" role="dialog" aria-modal="true" aria-labelledby="product-editor-title" data-testid="product-editor" @keydown.esc="emit('cancel')" @keydown="trap">
      <header class="dialog-heading"><h2 id="product-editor-title">{{ product ? 'Edit product' : 'New product' }}</h2><button aria-label="Close product editor" title="Close" data-testid="close-product-editor" @click="emit('cancel')"><X :size="18" aria-hidden="true" /></button></header>
      <form novalidate @submit.prevent="save">
        <label>Name<input ref="nameInput" v-model="draft.name" data-testid="product-name" /></label>
        <label>SKU<input v-model="draft.sku" data-testid="product-sku" /></label>
        <label>Category<select v-model="draft.category" data-testid="editor-category"><option v-for="category in categories" :key="category">{{ category }}</option></select></label>
        <div class="form-pair"><label>Price ($)<input v-model="draft.price" data-testid="product-price" type="number" step="0.01" /></label><label>Stock<input v-model="draft.stock" data-testid="product-stock" type="number" step="1" /></label></div>
        <label>Supplier<input v-model="draft.supplier" data-testid="product-supplier" /></label>
        <label>Notes<textarea v-model="draft.note" rows="3" data-testid="product-note"></textarea></label>
        <p v-if="error" role="alert" data-testid="product-error">{{ error }}</p>
        <footer class="dialog-actions"><button type="button" data-testid="cancel-product" @click="emit('cancel')">Cancel</button><button class="primary" data-testid="save-product" type="submit"><Check :size="16" aria-hidden="true" />Save product</button></footer>
      </form>
    </section>
  </div>
</template>
