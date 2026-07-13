import { defineStore } from 'pinia'
import type { Chat } from '@/types/chat'
import { chatsApi } from '@/api/chats'
import { createTemporaryChatTitle } from '@/utils/chatTitle'
import { clearMarkdownRenderCache } from '@/utils/markdownRenderCache'

const deferredTitleTimers = new Map<string, number>()

export interface ChatsState {
  chatList: Chat[]
  currentChat: Chat | null
  loading: boolean
}

export const useChatsStore = defineStore('chats', {
  state: (): ChatsState => ({
    chatList: [],
    currentChat: null,
    loading: false
  }),

  actions: {
    async fetchChats(characterId?: string) {
      this.loading = true
      try {
        const response = await chatsApi.list(characterId ? { character_id: characterId } : {})
        this.chatList = response
        return response
      } catch (error) {
        console.error('获取聊天列表失败:', error)
        this.chatList = []
        return []
      } finally {
        this.loading = false
      }
    },

    async createChat(
      characterId: string,
      firstMessage: string,
      deferTitle = false,
      options?: { insertIntoList?: boolean }
    ) {
      try {
        const response = await chatsApi.create({
          character_id: characterId,
          first_message: firstMessage,
          defer_title: deferTitle
        })

        if (options?.insertIntoList !== false) {
          // 添加到列表
          this.chatList.unshift(response)
        }

        return response
      } catch (error) {
        console.error('创建聊天失败:', error)
        throw error
      }
    },

    insertDraftChat(characterId: string, firstMessage: string) {
      const now = new Date().toISOString()
      const draftChat: Chat = {
        id: `draft_${Date.now()}`,
        character_id: characterId,
        title: createTemporaryChatTitle(firstMessage),
        created_at: now,
        updated_at: now
      }

      this.chatList = [draftChat, ...this.chatList.filter(chat => chat.id !== draftChat.id)]
      return draftChat
    },

    replaceDraftChat(draftChatId: string, nextChat: Chat) {
      const index = this.chatList.findIndex(chat => chat.id === draftChatId)
      if (index >= 0) {
        this.chatList.splice(index, 1, nextChat)
        return
      }

      const existingIndex = this.chatList.findIndex(chat => chat.id === nextChat.id)
      if (existingIndex >= 0) {
        this.chatList.splice(existingIndex, 1, nextChat)
        return
      }

      this.chatList.unshift(nextChat)
    },

    removeDraftChat(draftChatId: string) {
      this.chatList = this.chatList.filter(chat => chat.id !== draftChatId)
    },

    mergeChat(nextChat: Chat) {
      const index = this.chatList.findIndex(chat => chat.id === nextChat.id)
      if (index >= 0) {
        this.chatList.splice(index, 1, nextChat)
        return
      }

      this.chatList.unshift(nextChat)
    },

    watchDeferredTitle(chatId: string, characterId: string, temporaryTitle: string) {
      const existingTimer = deferredTitleTimers.get(chatId)
      if (existingTimer) {
        clearTimeout(existingTimer)
      }

      let attempts = 0
      const maxAttempts = 20
      const poll = async () => {
        attempts += 1

        try {
          const chats = await chatsApi.list({ character_id: characterId })
          const matchedChat = chats.find(chat => chat.id === chatId)
          if (matchedChat) {
            this.mergeChat(matchedChat)

            if (matchedChat.title !== temporaryTitle) {
              deferredTitleTimers.delete(chatId)
              return
            }
          }
        } catch (error) {
          console.error('轮询聊天标题失败:', error)
        }

        if (attempts >= maxAttempts) {
          deferredTitleTimers.delete(chatId)
          return
        }

        const timer = window.setTimeout(() => {
          void poll()
        }, 500)
        deferredTitleTimers.set(chatId, timer)
      }

      void poll()
    },

    async deleteChat(chatId: string) {
      try {
        const timer = deferredTitleTimers.get(chatId)
        if (timer) {
          clearTimeout(timer)
          deferredTitleTimers.delete(chatId)
        }
        await chatsApi.delete(chatId)
        clearMarkdownRenderCache()

        // 从列表中移除
        this.chatList = this.chatList.filter((chat) => chat.id !== chatId)
      } catch (error) {
        console.error('删除聊天失败:', error)
        throw error
      }
    },

    async updateChatTitle(chatId: string, title: string) {
      try {
        const response = await chatsApi.update(chatId, { title })

        // 更新列表中的标题
        const chat = this.chatList.find((c) => c.id === chatId)
        if (chat) {
          chat.title = response.title
          chat.updated_at = response.updated_at
        }
      } catch (error) {
        console.error('更新聊天标题失败:', error)
        throw error
      }
    }
  }
})
