import client from './client'
import type {
  ASRConfig,
  ASRConfigResponse,
  ASRHealthResponse,
  ASRProviderStatus,
  ASRUploadMetadata,
  ASRTranscriptionResponse
} from './types'

export const asrApi = {
  async listProviders(): Promise<ASRProviderStatus[]> {
    const { data } = await client.get<ASRProviderStatus[]>('/api/asr/providers')
    return data
  },

  async getConfig(): Promise<ASRConfigResponse> {
    const { data } = await client.get<ASRConfigResponse>('/api/asr/config')
    return data
  },

  async updateConfig(payload: Partial<ASRConfig>): Promise<ASRConfigResponse> {
    const { data } = await client.put<ASRConfigResponse>('/api/asr/config', payload)
    return data
  },

  async switchProvider(provider: string): Promise<ASRConfigResponse> {
    const { data } = await client.post<ASRConfigResponse>('/api/asr/switch', { provider })
    return data
  },

  async health(): Promise<ASRHealthResponse> {
    const { data } = await client.get<ASRHealthResponse>('/api/asr/health')
    return data
  },

  async transcribe(
    recording: Blob,
    provider?: string,
    metadata?: ASRUploadMetadata
  ): Promise<ASRTranscriptionResponse> {
    const formData = new FormData()
    formData.append('audio', recording, 'recording.wav')

    if (metadata) {
      formData.append('source', metadata.source)
      formData.append('sample_rate', String(metadata.sample_rate))
      formData.append('channels', String(metadata.channels))
      formData.append('encoding', metadata.encoding)
    }

    const { data } = await client.post<ASRTranscriptionResponse>('/api/asr/transcribe', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      params: provider ? { provider } : undefined,
      timeout: 60000
    })
    return data
  }
}
