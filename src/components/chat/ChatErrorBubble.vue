<script setup lang="ts">
import { computed } from 'vue'

import type { ChatNoticeItem } from '@/types/message'

interface Props {
  notice: ChatNoticeItem
  variant?: 'default' | 'stage'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default'
})

const isStage = computed(() => props.variant === 'stage')
const displayTime = computed(() => {
  const date = new Date(props.notice.timestamp)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
})
</script>

<template>
  <div
    class="chat-error-row"
    :class="{ 'stage-chat-error-row': isStage }"
    role="alert"
    aria-atomic="true"
  >
    <div class="chat-error-bubble" :class="{ 'stage-chat-error-bubble': isStage }">
      <div class="chat-error-icon" aria-hidden="true">
        <div class="i-solar:danger-triangle-bold-duotone" />
      </div>

      <div class="chat-error-body">
        <div class="chat-error-header">
          <span class="chat-error-label">回复生成失败</span>
          <time v-if="displayTime" class="chat-error-time" :datetime="notice.timestamp">
            {{ displayTime }}
          </time>
        </div>
        <p class="chat-error-message">{{ notice.content }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-error-row {
  display: flex;
  justify-content: flex-start;
  margin: 0 0 1rem 2.75rem;
}

.chat-error-bubble {
  display: grid;
  width: fit-content;
  max-width: calc(70% - 2.75rem);
  min-width: min(18rem, 100%);
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.65rem;
  border: 1px solid rgb(192 76 62 / 0.28);
  border-radius: 0.75rem;
  padding: 0.75rem;
  background: rgb(255 247 245 / 0.92);
  box-shadow: 0 1px 2px rgb(132 55 46 / 0.1);
  color: #752d26;
}

.chat-error-icon {
  display: inline-flex;
  width: 1.75rem;
  height: 1.75rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.55rem;
  background: rgb(205 82 67 / 0.12);
  color: #a33c31;
  font-size: 1.05rem;
}

.chat-error-body {
  min-width: 0;
}

.chat-error-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.25rem;
}

.chat-error-label {
  color: #7d2f27;
  font-size: 0.8125rem;
  font-weight: 650;
  line-height: 1.4;
}

.chat-error-time {
  flex: 0 0 auto;
  color: #76504b;
  font-size: 0.75rem;
  line-height: 1.4;
}

.chat-error-message {
  margin: 0;
  color: #752d26;
  font-size: 0.9375rem;
  line-height: 1.6;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.stage-chat-error-row {
  margin-right: 3rem;
  margin-left: 0.5rem;
}

.stage-chat-error-bubble {
  max-width: 100%;
}

.dark .chat-error-bubble {
  border-color: rgb(255 161 145 / 0.26);
  background: rgb(79 38 36 / 0.9);
  box-shadow: none;
  color: #ffe3de;
}

.dark .chat-error-icon {
  background: rgb(255 161 145 / 0.14);
  color: #ffb2a5;
}

.dark .chat-error-label,
.dark .chat-error-message {
  color: #ffe3de;
}

.dark .chat-error-time {
  color: #f4b9ae;
}

@media (max-width: 768px) {
  .chat-error-row,
  .stage-chat-error-row {
    margin-right: 0;
    margin-left: 0;
  }

  .chat-error-bubble,
  .stage-chat-error-bubble {
    width: auto;
    max-width: 92%;
    min-width: 0;
  }
}
</style>
