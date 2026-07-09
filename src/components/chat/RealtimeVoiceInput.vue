<script setup lang="ts">
import { computed, watch } from 'vue'

import { useRealtimeVoiceInput } from '@/composables/useRealtimeVoiceInput'
import { useASRStore } from '@/stores/asr'
import { useChatStore } from '@/stores/chat'
import { useWebSocketStore } from '@/stores/websocket'

const asrStore = useASRStore()
const chatStore = useChatStore()
const wsStore = useWebSocketStore()
const realtimeVoiceInput = useRealtimeVoiceInput()

const activeChatId = computed(() => {
  const chatId = chatStore.currentChatId
  if (!chatId || chatId.startsWith('draft_')) {
    return ''
  }

  return chatId
})

const activeCharacterId = computed(() => chatStore.currentCharacterId || '')

const disabledReason = computed(() => {
  if (!asrStore.moduleEnabled) {
    return 'ASR module is disabled'
  }
  if (!activeCharacterId.value) {
    return 'Select a character first'
  }
  if (!activeChatId.value) {
    return 'Open a saved chat first'
  }
  return ''
})

const connectionHint = computed(() => !wsStore.connected ? 'WebSocket disconnected' : '')

const isDisabled = computed(() => realtimeVoiceInput.isStarting.value || (!realtimeVoiceInput.isListening.value && !!disabledReason.value))

const buttonTitle = computed(() => {
  if (realtimeVoiceInput.error.value) {
    return realtimeVoiceInput.error.value
  }
  if (realtimeVoiceInput.isStarting.value) {
    return 'Starting realtime voice'
  }
  if (realtimeVoiceInput.isListening.value) {
    return realtimeVoiceInput.isSpeaking.value
      ? 'Speech detected'
      : 'Realtime voice listening'
  }
  return disabledReason.value || connectionHint.value || 'Start realtime voice'
})

const buttonClass = computed(() => {
  if (realtimeVoiceInput.isSpeaking.value) {
    return 'bg-primary-500 text-white hover:bg-primary-600 shadow-primary-500/25'
  }
  if (realtimeVoiceInput.isListening.value) {
    return 'bg-primary-400 text-white hover:bg-primary-500 shadow-primary-400/20'
  }
  if (isDisabled.value) {
    return 'cursor-not-allowed text-neutral-300 dark:text-neutral-600'
  }
  return 'text-neutral-500 hover:bg-neutral-100/70 dark:text-neutral-400 dark:hover:bg-neutral-800/60'
})

const pulseClass = computed(() => realtimeVoiceInput.isSpeaking.value
  ? 'bg-primary-500/30'
  : 'bg-primary-400/20'
)

const statusDotClass = computed(() => {
  if (realtimeVoiceInput.isSpeaking.value) {
    return 'bg-white'
  }
  if (realtimeVoiceInput.isListening.value) {
    return 'bg-cyan-100'
  }
  if (isDisabled.value) {
    return 'bg-neutral-300 dark:bg-neutral-600'
  }
  return 'bg-primary-400'
})

async function toggleRealtimeVoiceInput() {
  if (realtimeVoiceInput.isListening.value) {
    await realtimeVoiceInput.stop()
    return
  }

  if (isDisabled.value) {
    return
  }

  await realtimeVoiceInput.start({
    chatId: activeChatId.value,
    characterId: activeCharacterId.value
  })
}

watch(
  () => [activeChatId.value, activeCharacterId.value, asrStore.moduleEnabled] as const,
  ([chatId, characterId, moduleEnabled], [previousChatId, previousCharacterId]) => {
    const contextChanged = chatId !== previousChatId || characterId !== previousCharacterId
    if (
      (realtimeVoiceInput.isListening.value || realtimeVoiceInput.isStarting.value)
      && (contextChanged || !chatId || !characterId || !moduleEnabled)
    ) {
      void realtimeVoiceInput.stop({
        errorMessage: 'Realtime voice input stopped because chat context changed'
      })
    }
  }
)
</script>

<template>
  <div class="relative flex flex-col items-center">
    <button
      type="button"
      class="relative h-8 w-8 flex shrink-0 items-center justify-center rounded-md border border-transparent text-lg outline-none transition-all duration-200 active:scale-95"
      :class="buttonClass"
      :title="buttonTitle"
      :aria-label="buttonTitle"
      :aria-pressed="realtimeVoiceInput.isListening.value"
      :disabled="isDisabled"
      @click="toggleRealtimeVoiceInput"
    >
      <span
        v-if="realtimeVoiceInput.isListening.value"
        class="absolute inset-0 rounded-md animate-ping"
        :class="pulseClass"
      />
      <div
        v-if="realtimeVoiceInput.isStarting.value"
        class="i-solar:refresh-bold-duotone h-5 w-5 animate-spin"
      />
      <div
        v-else-if="realtimeVoiceInput.isListening.value"
        class="i-solar:stop-circle-bold-duotone h-5 w-5"
      />
      <div
        v-else
        class="i-solar:microphone-bold-duotone h-5 w-5"
      />
      <span
        class="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
        :class="statusDotClass"
      />
    </button>

    <div
      v-if="realtimeVoiceInput.error.value"
      class="absolute bottom-10 left-1/2 w-64 rounded-lg border border-red-200/70 bg-red-50/95 p-2 text-xs text-red-700 shadow-lg backdrop-blur-md -translate-x-1/2 dark:border-red-800/60 dark:bg-red-900/80 dark:text-red-200"
    >
      {{ realtimeVoiceInput.error.value }}
    </div>
  </div>
</template>
