import {
  ConnectionStatus,
  type ParsedWebSocketMessage,
  type WebSocketSessionEventMap
} from '@/types/websocket'
import { WebSocketManager } from '@/utils/websocket'

interface SendTextPayload {
  text: string
  chatId: string
  characterId: string
  clientContext?: unknown
}

interface SendAudioChunkPayload {
  chatId: string
  characterId: string
  audio: number[]
  seq: number
}

interface SendAudioEndPayload {
  chatId: string
  characterId: string
}

type SessionEventName = keyof WebSocketSessionEventMap
type SessionEventListener<K extends SessionEventName> = (payload: WebSocketSessionEventMap[K]) => void
type AnySessionEventListener = (payload: WebSocketSessionEventMap[SessionEventName]) => void

export class WebSocketSessionController {
  private listeners = new Map<SessionEventName, Set<AnySessionEventListener>>()
  private manager: WebSocketManager | null = null
  private sessionEpoch = 0
  private url: string | null = null
  private status: ConnectionStatus = ConnectionStatus.IDLE
  private error: string | null = null

  getStatus() {
    return this.status
  }

  getError() {
    return this.error
  }

  canSend() {
    return this.manager?.canSend() ?? false
  }

  connect(url: string) {
    if (this.url === url) {
      if (this.status === ConnectionStatus.CONNECTED || this.status === ConnectionStatus.CONNECTING) {
        return
      }

      if (this.status === ConnectionStatus.RECONNECTING && this.manager) {
        this.manager.connect()
        return
      }
    }

    if (this.url !== url) {
      this.teardownCurrentSession()
    }

    if (!this.manager) {
      this.url = url
      this.sessionEpoch += 1
      const manager = new WebSocketManager(url)
      this.manager = manager
      this.bindManager(manager, this.sessionEpoch)
    }

    this.setStatus(ConnectionStatus.CONNECTING, null)
    this.manager.connect()
  }

  disconnect() {
    this.teardownCurrentSession()
    this.setStatus(ConnectionStatus.CLOSED, null)
  }

  sendText(payload: SendTextPayload) {
    return this.sendRaw({
      type: 'input:text',
      data: {
        text: payload.text,
        chat_id: payload.chatId,
        character_id: payload.characterId,
        client_context: payload.clientContext
      }
    })
  }

  sendAudioChunk(payload: SendAudioChunkPayload) {
    return this.sendRaw({
      type: 'input:audio:chunk',
      data: {
        chat_id: payload.chatId,
        character_id: payload.characterId,
        audio: payload.audio,
        seq: payload.seq
      }
    })
  }

  sendAudioEnd(payload: SendAudioEndPayload) {
    return this.sendRaw({
      type: 'input:audio:end',
      data: {
        chat_id: payload.chatId,
        character_id: payload.characterId
      }
    })
  }

  on<K extends SessionEventName>(event: K, listener: SessionEventListener<K>) {
    const listeners = this.listeners.get(event) || new Set<AnySessionEventListener>()
    listeners.add(listener as AnySessionEventListener)
    this.listeners.set(event, listeners)
  }

  off<K extends SessionEventName>(event: K, listener: SessionEventListener<K>) {
    const listeners = this.listeners.get(event)
    if (!listeners) {
      return
    }

    listeners.delete(listener as AnySessionEventListener)
    if (listeners.size === 0) {
      this.listeners.delete(event)
    }
  }

  private bindManager(manager: WebSocketManager, epoch: number) {
    manager.on('connecting', () => {
      if (!this.isCurrentSession(manager, epoch)) {
        return
      }
      this.setStatus(ConnectionStatus.CONNECTING, null)
    })

    manager.on('connected', () => {
      if (!this.isCurrentSession(manager, epoch)) {
        return
      }
      this.setStatus(ConnectionStatus.CONNECTED, null)
    })

    manager.on('disconnected', (payload?: unknown) => {
      if (!this.isCurrentSession(manager, epoch)) {
        return
      }

      const willReconnect = Boolean(
        payload
        && typeof payload === 'object'
        && 'willReconnect' in payload
        && payload.willReconnect
      )

      if (willReconnect) {
        this.setStatus(ConnectionStatus.RECONNECTING, this.error)
        return
      }

      this.setStatus(ConnectionStatus.CLOSED, this.error)
    })

    manager.on('error', (error) => {
      if (!this.isCurrentSession(manager, epoch)) {
        return
      }
      this.error = error instanceof Error ? error.message : String(error)
      this.emit('connection:status', {
        status: this.status,
        error: this.error
      })
    })

    manager.on('message', (payload) => {
      if (!this.isCurrentSession(manager, epoch)) {
        return
      }
      this.dispatchProtocolMessage(payload as ParsedWebSocketMessage)
    })
  }

  private isCurrentSession(manager: WebSocketManager, epoch: number) {
    return this.manager === manager && this.sessionEpoch === epoch
  }

  private dispatchProtocolMessage(message: ParsedWebSocketMessage) {
    switch (message.type) {
      case 'output:chat:chunk':
        this.emit('chat:chunk', message.data as WebSocketSessionEventMap['chat:chunk'])
        break
      case 'output:chat:complete':
        this.emit('chat:complete', message.data as WebSocketSessionEventMap['chat:complete'])
        break
      case 'output:chat:interrupted':
        this.emit('chat:interrupted', message.data as WebSocketSessionEventMap['chat:interrupted'])
        break
      case 'output:audio:segment':
        this.emit('audio:segment', message.data as WebSocketSessionEventMap['audio:segment'])
        break
      case 'output:audio:complete':
        this.emit('audio:complete', message.data as WebSocketSessionEventMap['audio:complete'])
        break
      case 'output:audio:error':
        this.emit('audio:error', message.data as WebSocketSessionEventMap['audio:error'])
        break
      case 'output:asr:transcript':
        this.emit('asr:transcript', message.data as WebSocketSessionEventMap['asr:transcript'])
        break
      case 'control:listen-state':
        this.emit('vad:listen-state', message.data as WebSocketSessionEventMap['vad:listen-state'])
        break
      case 'control:interrupt':
        this.emit('vad:interrupt', message.data as WebSocketSessionEventMap['vad:interrupt'])
        break
      case 'error':
        this.emit('chat:error', message.data as WebSocketSessionEventMap['chat:error'])
        break
      case 'pong':
        break
      default:
        console.warn('Unknown message type:', message.type)
    }
  }

  private sendRaw(message: unknown) {
    return this.manager?.send(message) ?? false
  }

  private teardownCurrentSession() {
    const manager = this.manager
    this.manager = null
    this.url = null
    if (manager) {
      manager.destroy()
    }
  }

  private setStatus(status: ConnectionStatus, error: string | null) {
    this.status = status
    this.error = error
    this.emit('connection:status', { status, error })
  }

  private emit<K extends SessionEventName>(event: K, payload: WebSocketSessionEventMap[K]) {
    const listeners = this.listeners.get(event)
    if (!listeners) {
      return
    }

    listeners.forEach(listener => {
      (listener as SessionEventListener<K>)(payload)
    })
  }
}

export const websocketSessionController = new WebSocketSessionController()
