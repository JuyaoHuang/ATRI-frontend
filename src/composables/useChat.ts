import { computed } from 'vue'
import { toast } from 'vue-sonner'

import { chatsApi } from '@/api/chats'
import { useAudioPlayer } from '@/composables/useAudioPlayer'
import { useVision } from '@/composables/useVision'
import { useCharactersStore } from '@/stores/characters'
import { useChatStore } from '@/stores/chat'
import { useChatsStore } from '@/stores/chats'
import { useLive2dStore } from '@/stores/live2d'
import { useWebSocket } from '@/composables/useWebSocket'
import { extractLive2dExpression } from '@/utils/live2dExpression'

interface ClientDatetimeContext {
  iso: string
  local: string
  time_zone?: string
  utc_offset: string
}

interface ClientContext {
  datetime: ClientDatetimeContext
}

function formatUtcOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absoluteMinutes = Math.abs(offsetMinutes)
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, '0')
  const minutes = String(absoluteMinutes % 60).padStart(2, '0')

  return `UTC${sign}${hours}:${minutes}`
}

function buildClientContext(date: Date): ClientContext {
  return {
    datetime: {
      iso: date.toISOString(),
      local: date.toLocaleString(),
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      utc_offset: formatUtcOffset(date)
    }
  }
}

export function useChat() {
  const chatStore = useChatStore()
  const chatsStore = useChatsStore()
  const { canSend, sendText } = useWebSocket()
  const charactersStore = useCharactersStore()
  const live2dStore = useLive2dStore()
  const audioPlayer = useAudioPlayer()
  const { captureForSubmission } = useVision()

  const sendMessage = async (text: string) => {
    if (!text.trim()) return false
    if (!chatStore.reserveSubmission()) return false

    try {
      if (!canSend()) {
        toast.error('WebSocket is not connected')
        return false
      }

      const messageText = text.trim()
      const sentAt = new Date()
      const sentAtIso = sentAt.toISOString()
      const clientContext = buildClientContext(sentAt)
      const currentCharacterId = charactersStore.activeCharacterId || chatStore.currentCharacterId
      let currentChatId = chatStore.currentChatId
      let deferredTitleSeed: string | null = null

      if (!currentCharacterId) {
        console.error('No character selected')
        toast.error('当前没有可用角色，无法发送消息')
        return false
      }

      if (!currentChatId) {
        const draftChat = chatsStore.insertDraftChat(currentCharacterId, messageText)
        currentChatId = draftChat.id
        chatStore.beginDraftChat(draftChat.id, currentCharacterId)

        try {
          const newChat = await chatsStore.createChat(currentCharacterId, messageText, true, {
            insertIntoList: false
          })
          chatsStore.replaceDraftChat(draftChat.id, newChat)
          chatStore.markSkipNextHistoryLoad(newChat.id)
          chatStore.replaceCurrentChatId(draftChat.id, newChat.id)
          chatStore.setCurrentCharacter(currentCharacterId)
          deferredTitleSeed = draftChat.title
          currentChatId = newChat.id
        } catch (error) {
          console.error('自动创建聊天失败:', error)
          chatsStore.removeDraftChat(draftChat.id)
          chatStore.prepareNewChat(currentCharacterId)
          toast.error('自动创建聊天失败，请检查后端服务是否已重启')
          return false
        }
      }

      if (!canSend()) {
        toast.error('WebSocket is not connected')
        return false
      }

      const image = await captureForSubmission()
      audioPlayer.stopBecauseContextChanged()
      chatStore.beginStreaming({
        chatId: currentChatId,
        characterId: currentCharacterId
      })

      const sent = sendText({
        text: messageText,
        chatId: currentChatId,
        characterId: currentCharacterId,
        clientContext,
        image
      })

      if (!sent) {
        toast.error('WebSocket is not connected')
        chatStore.clearActiveStream()
        return false
      }

      if (deferredTitleSeed) {
        chatStore.markPendingDeferredTitle(currentChatId)
        chatsStore.watchDeferredTitle(currentChatId, currentCharacterId, deferredTitleSeed)
      }

      chatStore.addMessage({
        id: `msg_${Date.now()}`,
        chat_id: currentChatId,
        role: 'human',
        content: messageText,
        timestamp: sentAtIso
      })
      return true
    } finally {
      chatStore.releaseSubmission()
    }
  }

  const loadHistory = async (chatId: string) => {
    try {
      const response = await chatsApi.get({ chat_id: chatId })
      if (chatStore.currentChatId !== chatId) {
        return
      }

      let lastAssistantExpression: string | null = null
      chatStore.messages = response.messages.map((msg, index) => {
        // 如果是 AI 消息且有 name，从 characters store 获取 avatar
        let avatar: string | undefined
        let content = msg.content
        if (msg.role === 'ai' && msg.name) {
          const character = charactersStore.characters.find((c) => c.id === msg.name)
          avatar = character?.avatarUrl || character?.avatar
          const parsed = extractLive2dExpression(msg.content)
          content = parsed.content
          if (parsed.expression) {
            lastAssistantExpression = parsed.expression
          }
        }

        return {
          id: `msg_${index}`,
          chat_id: chatId,
          role: msg.role,
          content,
          timestamp: msg.timestamp,
          name: msg.name,
          avatar,
          generation_id: msg.generation_id,
          interrupted: msg.interrupted,
          interrupt_reason: msg.interrupt_reason
        }
      })

      live2dStore.requestExpression(lastAssistantExpression)
    } catch (error) {
      console.error('加载聊天历史失败:', error)
    }
  }

  return {
    messages: computed(() => chatStore.messages),
    isStreaming: computed(() => chatStore.isCurrentChatStreaming),
    connectionBusy: computed(() => chatStore.connectionBusy),
    streamingText: computed(() => chatStore.isCurrentChatStreaming ? chatStore.streamingText : ''),
    sendMessage,
    loadHistory
  }
}
