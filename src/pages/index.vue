<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { breakpointsTailwind, useBreakpoints, useMouse, useWindowSize } from '@vueuse/core'

import { useTheme } from '@/composables/useTheme'
import { useWebSocket } from '@/composables/useWebSocket'
import ChatArea from '@/components/chat/ChatArea.vue'
import Live2DCanvas from '@/components/live2d/Live2DCanvas.vue'
import StageChatShell from '@/components/live2d/StageChatShell.vue'
import StageHeader from '@/components/live2d/StageHeader.vue'
import Sidebar from '@/components/sidebar/Sidebar.vue'
import { useCharactersStore } from '@/stores/characters'
import { useLive2dStore } from '@/stores/live2d'

const { isDark, toggleDark } = useTheme()
const { connect, disconnect } = useWebSocket()
const charactersStore = useCharactersStore()
const live2dStore = useLive2dStore()
const isLive2dMode = computed(() => live2dStore.enabled)
const mouse = useMouse()
const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('md')
const { width: windowWidth } = useWindowSize()

const stageModelPosition = computed(() => ({
  x: live2dStore.position.x - (isMobile.value ? 0 : windowWidth.value * 0.1),
  y: live2dStore.position.y
}))

onMounted(() => {
  connect()
  void charactersStore.fetchCharacters()
  void live2dStore.fetchModels()
})

onUnmounted(() => {
  disconnect()
})

watch(isLive2dMode, (enabled) => {
  if (enabled) {
    void live2dStore.fetchModels()
  }
})
</script>

<template>
  <div class="app-container w-full h-full flex" :class="{ 'stage-mode': isLive2dMode }">
    <div v-if="!isLive2dMode" class="top-actions">
      <button
        border="2 solid neutral-100/60 dark:neutral-800/30"
        bg="neutral-50/70 dark:neutral-800/70"
        w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md
        title="Theme"
        @click="toggleDark()"
      >
        <Transition name="fade" mode="out-in">
          <div v-if="isDark" i-solar:moon-outline size-5 text="neutral-500 dark:neutral-400" />
          <div v-else i-solar:sun-2-outline size-5 text="neutral-500 dark:neutral-400" />
        </Transition>
      </button>

      <RouterLink
        to="/settings"
        border="2 solid neutral-100/60 dark:neutral-800/30"
        bg="neutral-50/70 dark:neutral-800/70"
        w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md
        title="Settings"
      >
        <div i-solar:settings-outline size-5 text="neutral-500 dark:neutral-400" />
      </RouterLink>
    </div>

    <template v-if="!isLive2dMode">
      <Sidebar />
      <ChatArea />
    </template>

    <template v-else>
      <div class="stage-page-root">
        <div class="stage-header-wrap">
          <StageHeader />
        </div>

        <div class="stage-page-body">
          <div class="stage-widget">
            <Live2DCanvas
              :model-url="live2dStore.activeModel?.modelUrl"
              :position="stageModelPosition"
              :scale="live2dStore.scale"
              :expression-request="live2dStore.expressionRequest"
              :model-parameters="live2dStore.modelParameters"
              :focus-at="{ x: mouse.x.value, y: mouse.y.value }"
              :disable-focus="live2dStore.disableFocus"
              :expression-system-enabled="live2dStore.expressionEnabled"
              :auto-blink-enabled="live2dStore.autoBlinkEnabled"
              :force-auto-blink-enabled="live2dStore.forceAutoBlinkEnabled"
              :shadow-enabled="live2dStore.shadowEnabled"
              :max-fps="live2dStore.maxFps"
              :resolution="live2dStore.renderScale"
              empty-text="No available Live2D model. Ask the server administrator to install one."
            />
          </div>

          <StageChatShell class="stage-interactive-area" />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.app-container {
  position: relative;
  background: transparent;
}

.stage-mode {
  display: block;
  width: 100vw;
  height: 100dvh;
  overflow: hidden;
}

.top-actions {
  position: fixed;
  top: 1.5rem;
  right: 1.5rem;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.stage-page-root {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.stage-header-wrap {
  width: 100%;
  padding: 0.25rem 0.75rem 0.75rem;
}

.stage-page-body {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
}

.stage-widget {
  position: relative;
  flex: 1 1 auto;
  min-width: 50%;
  min-height: 0;
  height: 100%;
}

.stage-widget :deep(.live2d-canvas) {
  width: 100%;
  height: 100%;
}

.stage-interactive-area {
  position: absolute;
  top: 0;
  right: 1rem;
  z-index: 35;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: min(31.25rem, calc(100vw - 2rem));
  min-width: min(30%, 20rem);
  height: 85dvh;
  min-height: 0;
}

@media (max-width: 768px) {
  .top-actions {
    top: 1rem;
    right: 1rem;
  }

  .stage-header-wrap {
    padding: 0;
  }

  .stage-page-body {
    height: 100dvh;
  }

  .stage-widget {
    min-height: calc(100dvh - 23rem);
  }

  .stage-interactive-area {
    top: auto;
    right: 1rem;
    bottom: 1rem;
    left: 1rem;
    width: auto;
    height: min(27rem, calc(100vh - 23rem));
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
