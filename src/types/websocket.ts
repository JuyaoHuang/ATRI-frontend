import type { InputImage, VisionCaptureStatus, VisionSource } from '@/types/vision'

export const ConnectionStatus = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  CLOSED: 'closed'
} as const

export type ConnectionStatus = typeof ConnectionStatus[keyof typeof ConnectionStatus]

export interface SendTextPayload {
  text: string
  chatId: string
  characterId: string
  clientContext?: unknown
  image?: InputImage
}

export interface SendAudioChunkPayload {
  chatId: string
  characterId: string
  audio: number[]
  seq: number
}

export interface SendAudioEndPayload {
  chatId: string
  characterId: string
}

export interface AsrTranscriptData {
  text?: string
  chat_id?: string
  character_id?: string
  generation_id?: string
  is_final?: boolean
  seq?: number
}

export interface ChatChunkData {
  chunk?: string
  character_id?: string
  chat_id?: string
  generation_id?: string
}

export interface ChatCompleteData {
  full_reply?: string
  character_id?: string
  chat_id?: string
  generation_id?: string
}

export interface ChatInterruptedData {
  partial_reply?: string
  character_id?: string
  chat_id?: string
  generation_id?: string
  interrupted?: boolean
  reason?: string
}

export interface ChatErrorData {
  message?: string
  chat_id?: string
  character_id?: string
  generation_id?: string
}

export interface ChatGenerationErrorData {
  message?: string
  chat_id?: string
  character_id?: string
  generation_id?: string
}

export interface VisionCaptureRequestData {
  generation_id?: string
  chat_id?: string
  character_id?: string
  source?: VisionSource
}

export interface SendVisionStatePayload {
  enabled: boolean
  source: VisionSource
}

export interface SendVisionCaptureResultPayload {
  generationId: string
  status: VisionCaptureStatus
  image?: InputImage
}

export interface AudioSegmentData {
  chat_id?: string
  character_id?: string
  generation_id?: string
  segment_id?: string
  sequence?: number
  audio?: string
  media_type?: string
  display_text?: string
  tts_text?: string
}

export interface AudioCompleteData {
  chat_id?: string
  character_id?: string
  generation_id?: string
  last_sequence?: number | null
}

export interface AudioErrorData {
  chat_id?: string
  character_id?: string
  generation_id?: string
  segment_id?: string
  sequence?: number
  code?: string
  message?: string
}

export interface InterruptData {
  chat_id?: string
  character_id?: string
  generation_id?: string
  reason?: string
  preserve_chat_generation?: boolean
}

export interface VadListenStateData {
  chat_id?: string
  character_id?: string
  state?: string
  is_speech?: boolean
  seq?: number
  probability?: number
  energy?: number
  code?: string
  message?: string
  reason?: string
  disabled?: boolean
}

export interface ConnectionStatusEvent {
  status: ConnectionStatus
  error: string | null
}

export interface ParsedWebSocketMessage {
  type: string
  data?: unknown
}

export interface WebSocketSessionEventMap {
  'connection:status': ConnectionStatusEvent
  'chat:chunk': ChatChunkData
  'chat:complete': ChatCompleteData
  'chat:interrupted': ChatInterruptedData
  'chat:error': ChatErrorData
  'chat:generation-error': ChatGenerationErrorData
  'audio:segment': AudioSegmentData
  'audio:complete': AudioCompleteData
  'audio:error': AudioErrorData
  'asr:transcript': AsrTranscriptData
  'vad:listen-state': VadListenStateData
  'vad:interrupt': InterruptData | undefined
  'vision:capture-request': VisionCaptureRequestData
}
