import { defineStore } from 'pinia'
import type { WebSocketManager } from '@/utils/websocket'

export interface WebSocketState {
  connected: boolean
  reconnecting: boolean
  error: string | null
  wsManager: WebSocketManager | null
}

export const useWebSocketStore = defineStore('websocket', {
  state: (): WebSocketState => ({
    connected: false,
    reconnecting: false,
    error: null,
    wsManager: null
  }),

  actions: {
    send(message: unknown) {
      this.wsManager?.send(message)
    },

    sendIfOpen(message: unknown): boolean {
      return this.wsManager?.sendIfOpen(message) ?? false
    }
  }
})
