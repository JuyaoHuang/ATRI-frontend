import { defineStore } from 'pinia'
import type { Message } from '@/types/message'

export interface ChatState {
  currentChatId: string | null
  currentCharacterId: string | null
  messages: Message[]
  isStreaming: boolean
  streamingText: string
  skipNextHistoryLoadChatId: string | null
  pendingDeferredTitleChatId: string | null
  draftChatId: string | null
}

export const useChatStore = defineStore('chat', {
  state: (): ChatState => ({
    currentChatId: null,
    currentCharacterId: null,
    messages: [],
    isStreaming: false,
    streamingText: '',
    skipNextHistoryLoadChatId: null,
    pendingDeferredTitleChatId: null,
    draftChatId: null
  }),

  actions: {
    setCurrentCharacter(characterId: string | null) {
      this.currentCharacterId = characterId
    },

    setCurrentChat(chatId: string, characterId: string) {
      this.currentChatId = chatId
      this.currentCharacterId = characterId
      this.draftChatId = chatId.startsWith('draft_') ? chatId : null
    },

    prepareNewChat(characterId: string) {
      this.currentChatId = null
      this.currentCharacterId = characterId
      this.draftChatId = null
      this.clearMessages()
    },

    beginDraftChat(chatId: string, characterId: string) {
      this.currentChatId = chatId
      this.currentCharacterId = characterId
      this.draftChatId = chatId
      this.clearMessages()
    },

    markSkipNextHistoryLoad(chatId: string) {
      this.skipNextHistoryLoadChatId = chatId
    },

    consumeSkipNextHistoryLoad(chatId: string) {
      if (this.skipNextHistoryLoadChatId === chatId) {
        this.skipNextHistoryLoadChatId = null
        return true
      }

      return false
    },

    markPendingDeferredTitle(chatId: string) {
      this.pendingDeferredTitleChatId = chatId
    },

    consumePendingDeferredTitle(chatId: string) {
      if (this.pendingDeferredTitleChatId === chatId) {
        this.pendingDeferredTitleChatId = null
        return true
      }

      return false
    },

    replaceCurrentChatId(previousChatId: string, nextChatId: string) {
      if (this.currentChatId === previousChatId) {
        this.currentChatId = nextChatId
      }

      if (this.draftChatId === previousChatId) {
        this.draftChatId = null
      }

      this.messages = this.messages.map(message => {
        if (message.chat_id !== previousChatId) {
          return message
        }

        return {
          ...message,
          chat_id: nextChatId
        }
      })
    },

    addMessage(message: Message) {
      this.messages.push(message)
    },

    addAsrTranscriptMessage(payload: {
      chatId: string
      characterId?: string
      text: string
      generationId?: string
    }) {
      const content = payload.text.trim()
      if (!content || this.currentChatId !== payload.chatId) {
        return
      }
      if (payload.characterId && this.currentCharacterId !== payload.characterId) {
        return
      }

      this.messages.push({
        id: `asr_${payload.generationId || Date.now()}`,
        chat_id: payload.chatId,
        role: 'human',
        content,
        timestamp: new Date().toISOString(),
        generation_id: payload.generationId
      })
      this.streamingText = ''
      this.isStreaming = true
    },

    appendStreamingChunk(chunk: string) {
      this.streamingText += chunk
    },

    completeStreaming(fullReply: string, name?: string, avatar?: string, generationId?: string) {
      if (this.currentChatId && this.currentCharacterId) {
        this.messages.push({
          id: `msg_${Date.now()}`,
          chat_id: this.currentChatId,
          role: 'ai',
          content: fullReply,
          timestamp: new Date().toISOString(),
          name,
          avatar,
          generation_id: generationId
        })
      }
      this.streamingText = ''
      this.isStreaming = false
    },

    interruptStreaming(payload: {
      chatId: string
      characterId?: string
      partialReply?: string
      generationId?: string
      interruptReason?: string
      name?: string
      avatar?: string
    }) {
      if (this.currentChatId !== payload.chatId) {
        return
      }
      if (payload.characterId && this.currentCharacterId !== payload.characterId) {
        return
      }

      const content = (payload.partialReply || '').trim()
      if (content) {
        this.messages.push({
          id: `interrupted_${payload.generationId || Date.now()}`,
          chat_id: payload.chatId,
          role: 'ai',
          content,
          timestamp: new Date().toISOString(),
          name: payload.name,
          avatar: payload.avatar,
          generation_id: payload.generationId,
          interrupted: true,
          interrupt_reason: payload.interruptReason
        })
      }
      this.streamingText = ''
      this.isStreaming = false
    },

    clearMessages() {
      this.messages = []
      this.streamingText = ''
      this.isStreaming = false
    }
  }
})
