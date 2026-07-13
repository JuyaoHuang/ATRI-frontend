// @vitest-environment jsdom

import { createPinia } from 'pinia'
import { createApp, createSSRApp, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import MessageItem from '@/components/chat/MessageItem.vue'
import { useTTSStore } from '@/stores/tts'
import type { Message } from '@/types/message'
import { clearMarkdownRenderCache } from '@/utils/markdownRenderCache'

const audioPlayerMock = vi.hoisted(() => ({
  enqueueText: vi.fn(),
  isBusy: { value: false }
}))

vi.mock('@/composables/useAudioPlayer', () => ({
  useAudioPlayer: () => audioPlayerMock
}))

const BASE_MESSAGE: Message = {
  id: 'message-a',
  chat_id: 'chat-a',
  role: 'ai',
  content: '**answer** with $a_x=b$',
  timestamp: '2026-07-13T00:00:00.000Z',
  name: 'ATRI'
}

async function renderMessage(
  message: Message,
  variant: 'default' | 'stage' = 'default'
): Promise<string> {
  const app = createSSRApp({
    render: () => h(MessageItem, { message, variant })
  })
  app.use(createPinia())
  return renderToString(app)
}

function markdownInnerHtml(renderedComponent: string): string | undefined {
  const container = document.createElement('div')
  container.innerHTML = renderedComponent
  return container.querySelector('.markdown-content__rendered')?.innerHTML
}

describe('MessageItem Markdown rendering', () => {
  beforeEach(() => {
    clearMarkdownRenderCache()
    audioPlayerMock.enqueueText.mockClear()
  })

  it('renders static AI and human messages with identical Markdown semantics', async () => {
    const aiHtml = await renderMessage(BASE_MESSAGE)
    const humanHtml = await renderMessage({
      ...BASE_MESSAGE,
      id: 'message-human',
      role: 'human'
    })

    expect(aiHtml).toContain('<strong>answer</strong>')
    expect(humanHtml).toContain('<strong>answer</strong>')
    expect(aiHtml).toContain('class="katex"')
    expect(humanHtml).toContain('class="katex"')
  })

  it('uses equivalent rendered content in default and Stage variants', async () => {
    const defaultHtml = await renderMessage(BASE_MESSAGE, 'default')
    const stageHtml = await renderMessage(BASE_MESSAGE, 'stage')

    expect(markdownInnerHtml(defaultHtml)).toBe(markdownInnerHtml(stageHtml))
    expect(stageHtml).toContain('stage-message')
  })

  it('preserves interrupted status, name and timestamp presentation', async () => {
    const html = await renderMessage({
      ...BASE_MESSAGE,
      avatar: 'atri.png',
      interrupted: true,
      interrupt_reason: 'vad'
    })

    expect(html).toContain('ATRI')
    expect(html).toContain('Interrupted')
    expect(html).toContain('message-time')
    expect(html).toContain('src="/avatars/atri.png"')
    expect(html).toContain('alt="ATRI"')
  })

  it('passes the original Markdown source to manual TTS playback', async () => {
    const pinia = createPinia()
    const ttsStore = useTTSStore(pinia)
    ttsStore.config.enabled = true
    const host = document.createElement('div')
    const message = {
      ...BASE_MESSAGE,
      generation_id: 'generation-a'
    }
    const app = createApp({
      render: () => h(MessageItem, { message })
    })
    app.use(pinia)
    app.mount(host)

    try {
      await nextTick()
      host.querySelector<HTMLButtonElement>('.message-speech-button')?.click()

      expect(audioPlayerMock.enqueueText).toHaveBeenCalledWith(
        BASE_MESSAGE.content,
        { source: 'manual', generationId: 'generation-a' }
      )
    } finally {
      app.unmount()
    }
  })
})
