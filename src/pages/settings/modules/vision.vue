<script setup lang="ts">
import { computed, onMounted } from 'vue'

import Checkbox from '@/components/airi-ui/Checkbox.vue'
import { useVision } from '@/composables/useVision'

const {
  error,
  loaded,
  loading,
  loadConfig,
  moduleEnabled,
  runtimeError,
  runtimeStatus,
  saving,
  updateModuleEnabled,
} = useVision()

const toggleDisabled = computed(() => !loaded.value || loading.value || saving.value)

const moduleHint = computed(() => {
  if (loading.value && !loaded.value) {
    return '正在读取 ATRI 的视觉配置'
  }
  if (saving.value) {
    return '正在保存模块状态'
  }
  return moduleEnabled.value
    ? 'ATRI 已允许接收当前标签页提供的屏幕画面'
    : '视觉输入已停用，聊天页不会建立屏幕共享'
})

const runtimeLabel = computed(() => {
  if (!moduleEnabled.value) {
    return '模块已关闭'
  }
  switch (runtimeStatus.value) {
    case 'starting':
      return '正在等待浏览器授权'
    case 'active':
      return '当前标签页正在共享'
    case 'error':
      return '共享未能启动'
    default:
      return '当前标签页未共享'
  }
})

const runtimeDescription = computed(() => {
  if (!moduleEnabled.value) {
    return '启用模块后，仍需回到聊天主页点击视觉按钮。'
  }
  if (runtimeStatus.value === 'active') {
    return '发送文字或完成语音转写时，ATRI 会从共享画面截取当前一帧。'
  }
  if (runtimeStatus.value === 'starting') {
    return '请在浏览器选择要共享的屏幕、窗口或标签页。'
  }
  if (runtimeStatus.value === 'error') {
    return runtimeError.value || '可以回到聊天主页重新尝试。'
  }
  return '模块已就绪；共享只会由聊天主页上的视觉按钮启动。'
})

const runtimeIcon = computed(() => {
  if (!moduleEnabled.value) {
    return 'i-solar:eye-closed-bold-duotone'
  }
  if (runtimeStatus.value === 'starting') {
    return 'i-solar:refresh-bold-duotone animate-spin'
  }
  if (runtimeStatus.value === 'active') {
    return 'i-solar:eye-scan-bold-duotone'
  }
  if (runtimeStatus.value === 'error') {
    return 'i-solar:danger-circle-bold-duotone'
  }
  return 'i-solar:eye-bold-duotone'
})

async function handleEnabledChange(enabled: boolean): Promise<void> {
  try {
    await updateModuleEnabled(enabled)
  }
  catch {
    // The store keeps the last server-confirmed value and exposes a safe error.
  }
}

onMounted(() => {
  void loadConfig()
})
</script>

<template>
  <main class="vision-settings mx-auto w-full max-w-3xl pb-12">
    <section class="vision-card" aria-labelledby="vision-module-title">
      <header class="vision-card__header">
        <div class="vision-card__icon" aria-hidden="true">
          <div class="i-solar:eye-bold-duotone h-6 w-6" />
        </div>
        <div class="min-w-0">
          <p class="vision-card__eyebrow">
            视觉功能
          </p>
          <h2 id="vision-module-title" class="vision-card__title">
            允许 ATRI 理解共享画面
          </h2>
          <p class="vision-card__summary">
            这个开关只决定视觉模块是否可用，不会立即请求屏幕共享权限。
          </p>
        </div>
      </header>

      <label class="vision-toggle" :class="{ 'vision-toggle--disabled': toggleDisabled }">
        <span class="vision-toggle__copy">
          <span class="vision-toggle__label">启用视觉功能</span>
          <span id="vision-module-hint" class="vision-toggle__hint">{{ moduleHint }}</span>
        </span>
        <span
          v-if="saving"
          class="i-solar:refresh-bold-duotone h-5 w-5 shrink-0 animate-spin text-primary-500"
          aria-hidden="true"
        />
        <Checkbox
          :model-value="moduleEnabled"
          :disabled="toggleDisabled"
          aria-label="启用视觉功能"
          aria-describedby="vision-module-hint"
          @update:model-value="handleEnabledChange"
        />
      </label>

      <div v-if="error" class="vision-error" role="alert">
        <div class="i-solar:danger-circle-bold-duotone h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <p class="font-semibold">
            视觉设置未能更新
          </p>
          <p class="mt-0.5 text-xs opacity-80">
            {{ error }} 已保留服务器最后确认的开关状态。
          </p>
        </div>
      </div>

      <div class="vision-runtime" aria-live="polite">
        <div
          class="vision-runtime__icon"
          :class="{ 'vision-runtime__icon--active': runtimeStatus === 'active' && moduleEnabled }"
          aria-hidden="true"
        >
          <div class="h-5 w-5" :class="runtimeIcon" />
        </div>
        <div class="min-w-0">
          <p class="vision-runtime__label">
            {{ runtimeLabel }}
          </p>
          <p class="vision-runtime__description">
            {{ runtimeDescription }}
          </p>
        </div>
      </div>
    </section>

    <section class="vision-note" aria-label="屏幕共享说明">
      <div class="i-solar:shield-check-bold-duotone h-5 w-5 shrink-0" aria-hidden="true" />
      <p>
        启用后，请回到聊天主页点击 VAD 麦克风右侧的视觉按钮并选择共享目标。共享仅属于当前浏览器标签页；刷新页面或使用浏览器原生“停止共享”后会结束。
      </p>
    </section>
  </main>
</template>

<style scoped>
.vision-settings {
  color: rgb(64 64 64);
}

.vision-card {
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 0.78);
  border-radius: 1rem;
  background:
    linear-gradient(145deg, rgb(255 255 255 / 0.92), rgb(240 252 255 / 0.78));
  box-shadow:
    0 16px 42px rgb(0 129 179 / 0.08),
    inset 0 1px 0 rgb(255 255 255 / 0.94);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.vision-card__header {
  display: flex;
  gap: 1rem;
  padding: 1.25rem;
}

.vision-card__icon {
  display: flex;
  width: 2.75rem;
  height: 2.75rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 0.85rem;
  color: #00769f;
  background: rgb(152 236 255 / 0.34);
}

.vision-card__eyebrow {
  margin: 0 0 0.2rem;
  color: rgb(0 129 179 / 0.68);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.vision-card__title {
  margin: 0;
  color: #006f99;
  font-size: clamp(1.08rem, 2vw, 1.35rem);
  font-weight: 800;
  line-height: 1.35;
}

.vision-card__summary {
  margin: 0.4rem 0 0;
  color: rgb(0 92 126 / 0.68);
  font-size: 0.84rem;
  line-height: 1.6;
}

.vision-toggle {
  display: flex;
  min-height: 4.6rem;
  align-items: center;
  gap: 0.75rem;
  margin: 0 1.25rem;
  padding: 0.9rem 1rem;
  border: 1px solid rgb(152 236 255 / 0.58);
  border-radius: 0.9rem;
  background: rgb(240 252 255 / 0.74);
  cursor: pointer;
  transition: border-color 180ms ease, background-color 180ms ease;
}

.vision-toggle:hover {
  border-color: rgb(41 189 226 / 0.72);
  background: rgb(230 250 255 / 0.9);
}

.vision-toggle--disabled {
  cursor: wait;
}

.vision-toggle__copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.2rem;
}

.vision-toggle__label,
.vision-runtime__label {
  color: #00769f;
  font-size: 0.9rem;
  font-weight: 750;
}

.vision-toggle__hint,
.vision-runtime__description {
  color: rgb(0 92 126 / 0.66);
  font-size: 0.78rem;
  line-height: 1.5;
}

.vision-error {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  margin: 0.8rem 1.25rem 0;
  padding: 0.75rem 0.85rem;
  border: 1px solid rgb(248 113 113 / 0.28);
  border-radius: 0.85rem;
  color: rgb(185 28 28);
  background: rgb(254 242 242 / 0.74);
}

.vision-runtime {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-top: 1.1rem;
  padding: 1rem 1.25rem 1.25rem;
  border-top: 1px solid rgb(152 236 255 / 0.34);
}

.vision-runtime__icon {
  display: flex;
  width: 2.2rem;
  height: 2.2rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  color: rgb(82 82 82 / 0.7);
  background: rgb(229 229 229 / 0.58);
}

.vision-runtime__icon--active {
  color: #006f99;
  background: rgb(152 236 255 / 0.36);
  box-shadow: 0 0 0 3px rgb(41 189 226 / 0.09);
}

.vision-note {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  margin-top: 1rem;
  padding: 0.9rem 1rem;
  border: 1px solid rgb(152 236 255 / 0.32);
  border-radius: 0.9rem;
  color: rgb(0 92 126 / 0.72);
  background: rgb(240 252 255 / 0.48);
  font-size: 0.78rem;
  line-height: 1.65;
}

.dark .vision-settings {
  color: rgb(229 229 229);
}

.dark .vision-card {
  border-color: rgb(41 189 226 / 0.24);
  background:
    linear-gradient(145deg, rgb(0 51 69 / 0.8), rgb(0 24 32 / 0.76));
  box-shadow:
    0 16px 42px rgb(0 0 0 / 0.22),
    inset 0 1px 0 rgb(255 255 255 / 0.05);
}

.dark .vision-card__icon {
  color: #c5fcff;
  background: rgb(41 189 226 / 0.18);
}

.dark .vision-card__eyebrow {
  color: rgb(152 236 255 / 0.68);
}

.dark .vision-card__title,
.dark .vision-toggle__label,
.dark .vision-runtime__label {
  color: #c5fcff;
}

.dark .vision-card__summary,
.dark .vision-toggle__hint,
.dark .vision-runtime__description {
  color: rgb(197 252 255 / 0.64);
}

.dark .vision-toggle {
  border-color: rgb(41 189 226 / 0.27);
  background: rgb(0 51 69 / 0.58);
}

.dark .vision-toggle:hover {
  border-color: rgb(41 189 226 / 0.5);
  background: rgb(0 71 102 / 0.62);
}

.dark .vision-error {
  border-color: rgb(248 113 113 / 0.28);
  color: rgb(254 202 202);
  background: rgb(127 29 29 / 0.24);
}

.dark .vision-runtime {
  border-top-color: rgb(41 189 226 / 0.2);
}

.dark .vision-runtime__icon {
  color: rgb(212 212 216 / 0.72);
  background: rgb(38 38 38 / 0.64);
}

.dark .vision-runtime__icon--active {
  color: #c5fcff;
  background: rgb(41 189 226 / 0.18);
}

.dark .vision-note {
  border-color: rgb(41 189 226 / 0.2);
  color: rgb(197 252 255 / 0.65);
  background: rgb(0 51 69 / 0.36);
}

@media (max-width: 640px) {
  .vision-card__header {
    padding: 1rem;
  }

  .vision-toggle {
    margin-inline: 1rem;
  }

  .vision-error {
    margin-inline: 1rem;
  }

  .vision-runtime {
    padding-inline: 1rem;
  }
}
</style>
