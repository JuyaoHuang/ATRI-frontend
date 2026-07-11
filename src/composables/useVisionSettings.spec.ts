import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { visionApi } from '@/api/vision'
import { useVision } from '@/composables/useVision'
import { useVisionStore } from '@/stores/vision'
import type { VisionConfigResponse } from '@/types/vision'
import { visionSessionController } from '@/utils/visionSessionController'

const websocketMocks = vi.hoisted(() => ({
  on: vi.fn(),
  sendVisionCaptureResult: vi.fn(),
  sendVisionState: vi.fn(),
}))

vi.mock('@/api/vision', () => ({
  visionApi: {
    getConfig: vi.fn(),
    updateEnabled: vi.fn(),
  },
}))

vi.mock('@/composables/useWebSocket', () => ({
  useWebSocket: () => websocketMocks,
}))

const ENABLED_CONFIG: VisionConfigResponse = {
  enabled: true,
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

describe('useVision module setting', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('stops the runtime only after the server confirms module disablement', async () => {
    const disabledConfig = { ...ENABLED_CONFIG, enabled: false }
    vi.mocked(visionApi.updateEnabled).mockResolvedValue(disabledConfig)
    const store = useVisionStore()
    store.applyConfig(ENABLED_CONFIG)
    const stop = vi.spyOn(visionSessionController, 'stop')

    await useVision().updateModuleEnabled(false)

    expect(store.moduleEnabled).toBe(false)
    expect(stop).toHaveBeenCalledOnce()
  })

  it('keeps text-only submission independent from a failed vision config load', async () => {
    vi.mocked(visionApi.getConfig).mockRejectedValue(new Error('vision endpoint unavailable'))

    await expect(useVision().captureForSubmission()).resolves.toBeUndefined()

    expect(visionApi.getConfig).not.toHaveBeenCalled()
  })

  it('keeps both the confirmed setting and runtime when the PUT fails', async () => {
    vi.mocked(visionApi.updateEnabled).mockRejectedValue(new Error('network details'))
    const store = useVisionStore()
    store.applyConfig(ENABLED_CONFIG)
    const stop = vi.spyOn(visionSessionController, 'stop')

    await expect(useVision().updateModuleEnabled(false)).rejects.toThrow('network details')

    expect(store.moduleEnabled).toBe(true)
    expect(stop).not.toHaveBeenCalled()
  })
})
