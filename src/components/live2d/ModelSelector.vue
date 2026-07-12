<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import Button from '@/components/airi-ui/Button.vue'
import { useLive2dStore } from '@/stores/live2d'

const props = defineProps<{
  selectedModelId?: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'pick', value: string): void
}>()

const live2dStore = useLive2dStore()
const models = computed(() => live2dStore.models)
const highlightedModelId = ref<string | null>(null)

watch(
  [() => props.selectedModelId, models],
  ([selectedModelId]) => {
    highlightedModelId.value = selectedModelId
      && models.value.some(model => model.id === selectedModelId)
      ? selectedModelId
      : null
  },
  { immediate: true },
)

function handlePick(modelId: string) {
  highlightedModelId.value = modelId
  emit('pick', modelId)
  emit('close')
}

function handleMobilePick() {
  if (!highlightedModelId.value) {
    return
  }
  handlePick(highlightedModelId.value)
}
</script>

<template>
  <div h-full flex flex-col gap="4 sm:6" pt="4 sm:0">
    <div flex items-start justify-between gap-4>
      <div>
        <div text-xl font-semibold>
          选择 Live2D 模型
        </div>
        <p mt-1 text-sm text="neutral-500 dark:neutral-400">
          这里只显示服务器管理员已安装并通过校验的模型。
        </p>
      </div>
      <Button variant="secondary" :disabled="live2dStore.loading" @click="live2dStore.fetchModels()">
        {{ live2dStore.loading ? '刷新中...' : '刷新列表' }}
      </Button>
    </div>

    <div
      v-if="!live2dStore.loading && models.length === 0"
      class="flex min-h-72 flex-1 flex-col items-center justify-center rounded-2xl border border-neutral-200/80 border-dashed px-6 py-12 text-center dark:border-neutral-700/80"
    >
      <div i-solar:folder-with-files-bold-duotone mb-4 text-5xl text="neutral-400 dark:neutral-500" />
      <div text-lg font-semibold>
        没有可用的 Live2D 模型
      </div>
      <p mt-2 max-w-xl text-sm text="neutral-500 dark:neutral-400">
        请联系服务器管理员，将完整模型文件夹放入
        <code>data/live2d/models/</code>。目录复制完成后刷新列表即可发现，无需 ZIP 或
        <code>metadata.json</code>。
      </p>
    </div>

    <div v-else class="min-h-0 flex-1 overflow-y-auto pr-1">
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <article
          v-for="model in models"
          :key="model.id"
          class="group cursor-pointer overflow-hidden rounded-2xl border bg-white/75 transition-all dark:bg-neutral-900/75"
          :class="[
            highlightedModelId === model.id
              ? 'border-primary-400 ring-2 ring-primary-400/30'
              : 'border-neutral-200/80 hover:border-primary-300 dark:border-neutral-700/80 dark:hover:border-primary-500',
          ]"
          @click="highlightedModelId = model.id"
        >
          <div class="grid min-h-48 grid-cols-[minmax(0,1.2fr)_minmax(9rem,0.8fr)]">
            <div class="relative min-h-48 overflow-hidden bg-neutral-100 dark:bg-neutral-950/60">
              <img
                v-if="model.thumbnailUrl"
                :src="model.thumbnailUrl"
                :alt="`${model.name} preview`"
                class="h-full w-full object-contain"
              >
              <div v-else class="h-full w-full flex flex-col items-center justify-center gap-2 text-neutral-400">
                <div i-solar:gallery-minimalistic-bold-duotone text-4xl />
                <span text-sm>无预览图</span>
              </div>
              <span
                v-if="model.isDefault"
                class="absolute left-3 top-3 rounded-full bg-primary-500/90 px-2.5 py-1 text-xs text-white shadow-sm"
              >
                后端默认
              </span>
            </div>

            <div class="min-w-0 flex flex-col justify-between gap-4 p-4">
              <div>
                <h3 class="break-words text-base font-semibold">
                  {{ model.name }}
                </h3>
                <p class="mt-1 break-all text-xs text-neutral-500 dark:text-neutral-400">
                  {{ model.id }}
                </p>
                <div mt-3 flex items-center gap-1 text-xs text="neutral-400 dark:neutral-500">
                  <div i-solar:tag-horizontal-bold />
                  <span>Live2D</span>
                </div>
              </div>

              <Button class="hidden w-full md:block" variant="secondary" @click.stop="handlePick(model.id)">
                {{ props.selectedModelId === model.id ? '保持选择' : '选择模型' }}
              </Button>
            </div>
          </div>
        </article>
      </div>
    </div>

    <Button
      class="block md:hidden"
      :disabled="!highlightedModelId"
      @click="handleMobilePick"
    >
      确认选择
    </Button>
  </div>
</template>
