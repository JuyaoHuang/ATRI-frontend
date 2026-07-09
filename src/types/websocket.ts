export const ConnectionStatus = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  CLOSED: 'closed'
} as const

export type ConnectionStatus = typeof ConnectionStatus[keyof typeof ConnectionStatus]

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
  generation_id?: string
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
  'audio:segment': AudioSegmentData
  'audio:complete': AudioCompleteData
  'audio:error': AudioErrorData
  'asr:transcript': AsrTranscriptData
  'vad:listen-state': VadListenStateData
  'vad:interrupt': InterruptData | undefined
}
