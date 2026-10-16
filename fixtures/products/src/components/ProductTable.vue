<script setup lang="ts">
import { Pencil, ShoppingCart } from 'lucide-vue-next';
import { money, type Product } from '../model';
defineProps<{ products: Product[]; selected: string[] }>();
const emit = defineEmits<{ toggle: [id: string]; edit: [product: Product]; order: [product: Product] }>();
</script>
<template>
  <div class="table-scroll" data-testid="product-table-scroll" tabindex="0" aria-label="Product table">
    <table data-testid="product-table">
      <thead><tr><th scope="col"><span class="sr-only">Select</span></th><th scope="col">Product</th><th scope="col">Category</th><th scope="col">Price</th><th scope="col">Stock</th><th scope="col">Supplier</th><th scope="col">Actions</th></tr></thead>
      <tbody><tr v-for="product in products" :key="product.id" :data-testid="`product-row-${product.id}`">
        <td><input type="checkbox" :aria-label="`Select ${product.name}`" :data-testid="`select-${product.id}`" :checked="selected.includes(product.id)" @change="emit('toggle', product.id)" /></td>
        <td><strong>{{ product.name }}</strong><small>{{ product.sku }}</small></td><td>{{ product.category }}</td><td :data-testid="`price-${product.id}`">{{ money(product.price) }}</td><td :data-testid="`stock-${product.id}`">{{ product.stock }}</td><td>{{ product.supplier }}</td>
        <td><div class="row-actions"><button :aria-label="`Edit ${product.name}`" :title="`Edit ${product.name}`" :data-testid="`edit-${product.id}`" @click="emit('edit', product)"><Pencil :size="16" aria-hidden="true" /></button><button :aria-label="`Add ${product.name} to order`" :title="`Add ${product.name} to order`" :data-testid="`order-${product.id}`" :disabled="product.stock === 0" @click="emit('order', product)"><ShoppingCart :size="16" aria-hidden="true" /></button></div></td>
      </tr><tr v-if="!products.length"><td colspan="7" class="empty" data-testid="products-empty">No products found</td></tr></tbody>
    </table>
  </div>
</template>
