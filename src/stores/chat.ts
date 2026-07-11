import { defineStore } from 'pinia'
import type { Message } from '@/types/message'

export interface ActiveStream {
  chatId: string
  characterId: string
  generationId: string | null
  status: 'pending' | 'streaming' | 'interrupted'
}

type StreamApplyResult = 'ignored' | 'hidden' | 'visible'

export interface ChatState {
  currentChatId: string | null
  currentCharacterId: string | null
  messages: Message[]
  streamingText: string
  activeStream: ActiveStream | null
  pendingInterruptedStream: ActiveStream | null
  skipNextHistoryLoadChatId: string | null
  pendingDeferredTitleChatId: string | null
  draftChatId: string | null
  submissionPending: boolean
}

export const useChatStore = defineStore('chat', {
  state: (): ChatState => ({
    currentChatId: null,
    currentCharacterId: null,
    messages: [],
    streamingText: '',
    activeStream: null,
    pendingInterruptedStream: null,
    skipNextHistoryLoadChatId: null,
    pendingDeferredTitleChatId: null,
    draftChatId: null,
    submissionPending: false
  }),

  getters: {
    connectionBusy: state => state.activeStream !== null || state.submissionPending,
    isCurrentChatStreaming: state => state.activeStream?.chatId === state.currentChatId
  },

  actions: {
    reserveSubmission() {
      if (this.submissionPending || this.activeStream) {
        return false
      }
      this.submissionPending = true
      return true
    },

    releaseSubmission() {
      this.submissionPending = false
    },

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

    beginStreaming(payload: {
      chatId: string
      characterId: string
      generationId?: string | null
    }) {
      this.activeStream = {
        chatId: payload.chatId,
        characterId: payload.characterId,
        generationId: payload.generationId || null,
        status: 'pending'
      }
      this.streamingText = ''
    },

    matchesActiveStream(payload: {
      chatId?: string
      characterId?: string
      generationId?: string
    }, options: {
      requireCharacter?: boolean
      bindGeneration?: boolean
      allowMissingGenerationAfterBind?: boolean
    } = {}) {
      const stream = this.activeStream
      if (!stream || !payload.chatId || payload.chatId !== stream.chatId) {
        return false
      }

      const requireCharacter = options.requireCharacter ?? true
      if (requireCharacter && payload.characterId !== stream.characterId) {
        return false
      }
      if (payload.characterId && payload.characterId !== stream.characterId) {
        return false
      }

      if (payload.generationId) {
        if (stream.generationId && stream.generationId !== payload.generationId) {
          return false
        }
        if (!stream.generationId && options.bindGeneration !== false) {
          stream.generationId = payload.generationId
        }
        return true
      }

      if (stream.generationId && options.allowMissingGenerationAfterBind !== true) {
        return false
      }

      return true
    },

    matchesPendingInterruptedStream(payload: {
      chatId?: string
      characterId?: string
      generationId?: string
    }) {
      const stream = this.pendingInterruptedStream
      if (!stream || !payload.chatId || payload.chatId !== stream.chatId) {
        return false
      }
      if (payload.characterId !== stream.characterId) {
        return false
      }
      if (stream.generationId && payload.generationId !== stream.generationId) {
        return false
      }
      return true
    },

    addAsrTranscriptMessage(payload: {
      chatId: string
      characterId?: string
      text: string
      generationId?: string
    }) {
      const content = payload.text.trim()
      if (!content || !payload.characterId) {
        return false
      }

      this.beginStreaming({
        chatId: payload.chatId,
        characterId: payload.characterId,
        generationId: payload.generationId
      })

      const visible = this.currentChatId === payload.chatId
        && this.currentCharacterId === payload.characterId
      if (!visible) {
        return false
      }

      this.messages.push({
        id: `asr_${payload.generationId || Date.now()}`,
        chat_id: payload.chatId,
        role: 'human',
        content,
        timestamp: new Date().toISOString(),
        generation_id: payload.generationId
      })
      return true
    },

    appendStreamingChunk(payload: {
      chatId?: string
      characterId?: string
      generationId?: string
      chunk: string
    }): StreamApplyResult {
      if (!this.matchesActiveStream(payload)) {
        return 'ignored'
      }

      const stream = this.activeStream
      if (!stream || stream.status === 'interrupted') {
        return 'ignored'
      }

      stream.status = 'streaming'
      this.streamingText += payload.chunk

      return this.currentChatId === payload.chatId ? 'visible' : 'hidden'
    },

    completeStreaming(payload: {
      chatId?: string
      characterId?: string
      fullReply: string
      name?: string
      avatar?: string
      generationId?: string
    }): StreamApplyResult {
      if (!this.matchesActiveStream(payload) || this.activeStream?.status === 'interrupted') {
        return 'ignored'
      }

      const visible = this.currentChatId === payload.chatId
        && this.currentCharacterId === payload.characterId
      if (visible && payload.chatId) {
        this.messages.push({
          id: `msg_${Date.now()}`,
          chat_id: payload.chatId,
          role: 'ai',
          content: payload.fullReply,
          timestamp: new Date().toISOString(),
          name: payload.name,
          avatar: payload.avatar,
          generation_id: payload.generationId
        })
      }
      this.streamingText = ''
      this.activeStream = null
      return visible ? 'visible' : 'hidden'
    },

    markActiveStreamInterrupted(payload: {
      chatId?: string
      characterId?: string
      generationId?: string
    }): StreamApplyResult {
      if (!this.matchesActiveStream(payload, { requireCharacter: false })) {
        return 'ignored'
      }

      if (this.activeStream) {
        this.activeStream.status = 'interrupted'
        this.pendingInterruptedStream = { ...this.activeStream }
      }
      const visible = this.currentChatId === payload.chatId
      this.activeStream = null
      this.streamingText = ''
      return visible ? 'visible' : 'hidden'
    },

    interruptStreaming(payload: {
      chatId?: string
      characterId?: string
      partialReply?: string
      generationId?: string
      interruptReason?: string
      name?: string
      avatar?: string
    }): StreamApplyResult {
      const matchesActive = this.matchesActiveStream(payload)
      const matchesPending = matchesActive ? false : this.matchesPendingInterruptedStream(payload)
      if (!matchesActive && !matchesPending) {
        return 'ignored'
      }

      const visible = this.currentChatId === payload.chatId
        && this.currentCharacterId === payload.characterId
      const content = (payload.partialReply || '').trim()
      if (visible && payload.chatId && content) {
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
      if (matchesActive) {
        this.activeStream = null
      }
      if (matchesPending) {
        this.pendingInterruptedStream = null
      }
      return visible ? 'visible' : 'hidden'
    },

    failActiveStream(payload: {
      chatId?: string
      generationId?: string
    }) {
      if (!this.matchesActiveStream(
        payload,
        {
          requireCharacter: false,
          bindGeneration: false,
          allowMissingGenerationAfterBind: true
        }
      )) {
        return false
      }

      this.activeStream = null
      this.streamingText = ''
      return true
    },

    clearActiveStream() {
      this.activeStream = null
      this.streamingText = ''
    },

    clearMessages() {
      this.messages = []
    }
  }
})
