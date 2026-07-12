import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { visionApi } from '@/api/vision'
import { useVisionStore } from '@/stores/vision'
import type { VisionConfigResponse } from '@/types/vision'

vi.mock('@/api/vision', () => ({
  visionApi: {
    getConfig: vi.fn(),
    updateEnabled: vi.fn()
  }
}))

const CONFIG: VisionConfigResponse = {
  enabled: true,
  source: 'screen',
  capture: {
    media_type: 'image/jpeg',
    jpeg_quality: 0.75,
    max_long_edge: 1600,
    max_decoded_bytes: 2048,
    timeout_ms: 900
  },
  provider: { detail: 'auto' },
  transport: { websocket_max_message_bytes: 4096 }
}

describe('vision store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(visionApi.getConfig).mockReset()
    vi.mocked(visionApi.updateEnabled).mockReset()
  })

  it('loads the safe configuration projection', async () => {
    vi.mocked(visionApi.getConfig).mockResolvedValue(CONFIG)
    const store = useVisionStore()

    await store.load()

    expect(store.moduleEnabled).toBe(true)
    expect(store.captureConfig).toEqual({
      jpegQuality: 0.75,
      maxLongEdge: 1600,
      maxDecodedBytes: 2048
    })
  })

  it('keeps binary and Base64 values outside Pinia state', () => {
    const store = useVisionStore()
    store.applyConfig(CONFIG)
    store.setRuntimeSnapshot('active')

    const serialized = JSON.stringify(store.$state)
    expect(serialized).not.toContain('base64')
    expect(Object.keys(store.$state)).toEqual([
      'loaded',
      'config',
      'runtimeStatus',
      'runtimeError',
      'loading',
      'saving',
      'error'
    ])
  })

  it('preserves the last confirmed config when an update fails', async () => {
    const store = useVisionStore()
    store.applyConfig(CONFIG)
    vi.mocked(visionApi.updateEnabled).mockRejectedValue(new Error('private response'))

    await expect(store.updateEnabled(false)).rejects.toThrow('private response')

    expect(store.moduleEnabled).toBe(true)
    expect(store.error).toBe('无法读取或保存视觉配置。')
    expect(store.error).not.toContain('private response')
  })
})
