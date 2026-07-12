export interface Message {
  id: string
  chat_id: string
  role: 'human' | 'ai'
  content: string
  timestamp: string
  generation_id?: string
  interrupted?: boolean
  interrupt_reason?: string
  name?: string      // AI 消息的角色名称或 character_id
  avatar?: string    // 头像 URL 或文件名
}

export interface ChatMessageItem extends Message {
  kind: 'message'
}

export interface ChatNoticeItem {
  kind: 'notice'
  id: string
  chat_id: string
  generation_id: string
  level: 'error'
  content: string
  timestamp: string
}

export type ChatTimelineItem = ChatMessageItem | ChatNoticeItem
