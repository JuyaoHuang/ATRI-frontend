import { computed, ref } from 'vue'

import { useTTSStore } from '@/stores/tts'
import { cleanAiReplyTextForTts } from '@/utils/ttsText'

interface QueueItem {
  id: string
  text: string
  url: string
  source: 'auto' | 'manual' | 'test'
  generationId?: string
}

interface EnqueueOptions {
  source?: QueueItem['source']
  voiceId?: string
  generationId?: string
}

const queue = ref<QueueItem[]>([])
const current = ref<QueueItem | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const error = ref<string | null>(null)
let audio: HTMLAudioElement | null = null
const invalidatedGenerationIds = new Set<string>()
const activeSynthesisGenerationIds = new Set<string>()

function finiteTime(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0
}

function syncPlaybackPosition() {
  if (!audio) {
    currentTime.value = 0
    duration.value = 0
    return
  }
  currentTime.value = finiteTime(audio.currentTime)
  duration.value = finiteTime(audio.duration)
}

function resetPlaybackPosition() {
  currentTime.value = 0
  duration.value = 0
}

function ensureAudio() {
  if (!audio && typeof Audio !== 'undefined') {
    audio = new Audio()
    audio.onended = () => finishCurrent()
    audio.onloadedmetadata = syncPlaybackPosition
    audio.ondurationchange = syncPlaybackPosition
    audio.ontimeupdate = syncPlaybackPosition
    audio.onplay = () => {
      isPlaying.value = true
    }
    audio.onpause = () => {
      isPlaying.value = false
      syncPlaybackPosition()
    }
    audio.onerror = () => {
      error.value = 'Audio playback failed'
      finishCurrent()
    }
  }
  return audio
}

function revokeItem(item: QueueItem | null) {
  if (item?.url) {
    URL.revokeObjectURL(item.url)
  }
}

function isGenerationInvalidated(generationId?: string) {
  return Boolean(generationId && invalidatedGenerationIds.has(generationId))
}

function cleanupInvalidatedGeneration(generationId?: string) {
  if (!generationId || activeSynthesisGenerationIds.has(generationId)) {
    return
  }
  if (current.value?.generationId === generationId) {
    return
  }
  if (queue.value.some(item => item.generationId === generationId)) {
    return
  }
  invalidatedGenerationIds.delete(generationId)
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}

async function playNext() {
  if (current.value || queue.value.length === 0) {
    return
  }

  const item = queue.value.shift()
  if (!item) {
    return
  }
  if (isGenerationInvalidated(item.generationId)) {
    revokeItem(item)
    cleanupInvalidatedGeneration(item.generationId)
    void playNext()
    return
  }

  const player = ensureAudio()
  if (!player) {
    revokeItem(item)
    error.value = 'Audio playback is not available in this environment'
    return
  }

  const ttsStore = useTTSStore()
  current.value = item
  resetPlaybackPosition()
  player.src = item.url
  player.volume = Math.min(1, Math.max(0, ttsStore.outputVolume))

  try {
    await player.play()
    isPlaying.value = true
  } catch (playbackError) {
    error.value = errorMessage(playbackError)
    finishCurrent()
  }
}

function finishCurrent() {
  const finished = current.value
  current.value = null
  isPlaying.value = false
  resetPlaybackPosition()
  revokeItem(finished)
  void playNext()
}

export function useAudioPlayer() {
  const ttsStore = useTTSStore()

  async function enqueueText(text: string, options: EnqueueOptions = {}) {
    const normalizedText = text.trim()
    if (!normalizedText) {
      return
    }

    const source = options.source || 'manual'
    const generationId = options.generationId
    if (isGenerationInvalidated(generationId)) {
      return
    }

    const synthesisText = source === 'test'
      ? normalizedText
      : cleanAiReplyTextForTts(normalizedText)

    if (!synthesisText) {
      return
    }

    error.value = null
    await ttsStore.ensureLoaded()

    if (generationId) {
      activeSynthesisGenerationIds.add(generationId)
    }

    let blob: Blob
    try {
      blob = await ttsStore.synthesize({
        text: synthesisText,
        provider: ttsStore.config.tts_model,
        voice_id: options.voiceId
      })
    } finally {
      if (generationId) {
        activeSynthesisGenerationIds.delete(generationId)
      }
    }

    if (isGenerationInvalidated(generationId)) {
      cleanupInvalidatedGeneration(generationId)
      return
    }

    const item: QueueItem = {
      id: `tts_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      text: normalizedText,
      source,
      generationId,
      url: URL.createObjectURL(blob)
    }
    queue.value.push(item)
    await playNext()
  }

  function pause() {
    if (!audio || !current.value) {
      return
    }
    audio.pause()
    isPlaying.value = false
  }

  async function resume() {
    if (!audio || !current.value) {
      await playNext()
      return
    }
    try {
      await audio.play()
      isPlaying.value = true
    } catch (playbackError) {
      error.value = errorMessage(playbackError)
    }
  }

  function stop() {
    const stoppedGenerationIds = new Set<string>()
    if (current.value?.generationId) {
      stoppedGenerationIds.add(current.value.generationId)
    }
    queue.value.forEach(item => {
      if (item.generationId) {
        stoppedGenerationIds.add(item.generationId)
      }
    })

    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    revokeItem(current.value)
    queue.value.forEach(revokeItem)
    current.value = null
    queue.value = []
    isPlaying.value = false
    resetPlaybackPosition()
    stoppedGenerationIds.forEach(generationId => cleanupInvalidatedGeneration(generationId))
  }

  function invalidateGeneration(generationId: string) {
    invalidatedGenerationIds.add(generationId)
    queue.value = queue.value.filter(item => {
      if (item.generationId !== generationId) {
        return true
      }
      revokeItem(item)
      return false
    })
    if (current.value?.generationId === generationId) {
      stop()
    }
    cleanupInvalidatedGeneration(generationId)
  }

  function invalidateActiveGeneration() {
    const generationIds = new Set<string>()
    if (current.value?.generationId) {
      generationIds.add(current.value.generationId)
    }
    queue.value.forEach(item => {
      if (item.generationId) {
        generationIds.add(item.generationId)
      }
    })
    activeSynthesisGenerationIds.forEach(generationId => generationIds.add(generationId))
    generationIds.forEach(generationId => invalidatedGenerationIds.add(generationId))
  }

  function seek(time: number) {
    if (!audio || !current.value) {
      return
    }

    const max = duration.value || finiteTime(audio.duration)
    const target = max > 0
      ? Math.min(max, Math.max(0, time))
      : Math.max(0, time)
    audio.currentTime = target
    currentTime.value = target
  }

  return {
    queue: computed(() => queue.value),
    current: computed(() => current.value),
    isPlaying: computed(() => isPlaying.value),
    isBusy: computed(() => isPlaying.value || Boolean(current.value) || ttsStore.synthesizing),
    currentTime: computed(() => currentTime.value),
    duration: computed(() => duration.value),
    progress: computed(() => duration.value > 0 ? Math.min(100, (currentTime.value / duration.value) * 100) : 0),
    canSeek: computed(() => Boolean(current.value) && duration.value > 0),
    error: computed(() => error.value || ttsStore.error),
    enqueueText,
    pause,
    resume,
    stop,
    invalidateGeneration,
    invalidateActiveGeneration,
    seek
  }
}
