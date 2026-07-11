<script setup lang="ts">
import { computed, onMounted, useId } from 'vue'

import { useAutoDismissVisibility } from '@/composables/useAutoDismissVisibility'
import { useVision } from '@/composables/useVision'

const RUNTIME_ERROR_VISIBLE_DURATION_MS = 2000

const {
  ensureLoaded,
  error: configError,
  loaded,
  loading,
  moduleEnabled,
  runtimeActive,
  runtimeError,
  runtimeStatus,
  start,
  stop,
} = useVision()
const errorId = useId()

const screenShareSupported = computed(() => (
  typeof navigator !== 'undefined'
  && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
))

const isStarting = computed(() => runtimeStatus.value === 'starting')
const hasRuntimeError = computed(() => runtimeStatus.value === 'error' && !!runtimeError.value)
const runtimeErrorNotice = computed(() => (
  hasRuntimeError.value && moduleEnabled.value && screenShareSupported.value
    ? runtimeError.value
    : null
))
const showRuntimeErrorNotice = useAutoDismissVisibility(
  runtimeErrorNotice,
  RUNTIME_ERROR_VISIBLE_DURATION_MS,
)
const isDisabled = computed(() => (
  !loaded.value
  || loading.value
  || !moduleEnabled.value
  || !screenShareSupported.value
))

const buttonTitle = computed(() => {
  if (loading.value || !loaded.value) {
    return configError.value || '正在读取视觉设置'
  }
  if (!moduleEnabled.value) {
    return '请先在设置中启用视觉功能'
  }
  if (!screenShareSupported.value) {
    return '当前浏览器不支持屏幕共享'
  }
  if (isStarting.value) {
    return '正在请求屏幕共享权限，点击可取消'
  }
  if (runtimeActive.value) {
    return '停止屏幕共享'
  }
  if (runtimeError.value) {
    return `${runtimeError.value} 点击重试`
  }
  return '开始屏幕共享'
})

const buttonClass = computed(() => {
  if (runtimeActive.value) {
    return [
      'border-primary-300/70 bg-primary-500 text-white shadow-sm shadow-primary-500/25',
      'hover:bg-primary-600 dark:border-primary-300/40 dark:bg-primary-500',
    ]
  }
  if (isStarting.value) {
    return [
      'border-primary-300/60 bg-primary-100/80 text-primary-700',
      'hover:bg-primary-200/80 dark:border-primary-600/40 dark:bg-primary-900/55 dark:text-primary-200',
    ]
  }
  if (hasRuntimeError.value && !isDisabled.value) {
    return [
      'border-red-200/70 bg-red-50/75 text-red-600 hover:bg-red-100/80',
      'dark:border-red-800/55 dark:bg-red-950/35 dark:text-red-300 dark:hover:bg-red-900/45',
    ]
  }
  if (isDisabled.value) {
    return 'cursor-not-allowed border-transparent text-neutral-300 dark:text-neutral-600'
  }
  return [
    'border-transparent text-neutral-500 hover:bg-neutral-100/70',
    'dark:text-neutral-400 dark:hover:bg-neutral-800/60',
  ]
})

const iconClass = computed(() => {
  if (isStarting.value) {
    return 'i-solar:refresh-bold-duotone animate-spin'
  }
  if (runtimeActive.value) {
    return 'i-solar:eye-scan-bold-duotone'
  }
  if (hasRuntimeError.value) {
    return 'i-solar:danger-circle-bold-duotone'
  }
  if (!moduleEnabled.value || !screenShareSupported.value) {
    return 'i-solar:eye-closed-bold-duotone'
  }
  return 'i-solar:eye-bold-duotone'
})

async function toggleVision(): Promise<void> {
  if (runtimeActive.value || isStarting.value) {
    stop()
    return
  }
  if (isDisabled.value) {
    return
  }
  await start()
}

onMounted(() => {
  void ensureLoaded()
})
</script>

<template>
  <div class="relative flex flex-col items-center">
    <button
      type="button"
      class="relative h-8 w-8 flex shrink-0 items-center justify-center rounded-md border text-lg outline-none transition-all duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-primary-400/70 focus-visible:ring-offset-1 disabled:active:scale-100 dark:focus-visible:ring-offset-neutral-900"
      :class="buttonClass"
      :title="buttonTitle"
      :aria-label="buttonTitle"
      :aria-pressed="runtimeActive"
      :aria-busy="isStarting"
      :aria-describedby="showRuntimeErrorNotice ? errorId : undefined"
      :disabled="isDisabled"
      @click="toggleVision"
    >
      <div class="h-5 w-5" :class="iconClass" aria-hidden="true" />
      <span
        v-if="runtimeActive"
        class="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-cyan-100 ring-1 ring-primary-700/20"
        aria-hidden="true"
      />
    </button>

    <Transition name="vision-runtime-error">
      <div
        v-if="showRuntimeErrorNotice"
        :id="errorId"
        class="pointer-events-none absolute bottom-10 left-1/2 z-30 w-64 rounded-lg border border-red-200/70 bg-red-50/95 p-2 text-xs text-red-700 shadow-lg backdrop-blur-md -translate-x-1/2 dark:border-red-800/60 dark:bg-red-950/90 dark:text-red-200"
        role="status"
      >
        {{ runtimeError }} 点击视觉按钮可重新尝试。
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.vision-runtime-error-leave-active {
  transition: opacity 300ms ease;
}

.vision-runtime-error-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .vision-runtime-error-leave-active {
    transition-duration: 1ms;
  }
}
</style>
