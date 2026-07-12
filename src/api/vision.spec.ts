import { beforeEach, describe, expect, it, vi } from 'vitest'

import client from '@/api/client'
import { visionApi } from '@/api/vision'
import type { VisionConfigResponse } from '@/types/vision'

vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}))

const CONFIG: VisionConfigResponse = {
  enabled: false,
  source: 'screen',
  capture: {
    media_type: 'image/jpeg',
    jpeg_quality: 0.82,
    max_long_edge: 1920,
    max_decoded_bytes: 4 * 1024 * 1024,
    timeout_ms: 1500,
  },
  provider: { detail: 'auto' },
  transport: { websocket_max_message_bytes: 8 * 1024 * 1024 },
}

describe('vision API', () => {
  beforeEach(() => {
    vi.mocked(client.get).mockReset()
    vi.mocked(client.put).mockReset()
  })

  it('updates only the enabled allowlisted field', async () => {
    vi.mocked(client.put).mockResolvedValue({ data: CONFIG })

    await expect(visionApi.updateEnabled(false)).resolves.toEqual(CONFIG)

    expect(client.put).toHaveBeenCalledOnce()
    expect(client.put).toHaveBeenCalledWith('/api/vision/config', { enabled: false })
  })
})
