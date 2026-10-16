<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { computed } from 'vue';
import { lineTotal, money, type Product } from '../model';
const props = defineProps<{ lines: Array<{ product: Product; quantity: number }> }>();
const emit = defineEmits<{ quantity: [id: string, quantity: number]; remove: [id: string] }>();
const total = computed(() => props.lines.reduce((sum, line) => sum + lineTotal(line.product.price, line.quantity), 0));
function update(id: string, stock: number, value: string) {
  const quantity = Number(value);
  if (Number.isInteger(quantity) && quantity >= 1 && quantity <= stock) emit('quantity', id, quantity);
}
</script>
<template>
  <section class="order-section" aria-labelledby="order-heading"><div class="section-heading"><h2 id="order-heading">Purchase order</h2><span>{{ lines.length }} items</span></div>
    <p v-if="!lines.length" class="empty" data-testid="order-empty">No items in this order</p>
    <div v-for="line in lines" :key="line.product.id" class="order-line" :data-testid="`order-line-${line.product.id}`"><span>{{ line.product.name }}</span><label><span class="sr-only">Quantity for {{ line.product.name }}</span><input type="number" min="1" :max="line.product.stock" :value="line.quantity" :data-testid="`quantity-${line.product.id}`" @input="update(line.product.id, line.product.stock, ($event.target as HTMLInputElement).value)" /></label><strong :data-testid="`line-total-${line.product.id}`">{{ money(lineTotal(line.product.price, line.quantity)) }}</strong><button :aria-label="`Remove ${line.product.name} from order`" title="Remove from order" :data-testid="`remove-order-${line.product.id}`" @click="emit('remove', line.product.id)"><X :size="16" aria-hidden="true" /></button></div>
    <div class="order-total"><span>Order total</span><strong data-testid="order-total">{{ money(total) }}</strong></div>
  </section>
</template>
