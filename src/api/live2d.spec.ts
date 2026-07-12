import { beforeEach, describe, expect, it, vi } from 'vitest'

import client from '@/api/client'
import { live2dApi } from '@/api/live2d'
import type { Live2DModelResponse } from '@/api/types'

vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn(),
  },
}))

const MODEL: Live2DModelResponse = {
  id: 'mao_pro',
  name: 'mao_pro',
  model_path: 'runtime/mao_pro.model3.json',
  model_url: 'http://test/api/assets/live2d/mao_pro/runtime/mao_pro.model3.json',
  thumbnail_url: null,
  expressions: ['happy'],
  is_default: true,
}

describe('live2d API', () => {
  beforeEach(() => {
    vi.mocked(client.get).mockReset()
  })

  it('exposes only read operations', () => {
    expect(Object.keys(live2dApi).sort()).toEqual(['getExpressions', 'list'])
  })

  it('loads the server-discovered model catalog', async () => {
    vi.mocked(client.get).mockResolvedValue({ data: [MODEL] })

    await expect(live2dApi.list()).resolves.toEqual([MODEL])

    expect(client.get).toHaveBeenCalledWith('/api/live2d/models')
  })

  it('encodes the model id when reading expressions', async () => {
    vi.mocked(client.get).mockResolvedValue({
      data: { model_id: 'model name', expressions: ['happy'] },
    })

    await live2dApi.getExpressions('model name')

    expect(client.get).toHaveBeenCalledWith('/api/live2d/models/model%20name/expressions')
  })
})
