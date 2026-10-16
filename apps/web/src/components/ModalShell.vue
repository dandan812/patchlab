<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { X } from 'lucide-vue-next'

defineProps<{ title: string; labelId: string; wide?: boolean; locked?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLElement>()
const previousFocus = document.activeElement as HTMLElement | null
const previousOverflow = document.body.style.overflow

function keyboard(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (event.key !== 'Tab' || !panel.value) return
  const elements = [
    ...panel.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]'
    )
  ].filter((element) => element.getClientRects().length)
  const first = elements[0]
  const last = elements[elements.length - 1]
  if (!first || !last) {
    event.preventDefault()
    return
  }
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === panel.value)
  ) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(async () => {
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', keyboard)
  await nextTick()
  const initial = panel.value?.querySelector<HTMLElement>('[data-autofocus]')
  ;(initial || panel.value)?.focus()
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', keyboard)
  document.body.style.overflow = previousOverflow
  previousFocus?.focus()
})
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="!locked && emit('close')">
      <section
        ref="panel"
        class="modal"
        :class="{ 'modal-wide': wide }"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="labelId"
        tabindex="-1"
      >
        <header class="modal-header">
          <h2 :id="labelId">{{ title }}</h2>
          <button
            class="icon-button"
            title="关闭"
            aria-label="关闭弹窗"
            :disabled="locked"
            @click="emit('close')"
          >
            <X :size="18" />
          </button>
        </header>
        <slot />
      </section>
    </div>
  </Teleport>
</template>
