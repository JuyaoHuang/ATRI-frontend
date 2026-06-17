<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { useChat } from '@/composables/useChat'
import { useASRStore } from '@/stores/asr'

import RealtimeVoiceInput from './RealtimeVoiceInput.vue'
import VoiceInput from './VoiceInput.vue'

interface Props {
  variant?: 'default' | 'stage'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default'
})

const { sendMessage, isStreaming } = useChat()
const asrStore = useASRStore()
const inputText = ref('')
const autoSendPending = ref(false)
const isComposing = ref(false)
const DOUBLE_ENTER_INTERVAL_MS = 300
const TRAILING_NEWLINES_REGEX = /[\r\n]+$/
const SEND_MODES = ['enter', 'ctrl-enter', 'double-enter'] as const
type SendMode = (typeof SEND_MODES)[number]
const sendMode = useLocalStorage<SendMode>('ui/chat/settings/send-mode', 'enter')
const lastEnterTime = ref(0)

let autoSendTimer: ReturnType<typeof setTimeout> | undefined

const hasText = computed(() => inputText.value.trim().length > 0)
const autoSendDelay = computed(() => Math.max(0, asrStore.autoSendDelay))
const sendModeLabels: Record<SendMode, string> = {
  'enter': 'Enter',
  'ctrl-enter': 'Ctrl + Enter',
  'double-enter': 'Double Enter',
}
const autoSendLabel = computed(() => {
  if (!autoSendPending.value) {
    return ''
  }
  return autoSendDelay.value === 0
    ? 'Auto-send ready'
    : `Auto-send in ${(autoSendDelay.value / 1000).toFixed(1)}s`
})

function clearAutoSendTimer() {
  if (autoSendTimer) {
    clearTimeout(autoSendTimer)
    autoSendTimer = undefined
  }
  autoSendPending.value = false
}

function scheduleAutoSend() {
  clearAutoSendTimer()
  if (!asrStore.moduleEnabled || !asrStore.autoSendEnabled || !hasText.value || isStreaming.value) {
    return
  }

  autoSendPending.value = true
  autoSendTimer = setTimeout(() => {
    autoSendTimer = undefined
    autoSendPending.value = false
    void handleSend()
  }, autoSendDelay.value)
}

const handleSend = async () => {
  clearAutoSendTimer()
  if (!hasText.value || isStreaming.value) {
    return
  }

  const sent = await sendMessage(inputText.value.trim())
  if (sent) {
    inputText.value = ''
  }
}

function handleTranscript(text: string) {
  const transcript = text.trim()
  if (!transcript) {
    return
  }

  const existing = inputText.value.trimEnd()
  inputText.value = existing ? `${existing} ${transcript}` : transcript
  scheduleAutoSend()
}

function handleManualInput() {
  clearAutoSendTimer()
}

function sendFromKeyboard() {
  inputText.value = inputText.value.replace(TRAILING_NEWLINES_REGEX, '')
  void handleSend()
}

function handleKeydown(event: KeyboardEvent) {
  if (isComposing.value || event.key !== 'Enter') {
    return
  }

  const hasControl = event.ctrlKey || event.metaKey
  const hasShift = event.shiftKey

  switch (sendMode.value) {
    case 'enter':
      if (!hasShift && !hasControl) {
        event.preventDefault()
        sendFromKeyboard()
      }
      return
    case 'ctrl-enter':
      if (hasControl) {
        event.preventDefault()
        sendFromKeyboard()
      }
      return
    case 'double-enter':
      if (!hasShift && !hasControl) {
        const now = Date.now()
        if (now - lastEnterTime.value < DOUBLE_ENTER_INTERVAL_MS) {
          event.preventDefault()
          sendFromKeyboard()
          lastEnterTime.value = 0
        }
        else {
          lastEnterTime.value = now
        }
      }
  }
}

watch(
  () => [asrStore.moduleEnabled, asrStore.autoSendEnabled, asrStore.autoSendDelay, isStreaming.value] as const,
  () => {
    if (!asrStore.moduleEnabled) {
      clearAutoSendTimer()
    } else if (autoSendPending.value) {
      scheduleAutoSend()
    }
  }
)

watch(sendMode, () => {
  lastEnterTime.value = 0
})

onMounted(() => {
  if (!asrStore.providers.length) {
    void asrStore.load()
  }
})

onUnmounted(() => {
  clearAutoSendTimer()
})
</script>

<template>
  <div
    class="input-box min-h-32 p-4 flex flex-col gap-2"
    :class="{ 'stage-input-box': props.variant === 'stage' }"
  >
    <div
      v-if="autoSendPending"
      class="auto-send-strip flex items-center justify-between rounded-lg px-3 py-1.5 text-xs"
    >
      <span>{{ autoSendLabel }}</span>
      <button type="button" class="auto-send-cancel" @click="clearAutoSendTimer">
        Cancel
      </button>
    </div>

    <div class="input-box-body flex min-h-0 flex-1 gap-3">
      <div class="chat-input-wrap relative min-h-0 flex-1">
        <textarea
          v-model="inputText"
          class="chat-input h-full min-h-0 w-full resize-none rounded-t-xl p-4 pb-[60px] focus:outline-none"
          :class="{ 'stage-chat-input': props.variant === 'stage' }"
          placeholder="Say something..."
          :disabled="isStreaming"
          @input="handleManualInput"
          @keydown="handleKeydown"
          @compositionstart="isComposing = true"
          @compositionend="isComposing = false"
        />

        <div class="chat-input-tools absolute bottom-2 left-2 z-10 flex items-center gap-2">
          <DropdownMenuRoot>
            <DropdownMenuTrigger as-child>
              <button
                type="button"
                :class="[
                  'h-8 w-8 flex items-center justify-center rounded-md outline-none transition-all duration-200 active:scale-95',
                  'text-lg text-neutral-500 hover:bg-neutral-100/70 dark:text-neutral-400 dark:hover:bg-neutral-800/60',
                ]"
                title="Send shortcut"
                aria-label="Send shortcut"
              >
                <div class="i-solar:keyboard-bold-duotone h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent
                side="top"
                align="start"
                :side-offset="8"
                :class="[
                  'z-50 min-w-[180px] rounded-xl border border-neutral-200/60 bg-neutral-50/90 p-1',
                  'shadow-lg backdrop-blur-md dark:border-neutral-800/30 dark:bg-neutral-900/80',
                  'flex flex-col gap-1',
                ]"
              >
                <DropdownMenuItem
                  v-for="mode in SEND_MODES"
                  :key="mode"
                  :class="[
                    'w-full flex cursor-pointer items-center rounded-lg px-3 py-2 text-xs outline-none transition-colors',
                    'hover:bg-primary-100/60 dark:hover:bg-primary-900/40',
                    sendMode === mode ? 'bg-primary-100/60 text-primary-600 font-medium dark:bg-primary-900/40 dark:text-primary-300' : 'text-neutral-600 dark:text-neutral-300',
                  ]"
                  @select="sendMode = mode"
                >
                  <div class="mr-2 h-4 w-4 flex items-center justify-center">
                    <div v-if="sendMode === mode" class="i-solar:check-circle-bold-duotone h-4 w-4" />
                  </div>
                  <span>{{ sendModeLabels[mode] }}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>

          <VoiceInput v-if="asrStore.moduleEnabled" compact @transcript="handleTranscript" />
          <RealtimeVoiceInput />
        </div>
      </div>
      <div class="input-actions flex shrink-0 flex-col items-center justify-end gap-2">
        <button
          class="send-button px-5 py-2 rounded-xl transition-colors font-medium"
          :class="{ 'stage-send-button': props.variant === 'stage' }"
          :disabled="!hasText || isStreaming"
          @click="() => void handleSend()"
        >
          {{ isStreaming ? 'Sending...' : 'Send' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-box {
  background: rgb(152 236 255 / 0.2);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.stage-input-box {
  min-height: 10rem;
  padding: 0.85rem 1rem 1rem;
  background: linear-gradient(180deg, rgb(152 236 255 / 0.12), rgb(152 236 255 / 0.24));
}

.chat-input {
  border: 0;
  background: transparent;
  color: #0081b3;
  font-weight: 500;
  line-height: 1.6;
}

.chat-input::placeholder {
  color: #0098c4;
}

.stage-chat-input {
  padding: 1rem 0.85rem;
  border-radius: 1rem;
}

.input-actions {
  width: 6.25rem;
}

.send-button {
  align-self: stretch;
  background: rgb(240 252 255 / 0.88);
  border: 1px solid rgb(152 236 255 / 0.55);
  color: #0081b3;
}

.stage-send-button {
  border-radius: 999px;
  padding-inline: 1.2rem;
}

.send-button:hover {
  background: rgb(197 252 255 / 0.94);
}

.send-button:disabled {
  background: rgb(245 245 245 / 0.78);
  border-color: rgb(229 229 229 / 0.7);
  color: rgb(115 115 115);
  cursor: not-allowed;
}

.auto-send-strip {
  background: rgb(240 252 255 / 0.84);
  border: 1px solid rgb(152 236 255 / 0.45);
  color: #0081b3;
}

.auto-send-cancel {
  color: #00769f;
  font-weight: 600;
}

.auto-send-cancel:hover {
  color: #004f73;
}

.dark .input-box {
  background: rgb(41 189 226 / 0.2);
}

.dark .stage-input-box {
  background: linear-gradient(180deg, rgb(41 189 226 / 0.1), rgb(41 189 226 / 0.18));
}

.dark .chat-input {
  color: #c5fcff;
}

.dark .chat-input::placeholder {
  color: #98ecff;
}

.dark .send-button {
  background: rgb(0 51 69 / 0.82);
  border-color: rgb(41 189 226 / 0.35);
  color: #c5fcff;
}

.dark .send-button:hover {
  background: rgb(0 71 102 / 0.9);
}

.dark .send-button:disabled {
  background: rgb(38 38 38 / 0.7);
  border-color: rgb(63 63 70 / 0.7);
  color: rgb(161 161 170);
}

.dark .auto-send-strip {
  background: rgb(0 51 69 / 0.78);
  border-color: rgb(41 189 226 / 0.3);
  color: #c5fcff;
}

.dark .auto-send-cancel {
  color: #98ecff;
}

.dark .auto-send-cancel:hover {
  color: #c5fcff;
}
</style>
