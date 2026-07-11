import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useChat } from '@/composables/useChat'
import { useCharactersStore } from '@/stores/characters'
import { useChatStore } from '@/stores/chat'
import type { SendTextPayload } from '@/types/websocket'
import type { InputImage } from '@/types/vision'

const mocks = vi.hoisted(() => ({
  canSend: vi.fn<() => boolean>(() => true),
  sendText: vi.fn<(_payload: SendTextPayload) => boolean>(() => true),
  captureForSubmission: vi.fn<() => Promise<InputImage | undefined>>(),
  stopBecauseContextChanged: vi.fn()
}))

vi.mock('@/composables/useWebSocket', () => ({
  useWebSocket: () => ({
    canSend: mocks.canSend,
    sendText: mocks.sendText
  })
}))

vi.mock('@/composables/useVision', () => ({
  useVision: () => ({
    captureForSubmission: mocks.captureForSubmission
  })
}))

vi.mock('@/composables/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    stopBecauseContextChanged: mocks.stopBecauseContextChanged
  })
}))

vi.mock('@/stores/live2d', () => ({
  useLive2dStore: () => ({ requestExpression: vi.fn() })
}))

vi.mock('vue-sonner', () => ({
  toast: { error: vi.fn() }
}))

const IMAGE: InputImage = {
  source: 'screen',
  media_type: 'image/jpeg',
  encoding: 'base64',
  data: 'opaque-image-data'
}

describe('useChat visual submission', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocks.canSend.mockReturnValue(true)
    mocks.sendText.mockReturnValue(true)
    const chatStore = useChatStore()
    chatStore.setCurrentChat('chat-a', 'atri')
    useCharactersStore().activeCharacterId = 'atri'
  })

  it('holds the submission gate while capture is pending', async () => {
    let resolveCapture: ((image: InputImage) => void) | undefined
    mocks.captureForSubmission.mockReturnValueOnce(new Promise<InputImage>(resolve => {
      resolveCapture = resolve
    }))
    const chat = useChat()

    const firstSubmission = chat.sendMessage('first')
    const duplicateSubmission = chat.sendMessage('second')

    expect(await duplicateSubmission).toBe(false)
    expect(mocks.sendText).not.toHaveBeenCalled()
    resolveCapture?.(IMAGE)
    expect(await firstSubmission).toBe(true)
    expect(mocks.sendText).toHaveBeenCalledTimes(1)
    const payload = mocks.sendText.mock.calls[0]![0]
    expect(payload.text).toBe('first')
    expect(payload.image?.data.length).toBe(IMAGE.data.length)
  })

  it('sends text exactly once when local capture is unavailable', async () => {
    mocks.captureForSubmission.mockResolvedValueOnce(undefined)
    const chat = useChat()

    expect(await chat.sendMessage('text only')).toBe(true)

    expect(mocks.captureForSubmission).toHaveBeenCalledTimes(1)
    expect(mocks.sendText).toHaveBeenCalledTimes(1)
    expect(mocks.sendText.mock.calls[0]![0].image).toBeUndefined()
  })
})
