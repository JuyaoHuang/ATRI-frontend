<script setup lang="ts">
import { computed } from 'vue'

import { useAudioPlayer } from '@/composables/useAudioPlayer'
import { useTTSStore } from '@/stores/tts'
import { useUserStore } from '@/stores/user'
import type { Message } from '@/types/message'
import { resolveAvatarUrl } from '@/utils/avatar'

interface Props {
  message: Message
  variant?: 'default' | 'stage'
}

const props = defineProps<Props>()
const userStore = useUserStore()
const ttsStore = useTTSStore()
const audioPlayer = useAudioPlayer()
const isStage = computed(() => props.variant === 'stage')

const formatTime = (timestamp: string) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const displayName = computed(() => {
  if (props.message.role === 'human') {
    return userStore.displayName
  }

  return props.message.name || 'AI'
})

const avatarSrc = computed(() => {
  if (props.message.role === 'human') {
    return userStore.avatarUrl
  }

  return resolveAvatarUrl(props.message.avatar)
})

const canPlaySpeech = computed(() => {
  return props.message.role === 'ai' && !isStage.value && ttsStore.moduleEnabled && props.message.content.trim().length > 0
})

function playMessageSpeech() {
  void audioPlayer.enqueueText(props.message.content, {
    source: 'manual',
    generationId: props.message.generation_id
  })
}
</script>

<template>
  <div
    class="message-item"
    :class="[
      message.role === 'human' ? 'human-message' : 'ai-message',
      isStage ? 'stage-message' : ''
    ]"
  >
    <div v-if="message.role === 'ai' && !isStage" class="message-avatar">
      <img
        v-if="avatarSrc"
        :src="avatarSrc"
        :alt="displayName"
        class="w-8 h-8 rounded-full object-cover"
      >
      <div v-else class="fallback-avatar ai-fallback">
        AI
      </div>
    </div>

    <div
      v-if="isStage"
      class="stage-corner-avatar"
      :class="message.role === 'human' ? 'stage-user-avatar' : 'stage-ai-avatar'"
    >
      <img
        v-if="avatarSrc"
        :src="avatarSrc"
        :alt="displayName"
        class="w-full h-full rounded-full object-cover"
      >
      <div v-else class="fallback-avatar" :class="message.role === 'human' ? 'user-fallback' : 'ai-fallback'">
        {{ message.role === 'human' ? displayName.slice(0, 2) : 'AI' }}
      </div>
    </div>

    <div class="message-content">
      <div class="message-header">
        <span class="message-role">{{ displayName }}</span>
        <span v-if="message.interrupted" class="message-status">Interrupted</span>
        <div class="message-tools">
          <button
            v-if="canPlaySpeech"
            class="message-speech-button"
            type="button"
            title="Play speech"
            :disabled="audioPlayer.isBusy.value"
            @click="playMessageSpeech"
          >
            <div :class="audioPlayer.isBusy.value ? 'i-solar:refresh-bold-duotone animate-spin' : 'i-solar:volume-loud-bold-duotone'" />
          </button>
          <span class="message-time">{{ formatTime(message.timestamp) }}</span>
        </div>
      </div>
      <div class="message-text">{{ message.content }}</div>
    </div>

    <div v-if="message.role === 'human' && !isStage" class="message-avatar">
      <img
        v-if="avatarSrc"
        :src="avatarSrc"
        :alt="displayName"
        class="w-8 h-8 rounded-full object-cover"
      >
      <div v-else class="fallback-avatar user-fallback">
        {{ displayName.slice(0, 2) }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-item {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  align-items: flex-start;
}

.message-item.ai-message:not(.stage-message) {
  flex-direction: row;
  justify-content: flex-start;
  margin-right: 30rem;
}

.stage-message.ai-message {
  flex-direction: row;
  justify-content: flex-start;
}

.message-item.human-message:not(.stage-message) {
  flex-direction: row;
  justify-content: flex-end;
}

.stage-message.human-message {
  flex-direction: row-reverse;
  justify-content: flex-start;
}

.message-avatar {
  flex-shrink: 0;
}

.message-item.human-message:not(.stage-message) .message-avatar {
  display: flex;
  width: 2.2rem;
  height: 2.2rem;
  align-items: center;
  justify-content: center;
}

.message-item.human-message:not(.stage-message) .message-avatar img,
.message-item.human-message:not(.stage-message) .message-avatar .fallback-avatar {
  display: flex;
  width: 2.2rem;
  height: 2.2rem;
  border: 2px solid rgb(255 255 255 / 0.9);
  border-radius: 999px;
  object-fit: cover;
  box-shadow:
    0 10px 20px rgb(0 129 179 / 0.12),
    0 0 0 1px rgb(152 236 255 / 0.32);
}

.fallback-avatar {
  display: flex;
  width: 2rem;
  height: 2rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: white;
  font-size: 0.875rem;
}

.ai-fallback {
  background: #0081b3;
}

.user-fallback {
  background: #737373;
}

.message-item.human-message:not(.stage-message) .user-fallback {
  background: linear-gradient(135deg, #7f8ea3, #5f6b7d);
}

.message-content {
  max-width: 70%;
  min-width: 5rem;
  border-radius: 0.75rem;
  padding: 0.75rem;
}

.message-item.ai-message:not(.stage-message) .message-content {
  background: rgb(240 252 255 / 0.8);
  box-shadow: 0 1px 2px rgb(152 236 255 / 0.5);
  color: #0071a0;
  max-width: calc(100% - 3rem);
}

.stage-message.ai-message .message-content {
  background: rgb(240 252 255 / 0.8);
  box-shadow: 0 1px 2px rgb(152 236 255 / 0.5);
  color: #0071a0;
  max-width: calc(100% - 3rem);
}

.message-item.human-message:not(.stage-message) .message-content {
  background: rgb(245 245 245 / 0.8);
  box-shadow: 0 1px 2px rgb(229 229 229 / 0.5);
  color: rgb(38 38 38);
  max-width: calc(100% - 3rem);
  margin-left: 0;
  margin-right: 0;
}

.stage-message.human-message .message-content {
  background: rgb(245 245 245 / 0.8);
  box-shadow: 0 1px 2px rgb(229 229 229 / 0.5);
  color: rgb(38 38 38);
  margin-left: auto;
  margin-right: -5rem;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.message-role {
  display: inline-block;
  font-size: 0.875rem;
  font-weight: 400;
  color: rgb(0 0 0 / 0.6);
}

.message-status {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 2px 7px;
  background: rgb(245 158 11 / 0.14);
  color: #a15c00;
  font-size: 11px;
  line-height: 1.3;
}

.message-time {
  font-size: 0.75rem;
  color: rgb(0 0 0 / 0.42);
}

.message-tools {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  flex: 0 0 auto;
  margin-left: auto;
}

.message-speech-button {
  display: inline-flex;
  width: 1.6rem;
  height: 1.6rem;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(0 129 179 / 0.14);
  border-radius: 0.55rem;
  color: #0071a0;
  background: rgb(255 255 255 / 0.62);
  font-size: 0.9rem;
  transition: background 120ms ease, transform 120ms ease;
}

.message-speech-button:hover:not(:disabled) {
  background: rgb(152 236 255 / 0.28);
  transform: translateY(-1px);
}

.message-speech-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.message-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
}

.stage-message {
  position: relative;
  display: block;
  margin-bottom: 10px;
  padding-top: 1.8rem;
}

.stage-message .stage-corner-avatar {
  position: absolute;
  top: -0.15rem;
  z-index: 3;
  display: flex;
  width: 2.2rem;
  height: 2.2rem;
  align-items: center;
  justify-content: center;
}

.stage-message .stage-corner-avatar {
  top: 0;
}

.stage-message.ai-message {
  align-items: flex-start;
  margin-right: 0rem;
  margin-left: 0.5rem;
}

.stage-message.human-message {
  flex-direction: row-reverse;
  justify-content: flex-start;
  align-items: flex-start;
  margin-right: 5rem;
  margin-left: 0rem;
}

.stage-message.ai-message .stage-corner-avatar {
  left: -0.3rem;
  top: 0.1rem;
}

.stage-message.human-message .stage-corner-avatar {
  right: -5rem;
  top: 0rem;
}

.stage-message .stage-corner-avatar img,
.stage-message .stage-corner-avatar .fallback-avatar {
  display: flex;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 999px;
  border: 2px solid rgb(255 255 255 / 0.9);
  object-fit: cover;
  box-shadow:
    0 10px 20px rgb(0 129 179 / 0.12),
    0 0 0 1px rgb(152 236 255 / 0.32);
}

.stage-message.ai-message .message-content {
  background: rgb(240 252 255 / 0.82);
  box-shadow: 0 1px 2px rgb(152 236 255 / 0.5);
  color: #0071a0;
}

.stage-message.human-message .message-content {
  background: rgb(245 245 245 / 0.8);
  box-shadow: 0 1px 2px rgb(229 229 229 / 0.5);
  color: rgb(38 38 38);
  margin-left: auto;
  margin-right: -5rem;
}

.stage-message .message-role {
  font-size: 0.875rem;
}

.stage-message .message-header {
  margin-bottom: 6px;
}

.stage-message .message-text {
  line-height: 1.7;
}

.stage-message .ai-fallback {
  background: linear-gradient(135deg, #18b5d8, #63d9dc);
}

.stage-message .user-fallback {
  background: linear-gradient(135deg, #7f8ea3, #5f6b7d);
}

.dark .message-item.ai-message:not(.stage-message) .message-content {
  background: rgb(0 51 69 / 0.8);
  box-shadow: none;
  color: #c5fcff;
}

.dark .stage-message.ai-message .message-content {
  background: rgb(0 51 69 / 0.8);
  box-shadow: none;
  color: #c5fcff;
}

.dark .message-item.human-message:not(.stage-message) .message-content {
  background: rgb(38 38 38 / 0.8);
  box-shadow: none;
  color: rgb(245 245 245);
}

.dark .stage-message.human-message .message-content {
  background: rgb(38 38 38 / 0.8);
  box-shadow: none;
  color: rgb(245 245 245);
}

.dark .message-role {
  color: rgb(255 255 255 / 0.65);
}

.dark .message-time {
  color: rgb(255 255 255 / 0.42);
}

.dark .message-speech-button {
  border-color: rgb(152 236 255 / 0.18);
  color: #c5fcff;
  background: rgb(0 71 102 / 0.44);
}

.dark .message-item.human-message:not(.stage-message) .message-avatar img,
.dark .message-item.human-message:not(.stage-message) .message-avatar .fallback-avatar {
  border-color: rgb(0 51 69 / 0.92);
  box-shadow:
    0 10px 20px rgb(0 0 0 / 0.22),
    0 0 0 1px rgb(41 189 226 / 0.22);
}

.dark .stage-message .stage-corner-avatar img,
.dark .stage-message .stage-corner-avatar .fallback-avatar {
  border-color: rgb(0 51 69 / 0.92);
  box-shadow:
    0 10px 20px rgb(0 0 0 / 0.22),
    0 0 0 1px rgb(41 189 226 / 0.22);
}

@media (max-width: 768px) {
  .message-avatar,
  .stage-message .stage-corner-avatar {
    display: none;
  }

  .message-item {
    gap: 0;
  }

  .message-item.ai-message:not(.stage-message) {
    margin-right: 0;
  }

  .message-item.ai-message:not(.stage-message) .message-content,
  .message-item.human-message:not(.stage-message) .message-content {
    max-width: 88%;
  }

  .stage-message {
    margin-bottom: 0.75rem;
    padding-top: 0;
  }

  .stage-message.ai-message {
    margin-left: 0;
  }

  .stage-message.human-message {
    margin-right: 0;
    margin-left: 0;
  }

  .stage-message.human-message .message-content {
    margin-right: 0;
  }

  .stage-message.ai-message .message-content,
  .stage-message.human-message .message-content {
    max-width: 92%;
  }
}
</style>
