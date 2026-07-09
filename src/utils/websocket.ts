import type { ParsedWebSocketMessage } from '@/types/websocket'

type WebSocketEventMap = {
  connecting: undefined
  connected: undefined
  disconnected: { willReconnect: boolean }
  error: unknown
  message: ParsedWebSocketMessage
}

type WebSocketEventName = keyof WebSocketEventMap
type WebSocketListener<K extends WebSocketEventName> = (data: WebSocketEventMap[K]) => void

export class WebSocketManager {
  private ws: WebSocket | null = null
  private reconnectTimer: number | null = null
  private heartbeatTimer: number | null = null
  private listeners: Map<WebSocketEventName, Array<WebSocketListener<WebSocketEventName>>> = new Map()
  private shouldReconnect = true
  private destroyed = false
  private readonly url: string

  constructor(url: string) {
    this.url = url
  }

  getUrl(): string {
    return this.url
  }

  canSend(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  isOpenOrConnecting(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
      || this.ws?.readyState === WebSocket.CONNECTING
  }

  connect(): void {
    if (this.destroyed || this.isOpenOrConnecting()) {
      return
    }

    this.shouldReconnect = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.emit('connecting', undefined)
    const socket = new WebSocket(this.url)
    this.ws = socket

    socket.onopen = () => {
      if (this.ws !== socket || this.destroyed) {
        return
      }
      console.log('WebSocket connected')
      this.emit('connected', undefined)
      this.startHeartbeat()
    }

    socket.onmessage = (event) => {
      if (this.ws !== socket || this.destroyed) {
        return
      }
      try {
        const message = JSON.parse(event.data)
        this.emit('message', message as ParsedWebSocketMessage)
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    }

    socket.onerror = (error) => {
      if (this.ws !== socket || this.destroyed) {
        return
      }
      console.error('WebSocket error:', error)
      this.emit('error', error)
    }

    socket.onclose = () => {
      if (this.ws !== socket || this.destroyed) {
        return
      }
      console.log('WebSocket closed')
      this.ws = null
      const willReconnect = this.shouldReconnect
      this.stopHeartbeat()
      this.emit('disconnected', { willReconnect })
      if (willReconnect) {
        this.scheduleReconnect()
      }
    }
  }

  disconnect(): void {
    this.shouldReconnect = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.stopHeartbeat()
    if (this.ws) {
      const socket = this.ws
      this.ws = null
      socket.close()
    }
  }

  destroy(): void {
    this.destroyed = true
    this.disconnect()
    this.listeners.clear()
  }

  send(message: unknown): boolean {
    if (!this.canSend()) {
      return false
    }

    const socket = this.ws
    if (!socket) {
      return false
    }

    try {
      socket.send(JSON.stringify(message))
      return true
    } catch (error) {
      console.error('Failed to send WebSocket message:', error)
      return false
    }
  }

  on<K extends WebSocketEventName>(event: K, callback: WebSocketListener<K>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(callback as WebSocketListener<WebSocketEventName>)
  }

  off<K extends WebSocketEventName>(event: K, callback: WebSocketListener<K>): void {
    const callbacks = this.listeners.get(event)
    if (!callbacks) {
      return
    }

    const nextCallbacks = callbacks.filter(item => item !== callback)
    if (nextCallbacks.length === 0) {
      this.listeners.delete(event)
      return
    }

    this.listeners.set(event, nextCallbacks)
  }

  private emit<K extends WebSocketEventName>(event: K, data: WebSocketEventMap[K]): void {
    const callbacks = this.listeners.get(event) || []
    callbacks.forEach(callback => {
      (callback as WebSocketListener<K>)(data)
    })
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = window.setInterval(() => {
      this.send({ type: 'ping' })
    }, 20000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.destroyed || this.reconnectTimer) {
      return
    }

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      if (!this.shouldReconnect || this.destroyed) {
        return
      }
      console.log('Reconnecting...')
      this.connect()
    }, 3000)
  }
}
