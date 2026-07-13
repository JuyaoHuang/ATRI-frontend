<script setup lang="ts">
import { useMouse } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

import type { ModelSettingsRuntimeSnapshot } from './runtime'

import Live2DCanvas from './Live2DCanvas.vue'
import { createEmptyModelSettingsRuntimeSnapshot, resolveComponentStateToRuntimePhase } from './runtime'
import { useLive2dStore } from '@/stores/live2d'

const props = defineProps<{
  live2dSceneClass?: string | string[]
}>()

const emit = defineEmits<{
  (e: 'runtimeSnapshotChanged', value: ModelSettingsRuntimeSnapshot): void
}>()

const live2dStore = useLive2dStore()
const positionCursor = useMouse()
const live2dSceneRef = ref<{ captureFrame: () => Promise<Blob | undefined>, canvasElement: () => HTMLCanvasElement | undefined }>()
const componentState = ref<'pending' | 'loading' | 'mounted'>('pending')
const lastError = ref<string>()
const ownerInstanceId = `model-settings-preview-stage:${Math.random().toString(36).slice(2, 10)}`

const live2dSceneClassList = computed(() => {
  if (!props.live2dSceneClass) {
    return []
  }

  return typeof props.live2dSceneClass === 'string' ? [props.live2dSceneClass] : props.live2dSceneClass
})

const runtimeSnapshot = computed<ModelSettingsRuntimeSnapshot>(() => {
  const hasModel = !!live2dStore.activeModel?.modelUrl
  const phase = lastError.value
    ? 'error'
    : resolveComponentStateToRuntimePhase(componentState.value, { hasModel })

  return createEmptyModelSettingsRuntimeSnapshot({
    ownerInstanceId,
    renderer: 'live2d',
    phase,
    controlsLocked: hasModel ? phase !== 'mounted' : false,
    previewAvailable: hasModel,
    canCapturePreview: !!live2dSceneRef.value?.canvasElement(),
    lastError: lastError.value,
    updatedAt: Date.now(),
  })
})

watch(runtimeSnapshot, snapshot => emit('runtimeSnapshotChanged', snapshot), { immediate: true })

watch(
  () => live2dStore.activeModel?.modelUrl,
  (modelUrl) => {
    componentState.value = modelUrl ? 'loading' : 'pending'
    lastError.value = undefined
  },
  { immediate: true },
)

function handleModelLoaded() {
  componentState.value = 'mounted'
  lastError.value = undefined
}

function handleModelError(message: string) {
  lastError.value = message
}

async function capturePreviewFrame() {
  return live2dSceneRef.value?.captureFrame()
}

defineExpose({
  capturePreviewFrame,
})
</script>

<template>
  <div :class="live2dSceneClassList">
    <Live2DCanvas
      ref="live2dSceneRef"
      :model-url="live2dStore.activeModel?.modelUrl"
      :position="live2dStore.position"
      :scale="live2dStore.scale"
      :expression-request="live2dStore.expressionRequest"
      :model-parameters="live2dStore.modelParameters"
      :focus-at="{ x: positionCursor.x.value, y: positionCursor.y.value }"
      :disable-focus="live2dStore.disableFocus"
      :expression-system-enabled="live2dStore.expressionEnabled"
      :auto-blink-enabled="live2dStore.autoBlinkEnabled"
      :force-auto-blink-enabled="live2dStore.forceAutoBlinkEnabled"
      :shadow-enabled="live2dStore.shadowEnabled"
      :max-fps="live2dStore.maxFps"
      :resolution="live2dStore.renderScale"
      empty-text="No current model."
      @loaded="handleModelLoaded"
      @error="handleModelError"
    />
  </div>
</template>
