<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import InputBox from '@/components/chat/InputBox.vue'
import ChatHistory from '@/components/sidebar/ChatHistory.vue'
import CharacterSelector from '@/components/sidebar/CharacterSelector.vue'
import { useChat } from '@/composables/useChat'
import { useAudioPlayer } from '@/composables/useAudioPlayer'
import { useWebSocket } from '@/composables/useWebSocket'
import { useChatStore } from '@/stores/chat'
import StageChatHistory from './StageChatHistory.vue'

type PanelMode = 'history' | 'characters' | null

const panelMode = ref<PanelMode>(null)
const { connected, reconnecting } = useWebSocket()
const { loadHistory } = useChat()
const chatStore = useChatStore()
const audioPlayer = useAudioPlayer()

const connectionLabel = computed(() => {
  if (connected.value) {
    return '已连接'
  }

  if (reconnecting.value) {
    return '重连中...'
  }

  return '未连接'
})

const togglePanel = (mode: Exclude<PanelMode, null>) => {
  panelMode.value = panelMode.value === mode ? null : mode
}

const closePanel = () => {
  panelMode.value = null
}

const handleCharacterSelected = () => {
  panelMode.value = 'history'
}

watch(
  () => chatStore.currentChatId,
  (chatId) => {
    if (chatId) {
      if (chatId.startsWith('draft_')) {
        return
      }

      if (chatStore.consumeSkipNextHistoryLoad(chatId)) {
        return
      }

      loadHistory(chatId)
    }
    else {
      chatStore.clearMessages()
    }
  },
  { immediate: true },
)

watch(
  () => [chatStore.currentChatId, chatStore.currentCharacterId] as const,
  ([chatId, characterId], [previousChatId, previousCharacterId]) => {
    if (chatId !== previousChatId || characterId !== previousCharacterId) {
      audioPlayer.stopBecauseContextChanged()
    }
  },
)
</script>

<template>
  <div class="stage-chat-shell">
    <div class="stage-chat-container">
      <div class="stage-chat-toolbar">
        <div class="toolbar-copy">
          <h2>对话区域</h2>
        </div>

        <div class="toolbar-actions">
          <button
            class="toolbar-toggle"
            :class="{ 'is-active': panelMode === 'history' }"
            @click="togglePanel('history')"
          >
            聊天历史
          </button>
          <button
            class="toolbar-toggle"
            :class="{ 'is-active': panelMode === 'characters' }"
            @click="togglePanel('characters')"
          >
            角色选择
          </button>
          <div class="connection-pill">
            <span
              class="connection-dot"
              :class="connected ? 'is-online' : reconnecting ? 'is-reconnecting' : 'is-offline'"
            />
            <span>{{ connectionLabel }}</span>
          </div>
        </div>
      </div>

      <Transition name="panel-slide">
        <div v-if="panelMode" class="stage-control-panel">
          <div class="stage-control-panel__inner">
            <ChatHistory
              v-if="panelMode === 'history'"
              :auto-select-first="false"
              @create-chat="closePanel"
              @select-chat="closePanel"
            />
            <CharacterSelector v-else @select="handleCharacterSelected" />
          </div>
        </div>
      </Transition>

      <div class="stage-dialogue-history">
        <StageChatHistory />
      </div>

      <InputBox variant="stage" />
    </div>
  </div>
</template>

<style scoped>
.stage-chat-shell {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.stage-chat-container {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  border-radius: 1.75rem;
  overflow: hidden;
  border: 4px solid rgb(152 236 255 / 0.2);
  background: rgb(240 252 255 / 0.52);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  box-shadow:
    0 24px 48px rgb(0 129 179 / 0.12),
    inset 0 1px 0 rgb(255 255 255 / 0.82);
}

.stage-chat-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1rem 0.85rem;
  border-bottom: 1px solid rgb(152 236 255 / 0.28);
  background: rgb(152 236 255 / 0.14);
}

.toolbar-copy {
  min-width: 0;
}

.toolbar-copy h2 {
  color: #0071a0;
  font-size: 1rem;
  font-weight: 800;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.toolbar-toggle,
.connection-pill {
  border-radius: 999px;
  padding: 0.48rem 0.8rem;
  border: 1px solid rgb(152 236 255 / 0.4);
  background: rgb(255 255 255 / 0.72);
  color: rgb(0 129 179 / 0.78);
  font-size: 0.8rem;
  font-weight: 700;
  transition:
    background-color 0.2s ease,
    transform 0.2s ease,
    color 0.2s ease;
}

.toolbar-toggle:hover {
  transform: translateY(-1px);
}

.toolbar-toggle.is-active {
  background: linear-gradient(135deg, #18b5d8, #63d9dc);
  border-color: transparent;
  color: white;
}

.connection-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.connection-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
}

.connection-dot.is-online {
  background: #22c55e;
}

.connection-dot.is-reconnecting {
  background: #facc15;
}

.connection-dot.is-offline {
  background: #ef4444;
}

.stage-control-panel {
  padding: 0.9rem 1rem 0;
  flex-shrink: 0;
}

.stage-control-panel__inner {
  max-height: 16.5rem;
  overflow: auto;
  border-radius: 1.2rem;
  background: rgb(255 255 255 / 0.5);
  border: 1px solid rgb(152 236 255 / 0.24);
  padding: 0.9rem;
}

.stage-dialogue-history {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease,
    max-height 0.2s ease;
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.dark .stage-chat-container {
  border-color: rgb(41 189 226 / 0.18);
  background: rgb(0 51 69 / 0.56);
  box-shadow:
    0 24px 48px rgb(0 0 0 / 0.3),
    inset 0 1px 0 rgb(197 252 255 / 0.08);
}

.dark .stage-chat-toolbar {
  border-bottom-color: rgb(41 189 226 / 0.2);
  background: rgb(41 189 226 / 0.1);
}

.dark .toolbar-copy h2 {
  color: #c5fcff;
}

.dark .toolbar-toggle,
.dark .connection-pill,
.dark .stage-control-panel__inner {
  background: rgb(0 71 102 / 0.7);
  border-color: rgb(41 189 226 / 0.24);
  color: rgb(152 236 255 / 0.82);
}

.dark .toolbar-toggle.is-active {
  color: white;
}

@media (max-width: 768px) {
  .stage-chat-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .toolbar-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .stage-control-panel {
    padding: 0.8rem 0.8rem 0;
  }
}
</style>
