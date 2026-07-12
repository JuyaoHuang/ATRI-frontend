import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'

import ChatErrorBubble from '@/components/chat/ChatErrorBubble.vue'
import type { ChatNoticeItem } from '@/types/message'

const NOTICE: ChatNoticeItem = {
  kind: 'notice',
  id: 'notice-gen-a',
  chat_id: 'chat-a',
  generation_id: 'gen-a',
  level: 'error',
  content: '本轮回复生成失败，请稍后重试。',
  timestamp: '2026-07-11T12:30:00.000Z'
}

describe('ChatErrorBubble', () => {
  it('renders an accessible non-author error bubble without AI controls', async () => {
    const app = createSSRApp({
      render: () => h(ChatErrorBubble, { notice: NOTICE, variant: 'default' })
    })

    const html = await renderToString(app)

    expect(html).toContain('role="alert"')
    expect(html).toContain('aria-atomic="true"')
    expect(html).toContain('回复生成失败')
    expect(html).toContain(NOTICE.content)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('tabindex')
  })

  it('supports the stage layout variant', async () => {
    const app = createSSRApp({
      render: () => h(ChatErrorBubble, { notice: NOTICE, variant: 'stage' })
    })

    const html = await renderToString(app)

    expect(html).toContain('stage-chat-error-row')
    expect(html).toContain('stage-chat-error-bubble')
  })
})
