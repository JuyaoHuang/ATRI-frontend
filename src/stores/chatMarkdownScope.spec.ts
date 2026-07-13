import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useChatStore } from '@/stores/chat'
import type { ChatMessageItem } from '@/types/message'

function expectStaticMessage(
  item: ChatMessageItem | undefined,
  role: 'human' | 'ai',
  content: string
): void {
  expect(item).toMatchObject({
    kind: 'message',
    role,
    content
  })
}

describe('chat Markdown rendering scope', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('normalizes typed, ASR, completed, interrupted and historical content to static messages', () => {
    const store = useChatStore()
    store.setCurrentChat('chat-a', 'atri')

    store.addMessage({
      id: 'typed',
      chat_id: 'chat-a',
      role: 'human',
      content: '**typed**',
      timestamp: '2026-07-13T00:00:00.000Z'
    })
    expectStaticMessage(store.messages.at(-1), 'human', '**typed**')

    store.addAsrTranscriptMessage({
      chatId: 'chat-a',
      characterId: 'atri',
      generationId: 'asr-a',
      text: '$a_x=b$'
    })
    expectStaticMessage(store.messages.at(-1), 'human', '$a_x=b$')

    store.completeStreaming({
      chatId: 'chat-a',
      characterId: 'atri',
      generationId: 'asr-a',
      fullReply: '## completed'
    })
    expectStaticMessage(store.messages.at(-1), 'ai', '## completed')

    store.beginStreaming({
      chatId: 'chat-a',
      characterId: 'atri',
      generationId: 'generation-interrupted'
    })
    store.interruptStreaming({
      chatId: 'chat-a',
      characterId: 'atri',
      generationId: 'generation-interrupted',
      partialReply: '> interrupted'
    })
    expectStaticMessage(store.messages.at(-1), 'ai', '> interrupted')
    expect(store.messages.at(-1)?.interrupted).toBe(true)

    store.replaceTimelineItems([{
      kind: 'message',
      id: 'history-human',
      chat_id: 'chat-a',
      role: 'human',
      content: '- historical human',
      timestamp: '2026-07-12T00:00:00.000Z'
    }, {
      kind: 'message',
      id: 'history-ai',
      chat_id: 'chat-a',
      role: 'ai',
      content: '$$x^2$$',
      timestamp: '2026-07-12T00:00:01.000Z'
    }])

    expectStaticMessage(store.messages[0], 'human', '- historical human')
    expectStaticMessage(store.messages[1], 'ai', '$$x^2$$')
  })

  it('keeps streaming text and generation failures outside static message semantics', () => {
    const store = useChatStore()
    store.setCurrentChat('chat-a', 'atri')
    store.beginStreaming({
      chatId: 'chat-a',
      characterId: 'atri',
      generationId: 'generation-a'
    })
    store.appendStreamingChunk({
      chatId: 'chat-a',
      characterId: 'atri',
      generationId: 'generation-a',
      chunk: '**streaming stays plain**'
    })

    expect(store.streamingText).toBe('**streaming stays plain**')
    expect(store.messages).toHaveLength(0)

    store.failActiveGeneration({
      chatId: 'chat-a',
      characterId: 'atri',
      generationId: 'generation-a',
      failure: { message: '$failure remains plain$' }
    })

    expect(store.timelineItems[0]?.kind).toBe('notice')
    expect(store.messages).toHaveLength(0)
  })
})
