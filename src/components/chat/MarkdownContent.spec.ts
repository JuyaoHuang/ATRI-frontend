// @vitest-environment jsdom

import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { beforeEach, describe, expect, it } from 'vitest'

import MarkdownContent from '@/components/chat/MarkdownContent.vue'
import markdownContentSource from '@/components/chat/MarkdownContent.vue?raw'
import { clearMarkdownRenderCache, getMarkdownRenderCacheStats } from '@/utils/markdownRenderCache'

async function renderContent(source: string): Promise<string> {
  const app = createSSRApp({
    render: () => h(MarkdownContent, { source })
  })
  return renderToString(app)
}

describe('MarkdownContent', () => {
  beforeEach(() => {
    clearMarkdownRenderCache()
  })

  it('renders sanitized Markdown and KaTeX through its HTML boundary', async () => {
    const html = await renderContent('**bold** and $a_x=b$')

    expect(html).toContain('markdown-content__rendered')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('class="katex"')
    expect(html).toContain('<math')
  })

  it('keeps Markdown soft line breaks out of the generated element tree', async () => {
    const html = await renderContent('first line\nsecond line')

    expect(html).toContain('first line\nsecond line')
    expect(html).not.toContain('<br')
  })

  it('defines separate whitespace behavior for Markdown and plain fallback', () => {
    expect(markdownContentSource).toMatch(
      /\.markdown-content__rendered\s*\{[^}]*white-space:\s*normal;/s
    )
    expect(markdownContentSource).toMatch(
      /\.markdown-content__fallback\s*\{[^}]*white-space:\s*pre-wrap;/s
    )
  })

  it('reuses sanitized HTML across component instances', async () => {
    await renderContent('# cached')
    await renderContent('# cached')

    expect(getMarkdownRenderCacheStats()).toMatchObject({
      entries: 1,
      misses: 1,
      hits: 1
    })
  })

  it('does not create active media or raw HTML nodes', async () => {
    const html = await renderContent([
      '<img src="https://example.invalid/pixel.png" onerror="alert(1)">',
      '![tracking](https://example.invalid/pixel.png)'
    ].join('\n\n'))
    const container = document.createElement('div')
    container.innerHTML = html

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[onerror]')).toBeNull()
    expect(container.textContent).toContain('<img')
  })
})
