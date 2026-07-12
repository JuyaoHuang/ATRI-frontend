import { onScopeDispose, readonly, ref, watch, type Ref } from 'vue'

export function useAutoDismissVisibility(
  source: Readonly<Ref<unknown>>,
  visibleDurationMs: number,
) {
  const visible = ref(Boolean(source.value))
  let dismissTimer: ReturnType<typeof setTimeout> | undefined

  const clearDismissTimer = (): void => {
    if (dismissTimer === undefined) {
      return
    }
    clearTimeout(dismissTimer)
    dismissTimer = undefined
  }

  const stopWatching = watch(source, value => {
    clearDismissTimer()
    visible.value = Boolean(value)
    if (!visible.value) {
      return
    }

    dismissTimer = setTimeout(() => {
      dismissTimer = undefined
      visible.value = false
    }, visibleDurationMs)
  }, { flush: 'sync', immediate: true })

  onScopeDispose(() => {
    clearDismissTimer()
    stopWatching()
  })

  return readonly(visible)
}
