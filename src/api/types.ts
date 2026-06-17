// API 请求和响应类型定义

// 角色相关
export interface CharacterResponse {
  character_id: string
  name: string
  avatar: string | null
  avatar_url?: string | null
  greeting: string | null
  description?: string | null
  created_at?: string | null
  updated_at?: string | null
  is_system?: boolean
}

export interface CharacterDetailResponse extends CharacterResponse {
  system_prompt: string
}

export interface CharacterCreateRequest {
  character_id?: string
  name: string
  greeting?: string
  description?: string
  system_prompt: string
}

export interface CharacterUpdateRequest {
  name?: string
  greeting?: string
  description?: string
  system_prompt?: string
}

export interface AvatarUploadResponse {
  character_id: string
  avatar: string
  avatar_url: string
}

// Live2D 相关
export interface Live2DModelResponse {
  id: string
  name: string
  model_path: string
  model_url: string
  thumbnail_url?: string | null
  expressions: string[]
  created_at: string
  is_default: boolean
}

export interface Live2DExpressionResponse {
  model_id: string
  expressions: string[]
}

// 聊天相关
// ASR related
export interface ASRAutoSendConfig {
  enabled: boolean
  delay_ms: number
}

export type ASRProviderConfig = Record<string, string | number | boolean | null | undefined>

export interface ASRConfig {
  asr_model: string
  auto_send: ASRAutoSendConfig
  web_speech_api?: ASRProviderConfig
  faster_whisper?: ASRProviderConfig
  whisper_cpp?: ASRProviderConfig
  whisper?: ASRProviderConfig
  openai_whisper?: ASRProviderConfig
  [key: string]: string | ASRAutoSendConfig | ASRProviderConfig | undefined
}

export interface ASRProviderStatus {
  name: string
  display_name: string
  provider_type: string
  description: string
  active: boolean
  available: boolean
  reason?: string | null
  supports_backend_transcription: boolean
  supports_browser_streaming: boolean
  config: ASRProviderConfig
}

export interface ASRConfigResponse {
  config: ASRConfig
  providers: ASRProviderStatus[]
}

export interface ASRHealthResponse {
  active_provider: string
  active_available: boolean
  providers: ASRProviderStatus[]
}

export interface ASRTranscriptionResponse {
  provider: string
  text: string
}

export interface ASRUploadMetadata {
  source: string
  sample_rate: number
  channels: number
  encoding: string
}

// TTS related
export type TTSProviderConfig = Record<string, string | number | boolean | null | undefined>

export interface TTSConfig {
  tts_model: string
  enabled: boolean
  auto_play: boolean
  show_player_on_home: boolean
  volume: number
  edge_tts?: TTSProviderConfig
  gpt_sovits_tts?: TTSProviderConfig
  siliconflow_tts?: TTSProviderConfig
  cosyvoice3_tts?: TTSProviderConfig
  [key: string]: string | number | boolean | TTSProviderConfig | undefined
}

export interface TTSProviderStatus {
  name: string
  display_name: string
  provider_type: string
  description: string
  active: boolean
  available: boolean
  reason?: string | null
  supports_streaming: boolean
  media_type: string
  config: TTSProviderConfig
}

export interface TTSConfigResponse {
  config: TTSConfig
  providers: TTSProviderStatus[]
}

export interface TTSHealthResponse {
  active_provider: string
  active_available: boolean
  providers: TTSProviderStatus[]
}

export interface TTSVoiceInfo {
  id: string
  name: string
  language?: string | null
  gender?: string | null
  description?: string | null
  preview_url?: string | null
}

export interface TTSVoicesResponse {
  provider: string
  voices: TTSVoiceInfo[]
}

export interface TTSSynthesisRequest {
  text: string
  provider?: string
  voice_id?: string
  options?: Record<string, string | number | boolean | null | undefined>
}

export interface ChatListParams {
  character_id?: string
  user_id?: string
}

export interface ChatResponse {
  id: string
  character_id: string
  title: string
  created_at: string
  updated_at: string
}

export interface CreateChatRequest {
  character_id: string
  first_message: string
  defer_title?: boolean
  user_id?: string
}

export interface CreateChatResponse {
  id: string
  character_id: string
  title: string
  created_at: string
  updated_at: string
}

export interface ChatDetailParams {
  chat_id: string
  limit?: number
  offset?: number
}

export interface MessageResponse {
  role: 'human' | 'ai'
  content: string
  timestamp: string
  name?: string      // AI 消息的角色名称或 character_id
}

export interface ChatDetailResponse {
  metadata: {
    id: string
    character_id: string
    title: string
    created_at: string
    updated_at: string
  }
  messages: MessageResponse[]
}

export interface UpdateChatTitleRequest {
  title: string
}

export interface DeleteChatRequest {
  chat_id: string
}

export interface DataCleanupResponse {
  character_id: string
  user_id: string
  chat_id?: string | null
  target: 'short_term_memory' | 'long_term_memory'
  status: 'cleared' | 'submitted'
  message: string
  details: Record<string, unknown>
}

export interface AuthStatusResponse {
  enabled: boolean
}

export interface AuthLoginResponse {
  enabled: boolean
  authorization_url: string | null
}

export interface AuthUserResponse {
  username: string
  avatar_url?: string | null
  name?: string | null
  auth_enabled: boolean
}

export interface AuthLogoutResponse {
  success: boolean
}

// 健康检查
export interface HealthResponse {
  status: string
}
