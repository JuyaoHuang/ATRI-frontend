import { defineStore } from 'pinia'
import { ConnectionStatus } from '@/types/websocket'

export interface WebSocketState {
  connectionStatus: ConnectionStatus
  error: string | null
}

export const useWebSocketStore = defineStore('websocket', {
  state: (): WebSocketState => ({
    connectionStatus: ConnectionStatus.IDLE,
    error: null
  }),

  getters: {
    connected: state => state.connectionStatus === ConnectionStatus.CONNECTED,
    reconnecting: state => state.connectionStatus === ConnectionStatus.RECONNECTING
  },

  actions: {
    setConnectionStatus(status: ConnectionStatus) {
      this.connectionStatus = status
    },

    setError(error: string | null) {
      this.error = error
    }
  }
})
