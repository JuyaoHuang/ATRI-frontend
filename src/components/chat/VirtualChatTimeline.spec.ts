// @vitest-environment jsdom

import { createPinia } from 'pinia'
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  type App,
  type Ref
} from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import VirtualChatTimeline from '@/components/chat/VirtualChatTimeline.vue'
import type { ChatMessageItem } from '@/types/message'
import {
  clearMarkdownRenderCache,
  getMarkdownRenderCacheStats
} from '@/utils/markdownRenderCache'

interface TimelineHarness {
  app: App<Element>
  host: HTMLDivElement
  items: Ref<ChatMessageItem[]>
  streamingText: Ref<string>
  isStreaming: Ref<boolean>
  chatId: Ref<string | null>
}

const originalDescriptors = new Map<string, PropertyDescriptor | undefined>()

function rememberDescriptor(name: string): void {
  originalDescriptors.set(name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name))
}

function defineLayoutProperty(name: string, get: (element: HTMLElement) => number): void {
  rememberDescriptor(name)
  Object.defineProperty(HTMLElement.prototype, name, {
    configurable: true,
    get() {
      return get(this as HTMLElement)
    }
  })
}

function installLayoutMocks(): void {
  defineLayoutProperty('offsetWidth', element => (
    element.hasAttribute('data-chat-virtual-scroll') ? 640 : 600
  ))
  defineLayoutProperty('offsetHeight', element => {
    if (element.hasAttribute('data-chat-virtual-scroll')) {
      return 360
    }
    if (element.classList.contains('virtual-chat-row')) {
      const index = Number(element.dataset.index ?? 0)
      return 72 + (index % 5) * 24
    }
    return 0
  })
  defineLayoutProperty('clientHeight', element => (
    element.hasAttribute('data-chat-virtual-scroll') ? 360 : 0
  ))
  defineLayoutProperty('scrollHeight', element => {
    if (!element.hasAttribute('data-chat-virtual-scroll')) {
      return 0
    }
    const sizer = element.querySelector<HTMLElement>('.virtual-chat-sizer')
    return Number.parseFloat(sizer?.style.height ?? '0')
  })

  rememberDescriptor('scrollTo')
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value(this: HTMLElement, options: ScrollToOptions | number, y?: number) {
      const requestedTop = typeof options === 'number'
        ? (y ?? 0)
        : (options.top ?? this.scrollTop)
      const maxTop = Math.max(this.scrollHeight - this.clientHeight, 0)
      this.scrollTop = Math.max(0, Math.min(requestedTop, maxTop))
      this.dispatchEvent(new Event('scroll'))
    }
  })
}

function restoreLayoutMocks(): void {
  for (const [name, descriptor] of originalDescriptors) {
    if (descriptor) {
      Object.defineProperty(HTMLElement.prototype, name, descriptor)
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name]
    }
  }
  originalDescriptors.clear()
}

function message(index: number, prefix = 'message', chatId = 'chat-a'): ChatMessageItem {
  return {
    kind: 'message',
    id: `${prefix}-${index}`,
    chat_id: chatId,
    role: index % 2 === 0 ? 'human' : 'ai',
    content: `Message ${index}\n\n${'variable text '.repeat(index % 4)}$x_${index}=y$`,
    timestamp: new Date(2026, 6, 13, 0, 0, index % 60).toISOString(),
    name: 'ATRI'
  }
}

function mountTimeline(initialItems: ChatMessageItem[], options: {
  streamingText?: string
  isStreaming?: boolean
  variant?: 'default' | 'stage'
  chatId?: string | null
} = {}): TimelineHarness {
  const items = ref(initialItems)
  const streamingText = ref(options.streamingText ?? '')
  const isStreaming = ref(options.isStreaming ?? false)
  const chatId = ref<string | null>(options.chatId ?? 'chat-a')
  const host = document.createElement('div')
  document.body.append(host)

  const root = defineComponent({
    setup() {
      return () => h(VirtualChatTimeline, {
        items: items.value,
        streamingText: streamingText.value,
        isStreaming: isStreaming.value,
        chatId: chatId.value,
        emptyStateText: 'empty',
        variant: options.variant ?? 'default'
      })
    }
  })
  const app = createApp(root)
  app.use(createPinia())
  app.mount(host)

  return { app, host, items, streamingText, isStreaming, chatId }
}

async function settleTimeline(): Promise<void> {
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 20))
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 20))
  await nextTick()
}

function scrollContainer(harness: TimelineHarness): HTMLElement {
  const container = harness.host.querySelector<HTMLElement>('[data-chat-virtual-scroll]')
  if (!container) {
    throw new Error('Virtual scroll container was not mounted')
  }
  return container
}

describe('VirtualChatTimeline', () => {
  const mountedApps: TimelineHarness[] = []

  beforeEach(() => {
    installLayoutMocks()
    clearMarkdownRenderCache()
  })

  afterEach(() => {
    mountedApps.splice(0).forEach(harness => {
      harness.app.unmount()
      harness.host.remove()
    })
    restoreLayoutMocks()
  })

  function track(harness: TimelineHarness): TimelineHarness {
    mountedApps.push(harness)
    return harness
  }

  it('mounts only visible and overscan rows for 1000 mixed-height messages', async () => {
    const harness = track(mountTimeline(
      Array.from({ length: 1_000 }, (_, index) => message(index))
    ))
    await settleTimeline()

    const mountedRows = harness.host.querySelectorAll('.virtual-chat-row')
    const mountedMessages = harness.host.querySelectorAll('.message-item')
    const keys = [...mountedRows].map(row => row.getAttribute('data-chat-message-key'))

    expect(mountedRows.length).toBeGreaterThan(0)
    expect(mountedRows.length).toBeLessThan(30)
    expect(mountedMessages).toHaveLength(mountedRows.length)
    expect(keys.some(key => key?.endsWith(':message-999'))).toBe(true)
    expect(getMarkdownRenderCacheStats().entries).toBeLessThan(30)
  })

  it('does not pull an upward-scrolled user to the tail when a message appends', async () => {
    const harness = track(mountTimeline(
      Array.from({ length: 200 }, (_, index) => message(index))
    ))
    await settleTimeline()
    const container = scrollContainer(harness)

    container.scrollTop = 2_000
    container.dispatchEvent(new Event('scroll'))
    await settleTimeline()
    const previousTop = container.scrollTop
    const anchorKey = harness.host.querySelector('.virtual-chat-row')
      ?.getAttribute('data-chat-message-key')
    harness.items.value = [...harness.items.value, message(200)]
    await settleTimeline()
    const visibleKeys = [...harness.host.querySelectorAll('.virtual-chat-row')]
      .map(row => row.getAttribute('data-chat-message-key'))

    expect(Math.abs(container.scrollTop - previousTop)).toBeLessThan(150)
    expect(container.scrollHeight - container.clientHeight - container.scrollTop)
      .toBeGreaterThan(1_000)
    expect(visibleKeys).toContain(anchorKey)
  })

  it('continues following the tail when a message appends at the bottom', async () => {
    const harness = track(mountTimeline(
      Array.from({ length: 100 }, (_, index) => message(index))
    ))
    await settleTimeline()
    const container = scrollContainer(harness)

    container.scrollTop = Math.max(container.scrollHeight - container.clientHeight, 0)
    container.dispatchEvent(new Event('scroll'))
    const previousTop = container.scrollTop
    harness.items.value = [...harness.items.value, message(100)]
    await settleTimeline()

    expect(container.scrollTop).toBeGreaterThan(previousTop)
    expect(container.scrollHeight - container.clientHeight - container.scrollTop)
      .toBeLessThanOrEqual(32)
  })

  it('preserves a visible stable-key anchor when older messages are prepended', async () => {
    const harness = track(mountTimeline(
      Array.from({ length: 120 }, (_, index) => message(index))
    ))
    await settleTimeline()
    const container = scrollContainer(harness)

    container.scrollTop = 3_000
    container.dispatchEvent(new Event('scroll'))
    await settleTimeline()
    const anchorKey = harness.host.querySelector('.virtual-chat-row')
      ?.getAttribute('data-chat-message-key')
    expect(anchorKey).toBeTruthy()

    const older = Array.from({ length: 10 }, (_, index) => message(index, 'older'))
    harness.items.value = [...older, ...harness.items.value]
    await settleTimeline()
    const visibleKeys = [...harness.host.querySelectorAll('.virtual-chat-row')]
      .map(row => row.getAttribute('data-chat-message-key'))

    expect(visibleKeys).toContain(anchorKey)
  })

  it('waits for the new chat history before performing its initial bottom scroll', async () => {
    const harness = track(mountTimeline(
      Array.from({ length: 80 }, (_, index) => message(index))
    ))
    await settleTimeline()
    const container = scrollContainer(harness)

    container.scrollTop = 1_200
    container.dispatchEvent(new Event('scroll'))
    harness.chatId.value = 'chat-b'
    await settleTimeline()

    harness.items.value = Array.from(
      { length: 60 },
      (_, index) => message(index, 'message', 'chat-b')
    )
    await settleTimeline()
    const visibleKeys = [...harness.host.querySelectorAll('.virtual-chat-row')]
      .map(row => row.getAttribute('data-chat-message-key'))

    expect(container.scrollHeight - container.clientHeight - container.scrollTop)
      .toBeLessThanOrEqual(32)
    expect(visibleKeys.some(key => key?.endsWith(':message-59'))).toBe(true)
  })

  it('hides the empty state while a generation is pending its first chunk', async () => {
    const harness = track(mountTimeline([], { isStreaming: true }))
    await settleTimeline()

    expect(harness.host.querySelector('.empty-state')).toBeNull()
    expect(harness.host.querySelector('.virtual-chat-row')).toBeNull()
  })

  it('keeps the streaming tail escaped and outside Markdown rendering', async () => {
    const source = '**plain preview** $x$ <img src="https://example.invalid/a.png">'
    const harness = track(mountTimeline([], {
      streamingText: source,
      isStreaming: true,
      variant: 'stage'
    }))
    await settleTimeline()
    const streaming = harness.host.querySelector('.streaming-text')

    expect(streaming?.textContent).toBe(source)
    expect(streaming?.querySelector('strong, .katex, img')).toBeNull()
    expect(getMarkdownRenderCacheStats().entries).toBe(0)
    expect(harness.host.querySelector('.stage-chat-history')).not.toBeNull()
  })
})
