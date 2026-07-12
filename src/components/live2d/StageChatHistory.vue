<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import { useChat } from '@/composables/useChat'
import { useChatHistoryScroll } from '@/composables/useChatHistoryScroll'
import { useChatStore } from '@/stores/chat'
import { useChatsStore } from '@/stores/chats'

import ChatTimelineItem from '@/components/chat/ChatTimelineItem.vue'

const { timelineItems, streamingText, isStreaming } = useChat()
const chatStore = useChatStore()
const chatsStore = useChatsStore()
const chatHistoryRef = ref<HTMLDivElement>()

const emptyStateText = computed(() => {
  if (!chatStore.currentCharacterId) {
    return '请选择一个角色开始对话。'
  }

  if (!chatStore.currentChatId && chatsStore.chatList.length > 0) {
    return '当前是新的空白会话，发送第一条消息后将自动创建聊天。'
  }

  if (!chatStore.currentChatId) {
    return '当前角色还没有聊天记录，发送第一条消息后将自动创建会话。'
  }

  return '开始对话吧。'
})

const renderTimelineItems = computed(() => timelineItems.value)

function getChatHistoryItemKey(message: { id?: string }, index: number) {
  if (message.id) {
    return message.id
  }

  return index
}

useChatHistoryScroll({
  containerRef: chatHistoryRef,
  messages: renderTimelineItems,
  getKey: getChatHistoryItemKey
})

function scrollToBottom() {
  nextTick(() => {
    if (!chatHistoryRef.value) {
      return
    }
    chatHistoryRef.value.scrollTop = chatHistoryRef.value.scrollHeight
  })
}

watch(
  () => [chatStore.currentChatId, renderTimelineItems.value.length],
  ([chatId, itemCount]) => {
    if (!chatId || itemCount === 0) {
      return
    }
    scrollToBottom()
  },
  { immediate: true }
)
</script>

<template>
  <div
    ref="chatHistoryRef"
    flex="~ col"
    relative
    h-full
    w-full
    overflow-y-auto
    rounded-xl
    px="<sm:2"
    py="<sm:2"
    class="gap-2 stage-chat-history"
  >
    <div v-if="renderTimelineItems.length === 0 && !isStreaming" class="stage-chat-empty-state">
      <p>{{ emptyStateText }}</p>
    </div>

    <template v-for="(item, index) in renderTimelineItems" :key="getChatHistoryItemKey(item, index)">
      <div
        :data-chat-message-index="index"
        :data-chat-message-key="String(getChatHistoryItemKey(item, index))"
        :data-chat-message-role="item.kind === 'message' ? item.role : 'notice'"
      >
        <ChatTimelineItem :item="item" variant="stage" />
      </div>
    </template>

    <div
      v-if="isStreaming && streamingText"
      class="streaming-message stage-streaming-message"
      data-chat-message-role="assistant"
      :data-chat-message-key="'streaming'"
    >
      <div class="streaming-content stage-streaming-content">
        <div class="streaming-header">
          <span class="streaming-role">AIRI</span>
          <span class="streaming-time">正在输入...</span>
        </div>
        <div class="streaming-text">{{ streamingText }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stage-chat-history {
  scrollbar-width: thin;
  scrollbar-color: rgb(24 181 216 / 0.65) transparent;
}

.stage-chat-history::-webkit-scrollbar {
  width: 8px;
}

.stage-chat-history::-webkit-scrollbar-thumb {
  background: rgb(24 181 216 / 0.55);
  border-radius: 999px;
}

.stage-chat-history::-webkit-scrollbar-track {
  background: transparent;
}

.stage-chat-empty-state {
  margin-top: 1rem;
  padding-left: 1rem;
  padding-right: 1rem;
  color: rgb(0 129 179 / 0.66);
  line-height: 1.7;
}

.stage-streaming-message {
  display: flex;
  margin-right: 3rem;
}

.stage-streaming-content {
  max-width: 100%;
  min-width: 5rem;
  border-radius: 0.75rem;
  padding: 0.75rem;
  background: rgb(240 252 255 / 0.8);
  box-shadow: 0 1px 2px rgb(152 236 255 / 0.5);
  color: #0071a0;
}

.streaming-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.streaming-role {
  font-size: 0.875rem;
  font-weight: 400;
  color: rgb(0 0 0 / 0.6);
}

.streaming-time {
  font-size: 0.75rem;
  color: rgb(0 0 0 / 0.42);
}

.streaming-text {
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.dark .stage-chat-empty-state {
  color: rgb(152 236 255 / 0.78);
}

.dark .stage-streaming-content {
  background: rgb(0 71 102 / 0.72);
  box-shadow: none;
  color: #c5fcff;
}

.dark .streaming-role {
  color: rgb(255 255 255 / 0.65);
}

.dark .streaming-time {
  color: rgb(255 255 255 / 0.42);
}
</style>
