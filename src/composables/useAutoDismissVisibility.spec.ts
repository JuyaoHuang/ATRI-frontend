import { effectScope, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAutoDismissVisibility } from '@/composables/useAutoDismissVisibility'

describe('useAutoDismissVisibility', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hides a truthy source after the configured visible duration', () => {
    const source = ref<unknown>(null)
    const scope = effectScope()
    const visible = scope.run(() => useAutoDismissVisibility(source, 2000))!

    source.value = 'permission denied'
    expect(visible.value).toBe(true)

    vi.advanceTimersByTime(1999)
    expect(visible.value).toBe(true)

    vi.advanceTimersByTime(1)
    expect(visible.value).toBe(false)
    scope.stop()
  })

  it('restarts the visible duration when the source changes', () => {
    const source = ref<unknown>('first error')
    const scope = effectScope()
    const visible = scope.run(() => useAutoDismissVisibility(source, 2000))!

    vi.advanceTimersByTime(1500)
    source.value = 'second error'
    vi.advanceTimersByTime(500)
    expect(visible.value).toBe(true)

    vi.advanceTimersByTime(1500)
    expect(visible.value).toBe(false)
    scope.stop()
  })

  it('clears the pending dismissal when its scope is disposed', () => {
    const source = ref<unknown>('permission denied')
    const scope = effectScope()
    scope.run(() => useAutoDismissVisibility(source, 2000))

    expect(vi.getTimerCount()).toBe(1)
    scope.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
})
