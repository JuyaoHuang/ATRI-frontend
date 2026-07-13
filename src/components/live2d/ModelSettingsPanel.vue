<script setup lang="ts">
import { computed, onMounted } from 'vue'

import type { ModelSettingsRuntimeSnapshot } from './runtime'

import Button from '@/components/airi-ui/Button.vue'
import Callout from '@/components/airi-ui/Callout.vue'
import Checkbox from '@/components/airi-ui/Checkbox.vue'
import Live2DSettings from './Live2DSettings.vue'
import ModelSelectorDialog from './ModelSelectorDialog.vue'
import { useLive2dStore } from '@/stores/live2d'

const props = withDefaults(defineProps<{
  palette: string[]
  settingsClass?: string | string[]
  allowExtractColors?: boolean
  runtimeSnapshot: ModelSettingsRuntimeSnapshot
}>(), {
  allowExtractColors: true,
})

defineEmits<{
  (e: 'extractColorsFromModel'): void
}>()

const live2dStore = useLive2dStore()

const settingsClassList = computed(() => {
  if (!props.settingsClass) {
    return []
  }

  return typeof props.settingsClass === 'string' ? [props.settingsClass] : props.settingsClass
})

function handleModelPick(modelId: string) {
  live2dStore.setActiveModel(modelId)
}

onMounted(() => {
  void live2dStore.fetchModels()
})
</script>

<template>
  <div
    :class="[
      'flex flex-col gap-2',
      'z-10 overflow-y-scroll p-2',
      ...settingsClassList,
    ]"
  >
    <Callout label="我们支持 2D 模型">
      <p>
        点击 <strong>选择模型</strong> 可使用已安装并通过校验的 Live2D 模型
      </p>
    </Callout>

    <div class="model-settings-toolbar">
      <ModelSelectorDialog :selected-model-id="live2dStore.activeModelId" @pick="handleModelPick">
        <Button variant="secondary">
          选择模型
        </Button>
      </ModelSelectorDialog>

      <label class="live2d-mode-pill">
        <div class="live2d-mode-pill__copy">
          <span class="live2d-mode-pill__label">Live2D</span>
          <span class="live2d-mode-pill__hint">主页启用舞台模式</span>
        </div>
        <Checkbox v-model="live2dStore.enabled" />
      </label>
    </div>

    <Live2DSettings
      :allow-extract-colors="allowExtractColors"
      :palette="palette"
      :runtime-snapshot="runtimeSnapshot"
      @extract-colors-from-model="$emit('extractColorsFromModel')"
    />
  </div>
</template>

<style scoped>
.model-settings-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.live2d-mode-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.9rem;
  min-height: 2.75rem;
  padding: 0.65rem 0.9rem;
  border-radius: 1rem;
  border: 1px solid rgb(255 255 255 / 0.75);
  background:
    linear-gradient(135deg, rgb(255 255 255 / 0.88), rgb(240 249 255 / 0.76));
  box-shadow:
    0 10px 28px rgb(15 23 42 / 0.08),
    inset 0 1px 0 rgb(255 255 255 / 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.live2d-mode-pill__copy {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.live2d-mode-pill__label {
  font-size: 0.86rem;
  font-weight: 700;
  color: rgb(15 23 42);
  letter-spacing: 0.01em;
}

.live2d-mode-pill__hint {
  font-size: 0.73rem;
  color: rgb(100 116 139);
}

.dark .live2d-mode-pill {
  border-color: rgb(148 163 184 / 0.14);
  background:
    linear-gradient(135deg, rgb(15 23 42 / 0.9), rgb(30 41 59 / 0.78));
  box-shadow:
    0 12px 32px rgb(2 6 23 / 0.28),
    inset 0 1px 0 rgb(255 255 255 / 0.05);
}

.dark .live2d-mode-pill__label {
  color: rgb(226 232 240);
}

.dark .live2d-mode-pill__hint {
  color: rgb(148 163 184);
}
</style>
