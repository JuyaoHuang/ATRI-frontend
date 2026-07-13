import { describe, expect, it } from 'vitest'

import { createModelLoadTracker } from './modelLoadTracker'

describe('model load tracker', () => {
  it('invalidates an older model when a new URL begins loading', () => {
    const tracker = createModelLoadTracker()
    const first = tracker.begin('https://example.test/a.model3.json')
    const second = tracker.begin('https://example.test/b.model3.json')

    expect(tracker.isCurrent(first, 'https://example.test/a.model3.json')).toBe(false)
    expect(tracker.isCurrent(second, 'https://example.test/b.model3.json')).toBe(true)
  })

  it('invalidates a pending model when the active URL becomes null', () => {
    const tracker = createModelLoadTracker()
    const pending = tracker.begin('https://example.test/a.model3.json')

    tracker.begin(null)

    expect(tracker.isCurrent(pending, null)).toBe(false)
  })

  it('invalidates every pending load when the canvas is destroyed', () => {
    const tracker = createModelLoadTracker()
    const pending = tracker.begin('https://example.test/a.model3.json')

    tracker.invalidate()

    expect(tracker.isCurrent(pending, 'https://example.test/a.model3.json')).toBe(false)
  })
})
