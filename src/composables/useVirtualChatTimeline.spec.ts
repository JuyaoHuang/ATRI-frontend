import { describe, expect, it } from 'vitest'

import { buildVirtualChatRows } from '@/composables/useVirtualChatTimeline'
import type { ChatMessageItem } from '@/types/message'

function message(id: string, content = id): ChatMessageItem {
  return {
    kind: 'message',
    id,
    chat_id: 'chat-a',
    role: 'human',
    content,
    timestamp: '2026-07-13T00:00:00.000Z'
  }
}

describe('buildVirtualChatRows', () => {
  it('keeps timeline keys stable when older rows are prepended', () => {
    const current = [message('one'), message('two')]
    const currentRows = buildVirtualChatRows({
      timelineItems: current,
      streamingText: '',
      isStreaming: false,
      chatId: 'chat-a'
    })
    const prependedRows = buildVirtualChatRows({
      timelineItems: [message('older'), ...current],
      streamingText: '',
      isStreaming: false,
      chatId: 'chat-a'
    })

    expect(prependedRows.slice(1).map(row => row.key))
      .toEqual(currentRows.map(row => row.key))
  })

  it('disambiguates duplicate IDs from the tail without renumbering existing rows', () => {
    const duplicate = message('duplicate')
    const currentRows = buildVirtualChatRows({
      timelineItems: [duplicate, duplicate],
      streamingText: '',
      isStreaming: false,
      chatId: 'chat-a'
    })
    const prependedRows = buildVirtualChatRows({
      timelineItems: [duplicate, duplicate, duplicate],
      streamingText: '',
      isStreaming: false,
      chatId: 'chat-a'
    })

    expect(prependedRows.slice(1).map(row => row.key))
      .toEqual(currentRows.map(row => row.key))
    expect(new Set(prependedRows.map(row => row.key)).size).toBe(3)
  })

  it('adds one chat-scoped plain-text streaming tail row', () => {
    const rows = buildVirtualChatRows({
      timelineItems: [message('one')],
      streamingText: '**still plain** $x$',
      isStreaming: true,
      chatId: 'chat-a'
    })

    expect(rows).toHaveLength(2)
    expect(rows[1]).toEqual({
      kind: 'streaming',
      key: 'streaming:chat-a',
      text: '**still plain** $x$'
    })
  })

  it('does not create a streaming row before visible text exists', () => {
    const rows = buildVirtualChatRows({
      timelineItems: [message('one')],
      streamingText: '',
      isStreaming: true,
      chatId: 'chat-a'
    })

    expect(rows).toHaveLength(1)
  })

  it('builds a 1000-message row model without changing source objects', () => {
    const items = Array.from({ length: 1_000 }, (_, index) => message(`message-${index}`))
    const rows = buildVirtualChatRows({
      timelineItems: items,
      streamingText: '',
      isStreaming: false,
      chatId: 'chat-a'
    })

    expect(rows).toHaveLength(1_000)
    expect(rows[500]).toMatchObject({
      kind: 'timeline-item',
      item: items[500]
    })
    expect(items[500]?.id).toBe('message-500')
  })
})
