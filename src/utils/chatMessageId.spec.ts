import { describe, expect, it } from 'vitest'

import type { MessageResponse } from '@/api/types'
import { createStableHistoryMessageIds } from '@/utils/chatMessageId'

const HUMAN: MessageResponse = {
  role: 'human',
  content: 'hello',
  timestamp: '2026-07-13T00:00:00.000Z'
}

const AI: MessageResponse = {
  role: 'ai',
  content: 'world',
  timestamp: '2026-07-13T00:00:01.000Z',
  generation_id: 'generation-a',
  name: 'atri'
}

describe('createStableHistoryMessageIds', () => {
  it('does not renumber existing messages when older history is prepended', () => {
    const current = [HUMAN, AI]
    const older: MessageResponse = {
      role: 'human',
      content: 'older',
      timestamp: '2026-07-12T23:59:59.000Z'
    }

    const currentIds = createStableHistoryMessageIds('chat-a', current)
    const prependedIds = createStableHistoryMessageIds('chat-a', [older, ...current])

    expect(prependedIds.slice(1)).toEqual(currentIds)
  })

  it('keeps exact duplicate occurrences stable when another duplicate is prepended', () => {
    const duplicate = { ...HUMAN }
    const currentIds = createStableHistoryMessageIds('chat-a', [duplicate, duplicate])
    const prependedIds = createStableHistoryMessageIds('chat-a', [
      duplicate,
      duplicate,
      duplicate
    ])

    expect(prependedIds.slice(1)).toEqual(currentIds)
    expect(new Set(prependedIds).size).toBe(3)
  })

  it('scopes IDs to the chat and exact message fields', () => {
    const original = createStableHistoryMessageIds('chat-a', [AI])[0]
    const otherChat = createStableHistoryMessageIds('chat-b', [AI])[0]
    const changedContent = createStableHistoryMessageIds('chat-a', [{
      ...AI,
      content: 'changed'
    }])[0]

    expect(original).not.toBe(otherChat)
    expect(original).not.toBe(changedContent)
  })
})
