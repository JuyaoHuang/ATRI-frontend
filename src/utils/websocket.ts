type WebSocketListener = (data?: unknown) => void

export class WebSocketManager {
  private ws: WebSocket | null = null
  private reconnectTimer: number | null = null
  private heartbeatTimer: number | null = null
  private listeners: Map<string, WebSocketListener[]> = new Map()
  private shouldReconnect = true
  private destroyed = false
  private readonly url: string

  constructor(url: string) {
    this.url = url
  }

  getUrl(): string {
    return this.url
  }

  isOpenOrConnecting(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
      || this.ws?.readyState === WebSocket.CONNECTING
  }

  isReconnectEnabled(): boolean {
    return this.shouldReconnect && !this.destroyed
  }

  connect(): void {
    if (this.destroyed || this.isOpenOrConnecting()) {
      return
    }

    this.shouldReconnect = true
    const socket = new WebSocket(this.url)
    this.ws = socket

    socket.onopen = () => {
      if (this.ws !== socket || this.destroyed) {
        return
      }
      console.log('WebSocket connected')
      this.emit('connected')
      this.startHeartbeat()
    }

    socket.onmessage = (event) => {
      if (this.ws !== socket || this.destroyed) {
        return
      }
      try {
        const message = JSON.parse(event.data)
        this.emit('message', message)
        this.handleMessage(message)
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
      this.emit('disconnected')
      this.stopHeartbeat()
      if (this.shouldReconnect) {
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
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return false
    }

    this.ws.send(JSON.stringify(message))
    return true
  }

  sendIfOpen(message: unknown): boolean {
    return this.send(message)
  }

  on(event: string, callback: WebSocketListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(callback)
  }

  off(event: string, callback: WebSocketListener): void {
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

  private emit(event: string, data?: unknown): void {
    const callbacks = this.listeners.get(event) || []
    callbacks.forEach(callback => callback(data))
  }

  private handleMessage(message: { type: string; data?: unknown }): void {
    switch (message.type) {
      case 'output:chat:chunk':
        this.emit('chat:chunk', message.data)
        break
      case 'output:chat:complete':
        this.emit('chat:complete', message.data)
        break
      case 'output:chat:interrupted':
        this.emit('chat:interrupted', message.data)
        break
      case 'output:asr:transcript':
        this.emit('asr:transcript', message.data)
        break
      case 'control:listen-state':
        this.emit('vad:listen-state', message.data)
        break
      case 'control:interrupt':
        this.emit('vad:interrupt', message.data)
        break
      case 'error':
        this.emit('chat:error', message.data)
        break
      case 'pong':
        break
      default:
        console.warn('Unknown message type:', message.type)
    }
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
