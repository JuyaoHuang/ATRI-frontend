import { afterEach, describe, expect, it } from 'vitest'

import type { InputImage } from '@/types/vision'
import { WebSocketSessionController } from '@/utils/websocketSessionController'

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 3
  static instances: FakeWebSocket[] = []

  readyState = FakeWebSocket.OPEN
  sent: string[] = []
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  readonly url: string

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  send(payload: string): void {
    this.sent.push(payload)
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED
  }
}

const ORIGINAL_WEBSOCKET = globalThis.WebSocket

afterEach(() => {
  globalThis.WebSocket = ORIGINAL_WEBSOCKET
  FakeWebSocket.instances = []
})

describe('WebSocketSessionController vision protocol', () => {
  it('attaches one optional image and preserves generation capture association', () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
    const controller = new WebSocketSessionController()
    const captureRequests: string[] = []
    controller.on('vision:capture-request', request => {
      if (request.generation_id) captureRequests.push(request.generation_id)
    })
    controller.connect('ws://localhost/ws')
    const socket = FakeWebSocket.instances[0]!
    const image: InputImage = {
      source: 'screen',
      media_type: 'image/jpeg',
      encoding: 'base64',
      data: 'opaque-image-data'
    }

    expect(controller.sendText({
      text: '请看屏幕',
      chatId: 'chat-a',
      characterId: 'atri',
      requestId: 'request-a',
      image
    })).toBe(true)
    const textMessage = JSON.parse(socket.sent[0]!) as {
      type: string
      data: { image?: InputImage }
    }
    expect(textMessage.type).toBe('input:text')
    expect(textMessage.data.image).toBeDefined()
    expect(textMessage.data.image?.data.length).toBe(image.data.length)

    socket.onmessage?.({
      data: JSON.stringify({
        type: 'control:vision:capture-request',
        data: {
          generation_id: 'gen-a',
          chat_id: 'chat-a',
          character_id: 'atri',
          source: 'screen'
        }
      })
    } as MessageEvent)
    expect(captureRequests).toEqual(['gen-a'])

    expect(controller.sendVisionCaptureResult({
      generationId: 'gen-a',
      status: 'captured',
      image
    })).toBe(true)
    const captureResult = JSON.parse(socket.sent[1]!) as {
      type: string
      data: { generation_id: string, status: string, image?: InputImage }
    }
    expect(captureResult.type).toBe('input:vision:capture-result')
    expect(captureResult.data.generation_id).toBe('gen-a')
    expect(captureResult.data.status).toBe('captured')
    expect(captureResult.data.image?.data.length).toBe(image.data.length)

    controller.disconnect()
  })

  it('drops an oversized text attachment and sends the text exactly once', () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
    const controller = new WebSocketSessionController()
    controller.connect('ws://localhost/ws')
    const socket = FakeWebSocket.instances[0]!
    const textOnlyMessage = {
      type: 'input:text',
      data: {
        text: '请只发送文字',
        chat_id: 'chat-a',
        character_id: 'atri',
        request_id: 'request-a'
      }
    }
    const textOnlyBytes = new TextEncoder().encode(JSON.stringify(textOnlyMessage)).byteLength

    expect(controller.sendText({
      text: '请只发送文字',
      chatId: 'chat-a',
      characterId: 'atri',
      requestId: 'request-a',
      image: {
        source: 'screen',
        media_type: 'image/jpeg',
        encoding: 'base64',
        data: 'x'.repeat(512)
      },
      maxMessageBytes: textOnlyBytes
    })).toBe(true)

    expect(socket.sent).toHaveLength(1)
    expect(JSON.parse(socket.sent[0]!)).toEqual(textOnlyMessage)
    controller.disconnect()
  })

  it('converts an oversized VAD capture result into a failed result', () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
    const controller = new WebSocketSessionController()
    controller.connect('ws://localhost/ws')
    const socket = FakeWebSocket.instances[0]!
    const failedMessage = {
      type: 'input:vision:capture-result',
      data: {
        generation_id: 'gen-a',
        status: 'failed'
      }
    }
    const failedBytes = new TextEncoder().encode(JSON.stringify(failedMessage)).byteLength

    expect(controller.sendVisionCaptureResult({
      generationId: 'gen-a',
      status: 'captured',
      image: {
        source: 'screen',
        media_type: 'image/jpeg',
        encoding: 'base64',
        data: 'x'.repeat(512)
      },
      maxMessageBytes: failedBytes
    })).toBe(true)

    expect(socket.sent).toHaveLength(1)
    expect(JSON.parse(socket.sent[0]!)).toEqual(failedMessage)
    controller.disconnect()
  })

  it('keeps generation failures separate from top-level protocol errors', () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
    const controller = new WebSocketSessionController()
    const generationErrors: string[] = []
    const protocolErrors: string[] = []
    controller.on('chat:generation-error', error => {
      if (error.generation_id) generationErrors.push(error.generation_id)
    })
    controller.on('chat:error', error => {
      if (error.message) protocolErrors.push(error.message)
    })
    controller.connect('ws://localhost/ws')
    const socket = FakeWebSocket.instances[0]!

    socket.onmessage?.({
      data: JSON.stringify({
        type: 'output:chat:error',
        data: {
          message: 'generation failed',
          chat_id: 'chat-a',
          character_id: 'atri',
          generation_id: 'gen-a'
        }
      })
    } as MessageEvent)
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'error',
        data: { message: 'invalid protocol' }
      })
    } as MessageEvent)

    expect(generationErrors).toEqual(['gen-a'])
    expect(protocolErrors).toEqual(['invalid protocol'])
    controller.disconnect()
  })
})
