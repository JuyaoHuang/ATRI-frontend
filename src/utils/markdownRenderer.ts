import { katex } from '@mdit/plugin-katex'
import { tasklist } from '@mdit/plugin-tasklist'
import DOMPurify, { type Config } from 'dompurify'
import MarkdownIt from 'markdown-it'

export { MARKDOWN_RENDERER_VERSION } from '@/utils/markdownRendererVersion'

declare const sanitizedHtmlBrand: unique symbol

export type SanitizedHtml = string & {
  readonly [sanitizedHtmlBrand]: 'SanitizedHtml'
}

export type MarkdownRenderResult =
  | { kind: 'html'; html: SanitizedHtml }
  | {
      kind: 'plain'
      text: string
      reason: 'empty' | 'too-large' | 'render-error'
    }

export const MAX_MARKDOWN_SOURCE_CHARS = 200_000
export const MAX_RENDERED_HTML_CHARS = 2_000_000

export const MAX_KATEX_EXPANSIONS = 1_000
export const MAX_KATEX_SIZE_EM = 50

const EXPLICIT_SAFE_PROTOCOL_RE = /^(?:https?:|mailto:)/i
const URL_SCHEME_RE = /^[a-z][a-z\d+.-]*:/i
const SAFE_SANITIZED_URI_RE = /^(?:(?:https?|mailto):|#|\/(?!\/)|\?|\.{1,2}\/|[a-z\d._~!$&'()*+,;=@%-]+(?:[/?#]|$))/i

const SANITIZE_CONFIG: Config = {
  ALLOW_ARIA_ATTR: true,
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  ALLOWED_URI_REGEXP: SAFE_SANITIZED_URI_RE,
  FORBID_ATTR: [
    'formaction',
    'id',
    'name',
    'poster',
    'src',
    'srcset',
    'xlink:href'
  ],
  FORBID_TAGS: [
    'audio',
    'embed',
    'foreignobject',
    'iframe',
    'img',
    'object',
    'picture',
    'script',
    'source',
    'style',
    'use',
    'video'
  ],
  KEEP_CONTENT: true,
  RETURN_TRUSTED_TYPE: false,
  SAFE_FOR_XML: true,
  SANITIZE_DOM: true,
  SANITIZE_NAMED_PROPS: true,
  USE_PROFILES: {
    html: true,
    mathMl: true,
    svg: true,
    svgFilters: false
  }
}

export function isSafeMarkdownLink(url: string): boolean {
  const normalized = url.trim()
  if (!normalized || hasControlCharacter(normalized)) {
    return false
  }

  if (EXPLICIT_SAFE_PROTOCOL_RE.test(normalized)) {
    return true
  }

  if (normalized.startsWith('//')) {
    return false
  }

  return !URL_SCHEME_RE.test(normalized)
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) {
      return true
    }
  }
  return false
}

function createIsolatedMarkdownParser(): MarkdownIt {
  const parser = new MarkdownIt({
    html: false,
    breaks: false,
    linkify: true,
    typographer: false
  })

  parser.disable('image')
  parser.validateLink = isSafeMarkdownLink
  parser.use(tasklist, {
    disabled: true,
    label: false
  })
  parser.use(katex, {
    delimiters: 'all',
    allowInlineWithSpace: false,
    mathFence: false,
    trust: false,
    throwOnError: false,
    output: 'htmlAndMathml',
    maxExpand: MAX_KATEX_EXPANSIONS,
    maxSize: MAX_KATEX_SIZE_EM,
    macros: {},
    logger: () => 'ignore'
  })

  return parser
}

function plainResult(
  text: string,
  reason: 'empty' | 'too-large' | 'render-error'
): MarkdownRenderResult {
  return { kind: 'plain', text, reason }
}

function sanitizeRenderedHtml(renderedHtml: string): SanitizedHtml {
  if (!DOMPurify.isSupported || typeof DOMPurify.sanitize !== 'function') {
    throw new Error('DOM sanitization is unavailable')
  }

  return DOMPurify.sanitize(renderedHtml, SANITIZE_CONFIG) as SanitizedHtml
}

export function renderMarkdown(source: string): MarkdownRenderResult {
  if (source.length === 0) {
    return plainResult(source, 'empty')
  }

  if (source.length > MAX_MARKDOWN_SOURCE_CHARS) {
    return plainResult(source, 'too-large')
  }

  try {
    const renderedHtml = createIsolatedMarkdownParser().render(source, {})
    if (renderedHtml.length > MAX_RENDERED_HTML_CHARS) {
      return plainResult(source, 'too-large')
    }

    return {
      kind: 'html',
      html: sanitizeRenderedHtml(renderedHtml)
    }
  } catch {
    console.warn('[chat-markdown] Rendering failed; using escaped plain text')
    return plainResult(source, 'render-error')
  }
}
