<script setup lang="ts">
import { computed, onMounted } from 'vue'

import IconStatusItem from '@/components/menu/IconStatusItem.vue'
import RippleGrid from '@/components/ui/RippleGrid.vue'
import { useRippleGridState } from '@/composables/useRippleGridState'
import { useASRStore } from '@/stores/asr'
import { useTTSStore } from '@/stores/tts'
import { useVisionStore } from '@/stores/vision'

interface ModuleItem {
  id: string
  name: string
  description: string
  icon?: string
  iconColor?: string
  iconImage?: string
  to: string
  configured: boolean
}

const asrStore = useASRStore()
const ttsStore = useTTSStore()
const visionStore = useVisionStore()
const { lastClickedIndex, setLastClickedIndex } = useRippleGridState()

const modulesList = computed<ModuleItem[]>(() => [
  {
    id: 'consciousness',
    name: 'LLM 配置',
    description: '管理模型推理、提示词和认知模块参数。',
    icon: 'i-solar:ghost-bold-duotone',
    to: '/settings/modules/consciousness',
    configured: false,
  },
  {
    id: 'speech',
    name: 'TTS 配置',
    description: '设置语音合成模型、音色与输出行为。',
    icon: 'i-solar:user-speak-rounded-bold-duotone',
    to: '/settings/modules/speech',
    configured: ttsStore.moduleEnabled && ttsStore.configured,
  },
  {
    id: 'hearing',
    name: 'ASR 配置',
    description: '调整语音识别链路、输入设备与转写策略。',
    icon: 'i-solar:microphone-3-bold-duotone',
    to: '/settings/modules/hearing',
    configured: asrStore.moduleEnabled && asrStore.configured,
  },
  {
    id: 'vision',
    name: '视觉功能',
    description: '启用屏幕视觉输入，并管理当前标签页的共享入口。',
    icon: visionStore.moduleEnabled
      ? 'i-solar:eye-bold-duotone'
      : 'i-solar:eye-closed-bold-duotone',
    to: '/settings/modules/vision',
    configured: visionStore.moduleEnabled,
  },
])

onMounted(() => {
  if (!asrStore.providers.length && !asrStore.loading) {
    void asrStore.load()
  }
  if (!ttsStore.providers.length && !ttsStore.loading) {
    void ttsStore.load()
  }
  if (!visionStore.loaded && !visionStore.loading) {
    void visionStore.load()
  }
})
</script>

<template>
  <div>
    <RippleGrid
      :items="modulesList"
      :get-key="module => module.id"
      :columns="{ default: 1, sm: 2 }"
      :origin-index="lastClickedIndex"
      @item-click="({ globalIndex }) => setLastClickedIndex(globalIndex)"
    >
      <template #item="{ item: module }">
        <IconStatusItem
          :title="module.name"
          :description="module.description"
          :icon="module.icon"
          :icon-color="module.iconColor"
          :icon-image="module.iconImage"
          :to="module.to"
          :configured="module.configured"
        />
      </template>
    </RippleGrid>
  </div>
  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, y: 20 }"
    :enter="{ scale: 1, opacity: 1, y: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:layers-bold-duotone />
  </div>
</template>
