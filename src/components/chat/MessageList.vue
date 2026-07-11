<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import { useChat } from '@/composables/useChat'
import { useChatStore } from '@/stores/chat'
import { useChatsStore } from '@/stores/chats'

import ChatTimelineItem from './ChatTimelineItem.vue'

interface Props {
  variant?: 'default' | 'stage'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default'
})

const { timelineItems, streamingText, isStreaming } = useChat()
const chatStore = useChatStore()
const chatsStore = useChatsStore()
const messageListRef = ref<HTMLElement | null>(null)
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

const scrollToBottom = () => {
  nextTick(() => {
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight
    }
  })
}

watch([timelineItems, streamingText], () => {
  scrollToBottom()
})
</script>

<template>
  <div
    ref="messageListRef"
    class="message-list flex-1 overflow-y-auto p-6 space-y-4"
    :class="{ 'stage-message-list': props.variant === 'stage' }"
  >
    <div
      v-if="timelineItems.length === 0 && !isStreaming"
      class="empty-state mt-20 text-center"
      :class="{ 'stage-empty-state': props.variant === 'stage' }"
    >
      <p class="text-lg">{{ emptyStateText }}</p>
    </div>

    <ChatTimelineItem
      v-for="item in timelineItems"
      :key="item.id"
      :item="item"
      :variant="props.variant"
    />

    <div
      v-if="isStreaming && streamingText"
      class="streaming-message"
      :class="{ 'stage-streaming-message': props.variant === 'stage' }"
    >
      <div class="streaming-content" :class="{ 'stage-streaming-content': props.variant === 'stage' }">
        <div class="streaming-header">
          <span class="streaming-role">AI</span>
          <span class="streaming-time">正在输入...</span>
        </div>
        <div class="streaming-text">{{ streamingText }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-list {
  scroll-behavior: smooth;
}

.stage-message-list {
  padding: 1.2rem 1.2rem 1rem;
}

.empty-state {
  color: rgb(0 0 0 / 0.45);
}

.stage-empty-state {
  margin-top: 2rem;
  padding-left: 1rem;
  padding-right: 1rem;
  text-align: left;
}

.streaming-message {
  display: flex;
  justify-content: flex-start;
}

.streaming-content {
  max-width: 70%;
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

.stage-streaming-content {
  max-width: 82%;
  border-radius: 1rem;
}

.dark .empty-state {
  color: rgb(255 255 255 / 0.42);
}

.dark .streaming-content {
  background: rgb(0 51 69 / 0.8);
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
