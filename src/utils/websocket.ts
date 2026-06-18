type WebSocketListener = (data?: unknown) => void

export class WebSocketManager {
  private ws: WebSocket | null = null
  private reconnectTimer: number | null = null
  private heartbeatTimer: number | null = null
  private messageQueue: unknown[] = []
  private listeners: Map<string, WebSocketListener[]> = new Map()
  private url: string

  constructor(url: string) {
    this.url = url
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => {
      console.log('WebSocket connected')
      this.emit('connected')
      this.startHeartbeat()
      this.flushMessageQueue()
    }

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        this.emit('message', message)
        this.handleMessage(message)
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    }

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      this.emit('error', error)
    }

    this.ws.onclose = () => {
      console.log('WebSocket closed')
      this.emit('disconnected')
      this.stopHeartbeat()
      this.scheduleReconnect()
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.stopHeartbeat()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  send(message: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      // 连接未就绪，加入队列
      this.messageQueue.push(message)
    }
  }

  sendIfOpen(message: unknown): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return false
    }

    this.ws.send(JSON.stringify(message))
    return true
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
    callbacks.forEach((callback) => callback(data))
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
        // 心跳响应
        break
      default:
        console.warn('Unknown message type:', message.type)
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = window.setInterval(() => {
      this.send({ type: 'ping' })
    }, 20000) // 20秒
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectTimer = window.setTimeout(() => {
      console.log('Reconnecting...')
      this.reconnectTimer = null
      this.connect()
    }, 3000) // 3秒后重连
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()
      this.send(message)
    }
  }
}
