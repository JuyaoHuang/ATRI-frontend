// @vitest-environment jsdom

import { createPinia } from 'pinia'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { beforeEach, describe, expect, it } from 'vitest'

import MessageItem from '@/components/chat/MessageItem.vue'
import type { Message } from '@/types/message'
import { clearMarkdownRenderCache } from '@/utils/markdownRenderCache'

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
      interrupted: true,
      interrupt_reason: 'vad'
    })

    expect(html).toContain('ATRI')
    expect(html).toContain('Interrupted')
    expect(html).toContain('message-time')
  })
})
