import { describe, expect, it, vi } from 'vitest'

import { renderMarkdown } from '@/utils/markdownRenderer'

describe('renderMarkdown without a browser DOM', () => {
  it('fails closed to escaped plain text instead of exposing unsanitized HTML', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const source = '# heading\n\n<script>alert(1)</script>'

    expect(renderMarkdown(source)).toEqual({
      kind: 'plain',
      text: source,
      reason: 'render-error'
    })
    expect(warning).toHaveBeenCalledOnce()
  })
})
