import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useChatStore } from '@/stores/chat'

const FAILURE = { message: '本轮回复生成失败，请稍后重试。' }

describe('chat generation failure', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('binds the first generation event and appends a visible notice', () => {
    const store = useChatStore()
    store.setCurrentChat('chat-a', 'atri')
    store.beginStreaming({ chatId: 'chat-a', characterId: 'atri' })
    store.streamingText = 'partial reply'

    const result = store.failActiveGeneration({
      chatId: 'chat-a',
      characterId: 'atri',
      generationId: 'gen-a',
      failure: FAILURE
    })

    expect(result).toBe('visible')
    expect(store.activeStream).toBeNull()
    expect(store.streamingText).toBe('')
    expect(store.timelineItems).toHaveLength(1)
    expect(store.timelineItems[0]).toMatchObject({
      kind: 'notice',
      chat_id: 'chat-a',
      generation_id: 'gen-a',
      level: 'error',
      content: FAILURE.message
    })
  })

  it('ignores mismatched and stale generations without changing the active stream', () => {
    const store = useChatStore()
    store.setCurrentChat('chat-b', 'atri')
    store.beginStreaming({
      chatId: 'chat-b',
      characterId: 'atri',
      generationId: 'gen-b'
    })
    store.streamingText = 'generation b'

    expect(store.failActiveGeneration({
      chatId: 'chat-b',
      characterId: 'atri',
      generationId: 'gen-a',
      failure: FAILURE
    })).toBe('ignored')
    expect(store.failActiveGeneration({
      chatId: 'chat-b',
      characterId: 'other',
      generationId: 'gen-b',
      failure: FAILURE
    })).toBe('ignored')

    expect(store.activeStream?.generationId).toBe('gen-b')
    expect(store.streamingText).toBe('generation b')
    expect(store.timelineItems).toHaveLength(0)
  })

  it('never matches a pending interrupted generation', () => {
    const store = useChatStore()
    store.setCurrentChat('chat-a', 'atri')
    store.beginStreaming({
      chatId: 'chat-a',
      characterId: 'atri',
      generationId: 'gen-interrupted'
    })
    store.markActiveStreamInterrupted({
      chatId: 'chat-a',
      characterId: 'atri',
      generationId: 'gen-interrupted'
    })

    expect(store.failActiveGeneration({
      chatId: 'chat-a',
      characterId: 'atri',
      generationId: 'gen-interrupted',
      failure: FAILURE
    })).toBe('ignored')
    expect(store.pendingInterruptedStream?.generationId).toBe('gen-interrupted')
    expect(store.timelineItems).toHaveLength(0)
  })

  it('ends a hidden generation without adding a notice to another chat', () => {
    const store = useChatStore()
    store.setCurrentChat('chat-visible', 'atri')
    store.beginStreaming({
      chatId: 'chat-hidden',
      characterId: 'atri',
      generationId: 'gen-hidden'
    })

    expect(store.failActiveGeneration({
      chatId: 'chat-hidden',
      characterId: 'atri',
      generationId: 'gen-hidden',
      failure: FAILURE
    })).toBe('hidden')
    expect(store.activeStream).toBeNull()
    expect(store.timelineItems).toHaveLength(0)
  })

  it('replaces transient notices when durable history is loaded', () => {
    const store = useChatStore()
    store.setCurrentChat('chat-a', 'atri')
    store.beginStreaming({
      chatId: 'chat-a',
      characterId: 'atri',
      generationId: 'gen-a'
    })
    store.failActiveGeneration({
      chatId: 'chat-a',
      characterId: 'atri',
      generationId: 'gen-a',
      failure: FAILURE
    })

    store.replaceTimelineItems([{
      kind: 'message',
      id: 'history-1',
      chat_id: 'chat-a',
      role: 'human',
      content: 'durable message',
      timestamp: '2026-07-11T00:00:00.000Z'
    }])

    expect(store.timelineItems).toHaveLength(1)
    expect(store.timelineItems[0]?.kind).toBe('message')
  })
})
