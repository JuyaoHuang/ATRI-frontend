import { useVirtualizer, type VirtualItem } from '@tanstack/vue-virtual'
import type { Ref } from 'vue'
import {
  computed,
  nextTick,
  onScopeDispose,
  readonly,
  shallowRef,
  watch
} from 'vue'

import type { ChatTimelineItem } from '@/types/message'

const DEFAULT_ESTIMATED_ROW_SIZE = 112
const DEFAULT_OVERSCAN = 6
const DEFAULT_TAIL_THRESHOLD = 32

export interface TimelineItemVirtualRow {
  kind: 'timeline-item'
  key: string
  item: ChatTimelineItem
}

export interface StreamingVirtualRow {
  kind: 'streaming'
  key: string
  text: string
}

export type VirtualChatTimelineRow = TimelineItemVirtualRow | StreamingVirtualRow

export interface VisibleVirtualChatRow {
  row: VirtualChatTimelineRow
  virtualItem: VirtualItem
}

export interface BuildVirtualChatRowsOptions {
  timelineItems: readonly ChatTimelineItem[]
  streamingText: string
  isStreaming: boolean
  chatId: string | null
}

export interface VirtualChatTimelineOptions {
  containerRef: Ref<HTMLElement | null>
  timelineItems: Ref<readonly ChatTimelineItem[]>
  streamingText: Ref<string>
  isStreaming: Ref<boolean>
  chatId: Ref<string | null>
  estimatedRowSize?: number
  overscan?: number
  tailThreshold?: number
}

function timelineItemBaseKey(item: ChatTimelineItem): string {
  return `timeline:${item.chat_id}:${item.kind}:${item.id}`
}

export function buildVirtualChatRows({
  timelineItems,
  streamingText,
  isStreaming,
  chatId
}: BuildVirtualChatRowsOptions): VirtualChatTimelineRow[] {
  const baseKeys = timelineItems.map(timelineItemBaseKey)
  const stableKeys = new Array<string>(baseKeys.length)
  const occurrencesFromTail = new Map<string, number>()

  for (let index = baseKeys.length - 1; index >= 0; index -= 1) {
    const baseKey = baseKeys[index]
    if (!baseKey) {
      continue
    }

    const occurrence = (occurrencesFromTail.get(baseKey) ?? 0) + 1
    occurrencesFromTail.set(baseKey, occurrence)
    stableKeys[index] = occurrence === 1
      ? baseKey
      : `${baseKey}:duplicate:${occurrence}`
  }

  const rows: VirtualChatTimelineRow[] = timelineItems.map((item, index) => ({
    kind: 'timeline-item',
    key: stableKeys[index] ?? `${timelineItemBaseKey(item)}:fallback`,
    item
  }))

  if (isStreaming && streamingText.length > 0) {
    rows.push({
      kind: 'streaming',
      key: `streaming:${chatId ?? 'new-chat'}`,
      text: streamingText
    })
  }

  return rows
}

export function useVirtualChatTimeline({
  containerRef,
  timelineItems,
  streamingText,
  isStreaming,
  chatId,
  estimatedRowSize = DEFAULT_ESTIMATED_ROW_SIZE,
  overscan = DEFAULT_OVERSCAN,
  tailThreshold = DEFAULT_TAIL_THRESHOLD
}: VirtualChatTimelineOptions) {
  const rows = computed(() => buildVirtualChatRows({
    timelineItems: timelineItems.value,
    streamingText: streamingText.value,
    isStreaming: isStreaming.value,
    chatId: chatId.value
  }))
  const isFollowingTail = shallowRef(true)
  let didInitialScroll = false
  let scheduledFrame: number | null = null
  let scheduledMicrotask = false
  let disposed = false
  let stopContainerListener: (() => void) | null = null

  const getItemKey = (index: number) => rows.value[index]?.key ?? `missing-row:${index}`
  const virtualizer = useVirtualizer<HTMLElement, HTMLElement>(computed(() => ({
    count: rows.value.length,
    getScrollElement: () => containerRef.value,
    estimateSize: () => estimatedRowSize,
    getItemKey,
    overscan,
    anchorTo: 'end' as const,
    followOnAppend: 'auto' as const,
    scrollEndThreshold: tailThreshold,
    useAnimationFrameWithResizeObserver: true
  })))
  virtualizer.value.shouldAdjustScrollPositionOnItemSizeChange = (
    item,
    _delta,
    instance
  ) => item.start < (instance.scrollOffset ?? 0)

  const visibleRows = computed<VisibleVirtualChatRow[]>(() => {
    const currentRows = rows.value
    const visible: VisibleVirtualChatRow[] = []
    for (const virtualItem of virtualizer.value.getVirtualItems()) {
      const row = currentRows[virtualItem.index]
      if (row) {
        visible.push({ row, virtualItem })
      }
    }
    return visible
  })

  const totalSize = computed(() => virtualizer.value.getTotalSize())

  function updateTailState(): void {
    const container = containerRef.value
    if (!container) {
      isFollowingTail.value = true
      return
    }

    const distanceFromTail = container.scrollHeight
      - container.clientHeight
      - container.scrollTop
    isFollowingTail.value = distanceFromTail <= tailThreshold
  }

  function bindContainer(container: HTMLElement | null): void {
    stopContainerListener?.()
    stopContainerListener = null
    if (!container) {
      return
    }

    const handleScroll = () => updateTailState()
    container.addEventListener('scroll', handleScroll, { passive: true })
    stopContainerListener = () => container.removeEventListener('scroll', handleScroll)
    updateTailState()
  }

  function scrollToEnd(): void {
    if (rows.value.length === 0) {
      return
    }

    isFollowingTail.value = true
    virtualizer.value.scrollToEnd({ behavior: 'auto' })
  }

  function runScheduledScroll(): void {
    scheduledFrame = null
    scheduledMicrotask = false
    if (!disposed) {
      scrollToEnd()
    }
  }

  function scheduleScrollToEnd(): void {
    if (scheduledFrame !== null || scheduledMicrotask) {
      return
    }

    void nextTick(() => {
      if (disposed || scheduledFrame !== null || scheduledMicrotask) {
        return
      }

      if (typeof globalThis.requestAnimationFrame === 'function') {
        scheduledFrame = globalThis.requestAnimationFrame(runScheduledScroll)
      } else {
        scheduledMicrotask = true
        queueMicrotask(runScheduledScroll)
      }
    })
  }

  function measureElement(element: Element | null): void {
    virtualizer.value.measureElement(element as HTMLElement | null)
  }

  function scrollToIndex(index: number): void {
    virtualizer.value.scrollToIndex(index, { align: 'auto', behavior: 'auto' })
  }

  function remeasure(): void {
    virtualizer.value.measure()
  }

  function rowsBelongToActiveChat(): boolean {
    const activeChatId = chatId.value
    if (!activeChatId || rows.value.length === 0) {
      return false
    }

    return rows.value.every(row => (
      row.kind === 'streaming' || row.item.chat_id === activeChatId
    ))
  }

  watch(containerRef, bindContainer, { immediate: true })

  watch(chatId, () => {
    didInitialScroll = false
    isFollowingTail.value = true
  })

  watch(
    () => [containerRef.value, chatId.value, rows.value] as const,
    ([container]) => {
      if (!container || didInitialScroll || !rowsBelongToActiveChat()) {
        return
      }

      didInitialScroll = true
      scheduleScrollToEnd()
    },
    { immediate: true, flush: 'post' }
  )

  watch(
    () => {
      const lastRow = rows.value.at(-1)
      const streamingLength = lastRow?.kind === 'streaming' ? lastRow.text.length : 0
      return `${rows.value.length}:${lastRow?.key ?? 'empty'}:${streamingLength}`
    },
    (_currentTail, previousTail) => {
      if (previousTail !== undefined && didInitialScroll && isFollowingTail.value) {
        scheduleScrollToEnd()
      }
    },
    { flush: 'post' }
  )

  onScopeDispose(() => {
    disposed = true
    stopContainerListener?.()
    if (scheduledFrame !== null && typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(scheduledFrame)
    }
  })

  return {
    rows,
    visibleRows,
    totalSize,
    isFollowingTail: readonly(isFollowingTail),
    measureElement,
    scrollToEnd,
    scrollToIndex,
    remeasure
  }
}
