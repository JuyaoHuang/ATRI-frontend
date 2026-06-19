import { computed } from 'vue'
import { useAudioPlayer } from '@/composables/useAudioPlayer'
import { useWebSocketStore } from '@/stores/websocket'
import { useChatStore } from '@/stores/chat'
import { useCharactersStore } from '@/stores/characters'
import { useLive2dStore } from '@/stores/live2d'
import { useTTSStore } from '@/stores/tts'
import { extractLive2dExpression } from '@/utils/live2dExpression'
import { WebSocketManager } from '@/utils/websocket'

interface AsrTranscriptData {
  text?: string
  chat_id?: string
  character_id?: string
  generation_id?: string
  is_final?: boolean
}

interface ChatChunkData {
  chunk?: string
  character_id?: string
  chat_id?: string
  generation_id?: string
}

interface ChatCompleteData {
  full_reply?: string
  character_id?: string
  chat_id?: string
  generation_id?: string
}

interface ChatInterruptedData {
  partial_reply?: string
  character_id?: string
  chat_id?: string
  generation_id?: string
  reason?: string
}

interface ChatErrorData {
  message?: string
  chat_id?: string
  generation_id?: string
}

interface InterruptData {
  chat_id?: string
  character_id?: string
  generation_id?: string
  reason?: string
}

export function useWebSocket() {
  const wsStore = useWebSocketStore()
  const chatStore = useChatStore()
  const charactersStore = useCharactersStore()
  const live2dStore = useLive2dStore()
  const ttsStore = useTTSStore()
  const audioPlayer = useAudioPlayer()

  const enqueueAutoSpeech = async (text: string, generationId?: string) => {
    await ttsStore.ensureLoaded()
    if (!generationId || !ttsStore.moduleEnabled || !ttsStore.autoPlayEnabled || !text.trim()) {
      return
    }
    await audioPlayer.enqueueText(text, { source: 'auto', generationId })
  }

  const resolveCharacterPresentation = (characterId?: string) => {
    if (!characterId) {
      return {}
    }

    const character = charactersStore.characters.find(item => item.id === characterId)
    return {
      characterName: character?.name,
      characterAvatar: character?.avatarUrl || character?.avatar
    }
  }

  const connect = () => {
    const wsUrl = normalizeWebSocketUrl(import.meta.env.VITE_WS_URL || 'ws://localhost:8430/ws')
    const existingManager = wsStore.wsManager

    void ttsStore.ensureLoaded()

    if (
      existingManager
      && existingManager.getUrl() === wsUrl
      && (existingManager.isOpenOrConnecting() || existingManager.isReconnectEnabled())
    ) {
      return
    }

    existingManager?.destroy()

    const wsManager = new WebSocketManager(wsUrl)
    const isCurrentManager = () => wsStore.wsManager === wsManager
    wsStore.wsManager = wsManager
    wsStore.reconnecting = false

    wsManager.on('connected', () => {
      if (!isCurrentManager()) {
        return
      }
      wsStore.connected = true
      wsStore.reconnecting = false
      wsStore.error = null
    })

    wsManager.on('disconnected', () => {
      if (!isCurrentManager()) {
        return
      }
      wsStore.connected = false
      wsStore.reconnecting = wsManager.isReconnectEnabled()
      chatStore.clearActiveStream()
    })

    wsManager.on('error', (error: unknown) => {
      if (!isCurrentManager()) {
        return
      }
      wsStore.error = String(error)
    })

    wsManager.on('chat:chunk', (data: unknown) => {
      if (!isCurrentManager()) {
        return
      }

      const chunkData = data as ChatChunkData
      chatStore.appendStreamingChunk({
        chatId: chunkData.chat_id,
        characterId: chunkData.character_id,
        generationId: chunkData.generation_id,
        chunk: chunkData.chunk || ''
      })
    })

    wsManager.on('chat:complete', (data: unknown) => {
      if (!isCurrentManager()) {
        return
      }

      const completeData = data as ChatCompleteData
      const parsed = extractLive2dExpression(completeData.full_reply || '')
      const { characterName, characterAvatar } = resolveCharacterPresentation(completeData.character_id)

      const result = chatStore.completeStreaming({
        chatId: completeData.chat_id,
        characterId: completeData.character_id,
        fullReply: parsed.content || '',
        name: characterName,
        avatar: characterAvatar,
        generationId: completeData.generation_id
      })

      if (result !== 'ignored' && completeData.chat_id) {
        chatStore.consumePendingDeferredTitle(completeData.chat_id)
      }
      if (result !== 'visible') {
        return
      }

      if (parsed.expression) {
        live2dStore.requestExpression(parsed.expression)
      }
      void enqueueAutoSpeech(parsed.content || '', completeData.generation_id)
    })

    wsManager.on('chat:interrupted', (data: unknown) => {
      if (!isCurrentManager()) {
        return
      }

      const interruptedData = data as ChatInterruptedData
      if (interruptedData.generation_id) {
        audioPlayer.vadInterruptGeneration(interruptedData.generation_id)
      }

      const parsed = extractLive2dExpression(interruptedData.partial_reply || '')
      const { characterName, characterAvatar } = resolveCharacterPresentation(interruptedData.character_id)
      const result = chatStore.interruptStreaming({
        chatId: interruptedData.chat_id,
        characterId: interruptedData.character_id,
        partialReply: parsed.content || '',
        generationId: interruptedData.generation_id,
        interruptReason: interruptedData.reason,
        name: characterName,
        avatar: characterAvatar
      })

      if (result === 'visible' && parsed.expression) {
        live2dStore.requestExpression(parsed.expression)
      }
    })

    wsManager.on('chat:error', (data: unknown) => {
      if (!isCurrentManager()) {
        return
      }

      const errorData = data as ChatErrorData
      wsStore.error = errorData.message || '对话错误'
      chatStore.failActiveStream({
        chatId: errorData.chat_id,
        generationId: errorData.generation_id
      })
    })

    wsManager.on('asr:transcript', (data: unknown) => {
      if (!isCurrentManager()) {
        return
      }

      const transcriptData = data as AsrTranscriptData
      if (
        !transcriptData.is_final
        || !transcriptData.text
        || !transcriptData.chat_id
        || !transcriptData.character_id
      ) {
        return
      }

      chatStore.addAsrTranscriptMessage({
        chatId: transcriptData.chat_id,
        characterId: transcriptData.character_id,
        text: transcriptData.text,
        generationId: transcriptData.generation_id
      })
    })

    wsManager.on('vad:interrupt', (data: unknown) => {
      if (!isCurrentManager()) {
        return
      }

      const interruptData = data as InterruptData | undefined
      audioPlayer.vadInterruptPlayback(interruptData?.generation_id)
      chatStore.markActiveStreamInterrupted({
        chatId: interruptData?.chat_id,
        characterId: interruptData?.character_id,
        generationId: interruptData?.generation_id
      })
    })

    wsManager.connect()
  }

  const disconnect = () => {
    const manager = wsStore.wsManager
    manager?.destroy()
    if (wsStore.wsManager === manager) {
      wsStore.wsManager = null
    }
    wsStore.connected = false
    wsStore.reconnecting = false
    chatStore.clearActiveStream()
  }

  return {
    connected: computed(() => wsStore.connected),
    reconnecting: computed(() => wsStore.reconnecting),
    error: computed(() => wsStore.error),
    connect,
    disconnect
  }
}

function normalizeWebSocketUrl(url: string) {
  const parsed = new URL(url, window.location.href)
  if (parsed.protocol === 'http:') {
    parsed.protocol = 'ws:'
  } else if (parsed.protocol === 'https:') {
    parsed.protocol = 'wss:'
  }
  return parsed.toString()
}
