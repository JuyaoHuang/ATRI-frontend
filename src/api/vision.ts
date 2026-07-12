import client from './client'

import type { VisionConfigResponse } from '@/types/vision'

export const visionApi = {
  async getConfig(): Promise<VisionConfigResponse> {
    const { data } = await client.get<VisionConfigResponse>('/api/vision/config')
    return data
  },

  async updateEnabled(enabled: boolean): Promise<VisionConfigResponse> {
    const { data } = await client.put<VisionConfigResponse>('/api/vision/config', { enabled })
    return data
  }
}
