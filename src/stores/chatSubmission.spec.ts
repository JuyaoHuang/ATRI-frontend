import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useChatStore } from '@/stores/chat'

describe('chat submission gate', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('prevents duplicate submission while capture is pending', () => {
    const store = useChatStore()

    expect(store.reserveSubmission()).toBe(true)
    expect(store.connectionBusy).toBe(true)
    expect(store.reserveSubmission()).toBe(false)

    store.releaseSubmission()
    expect(store.connectionBusy).toBe(false)
    expect(store.reserveSubmission()).toBe(true)
  })

  it('does not reserve while a generation is active', () => {
    const store = useChatStore()
    store.beginStreaming({ chatId: 'chat-a', characterId: 'atri' })

    expect(store.reserveSubmission()).toBe(false)
    expect(store.connectionBusy).toBe(true)
  })
})
