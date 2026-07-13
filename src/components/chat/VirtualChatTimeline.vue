<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { computed, ref, toRef } from 'vue'

import ChatTimelineItem from '@/components/chat/ChatTimelineItem.vue'
import { useVirtualChatTimeline } from '@/composables/useVirtualChatTimeline'
import type { ChatTimelineItem as ChatTimelineItemType } from '@/types/message'

interface Props {
  items: ChatTimelineItemType[]
  streamingText: string
  isStreaming: boolean
  chatId: string | null
  emptyStateText: string
  variant?: 'default' | 'stage'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default'
})
const containerRef = ref<HTMLElement | null>(null)
const isStage = computed(() => props.variant === 'stage')
const estimatedRowSize = isStage.value ? 104 : 112
const {
  rows,
  visibleRows,
  totalSize,
  measureElement
} = useVirtualChatTimeline({
  containerRef,
  timelineItems: toRef(props, 'items'),
  streamingText: toRef(props, 'streamingText'),
  isStreaming: toRef(props, 'isStreaming'),
  chatId: toRef(props, 'chatId'),
  estimatedRowSize
})

const timelineStyle = computed(() => ({
  height: `${totalSize.value}px`
}))

function rowStyle(start: number) {
  return {
    transform: `translateY(${start}px)`
  }
}

function setRowElement(element: Element | ComponentPublicInstance | null): void {
  measureElement(element instanceof Element ? element : null)
}
</script>

<template>
  <div
    ref="containerRef"
    class="virtual-chat-scroll"
    :class="isStage ? 'stage-chat-history' : 'message-list'"
    data-chat-virtual-scroll
  >
    <div
      v-if="rows.length === 0 && !props.isStreaming"
      class="empty-state"
      :class="{ 'stage-chat-empty-state': isStage }"
    >
      <p>{{ emptyStateText }}</p>
    </div>

    <div v-else class="virtual-chat-sizer" :style="timelineStyle">
      <div
        v-for="visibleRow in visibleRows"
        :key="visibleRow.row.key"
        :ref="setRowElement"
        class="virtual-chat-row"
        :data-index="visibleRow.virtualItem.index"
        :data-chat-message-index="visibleRow.virtualItem.index"
        :data-chat-message-key="visibleRow.row.key"
        :data-chat-message-role="visibleRow.row.kind === 'timeline-item'
          ? visibleRow.row.item.kind === 'message'
            ? visibleRow.row.item.role
            : 'notice'
          : 'assistant'"
        :style="rowStyle(visibleRow.virtualItem.start)"
      >
        <ChatTimelineItem
          v-if="visibleRow.row.kind === 'timeline-item'"
          :item="visibleRow.row.item"
          :variant="props.variant"
        />

        <div
          v-else
          class="streaming-message"
          :class="{ 'stage-streaming-message': isStage }"
        >
          <div
            class="streaming-content"
            :class="{ 'stage-streaming-content': isStage }"
          >
            <div class="streaming-header">
              <span class="streaming-role">{{ isStage ? 'AIRI' : 'AI' }}</span>
              <span class="streaming-time">正在输入...</span>
            </div>
            <div class="streaming-text">{{ visibleRow.row.text }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.virtual-chat-scroll {
  position: relative;
  min-height: 0;
  overflow-y: auto;
}

.message-list {
  flex: 1 1 0%;
  padding: 1.5rem;
}

.stage-chat-history {
  width: 100%;
  height: 100%;
  padding: 1.2rem 1.2rem 1rem;
  scrollbar-color: rgb(24 181 216 / 0.65) transparent;
  scrollbar-width: thin;
}

.stage-chat-history::-webkit-scrollbar {
  width: 8px;
}

.stage-chat-history::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgb(24 181 216 / 0.55);
}

.stage-chat-history::-webkit-scrollbar-track {
  background: transparent;
}

.virtual-chat-sizer {
  position: relative;
  width: 100%;
}

.virtual-chat-row {
  position: absolute;
  top: 0;
  left: 0;
  display: flow-root;
  width: 100%;
}

.empty-state {
  margin-top: 5rem;
  color: rgb(0 0 0 / 0.45);
  text-align: center;
}

.stage-chat-empty-state {
  margin-top: 1rem;
  padding-inline: 1rem;
  color: rgb(0 129 179 / 0.66);
  line-height: 1.7;
  text-align: left;
}

.streaming-message {
  display: flex;
  justify-content: flex-start;
  margin-bottom: 1rem;
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

.stage-streaming-message {
  margin-right: 3rem;
}

.stage-streaming-content {
  max-width: 100%;
}

.streaming-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.streaming-role {
  color: rgb(0 0 0 / 0.6);
  font-size: 0.875rem;
  font-weight: 400;
}

.streaming-time {
  color: rgb(0 0 0 / 0.42);
  font-size: 0.75rem;
}

.streaming-text {
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.dark .empty-state {
  color: rgb(255 255 255 / 0.42);
}

.dark .stage-chat-empty-state {
  color: rgb(152 236 255 / 0.78);
}

.dark .streaming-content {
  background: rgb(0 51 69 / 0.8);
  box-shadow: none;
  color: #c5fcff;
}

.dark .stage-streaming-content {
  background: rgb(0 71 102 / 0.72);
}

.dark .streaming-role {
  color: rgb(255 255 255 / 0.65);
}

.dark .streaming-time {
  color: rgb(255 255 255 / 0.42);
}
</style>
