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

export function useWebSocket() {
  const wsStore = useWebSocketStore()
  const chatStore = useChatStore()
  const charactersStore = useCharactersStore()
  const live2dStore = useLive2dStore()
  const ttsStore = useTTSStore()
  const audioPlayer = useAudioPlayer()

  const enqueueAutoSpeech = async (text: string) => {
    await ttsStore.ensureLoaded()
    if (!ttsStore.moduleEnabled || !ttsStore.autoPlayEnabled || !text.trim()) {
      return
    }
    await audioPlayer.enqueueText(text, { source: 'auto' })
  }

  const connect = () => {
    const wsUrl = normalizeWebSocketUrl(import.meta.env.VITE_WS_URL || 'ws://localhost:8430/ws')
    const wsManager = new WebSocketManager(wsUrl)
    void ttsStore.ensureLoaded()

    // 监听连接状态
    wsManager.on('connected', () => {
      wsStore.connected = true
      wsStore.reconnecting = false
      wsStore.error = null
    })

    wsManager.on('disconnected', () => {
      wsStore.connected = false
      wsStore.reconnecting = true
    })

    wsManager.on('error', (error: unknown) => {
      wsStore.error = String(error)
    })

    // 监听消息
    wsManager.on('chat:chunk', (data: unknown) => {
      const chunkData = data as { chunk?: string }
      chatStore.appendStreamingChunk(chunkData.chunk || '')
    })

    wsManager.on('chat:complete', (data: unknown) => {
      const completeData = data as { full_reply?: string; character_id?: string; chat_id?: string }
      const parsed = extractLive2dExpression(completeData.full_reply || '')

      // 获取角色信息
      let characterName: string | undefined
      let characterAvatar: string | undefined
      if (completeData.character_id) {
        const character = charactersStore.characters.find((c) => c.id === completeData.character_id)
        if (character) {
          characterName = character.name
          characterAvatar = character.avatarUrl || character.avatar
        }
      }

      if (parsed.expression) {
        live2dStore.requestExpression(parsed.expression)
      }

      chatStore.completeStreaming(parsed.content || '', characterName, characterAvatar)
      void enqueueAutoSpeech(parsed.content || '')

      if (completeData.chat_id) {
        chatStore.consumePendingDeferredTitle(completeData.chat_id)
      }
    })

    wsManager.on('chat:error', (data: unknown) => {
      const errorData = data as { message?: string }
      wsStore.error = errorData.message || '对话错误'
      chatStore.isStreaming = false
    })

    wsManager.on('asr:transcript', (data: unknown) => {
      const transcriptData = data as AsrTranscriptData
      if (!transcriptData.is_final || !transcriptData.text || !transcriptData.chat_id) {
        return
      }

      chatStore.addAsrTranscriptMessage({
        chatId: transcriptData.chat_id,
        characterId: transcriptData.character_id,
        text: transcriptData.text,
        generationId: transcriptData.generation_id
      })
    })

    wsManager.on('vad:interrupt', () => {
      audioPlayer.stop()
    })

    wsManager.connect()
    wsStore.wsManager = wsManager
  }

  const disconnect = () => {
    wsStore.wsManager?.disconnect()
    wsStore.wsManager = null
    wsStore.connected = false
    wsStore.reconnecting = false
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
