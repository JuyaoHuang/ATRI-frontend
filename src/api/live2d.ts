import client from './client'
import type {
  Live2DExpressionResponse,
  Live2DModelResponse
} from './types'

export const live2dApi = {
  async list(): Promise<Live2DModelResponse[]> {
    const { data } = await client.get<Live2DModelResponse[]>('/api/live2d/models')
    return data
  },

  async getExpressions(modelId: string): Promise<Live2DExpressionResponse> {
    const { data } = await client.get<Live2DExpressionResponse>(
      `/api/live2d/models/${encodeURIComponent(modelId)}/expressions`
    )
    return data
  }
}
