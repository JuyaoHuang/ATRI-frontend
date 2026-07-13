import { computed } from 'vue'

import { dataApi } from '@/api/data'
import { useChatStore } from '@/stores/chat'
import { useChatsStore } from '@/stores/chats'
import { clearMarkdownRenderCache } from '@/utils/markdownRenderCache'

export function useDataCleanup() {
  const chatStore = useChatStore()
  const chatsStore = useChatsStore()

  const currentChatId = computed(() => chatStore.currentChatId)

  async function deleteChatSession(chatId: string, characterId: string) {
    await chatsStore.deleteChat(chatId)

    if (chatStore.currentChatId === chatId) {
      const nextChat = chatsStore.chatList.find(chat => chat.character_id === characterId)
      if (nextChat) {
        chatStore.setCurrentChat(nextChat.id, characterId)
      } else {
        chatStore.prepareNewChat(characterId)
      }
    }
  }

  async function clearShortTermMemory(characterId: string, chatId: string) {
    const result = await dataApi.clearShortTermMemory(characterId, chatId)
    clearMarkdownRenderCache()
    return result
  }

  async function clearLongTermMemory(characterId: string) {
    const result = await dataApi.clearLongTermMemory(characterId)
    clearMarkdownRenderCache()
    return result
  }

  return {
    currentChatId,
    deleteChatSession,
    clearShortTermMemory,
    clearLongTermMemory
  }
}
