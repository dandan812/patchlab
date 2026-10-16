<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Package, Plus, ChevronLeft, ChevronRight, Trash2 } from 'lucide-vue-next';
import ProductFilters from './components/ProductFilters.vue';
import ProductTable from './components/ProductTable.vue';
import ProductEditor from './components/ProductEditor.vue';
import OrderCart from './components/OrderCart.vue';
import { seed, matchesProduct, removeSelected, money, type Product } from './model';

const products = ref<Product[]>(seed.map((item) => ({ ...item })));
const query = ref('');
const category = ref('All');
const page = ref(1);
const pageSize = 5;
const selected = ref<string[]>([]);
const editing = ref<Product | null>(null);
const editorOpen = ref(false);
const notice = ref('');
const cart = ref<Array<{ product: Product; quantity: number }>>([]);
const filtered = computed(() => products.value.filter((product) =>
  matchesProduct(product, query.value) && (category.value === 'All' || product.category === category.value)));
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)));
const visible = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const inventoryValue = computed(() => products.value.reduce((total, item) => total + item.price * item.stock, 0));
watch([query, category], () => { page.value = 1; });

function openEditor(product: Product | null) {
  editing.value = product;
  editorOpen.value = true;
}
function saveProduct(product: Product) {
  const index = products.value.findIndex((item) => item.id === product.id);
  if (index < 0) products.value.push(product);
  else products.value[index] = product;
  editorOpen.value = false;
  notice.value = `${product.name} saved`;
}
function toggle(id: string) {
  selected.value = selected.value.includes(id) ? selected.value.filter((value) => value !== id) : [...selected.value, id];
}
function deleteSelected() {
  const count = selected.value.length;
  products.value = removeSelected(products.value, selected.value);
  selected.value = [];
  page.value = Math.min(page.value, pageCount.value);
  notice.value = `${count} products removed`;
}
function addToOrder(product: Product) {
  const line = cart.value.find((item) => item.product.id === product.id);
  if (line && line.quantity < product.stock) line.quantity += 1;
  else if (!line && product.stock > 0) cart.value.push({ product: { ...product }, quantity: 1 });
}
</script>

<template>
  <div class="shell">
    <header class="app-header"><div class="brand"><Package :size="23" aria-hidden="true" /><span>Fieldstock</span></div><span class="workspace">Operations / Inventory</span></header>
    <main>
      <div class="page-heading"><div><p class="eyebrow">PRODUCTS</p><h1>Inventory</h1></div><button class="primary" data-testid="new-product" @click="openEditor(null)"><Plus :size="17" aria-hidden="true" />New product</button></div>
      <section class="metrics" aria-label="Inventory summary"><div><span>Products</span><strong data-testid="product-count">{{ products.length }}</strong></div><div><span>Inventory value</span><strong>{{ money(inventoryValue) }}</strong></div><div><span>Suppliers</span><strong>4</strong></div></section>
      <ProductFilters v-model:query="query" v-model:category="category" @reset="query = ''; category = 'All'" />
      <div class="selection-bar" v-if="selected.length"><span data-testid="selected-count">{{ selected.length }} selected</span><button class="danger" data-testid="delete-selected" @click="deleteSelected"><Trash2 :size="16" aria-hidden="true" />Delete selected</button><button @click="selected = []">Clear selection</button></div>
      <ProductTable :products="visible" :selected="selected" @toggle="toggle" @edit="openEditor" @order="addToOrder" />
      <div class="pagination" aria-label="Product pagination"><span data-testid="result-count">{{ filtered.length }} results</span><div><button aria-label="Previous page" data-testid="previous-page" :disabled="page <= 1" @click="page--"><ChevronLeft :size="17" aria-hidden="true" /></button><span data-testid="page-status">Page {{ page }} of {{ pageCount }}</span><button aria-label="Next page" data-testid="next-page" :disabled="page >= pageCount" @click="page++"><ChevronRight :size="17" aria-hidden="true" /></button></div></div>
      <OrderCart :lines="cart" @quantity="(id, quantity) => { const line = cart.find(item => item.product.id === id); if (line) line.quantity = quantity; }" @remove="id => cart = cart.filter(item => item.product.id !== id)" />
      <p role="status" class="notice">{{ notice }}</p>
    </main>
    <ProductEditor v-if="editorOpen" :product="editing" @save="saveProduct" @cancel="editorOpen = false" />
  </div>
</template>
