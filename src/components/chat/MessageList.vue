<script setup lang="ts">
import { computed } from 'vue'

import { useChat } from '@/composables/useChat'
import { useChatStore } from '@/stores/chat'
import { useChatsStore } from '@/stores/chats'

import VirtualChatTimeline from './VirtualChatTimeline.vue'

interface Props {
  variant?: 'default' | 'stage'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default'
})

const { timelineItems, streamingText, isStreaming } = useChat()
const chatStore = useChatStore()
const chatsStore = useChatsStore()
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
</script>

<template>
  <VirtualChatTimeline
    :items="timelineItems"
    :streaming-text="streamingText"
    :is-streaming="isStreaming"
    :chat-id="chatStore.currentChatId"
    :empty-state-text="emptyStateText"
    :variant="props.variant"
  />
</template>
