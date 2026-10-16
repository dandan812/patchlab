<script setup lang="ts">
import { Search, RotateCcw } from 'lucide-vue-next';
import { categories } from '../model';
defineProps<{ query: string; category: string }>();
const emit = defineEmits<{ 'update:query': [value: string]; 'update:category': [value: string]; reset: [] }>();
</script>
<template>
  <section class="product-toolbar" aria-label="Product filters" data-testid="product-toolbar">
    <label class="search-field"><Search :size="17" aria-hidden="true" /><span class="sr-only">Search products</span><input data-testid="product-search" :value="query" placeholder="Search name or SKU" @input="emit('update:query', ($event.target as HTMLInputElement).value)" /></label>
    <label class="category-field">Category<select data-testid="product-category" :value="category" @change="emit('update:category', ($event.target as HTMLSelectElement).value)"><option>All</option><option v-for="value in categories" :key="value">{{ value }}</option></select></label>
    <button data-testid="reset-products" @click="emit('reset')"><RotateCcw :size="16" aria-hidden="true" />Reset</button>
  </section>
</template>
