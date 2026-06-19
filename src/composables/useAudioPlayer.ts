import { computed, ref } from 'vue'

import { useTTSStore } from '@/stores/tts'
import { cleanAiReplyTextForTts } from '@/utils/ttsText'

interface QueueItem {
  id: string
  text: string
  url: string
  source: 'auto' | 'manual' | 'test'
  generationId?: string
  vadInterruptedAtWhenQueued?: number | null
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

// Keep VAD-interrupted ids long enough to reject late TTS results.
const VAD_INTERRUPTED_GENERATION_TTL_MS = 5 * 60 * 1000
const MAX_VAD_INTERRUPTED_GENERATIONS = 100
const vadInterruptedGenerationIds = new Map<string, number>()
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

function pruneVadInterruptedGenerations(now = Date.now()) {
  for (const [generationId, interruptedAt] of vadInterruptedGenerationIds) {
    if (now - interruptedAt > VAD_INTERRUPTED_GENERATION_TTL_MS) {
      vadInterruptedGenerationIds.delete(generationId)
    }
  }

  const overflow = vadInterruptedGenerationIds.size - MAX_VAD_INTERRUPTED_GENERATIONS
  if (overflow <= 0) {
    return
  }

  Array.from(vadInterruptedGenerationIds.keys())
    .slice(0, overflow)
    .forEach(generationId => vadInterruptedGenerationIds.delete(generationId))
}

function markVadGenerationInterrupted(generationId: string) {
  pruneVadInterruptedGenerations()
  if (vadInterruptedGenerationIds.has(generationId)) {
    vadInterruptedGenerationIds.delete(generationId)
  }
  vadInterruptedGenerationIds.set(generationId, Date.now())
}

function getVadGenerationInterruptedAt(generationId?: string) {
  if (!generationId) {
    return null
  }
  pruneVadInterruptedGenerations()
  return vadInterruptedGenerationIds.get(generationId) ?? null
}

function shouldSkipInterruptedQueueItem(item: QueueItem) {
  const interruptedAt = getVadGenerationInterruptedAt(item.generationId)
  if (item.source !== 'manual') {
    return interruptedAt !== null
  }

  return interruptedAt !== null && interruptedAt !== item.vadInterruptedAtWhenQueued
}

function markCurrentVadGenerationsInterrupted() {
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
  generationIds.forEach(markVadGenerationInterrupted)
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
  if (shouldSkipInterruptedQueueItem(item)) {
    revokeItem(item)
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
    const vadInterruptedAtBeforeSynthesis = getVadGenerationInterruptedAt(generationId)
    if (source === 'auto' && vadInterruptedAtBeforeSynthesis !== null) {
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

    const vadInterruptedAtAfterSynthesis = getVadGenerationInterruptedAt(generationId)
    if (source === 'auto' && vadInterruptedAtAfterSynthesis !== null) {
      return
    }
    if (
      source === 'manual'
      && vadInterruptedAtAfterSynthesis !== null
      && vadInterruptedAtAfterSynthesis !== vadInterruptedAtBeforeSynthesis
    ) {
      return
    }

    const item: QueueItem = {
      id: `tts_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      text: normalizedText,
      source,
      generationId,
      vadInterruptedAtWhenQueued: source === 'manual' ? vadInterruptedAtAfterSynthesis : undefined,
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
  }

  function vadInterruptGeneration(generationId: string) {
    markVadGenerationInterrupted(generationId)
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
  }

  function vadInterruptActiveGeneration() {
    markCurrentVadGenerationsInterrupted()
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
    vadInterruptGeneration,
    vadInterruptActiveGeneration,
    seek
  }
}
