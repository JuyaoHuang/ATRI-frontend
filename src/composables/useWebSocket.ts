import { computed } from 'vue'

import { useAudioPlayer } from '@/composables/useAudioPlayer'
import { useCharactersStore } from '@/stores/characters'
import { useChatStore } from '@/stores/chat'
import { useTTSStore } from '@/stores/tts'
import { useWebSocketStore } from '@/stores/websocket'
import {
  ConnectionStatus,
  type AudioCompleteData,
  type AudioErrorData,
  type AudioSegmentData,
  type ChatCompleteData,
  type ChatErrorData,
  type ChatGenerationErrorData,
  type ChatInterruptedData,
  type ChatChunkData,
  type InterruptData,
  type AsrTranscriptData,
  type ConnectionStatusEvent,
  type SendAudioChunkPayload,
  type SendAudioEndPayload,
  type SendTextPayload,
  type SendVisionCaptureResultPayload,
  type SendVisionStatePayload,
  type WebSocketSessionEventMap
} from '@/types/websocket'
import { extractLive2dExpression } from '@/utils/live2dExpression'
import { websocketSessionController } from '@/utils/websocketSessionController'
import { useLive2dStore } from '@/stores/live2d'

let defaultHandlersRegistered = false

export function useWebSocket() {
  const wsStore = useWebSocketStore()
  const chatStore = useChatStore()
  const charactersStore = useCharactersStore()
  const live2dStore = useLive2dStore()
  const ttsStore = useTTSStore()
  const audioPlayer = useAudioPlayer()

  ensureDefaultHandlers({
    wsStore,
    chatStore,
    charactersStore,
    live2dStore,
    ttsStore,
    audioPlayer
  })

  const connect = () => {
    void ttsStore.ensureLoaded()
    websocketSessionController.connect(
      normalizeWebSocketUrl(import.meta.env.VITE_WS_URL || 'ws://localhost:8430/ws')
    )
  }

  const disconnect = () => {
    websocketSessionController.disconnect()
  }

  const canSend = () => websocketSessionController.canSend()

  const sendText = (payload: SendTextPayload) => websocketSessionController.sendText(payload)

  const sendAudioChunk = (payload: SendAudioChunkPayload) =>
    websocketSessionController.sendAudioChunk(payload)

  const sendAudioEnd = (payload: SendAudioEndPayload) =>
    websocketSessionController.sendAudioEnd(payload)

  const sendVisionState = (payload: SendVisionStatePayload) =>
    websocketSessionController.sendVisionState(payload)

  const sendVisionCaptureResult = (payload: SendVisionCaptureResultPayload) =>
    websocketSessionController.sendVisionCaptureResult(payload)

  const on = <K extends keyof WebSocketSessionEventMap>(
    event: K,
    listener: (payload: WebSocketSessionEventMap[K]) => void
  ) => {
    websocketSessionController.on(event, listener)
  }

  const off = <K extends keyof WebSocketSessionEventMap>(
    event: K,
    listener: (payload: WebSocketSessionEventMap[K]) => void
  ) => {
    websocketSessionController.off(event, listener)
  }

  return {
    connectionStatus: computed(() => wsStore.connectionStatus),
    connected: computed(() => wsStore.connected),
    reconnecting: computed(() => wsStore.reconnecting),
    error: computed(() => wsStore.error),
    canSend,
    connect,
    disconnect,
    sendText,
    sendAudioChunk,
    sendAudioEnd,
    sendVisionState,
    sendVisionCaptureResult,
    on,
    off
  }
}

function ensureDefaultHandlers(deps: {
  wsStore: ReturnType<typeof useWebSocketStore>
  chatStore: ReturnType<typeof useChatStore>
  charactersStore: ReturnType<typeof useCharactersStore>
  live2dStore: ReturnType<typeof useLive2dStore>
  ttsStore: ReturnType<typeof useTTSStore>
  audioPlayer: ReturnType<typeof useAudioPlayer>
}) {
  if (defaultHandlersRegistered) {
    return
  }

  defaultHandlersRegistered = true

  const {
    wsStore,
    chatStore,
    charactersStore,
    live2dStore,
    ttsStore,
    audioPlayer
  } = deps

  const enqueueAutoSpeech = async (text: string, generationId?: string) => {
    await ttsStore.ensureLoaded()
    if (!generationId || !ttsStore.moduleEnabled || !ttsStore.autoPlayEnabled || !text.trim()) {
      return
    }
    if (ttsStore.streamingAutoPlayEnabled) {
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

  websocketSessionController.on('connection:status', (payload: ConnectionStatusEvent) => {
    wsStore.setConnectionStatus(payload.status)
    wsStore.setError(payload.error)
    if (
      payload.status === ConnectionStatus.RECONNECTING
      || payload.status === ConnectionStatus.CLOSED
    ) {
      chatStore.clearActiveStream()
    }
  })

  websocketSessionController.on('chat:chunk', (chunkData: ChatChunkData) => {
    chatStore.appendStreamingChunk({
      chatId: chunkData.chat_id,
      characterId: chunkData.character_id,
      generationId: chunkData.generation_id,
      chunk: chunkData.chunk || ''
    })
  })

  websocketSessionController.on('chat:complete', (completeData: ChatCompleteData) => {
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

    if (completeData.generation_id) {
      if (result === 'visible') {
        audioPlayer.trackAudioGeneration(completeData.generation_id)
      } else {
        audioPlayer.discardGenerationAudio(completeData.generation_id)
      }
    }

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

  websocketSessionController.on('chat:interrupted', (interruptedData: ChatInterruptedData) => {
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

  websocketSessionController.on('chat:error', (errorData: ChatErrorData) => {
    wsStore.setError(errorData.message || '对话错误')
  })

  websocketSessionController.on('chat:generation-error', (errorData: ChatGenerationErrorData) => {
    if (
      !errorData.chat_id
      || !errorData.character_id
      || !errorData.generation_id
      || !errorData.message
    ) {
      return
    }

    const result = chatStore.failActiveGeneration({
      chatId: errorData.chat_id,
      characterId: errorData.character_id,
      generationId: errorData.generation_id,
      failure: { message: errorData.message }
    })
    if (result !== 'ignored') {
      audioPlayer.discardGenerationAudio(errorData.generation_id)
    }
  })

  websocketSessionController.on('audio:segment', (segmentData: AudioSegmentData) => {
    const generationId = segmentData.generation_id
    const segmentId = segmentData.segment_id
    const sequence = Number(segmentData.sequence)
    if (
      !generationId
      || !segmentId
      || !Number.isInteger(sequence)
      || sequence < 0
      || typeof segmentData.audio !== 'string'
    ) {
      return
    }

    if (
      segmentData.chat_id !== chatStore.currentChatId
      || segmentData.character_id !== chatStore.currentCharacterId
    ) {
      audioPlayer.discardGenerationAudio(generationId)
      return
    }

    try {
      const mediaType = segmentData.media_type || 'application/octet-stream'
      const audio = base64ToBlob(segmentData.audio, mediaType)
      void audioPlayer.enqueueAudioSegment({
        generationId,
        segmentId,
        sequence,
        text: segmentData.display_text || segmentData.tts_text || '',
        audio,
        mediaType
      })
    } catch (error) {
      console.error('Failed to decode TTS audio segment:', error)
    }
  })

  websocketSessionController.on('audio:error', (errorData: AudioErrorData) => {
    const generationId = errorData.generation_id
    const sequence = Number(errorData.sequence)
    if (generationId && Number.isInteger(sequence) && sequence >= 0) {
      audioPlayer.skipAudioSegment(generationId, sequence)
    }
    console.warn('TTS audio segment failed:', errorData.code || errorData.message || 'unknown')
  })

  websocketSessionController.on('audio:complete', (completeData: AudioCompleteData) => {
    if (completeData.generation_id) {
      audioPlayer.completeAudioGeneration(completeData.generation_id)
    }
  })

  websocketSessionController.on('asr:transcript', (transcriptData: AsrTranscriptData) => {
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

  websocketSessionController.on('vad:interrupt', (interruptData: InterruptData | undefined) => {
    audioPlayer.vadInterruptPlayback(interruptData?.generation_id)
    chatStore.markActiveStreamInterrupted({
      chatId: interruptData?.chat_id,
      characterId: interruptData?.character_id,
      generationId: interruptData?.generation_id
    })
  })
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

function base64ToBlob(base64: string, mediaType: string) {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mediaType })
}
