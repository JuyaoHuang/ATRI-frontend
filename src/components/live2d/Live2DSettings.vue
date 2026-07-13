<script setup lang="ts">
import { computed } from 'vue'

import type { ModelSettingsRuntimeSnapshot } from './runtime'
import type { Live2DModelParameters } from '@/stores/live2d'

import Button from '@/components/airi-ui/Button.vue'
import Checkbox from '@/components/airi-ui/Checkbox.vue'
import FieldCheckbox from '@/components/airi-ui/FieldCheckbox.vue'
import FieldComboboxSelect from '@/components/airi-ui/FieldComboboxSelect.vue'
import FieldRange from '@/components/airi-ui/FieldRange.vue'
import SelectTab from '@/components/airi-ui/SelectTab.vue'
import AiriColorPalette from './AiriColorPalette.vue'
import AiriSection from './AiriSection.vue'
import { DEFAULT_MODEL_PARAMETERS, useLive2dStore } from '@/stores/live2d'

const props = withDefaults(defineProps<{
  palette: string[]
  allowExtractColors?: boolean
  runtimeSnapshot: ModelSettingsRuntimeSnapshot
}>(), {
  allowExtractColors: true,
})

defineEmits<{
  (e: 'extractColorsFromModel'): void
}>()

const live2dStore = useLive2dStore()

const fpsOptions = [
  { value: 0, label: '无限制' },
  { value: 60, label: '60' },
  { value: 30, label: '30' },
]

const llmModeOptions = [
  { value: 'none', label: 'None' },
  { value: 'all', label: 'All' },
  { value: 'custom', label: 'Custom' },
]

const SECTION_ICONS = {
  scale: 'i-solar:scale-bold-duotone',
  palette: 'i-solar:magic-stick-3-bold-duotone',
  parameters: 'i-solar:settings-bold-duotone',
  expressions: 'i-solar:face-scan-circle-bold-duotone',
} as const

const canExtractColors = computed(() => props.runtimeSnapshot.canCapturePreview)
const expressionNames = computed(() => live2dStore.expressionGroups)
const MODEL_DEFAULT_EXPRESSION_VALUE = '__atri_model_default_expression__'
const defaultExpressionOptions = computed(() => [
  {
    label: '模型默认表情',
    value: MODEL_DEFAULT_EXPRESSION_VALUE,
    description: '不叠加命名表情，使用模型自身的基础状态。',
  },
  ...expressionNames.value.map(expressionName => ({
    label: expressionName,
    value: expressionName,
  })),
])

const defaultExpressionModel = computed({
  get: () => live2dStore.savedExpressionDefaults[0] ?? MODEL_DEFAULT_EXPRESSION_VALUE,
  set: (value: string) => {
    live2dStore.setDefaultExpression(
      value === MODEL_DEFAULT_EXPRESSION_VALUE ? null : value,
    )
  },
})

const expressionEnabledModel = computed({
  get: () => live2dStore.expressionEnabled,
  set: (value: boolean) => live2dStore.setExpressionEnabled(value),
})

const parameterGroups = computed(() => [
  {
    title: 'Head Rotation',
    items: [
      { key: 'angleX', label: 'Angle X', min: -30, max: 30, step: 0.1 },
      { key: 'angleY', label: 'Angle Y', min: -30, max: 30, step: 0.1 },
      { key: 'angleZ', label: 'Angle Z', min: -30, max: 30, step: 0.1 },
    ],
  },
  {
    title: 'Eyes',
    items: [
      { key: 'leftEyeOpen', label: 'Left Eye Open/Close', min: 0, max: 1, step: 0.01 },
      { key: 'rightEyeOpen', label: 'Right Eye Open/Close', min: 0, max: 1, step: 0.01 },
      { key: 'leftEyeSmile', label: 'Left Eye Smiling', min: 0, max: 1, step: 0.01 },
      { key: 'rightEyeSmile', label: 'Right Eye Smiling', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'Eyebrows',
    items: [
      { key: 'leftEyebrowLR', label: 'Left eyebrow Left/Right', min: -1, max: 1, step: 0.01 },
      { key: 'rightEyebrowLR', label: 'Right eyebrow Left/Right', min: -1, max: 1, step: 0.01 },
      { key: 'leftEyebrowY', label: 'Left Eyebrow Y', min: -1, max: 1, step: 0.01 },
      { key: 'rightEyebrowY', label: 'Right Eyebrow Y', min: -1, max: 1, step: 0.01 },
      { key: 'leftEyebrowAngle', label: 'Left Eyebrow Angle', min: -1, max: 1, step: 0.01 },
      { key: 'rightEyebrowAngle', label: 'Right Eyebrow Angle', min: -1, max: 1, step: 0.01 },
      { key: 'leftEyebrowForm', label: 'Left Eyebrow Form', min: -1, max: 1, step: 0.01 },
      { key: 'rightEyebrowForm', label: 'Right Eyebrow Form', min: -1, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'Mouth',
    items: [
      { key: 'mouthOpen', label: 'Mouth Open/Close', min: 0, max: 1, step: 0.01 },
      { key: 'mouthForm', label: 'Mouth Form', min: -1, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'Face',
    items: [
      { key: 'cheek', label: 'Cheek', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'Body',
    items: [
      { key: 'bodyAngleX', label: 'Body rotation X', min: -10, max: 10, step: 0.1 },
      { key: 'bodyAngleY', label: 'Body rotation Y', min: -10, max: 10, step: 0.1 },
      { key: 'bodyAngleZ', label: 'Body rotation Z', min: -10, max: 10, step: 0.1 },
      { key: 'breath', label: 'Breath', min: 0, max: 1, step: 0.01 },
    ],
  },
])

function defaultParameterValue(key: keyof Live2DModelParameters) {
  return DEFAULT_MODEL_PARAMETERS[key]
}

</script>

<template>
  <AiriSection
    title="缩放与位置"
    :icon-class="SECTION_ICONS.scale"
    :expand="true"
    size="sm"
    inner-class="rounded-xl bg-white/80 dark:bg-black/75 backdrop-blur-lg"
  >
    <FieldRange v-model="live2dStore.scale" as="div" :min="0.1" :max="3" :step="0.01" label="缩放">
      <template #label>
        <div flex items-center>
          <div>缩放</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => live2dStore.scale = 1">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:text-neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>

    <FieldRange v-model="live2dStore.position.x" as="div" :min="-3000" :max="3000" :step="1" label="X">
      <template #label>
        <div flex items-center>
          <div>X</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => live2dStore.position.x = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:text-neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>

    <FieldRange v-model="live2dStore.position.y" as="div" :min="-3000" :max="3000" :step="1" label="Y">
      <template #label>
        <div flex items-center>
          <div>Y</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => live2dStore.position.y = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:text-neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
  </AiriSection>

  <AiriSection
    v-if="allowExtractColors"
    title="从模型提取主题颜色"
    :icon-class="SECTION_ICONS.palette"
    :expand="false"
    size="sm"
    inner-class="rounded-xl bg-white/80 dark:bg-black/75 backdrop-blur-lg"
  >
    <AiriColorPalette class="mb-4 mt-2" :colors="palette.map(hex => ({ hex, name: hex }))" />
    <Button variant="secondary" :disabled="!canExtractColors" @click="$emit('extractColorsFromModel')">
      提取
    </Button>
  </AiriSection>

  <AiriSection
    title="参数"
    :icon-class="SECTION_ICONS.parameters"
    :expand="false"
    size="sm"
    inner-class="rounded-xl bg-white/80 dark:bg-black/75 backdrop-blur-lg"
  >
    <FieldCheckbox
      v-model="live2dStore.disableFocus"
      label="禁用 Live2D 模型的鼠标跟随"
      placement="right"
    />

    <FieldRange
      v-model="live2dStore.renderScale"
      as="div"
      :min="0.5"
      :max="2"
      :step="0.25"
      label="渲染精度"
    />

    <label class="flex flex-col gap-4">
      <div class="flex items-center gap-2">
        <div class="flex-1">
          <div class="flex items-center gap-1 text-sm font-medium">
            帧率
          </div>
          <div class="text-xs text-neutral-500 dark:text-neutral-400">
            控制 Live2D 预览渲染时的最大帧率。
          </div>
        </div>
        <SelectTab v-model="live2dStore.maxFps" :options="fpsOptions" size="sm" class="shrink-0" />
      </div>
    </label>

    <div mt-4 flex items-center justify-between>
      <span class="text-sm text-neutral-600 dark:text-neutral-400">Auto Blink</span>
      <Checkbox v-model="live2dStore.autoBlinkEnabled" />
    </div>

    <div mt-3 flex items-center justify-between>
      <span class="text-sm text-neutral-600 dark:text-neutral-400">Force Auto Blink (fallback timer)</span>
      <Checkbox v-model="live2dStore.forceAutoBlinkEnabled" />
    </div>

    <div mt-4 flex items-center justify-between>
      <span class="text-sm text-neutral-600 dark:text-neutral-400">Shadow</span>
      <Checkbox v-model="live2dStore.shadowEnabled" />
    </div>

    <Button variant="secondary" class="mt-4 w-full" @click="live2dStore.resetModelParameters()">
      Reset To Default Parameters
    </Button>

    <div
      v-for="group in parameterGroups"
      :key="group.title"
      class="parameter-group"
    >
      <div class="parameter-group__title">{{ group.title }}</div>
      <FieldRange
        v-for="item in group.items"
        :key="String(item.key)"
        v-model="live2dStore.modelParameters[item.key as keyof typeof live2dStore.modelParameters]"
        as="div"
        :min="item.min"
        :max="item.max"
        :step="item.step"
        :label="item.label"
      >
        <template #label>
          <div flex items-center>
            <div>{{ item.label }}</div>
            <button
              px-2
              text-xs
              outline-none
              title="Reset value to default"
              @click="live2dStore.modelParameters[item.key as keyof Live2DModelParameters] = defaultParameterValue(item.key as keyof Live2DModelParameters)"
            >
              <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:text-neutral-400" />
            </button>
          </div>
        </template>
      </FieldRange>
    </div>
  </AiriSection>

  <AiriSection
    title="表情"
    :icon-class="SECTION_ICONS.expressions"
    :expand="false"
    size="sm"
    inner-class="rounded-xl bg-white/80 dark:bg-black/75 backdrop-blur-lg"
  >
    <div class="flex items-center justify-between">
      <span class="text-sm text-neutral-600 dark:text-neutral-400">表情系统</span>
      <Checkbox v-model="expressionEnabledModel" />
    </div>

    <div class="py-2 text-xs text-neutral-500 dark:text-neutral-400">
      开启后，AI 文本回复中的表情标记可以切换 Live2D 模型表情；关闭后，模型使用自身的基础表情，并保留 SDK 原生动作和眨眼行为。
    </div>

    <template v-if="live2dStore.expressionEnabled && expressionNames.length === 0">
      <div class="py-2 text-sm text-neutral-500 dark:text-neutral-400">
        当前模型没有可用表情。
      </div>
    </template>

    <template v-else-if="live2dStore.expressionEnabled">
      <FieldComboboxSelect
        v-model="defaultExpressionModel"
        label="默认表情"
        description="选择表情系统启用时优先使用的表情"
        :options="defaultExpressionOptions"
        placeholder="选择默认表情"
        layout="vertical"
        :select-class="['w-full']"
        :content-min-width="256"
      />

      <div class="mt-4 flex items-center gap-3">
        <span class="whitespace-nowrap text-sm text-neutral-600 dark:text-neutral-400">向 LLM 暴露</span>
        <SelectTab v-model="live2dStore.expressionLlmMode" :options="llmModeOptions" size="sm" />
      </div>

      <span v-if="live2dStore.expressionLlmMode !== 'none'" class="text-xs text-neutral-500 dark:text-neutral-400">
        LLM 工具集成暂未接通。
      </span>

      <div
        v-if="live2dStore.expressionLlmMode === 'custom'"
        class="mt-2 flex flex-col gap-2 border-l-2 border-neutral-200 pl-3 dark:border-neutral-700"
      >
        <div
          v-for="expressionName in expressionNames"
          :key="`llm-${expressionName}`"
          class="flex items-center justify-between"
        >
          <span class="text-xs text-neutral-600 dark:text-neutral-400">{{ expressionName }}</span>
          <Checkbox
            :model-value="live2dStore.expressionLlmExposed[expressionName] ?? false"
            @update:model-value="live2dStore.setExpressionLlmExposed(expressionName, $event)"
          />
        </div>
      </div>
    </template>
  </AiriSection>
</template>

<style scoped>
.parameter-group {
  margin-top: 1rem;
}

.parameter-group__title {
  margin-bottom: 0.35rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: rgb(115 115 115);
}

.dark .parameter-group__title {
  color: rgb(163 163 163);
}
</style>
