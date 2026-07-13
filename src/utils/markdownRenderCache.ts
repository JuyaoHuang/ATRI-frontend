import type { MarkdownRenderResult, SanitizedHtml } from '@/utils/markdownRenderer'
import { MARKDOWN_RENDERER_VERSION } from '@/utils/markdownRendererVersion'

export const DEFAULT_MARKDOWN_CACHE_MAX_ENTRIES = 1_000
export const DEFAULT_MARKDOWN_CACHE_MAX_BYTES = 32 * 1024 * 1024

const CACHE_ENTRY_OVERHEAD_BYTES = 128

interface MarkdownRenderCacheEntry {
  html: SanitizedHtml
  approximateBytes: number
}

export interface MarkdownRenderCacheOptions {
  maxEntries?: number
  maxBytes?: number
  rendererVersion?: string
}

export interface MarkdownRenderCacheStats {
  entries: number
  approximateBytes: number
  hits: number
  misses: number
  evictions: number
}

export function approximateMarkdownCacheEntryBytes(
  rendererVersion: string,
  source: string,
  html: SanitizedHtml
): number {
  return (rendererVersion.length + source.length + html.length) * 2
    + CACHE_ENTRY_OVERHEAD_BYTES
}

export class MarkdownRenderCache {
  private readonly entries = new Map<string, MarkdownRenderCacheEntry>()
  private readonly maxEntries: number
  private readonly maxBytes: number
  private readonly rendererVersion: string
  private approximateBytes = 0
  private hits = 0
  private misses = 0
  private evictions = 0

  constructor(options: MarkdownRenderCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MARKDOWN_CACHE_MAX_ENTRIES
    this.maxBytes = options.maxBytes ?? DEFAULT_MARKDOWN_CACHE_MAX_BYTES
    this.rendererVersion = options.rendererVersion ?? MARKDOWN_RENDERER_VERSION

    if (!Number.isInteger(this.maxEntries) || this.maxEntries <= 0) {
      throw new RangeError('Markdown cache maxEntries must be a positive integer')
    }
    if (!Number.isFinite(this.maxBytes) || this.maxBytes <= 0) {
      throw new RangeError('Markdown cache maxBytes must be positive')
    }
  }

  private keyFor(source: string, rendererVersion = this.rendererVersion): string {
    return `${rendererVersion.length}:${rendererVersion}${source}`
  }

  get(source: string, rendererVersion = this.rendererVersion): SanitizedHtml | undefined {
    const key = this.keyFor(source, rendererVersion)
    const entry = this.entries.get(key)
    if (!entry) {
      this.misses += 1
      return undefined
    }

    this.entries.delete(key)
    this.entries.set(key, entry)
    this.hits += 1
    return entry.html
  }

  set(
    source: string,
    html: SanitizedHtml,
    rendererVersion = this.rendererVersion
  ): boolean {
    const key = this.keyFor(source, rendererVersion)
    const approximateBytes = approximateMarkdownCacheEntryBytes(
      rendererVersion,
      source,
      html
    )
    if (approximateBytes > this.maxBytes) {
      return false
    }

    const previous = this.entries.get(key)
    if (previous) {
      this.entries.delete(key)
      this.approximateBytes -= previous.approximateBytes
    }

    this.entries.set(key, { html, approximateBytes })
    this.approximateBytes += approximateBytes
    this.evictToBudget()
    return this.entries.has(key)
  }

  render(
    source: string,
    renderer: (source: string) => MarkdownRenderResult
  ): MarkdownRenderResult {
    const cached = this.get(source)
    if (cached !== undefined) {
      return { kind: 'html', html: cached }
    }

    const result = renderer(source)
    if (result.kind === 'html') {
      this.set(source, result.html)
    }
    return result
  }

  clear(): void {
    this.entries.clear()
    this.approximateBytes = 0
    this.hits = 0
    this.misses = 0
    this.evictions = 0
  }

  getStats(): MarkdownRenderCacheStats {
    return {
      entries: this.entries.size,
      approximateBytes: this.approximateBytes,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions
    }
  }

  private evictToBudget(): void {
    while (
      this.entries.size > this.maxEntries
      || this.approximateBytes > this.maxBytes
    ) {
      const oldest = this.entries.entries().next().value
      if (!oldest) {
        break
      }

      const [key, entry] = oldest
      this.entries.delete(key)
      this.approximateBytes -= entry.approximateBytes
      this.evictions += 1
    }
  }
}

const sharedMarkdownRenderCache = new MarkdownRenderCache()

export function renderMarkdownWithCache(
  source: string,
  renderer: (source: string) => MarkdownRenderResult
): MarkdownRenderResult {
  return sharedMarkdownRenderCache.render(source, renderer)
}

export function clearMarkdownRenderCache(): void {
  sharedMarkdownRenderCache.clear()
}

export function getMarkdownRenderCacheStats(): MarkdownRenderCacheStats {
  return sharedMarkdownRenderCache.getStats()
}
