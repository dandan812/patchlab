<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  AlertCircle,
  ArrowRight,
  FlaskConical,
  Globe,
  LoaderCircle,
  LockKeyhole,
  Sparkles
} from 'lucide-vue-next'
import type { CaseInfo, Mode, Strategy, Task } from '../../../../packages/shared/src/types'
import type { CreateTaskInput, Meta } from '../api'
import { taskDescription } from '../localization'
import ModalShell from './ModalShell.vue'

const props = defineProps<{
  cases: CaseInfo[]
  meta: Meta | null
  busy: boolean
  initialCaseId?: string
  previousTask?: Task
  submit: (input: CreateTaskInput) => Promise<Task>
}>()
const emit = defineEmits<{ close: []; created: [] }>()
const caseId = ref(props.previousTask?.caseId || props.initialCaseId || props.cases[0]?.id || '')
const initialCase = props.cases.find((item) => item.id === caseId.value)
const description = ref(
  props.previousTask
    ? taskDescription(props.previousTask, initialCase)
    : initialCase?.description || ''
)
const mode = ref<Mode>(
  props.previousTask?.mode || (props.meta?.replayAvailable ? 'replay' : 'model')
)
const strategy = ref<Strategy>(props.previousTask?.strategy || 'C')
const isPublic = ref(props.previousTask?.public ?? false)
const formError = ref('')
const chosenCase = computed(() => props.cases.find((item) => item.id === caseId.value))
const categoryLabels = { state: '状态', form: '表单', layout: '布局' }
const modeAvailable = computed(() =>
  mode.value === 'replay' ? props.meta?.replayAvailable : props.meta?.modelConfigured
)
const descriptionValid = computed(
  () => description.value.trim().length >= 8 && description.value.trim().length <= 4000
)

watch(
  mode,
  (next) => {
    if (next === 'replay') strategy.value = 'C'
  },
  { immediate: true }
)
watch(caseId, (next, previous) => {
  const previousDescription = props.cases.find((item) => item.id === previous)?.description
  if (!description.value.trim() || description.value === previousDescription) {
    description.value = props.cases.find((item) => item.id === next)?.description || ''
  }
})

async function create() {
  formError.value = ''
  if (!caseId.value || !modeAvailable.value || props.busy) return
  if (!descriptionValid.value) {
    formError.value = '问题描述需包含 8–4000 个字符（不含首尾空白）。'
    return
  }
  try {
    await props.submit({
      caseId: caseId.value,
      description: description.value.trim(),
      mode: mode.value,
      strategy: strategy.value,
      public: isPublic.value
    })
    emit('created')
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : '创建失败，请重试。'
  }
}
</script>

<template>
  <ModalShell
    :title="previousTask ? '重跑任务' : '新建修复任务'"
    label-id="task-modal-title"
    wide
    :locked="busy"
    @close="!busy && emit('close')"
  >
    <form class="modal-body task-form" @submit.prevent="create">
      <label class="field">
        <span>案例 <span class="required">*</span></span>
        <select v-model="caseId" data-autofocus required :disabled="busy">
          <option v-if="!cases.length" value="" disabled>暂无可用案例</option>
          <option v-for="item in cases" :key="item.id" :value="item.id">
            {{ item.title }} · {{ item.id }}
          </option>
        </select>
      </label>
      <div v-if="chosenCase" class="case-context">
        <span class="small-label"
          >{{ chosenCase.app === 'products' ? '商品应用' : '任务应用' }} /
          {{ categoryLabels[chosenCase.category] }}</span
        >
        <p>{{ chosenCase.description }}</p>
      </div>
      <label class="field">
        <span
          >问题描述 <span class="required">*</span><span class="optional">8–4000 字符</span></span
        >
        <textarea
          v-model="description"
          :disabled="busy"
          rows="3"
          minlength="8"
          maxlength="4000"
          required
          placeholder="补充复现条件、实际表现与预期结果…"
        />
      </label>
      <fieldset class="field mode-field">
        <legend>执行模式</legend>
        <div class="mode-options">
          <label
            class="mode-option"
            :class="{ selected: mode === 'replay', unavailable: !meta?.replayAvailable }"
          >
            <input
              v-model="mode"
              type="radio"
              value="replay"
              :disabled="busy || !meta?.replayAvailable"
            />
            <FlaskConical :size="20" />
            <span><strong>脚本回放（非 AI 修复）</strong><small>执行预设修复脚本</small></span>
          </label>
          <label
            class="mode-option"
            :class="{ selected: mode === 'model', unavailable: !meta?.modelConfigured }"
          >
            <input
              v-model="mode"
              type="radio"
              value="model"
              :disabled="busy || !meta?.modelConfigured"
            />
            <Sparkles :size="20" />
            <span
              ><strong>AI 修复</strong
              ><small>{{
                meta?.modelConfigured ? meta.modelId || '使用已配置模型' : '需要模型配置与 Docker'
              }}</small></span
            >
          </label>
        </div>
      </fieldset>
      <fieldset class="field">
        <legend>策略</legend>
        <div class="segmented strategy-options" aria-label="修复策略">
          <label
            v-for="option in ['A', 'B', 'C'] as const"
            :key="option"
            :class="{ selected: strategy === option }"
          >
            <input
              v-model="strategy"
              type="radio"
              :value="option"
              :disabled="busy || (mode === 'replay' && option !== 'C')"
            />
            策略 {{ option }}
          </label>
        </div>
        <span v-if="mode === 'replay'" class="small-label"
          >脚本回放固定为策略 C，不参与模型策略对比。</span
        >
      </fieldset>
      <div class="visibility-field">
        <label class="checkbox-label">
          <input
            v-model="isPublic"
            type="checkbox"
            :disabled="busy"
            aria-describedby="visibility-description"
          />
          <Globe v-if="isPublic" :size="17" /><LockKeyhole v-else :size="17" />
          <strong>公开案例</strong>
        </label>
        <p id="visibility-description">
          {{
            isPublic
              ? '未登录访客也可查看任务描述、事件及产物。'
              : '仅登录管理员可查看任务描述、事件及产物。'
          }}
        </p>
      </div>
      <p v-if="!modeAvailable" class="inline-alert warning">
        <AlertCircle :size="16" />当前执行模式不可用，请检查服务配置。
      </p>
      <p v-if="formError" class="inline-alert danger" role="alert">
        <AlertCircle :size="16" />{{ formError }}
      </p>
      <footer class="modal-footer">
        <button type="button" class="button secondary" :disabled="busy" @click="emit('close')">
          取消
        </button>
        <button
          class="button primary"
          type="submit"
          :disabled="busy || !caseId || !modeAvailable || !descriptionValid"
        >
          <LoaderCircle v-if="busy" :size="16" class="spin" /><ArrowRight v-else :size="16" />
          {{ busy ? '正在创建' : '创建并运行' }}
        </button>
      </footer>
    </form>
  </ModalShell>
</template>
