<script setup lang="ts">
import { computed } from 'vue'

import 'katex/dist/katex.min.css'

import { renderMarkdownWithCache } from '@/utils/markdownRenderCache'

interface Props {
  source: string
}

const props = defineProps<Props>()
const rendered = computed(() => renderMarkdownWithCache(props.source))
</script>

<template>
  <div class="markdown-content">
    <!-- This is the sole message-content v-html boundary. The renderer only
         returns DOMPurify-branded HTML; every failure uses text interpolation. -->
    <div
      v-if="rendered.kind === 'html'"
      class="markdown-content__rendered"
      v-html="rendered.html"
    />
    <div v-else class="markdown-content__fallback">
      {{ rendered.text }}
    </div>
  </div>
</template>

<style scoped>
.markdown-content {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}

.markdown-content__fallback {
  white-space: pre-wrap;
  word-break: break-word;
}

.markdown-content__rendered :deep(> :first-child) {
  margin-top: 0;
}

.markdown-content__rendered :deep(> :last-child) {
  margin-bottom: 0;
}

.markdown-content__rendered :deep(p),
.markdown-content__rendered :deep(blockquote),
.markdown-content__rendered :deep(pre),
.markdown-content__rendered :deep(ul),
.markdown-content__rendered :deep(ol),
.markdown-content__rendered :deep(table),
.markdown-content__rendered :deep(.katex-block) {
  margin-top: 0;
  margin-bottom: 0.75em;
}

.markdown-content__rendered :deep(ul),
.markdown-content__rendered :deep(ol) {
  padding-left: 1.5em;
}

.markdown-content__rendered :deep(blockquote) {
  padding-left: 0.8em;
  border-left: 0.2em solid currentcolor;
  opacity: 0.9;
}

.markdown-content__rendered :deep(pre),
.markdown-content__rendered :deep(table),
.markdown-content__rendered :deep(.katex-display) {
  max-width: 100%;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
}

.markdown-content__rendered :deep(pre) {
  padding: 0.65em;
  border-radius: 0.45em;
  background: rgb(0 0 0 / 0.08);
  white-space: pre;
}

.markdown-content__rendered :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.markdown-content__rendered :deep(:not(pre) > code) {
  padding: 0.1em 0.3em;
  border-radius: 0.25em;
  background: rgb(0 0 0 / 0.08);
}

.markdown-content__rendered :deep(table) {
  display: block;
  border-collapse: collapse;
}

.markdown-content__rendered :deep(th),
.markdown-content__rendered :deep(td) {
  padding: 0.25em 0.5em;
  border: 1px solid currentcolor;
}

.markdown-content__rendered :deep(a) {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 0.15em;
}

.markdown-content__rendered :deep(.task-list-container) {
  list-style: none;
  padding-left: 0;
}

.markdown-content__rendered :deep(.task-list-item-checkbox) {
  margin-right: 0.4em;
  pointer-events: none;
  vertical-align: middle;
}

.markdown-content__rendered :deep(.katex-display) {
  padding-block: 0.2em;
}
</style>
