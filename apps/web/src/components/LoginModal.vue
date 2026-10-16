<script setup lang="ts">
import { ref } from 'vue'
import { AlertCircle, LoaderCircle, LogIn } from 'lucide-vue-next'
import ModalShell from './ModalShell.vue'

const props = defineProps<{ busy: boolean; submit: (password: string) => Promise<void> }>()
const emit = defineEmits<{ close: []; authenticated: [] }>()
const password = ref('')
const formError = ref('')

async function login() {
  if (!password.value || props.busy) return
  formError.value = ''
  try {
    await props.submit(password.value)
    password.value = ''
    emit('authenticated')
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : '登录失败'
  }
}
</script>

<template>
  <ModalShell
    title="管理员登录"
    label-id="login-modal-title"
    :locked="busy"
    @close="!busy && emit('close')"
  >
    <form class="modal-body" @submit.prevent="login">
      <label class="field">
        <span>管理员密码</span>
        <input
          v-model="password"
          data-autofocus
          type="password"
          autocomplete="current-password"
          required
          :disabled="busy"
        />
      </label>
      <p v-if="formError" class="inline-alert danger" role="alert">
        <AlertCircle :size="16" />{{ formError }}
      </p>
      <footer class="modal-footer">
        <button class="button secondary" type="button" :disabled="busy" @click="emit('close')">
          取消
        </button>
        <button class="button primary" type="submit" :disabled="busy || !password">
          <LoaderCircle v-if="busy" class="spin" :size="16" /><LogIn v-else :size="16" />
          {{ busy ? '正在登录' : '登录' }}
        </button>
      </footer>
    </form>
  </ModalShell>
</template>
