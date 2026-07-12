export type VisionSource = 'screen'
export type VisionRuntimeStatus = 'disabled' | 'starting' | 'active' | 'error'
export type VisionCaptureStatus = 'captured' | 'unavailable' | 'failed'

export interface InputImage {
  source: VisionSource
  media_type: 'image/jpeg'
  encoding: 'base64'
  data: string
}

export interface VisionCaptureConfigResponse {
  media_type: 'image/jpeg'
  jpeg_quality: number
  max_long_edge: number
  max_decoded_bytes: number
  timeout_ms: number
}

export interface VisionProviderConfigResponse {
  detail: 'auto' | 'low' | 'high'
}

export interface VisionTransportConfigResponse {
  websocket_max_message_bytes: number
}

export interface VisionConfigResponse {
  enabled: boolean
  source: VisionSource
  capture: VisionCaptureConfigResponse
  provider: VisionProviderConfigResponse
  transport: VisionTransportConfigResponse
}

export interface ScreenCaptureConfig {
  jpegQuality: number
  maxLongEdge: number
  maxDecodedBytes: number
}

export type VisionCaptureOutcome =
  | { status: 'captured', image: InputImage }
  | { status: 'unavailable' | 'failed' }

export interface VisionRuntimeSnapshot {
  status: VisionRuntimeStatus
  error: string | null
}
