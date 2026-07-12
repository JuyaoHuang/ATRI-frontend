// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import {
  MAX_MARKDOWN_SOURCE_CHARS,
  isSafeMarkdownLink,
  renderMarkdown,
  type SanitizedHtml
} from '@/utils/markdownRenderer'

function renderHtml(source: string): SanitizedHtml {
  const result = renderMarkdown(source)
  expect(result.kind).toBe('html')
  if (result.kind !== 'html') {
    throw new Error(`Expected HTML, received ${result.reason}`)
  }
  return result.html
}

function parseHtml(html: SanitizedHtml): HTMLDivElement {
  const container = document.createElement('div')
  container.innerHTML = html
  return container
}

describe('renderMarkdown', () => {
  it('renders the confirmed Markdown baseline', () => {
    const container = parseHtml(renderHtml([
      '# Heading',
      '',
      '**bold** *italic* ~~removed~~',
      '',
      '> quoted',
      '',
      '1. first',
      '2. second',
      '',
      '| name | value |',
      '| --- | --- |',
      '| alpha | 1 |',
      '',
      '`inline code`',
      '',
      '```text',
      '$not_math$',
      '```'
    ].join('\n')))

    expect(container.querySelector('h1')?.textContent).toBe('Heading')
    expect(container.querySelector('strong')?.textContent).toBe('bold')
    expect(container.querySelector('em')?.textContent).toBe('italic')
    expect(container.querySelector('s')?.textContent).toBe('removed')
    expect(container.querySelector('blockquote')?.textContent).toContain('quoted')
    expect(container.querySelectorAll('ol > li')).toHaveLength(2)
    expect(container.querySelector('table')).not.toBeNull()
    expect(container.querySelectorAll('code')).toHaveLength(2)
    expect(container.querySelector('code .katex')).toBeNull()
  })

  it('renders task lists as disabled, identifier-free controls', () => {
    const container = parseHtml(renderHtml('- [x] complete\n- [ ] pending'))
    const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')

    expect(checkboxes).toHaveLength(2)
    expect(checkboxes[0]?.checked).toBe(true)
    expect(checkboxes[1]?.checked).toBe(false)
    expect([...checkboxes].every(checkbox => checkbox.disabled)).toBe(true)
    expect(container.querySelector('label')).toBeNull()
    expect(container.querySelector('[id]')).toBeNull()
  })

  it('renders all four confirmed math delimiters with MathML', () => {
    const container = parseHtml(renderHtml([
      'Inline $a_x=b$ and \\(c^2=a^2+b^2\\).',
      '',
      '$$\\sum_{i=1}^{n} i$$',
      '',
      '\\[\\int_0^1 x^2 \\, dx\\]'
    ].join('\n')))

    expect(container.querySelectorAll('.katex')).toHaveLength(4)
    expect(container.querySelectorAll('math')).toHaveLength(4)
  })

  it('covers representative pure-math categories and environments', () => {
    const source = [
      '$\\alpha + \\beta + \\Gamma$',
      '$\\frac{a}{b} + \\sqrt[n]{x}$',
      '$\\int_0^1 x\\,dx + \\sum_{k=1}^{n} k$',
      '$\\lim_{x \\to 0} \\frac{\\sin x}{x}$',
      '$A \\subseteq B \\land p \\Rightarrow q$',
      '$$\\begin{matrix}a & b \\\\ c & d\\end{matrix}$$',
      '$$\\begin{aligned}a &= b + c \\\\ d &= e - f\\end{aligned}$$',
      '$$f(x)=\\begin{cases}x^2 & x \\ge 0 \\\\ -x & x < 0\\end{cases}$$',
      '$\\text{speed}=\\mathrm{distance}/\\mathrm{time}$'
    ].join('\n\n')
    const container = parseHtml(renderHtml(source))

    expect(container.querySelectorAll('.katex')).toHaveLength(9)
    expect(container.querySelectorAll('math')).toHaveLength(9)
    expect(container.querySelector('.katex-error')).toBeNull()
  })

  it('isolates mutable KaTeX macro state between messages', () => {
    const definingMessage = parseHtml(renderHtml('$\\gdef\\chatmacro{isolated}\\chatmacro$'))
    const separateMessage = parseHtml(renderHtml('$\\chatmacro$'))

    expect(definingMessage.textContent).toContain('isolated')
    expect(separateMessage.textContent).toContain('\\chatmacro')
    expect(separateMessage.textContent).not.toContain('isolated')
  })

  it('disables raw HTML, images, media and active KaTeX trust commands', () => {
    const source = [
      '<script>alert(1)</script>',
      '<img src="https://example.invalid/pixel.png" onerror="alert(1)">',
      '<video src="https://example.invalid/movie.mp4"></video>',
      '<iframe src="https://example.invalid"></iframe>',
      '![tracking](https://example.invalid/pixel.png)',
      '[danger](javascript:alert(1))',
      '$\\includegraphics{https://example.invalid/pixel.png}$',
      '$\\href{javascript:alert(1)}{click}$',
      '$\\htmlClass{evil}{x}$',
      '$\\htmlStyle{color:red}{x}$',
      '$\\htmlData{payload=active}{x}$'
    ].join('\n\n')
    const container = parseHtml(renderHtml(source))

    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('video')).toBeNull()
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('audio, picture, source, object, embed')).toBeNull()
    expect(container.querySelector('[onerror], [onclick]')).toBeNull()
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull()
    expect(container.querySelector('.evil')).toBeNull()
    expect(container.querySelector('[data-payload]')).toBeNull()
    expect(container.textContent).toContain('<script>alert(1)</script>')
  })

  it('allows only the confirmed link schemes and relative links', () => {
    const container = parseHtml(renderHtml([
      '[web](https://example.com)',
      '[mail](mailto:user@example.com)',
      '[relative](docs/guide)',
      '[anchor](#section)',
      '[ftp](ftp://example.com/file)',
      '[data](data:text/html,hello)',
      '[script](javascript:alert(1))',
      'Bare URL: https://example.org/path'
    ].join(' ')))
    const hrefs = [...container.querySelectorAll<HTMLAnchorElement>('a')]
      .map(link => link.getAttribute('href'))

    expect(hrefs).toContain('https://example.com')
    expect(hrefs).toContain('mailto:user@example.com')
    expect(hrefs).toContain('docs/guide')
    expect(hrefs).toContain('#section')
    expect(hrefs).toContain('https://example.org/path')
    expect(hrefs.some(href => href?.startsWith('ftp:'))).toBe(false)
    expect(hrefs.some(href => href?.startsWith('data:'))).toBe(false)
    expect(hrefs.some(href => href?.startsWith('javascript:'))).toBe(false)
  })

  it('safely represents unsupported math without throwing', () => {
    const container = parseHtml(renderHtml('$\\notARealChatCommand{x}$'))

    expect(container.querySelector('.katex')).not.toBeNull()
    expect(container.textContent).toContain('\\notARealChatCommand')
  })

  it('falls back to the complete raw source when the resource guard is exceeded', () => {
    const source = 'x'.repeat(MAX_MARKDOWN_SOURCE_CHARS + 1)
    const result = renderMarkdown(source)

    expect(result).toEqual({
      kind: 'plain',
      text: source,
      reason: 'too-large'
    })
  })

  it('returns a safe empty result for an empty source', () => {
    expect(renderMarkdown('')).toEqual({
      kind: 'plain',
      text: '',
      reason: 'empty'
    })
  })
})

describe('isSafeMarkdownLink', () => {
  it('rejects dangerous and unknown protocols before sanitization', () => {
    expect(isSafeMarkdownLink('https://example.com')).toBe(true)
    expect(isSafeMarkdownLink('mailto:user@example.com')).toBe(true)
    expect(isSafeMarkdownLink('../relative')).toBe(true)
    expect(isSafeMarkdownLink('#anchor')).toBe(true)
    expect(isSafeMarkdownLink('//example.com')).toBe(false)
    expect(isSafeMarkdownLink('javascript:alert(1)')).toBe(false)
    expect(isSafeMarkdownLink('data:text/html,hello')).toBe(false)
    expect(isSafeMarkdownLink('ftp://example.com')).toBe(false)
  })
})
