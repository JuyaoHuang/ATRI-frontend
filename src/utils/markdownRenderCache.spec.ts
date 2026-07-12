import { describe, expect, it } from 'vitest'

import {
  MarkdownRenderCache,
  approximateMarkdownCacheEntryBytes
} from '@/utils/markdownRenderCache'
import type {
  MarkdownRenderResult,
  SanitizedHtml
} from '@/utils/markdownRenderer'

function sanitized(value: string): SanitizedHtml {
  return value as SanitizedHtml
}

describe('MarkdownRenderCache', () => {
  it('skips rendering on a cache hit and updates recency', () => {
    let renderCalls = 0
    const cache = new MarkdownRenderCache({
      maxEntries: 2,
      maxBytes: 10_000,
      renderer: source => {
        renderCalls += 1
        return { kind: 'html', html: sanitized(`<p>${source}</p>`) }
      }
    })

    cache.render('alpha')
    cache.render('beta')
    cache.render('alpha')
    cache.render('gamma')

    expect(renderCalls).toBe(3)
    expect(cache.get('alpha')).toBe('<p>alpha</p>')
    expect(cache.get('beta')).toBeUndefined()
    expect(cache.get('gamma')).toBe('<p>gamma</p>')
    expect(cache.getStats()).toMatchObject({
      entries: 2,
      hits: 3,
      misses: 4,
      evictions: 1
    })
  })

  it('evicts the least-recently-used entry to satisfy the byte budget', () => {
    const version = 'test-v1'
    const firstHtml = sanitized('<p>1111111111</p>')
    const secondHtml = sanitized('<p>2222222222</p>')
    const oneEntryBytes = approximateMarkdownCacheEntryBytes(version, 'first', firstHtml)
    const cache = new MarkdownRenderCache({
      maxEntries: 10,
      maxBytes: oneEntryBytes + 8,
      rendererVersion: version
    })

    expect(cache.set('first', firstHtml)).toBe(true)
    expect(cache.set('second', secondHtml)).toBe(true)

    expect(cache.get('first')).toBeUndefined()
    expect(cache.get('second')).toBe(secondHtml)
    expect(cache.getStats()).toMatchObject({ entries: 1, evictions: 1 })
  })

  it('does not evict existing entries for a single oversized value', () => {
    const cache = new MarkdownRenderCache({ maxEntries: 2, maxBytes: 300 })
    const smallHtml = sanitized('<p>small</p>')

    expect(cache.set('small', smallHtml)).toBe(true)
    expect(cache.set('huge', sanitized('x'.repeat(1_000)))).toBe(false)
    expect(cache.get('small')).toBe(smallHtml)
    expect(cache.getStats().entries).toBe(1)
  })

  it('uses renderer version as part of the exact-source key', () => {
    const cache = new MarkdownRenderCache({ maxEntries: 4, maxBytes: 10_000 })
    const html = sanitized('<p>same source</p>')

    cache.set('same source', html, 'renderer-v1')

    expect(cache.get('same source', 'renderer-v1')).toBe(html)
    expect(cache.get('same source', 'renderer-v2')).toBeUndefined()
  })

  it('never caches a plain fallback result', () => {
    let renderCalls = 0
    const fallback: MarkdownRenderResult = {
      kind: 'plain',
      text: 'raw',
      reason: 'render-error'
    }
    const cache = new MarkdownRenderCache({
      renderer: () => {
        renderCalls += 1
        return fallback
      }
    })

    expect(cache.render('raw')).toEqual(fallback)
    expect(cache.render('raw')).toEqual(fallback)
    expect(renderCalls).toBe(2)
    expect(cache.getStats()).toMatchObject({ entries: 0, misses: 2 })
  })

  it('clears cached content and test statistics together', () => {
    const cache = new MarkdownRenderCache({ maxEntries: 2, maxBytes: 10_000 })
    cache.set('alpha', sanitized('<p>alpha</p>'))
    cache.get('alpha')
    cache.get('missing')

    cache.clear()

    expect(cache.getStats()).toEqual({
      entries: 0,
      approximateBytes: 0,
      hits: 0,
      misses: 0,
      evictions: 0
    })
  })

  it('rejects invalid budgets', () => {
    expect(() => new MarkdownRenderCache({ maxEntries: 0 })).toThrow(RangeError)
    expect(() => new MarkdownRenderCache({ maxBytes: Number.POSITIVE_INFINITY })).toThrow(RangeError)
  })
})
