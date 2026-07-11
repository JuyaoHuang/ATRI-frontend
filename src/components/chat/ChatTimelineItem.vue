<script setup lang="ts">
import type { ChatTimelineItem } from '@/types/message'

import ChatErrorBubble from './ChatErrorBubble.vue'
import MessageItem from './MessageItem.vue'

interface Props {
  item: ChatTimelineItem
  variant?: 'default' | 'stage'
}

withDefaults(defineProps<Props>(), {
  variant: 'default'
})
</script>

<template>
  <MessageItem
    v-if="item.kind === 'message'"
    :message="item"
    :variant="variant"
  />
  <ChatErrorBubble
    v-else
    :notice="item"
    :variant="variant"
  />
</template>
