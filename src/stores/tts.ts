import { defineStore } from 'pinia'

import { ttsApi } from '@/api/tts'
import type {
  TTSConfig,
  TTSProviderConfig,
  TTSProviderStatus,
  TTSStreamingConfig,
  TTSSynthesisRequest,
  TTSVoiceInfo
} from '@/api/types'

const DEFAULT_CONFIG: TTSConfig = {
  tts_model: 'edge_tts',
  enabled: false,
  auto_play: false,
  show_player_on_home: false,
  volume: 1,
  streaming: {
    enabled: false,
    segment_method: 'pysbd',
    faster_first_response: true,
    max_concurrent_synthesis: 2,
    max_pending_segments: 12
  },
  edge_tts: {
    voice: 'zh-CN-XiaoxiaoNeural',
    rate: '+0%'
  },
  gpt_sovits_tts: {},
  siliconflow_tts: {
    default_voice: 'FunAudioLLM/CosyVoice2-0.5B:claire',
    stream: false
  },
  cosyvoice3_tts: {
    sft_dropdown: '',
    stream: false,
    speed: 1
  }
}

let loadPromise: Promise<void> | null = null
const PROVIDER_WRITE_ALLOWLISTS: Record<string, Set<string>> = {
  edge_tts: new Set(['voice', 'rate']),
  gpt_sovits_tts: new Set(),
  siliconflow_tts: new Set(['default_voice', 'stream']),
  cosyvoice3_tts: new Set(['stream', 'speed'])
}

export interface TTSState {
  loaded: boolean
  config: TTSConfig
  providers: TTSProviderStatus[]
  voices: TTSVoiceInfo[]
  loading: boolean
  saving: boolean
  synthesizing: boolean
  error: string | null
}

function cloneConfig(config: TTSConfig): TTSConfig {
  return JSON.parse(JSON.stringify(config)) as TTSConfig
}

function normalizeConfig(config?: Partial<TTSConfig>): TTSConfig {
  const streaming = config?.streaming as Partial<TTSStreamingConfig> | undefined
  return {
    ...cloneConfig(DEFAULT_CONFIG),
    ...(config || {}),
    streaming: {
      ...DEFAULT_CONFIG.streaming,
      ...(streaming || {})
    },
    edge_tts: {
      ...DEFAULT_CONFIG.edge_tts,
      ...(config?.edge_tts || {})
    },
    gpt_sovits_tts: {
      ...DEFAULT_CONFIG.gpt_sovits_tts,
      ...(config?.gpt_sovits_tts || {})
    },
    siliconflow_tts: {
      ...DEFAULT_CONFIG.siliconflow_tts,
      ...(config?.siliconflow_tts || {})
    },
    cosyvoice3_tts: {
      ...DEFAULT_CONFIG.cosyvoice3_tts,
      ...(config?.cosyvoice3_tts || {})
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sanitizeProviderPatch(provider: string, patch: TTSProviderConfig): TTSProviderConfig {
  const allowlist = PROVIDER_WRITE_ALLOWLISTS[provider]
  if (allowlist) {
    return Object.fromEntries(
      Object.entries(patch).filter(([key]) => allowlist.has(key))
    ) as TTSProviderConfig
  }

  return patch
}

export const useTTSStore = defineStore('tts', {
  state: (): TTSState => ({
    loaded: false,
    config: cloneConfig(DEFAULT_CONFIG),
    providers: [],
    voices: [],
    loading: false,
    saving: false,
    synthesizing: false,
    error: null
  }),

  getters: {
    activeProvider(state): TTSProviderStatus | undefined {
      return state.providers.find(provider => provider.name === state.config.tts_model)
    },

    activeProviderConfig(state): TTSProviderConfig {
      const value = state.config[state.config.tts_model]
      return value && typeof value === 'object' && !Array.isArray(value)
        ? value as TTSProviderConfig
        : {}
    },

    moduleEnabled(state): boolean {
      return Boolean(state.config.enabled)
    },

    autoPlayEnabled(state): boolean {
      return Boolean(state.config.auto_play)
    },

    streamingAutoPlayEnabled(state): boolean {
      return Boolean(state.config.enabled && state.config.auto_play && state.config.streaming?.enabled)
    },

    showPlayerOnHome(state): boolean {
      return Boolean(state.config.show_player_on_home)
    },

    outputVolume(state): number {
      return Number(state.config.volume ?? 1)
    },

    configured(state): boolean {
      return Boolean(state.config.tts_model)
    }
  },

  actions: {
    async load() {
      if (loadPromise) {
        await loadPromise
        return
      }

      loadPromise = (async () => {
        this.loading = true
        this.error = null
        try {
          const response = await ttsApi.getConfig()
          this.config = normalizeConfig(response.config)
          this.providers = response.providers
          this.loaded = true
        } catch (error) {
          this.error = errorMessage(error)
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

    async refreshProviders() {
      try {
        this.providers = await ttsApi.listProviders()
      } catch (error) {
        this.error = errorMessage(error)
      }
    },

    async loadVoices(provider?: string) {
      const requestedProvider = provider || this.config.tts_model
      this.error = null
      this.voices = []
      try {
        const response = await ttsApi.getVoices(requestedProvider)
        if (requestedProvider === this.config.tts_model) {
          this.voices = response.voices
        }
      } catch (error) {
        if (requestedProvider === this.config.tts_model) {
          this.voices = []
          this.error = errorMessage(error)
        }
      }
    },

    async savePatch(patch: Partial<TTSConfig>) {
      this.saving = true
      this.error = null
      try {
        const response = await ttsApi.updateConfig(patch)
        this.config = normalizeConfig(response.config)
        this.providers = response.providers
        this.loaded = true
      } catch (error) {
        this.error = errorMessage(error)
        throw error
      } finally {
        this.saving = false
      }
    },

    async switchProvider(provider: string) {
      this.saving = true
      this.error = null
      try {
        const response = await ttsApi.switchProvider(provider)
        this.config = normalizeConfig(response.config)
        this.providers = response.providers
        this.loaded = true
        await this.loadVoices(provider)
      } catch (error) {
        this.error = errorMessage(error)
        throw error
      } finally {
        this.saving = false
      }
    },

    async updateProviderConfig(provider: string, patch: TTSProviderConfig) {
      const sanitizedPatch = sanitizeProviderPatch(provider, patch)
      if (Object.keys(sanitizedPatch).length === 0) {
        return
      }

      await this.savePatch({
        [provider]: sanitizedPatch
      } as Partial<TTSConfig>)
    },

    async updateEnabled(enabled: boolean) {
      await this.savePatch({ enabled })
    },

    async updateAutoPlay(autoPlay: boolean) {
      await this.savePatch({ auto_play: autoPlay })
    },

    async updateShowPlayerOnHome(showPlayerOnHome: boolean) {
      await this.savePatch({ show_player_on_home: showPlayerOnHome })
    },

    async updateVolume(volume: number) {
      await this.savePatch({ volume })
    },

    async synthesize(payload: TTSSynthesisRequest): Promise<Blob> {
      this.synthesizing = true
      this.error = null
      try {
        const response = await ttsApi.synthesize({
          ...payload,
          provider: payload.provider || this.config.tts_model
        })
        return response.blob
      } catch (error) {
        this.error = errorMessage(error)
        throw error
      } finally {
        this.synthesizing = false
      }
    }
  }
})
