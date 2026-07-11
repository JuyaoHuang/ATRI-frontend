import { defineStore } from 'pinia'

import { visionApi } from '@/api/vision'
import type {
  ScreenCaptureConfig,
  VisionConfigResponse,
  VisionRuntimeStatus
} from '@/types/vision'

const DEFAULT_CONFIG: VisionConfigResponse = {
  enabled: false,
  source: 'screen',
  capture: {
    media_type: 'image/jpeg',
    jpeg_quality: 0.82,
    max_long_edge: 1920,
    max_decoded_bytes: 4 * 1024 * 1024,
    timeout_ms: 1500
  },
  provider: {
    detail: 'auto'
  },
  transport: {
    websocket_max_message_bytes: 8 * 1024 * 1024
  }
}

let loadPromise: Promise<void> | null = null

export interface VisionState {
  loaded: boolean
  config: VisionConfigResponse
  runtimeStatus: VisionRuntimeStatus
  runtimeError: string | null
  loading: boolean
  saving: boolean
  error: string | null
}

function cloneConfig(config: VisionConfigResponse): VisionConfigResponse {
  return structuredClone(config)
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return '视觉配置请求已取消。'
  }
  return '无法读取或保存视觉配置。'
}

export const useVisionStore = defineStore('vision', {
  state: (): VisionState => ({
    loaded: false,
    config: cloneConfig(DEFAULT_CONFIG),
    runtimeStatus: 'disabled',
    runtimeError: null,
    loading: false,
    saving: false,
    error: null
  }),

  getters: {
    moduleEnabled: state => state.config.enabled,
    runtimeActive: state => state.runtimeStatus === 'active',
    captureConfig(state): ScreenCaptureConfig {
      return {
        jpegQuality: state.config.capture.jpeg_quality,
        maxLongEdge: state.config.capture.max_long_edge,
        maxDecodedBytes: state.config.capture.max_decoded_bytes
      }
    }
  },

  actions: {
    applyConfig(config: VisionConfigResponse) {
      this.config = cloneConfig(config)
      this.loaded = true
    },

    async load() {
      if (loadPromise) {
        await loadPromise
        return
      }

      loadPromise = (async () => {
        this.loading = true
        this.error = null
        try {
          this.applyConfig(await visionApi.getConfig())
        } catch (error) {
          this.error = safeErrorMessage(error)
        } finally {
          this.loading = false
          loadPromise = null
        }
      })()

      await loadPromise
    },

    async ensureLoaded() {
      if (!this.loaded) {
        await this.load()
      }
    },

    async updateEnabled(enabled: boolean) {
      this.saving = true
      this.error = null
      try {
        this.applyConfig(await visionApi.updateEnabled(enabled))
      } catch (error) {
        this.error = safeErrorMessage(error)
        throw error
      } finally {
        this.saving = false
      }
    },

    setRuntimeSnapshot(status: VisionRuntimeStatus, error: string | null = null) {
      this.runtimeStatus = status
      this.runtimeError = error
    }
  }
})
