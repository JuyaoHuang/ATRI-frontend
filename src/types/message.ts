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
