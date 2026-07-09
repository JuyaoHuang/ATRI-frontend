<script setup lang="ts">
import { watch } from 'vue'

import { useChat } from '@/composables/useChat'
import { useAudioPlayer } from '@/composables/useAudioPlayer'
import { useWebSocket } from '@/composables/useWebSocket'
import { useChatStore } from '@/stores/chat'

import InputBox from './InputBox.vue'
import MessageList from './MessageList.vue'

interface Props {
  variant?: 'default' | 'stage'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default'
})

const { connected, reconnecting } = useWebSocket()
const { loadHistory } = useChat()
const chatStore = useChatStore()
const audioPlayer = useAudioPlayer()

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
  <div class="chat-area flex-1 flex flex-col" :class="{ 'stage-chat-area': props.variant === 'stage' }">
    <div class="chat-header h-16 flex items-center justify-between px-6 border-b" :class="{ 'stage-chat-header': props.variant === 'stage' }">
      <h3 class="chat-title text-lg font-semibold">对话区域</h3>
      <div class="flex items-center gap-2" :class="{ 'stage-chat-status': props.variant === 'stage' }">
        <div
          class="w-2 h-2 rounded-full"
          :class="connected ? 'bg-green-500' : reconnecting ? 'bg-yellow-500' : 'bg-red-500'"
        />
        <span class="chat-status text-sm">
          {{ connected ? '已连接' : reconnecting ? '重连中...' : '未连接' }}
        </span>
      </div>
    </div>

    <MessageList :variant="props.variant" />
    <InputBox :variant="props.variant" />
  </div>
</template>

<style scoped>
.chat-area {
  background: transparent;
}

.stage-chat-area {
  border: 1px solid rgb(152 236 255 / 0.34);
  border-radius: 1.8rem;
  overflow: hidden;
  background: linear-gradient(180deg, rgb(255 255 255 / 0.48), rgb(240 252 255 / 0.28));
  backdrop-filter: blur(30px) saturate(150%);
  -webkit-backdrop-filter: blur(30px) saturate(150%);
  box-shadow:
    0 28px 48px rgb(0 129 179 / 0.12),
    inset 0 1px 0 rgb(255 255 255 / 0.82);
}

.chat-header {
  background: rgb(152 236 255 / 0.2);
  border-color: rgb(152 236 255 / 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.stage-chat-header {
  height: 3.65rem;
  padding-inline: 1.2rem;
  background: rgb(152 236 255 / 0.14);
}

.chat-title {
  color: #0081b3;
}

.chat-status {
  color: rgb(0 129 179 / 0.78);
}

.stage-chat-status {
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  background: rgb(240 252 255 / 0.66);
  border: 1px solid rgb(152 236 255 / 0.36);
}

.dark .chat-header {
  background: rgb(41 189 226 / 0.2);
  border-color: rgb(41 189 226 / 0.28);
}

.dark .stage-chat-area {
  background: linear-gradient(180deg, rgb(0 71 102 / 0.46), rgb(0 51 69 / 0.38));
  border-color: rgb(41 189 226 / 0.22);
  box-shadow:
    0 28px 48px rgb(0 0 0 / 0.28),
    inset 0 1px 0 rgb(197 252 255 / 0.08);
}

.dark .chat-title {
  color: #c5fcff;
}

.dark .chat-status {
  color: rgb(152 236 255 / 0.8);
}

.dark .stage-chat-status {
  background: rgb(0 51 69 / 0.72);
  border-color: rgb(41 189 226 / 0.24);
}
</style>
