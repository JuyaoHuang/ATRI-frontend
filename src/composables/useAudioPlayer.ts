import { computed, ref } from 'vue'

import { useTTSStore } from '@/stores/tts'
import { cleanAiReplyTextForTts } from '@/utils/ttsText'

interface QueueItem {
  id: string
  text: string
  url: string
  source: 'auto' | 'manual' | 'test' | 'stream'
  generationId?: string
  segmentId?: string
  sequence?: number
  mediaType?: string
  discardedAtWhenQueued?: number | null
}

interface EnqueueOptions {
  source?: Exclude<QueueItem['source'], 'stream'>
  voiceId?: string
  generationId?: string
}

interface AudioSegmentOptions {
  generationId: string
  segmentId: string
  sequence: number
  text: string
  audio: Blob
  mediaType: string
}

interface StreamedAudioGenerationState {
  seenSequences: Set<number>
  completed: boolean
  updatedAt: number
}

const queue = ref<QueueItem[]>([])
const current = ref<QueueItem | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const error = ref<string | null>(null)
let audio: HTMLAudioElement | null = null

// Keep discarded ids long enough to reject late TTS results.
const DISCARDED_GENERATION_TTL_MS = 5 * 60 * 1000
const MAX_DISCARDED_GENERATIONS = 100
const MAX_STREAMED_AUDIO_GENERATIONS = 100
const discardedGenerationIds = new Map<string, number>()
const activeSynthesisGenerationIds = new Set<string>()
const streamedAudioGenerationStates = new Map<string, StreamedAudioGenerationState>()
let discardEpoch = 0

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

function pruneDiscardedGenerations(now = Date.now()) {
  for (const [generationId, discardedAt] of discardedGenerationIds) {
    if (now - discardedAt > DISCARDED_GENERATION_TTL_MS) {
      discardedGenerationIds.delete(generationId)
    }
  }

  const overflow = discardedGenerationIds.size - MAX_DISCARDED_GENERATIONS
  if (overflow <= 0) {
    return
  }

  Array.from(discardedGenerationIds.keys())
    .slice(0, overflow)
    .forEach(generationId => discardedGenerationIds.delete(generationId))
}

function markGenerationDiscarded(generationId: string) {
  pruneDiscardedGenerations()
  if (discardedGenerationIds.has(generationId)) {
    discardedGenerationIds.delete(generationId)
  }
  discardedGenerationIds.set(generationId, Date.now())
}

function pruneStreamedAudioGenerations() {
  const overflow = streamedAudioGenerationStates.size - MAX_STREAMED_AUDIO_GENERATIONS
  if (overflow <= 0) {
    return
  }

  Array.from(streamedAudioGenerationStates.entries())
    .sort(([, left], [, right]) => left.updatedAt - right.updatedAt)
    .slice(0, overflow)
    .forEach(([generationId]) => streamedAudioGenerationStates.delete(generationId))
}

function getStreamedAudioGenerationState(generationId: string) {
  pruneStreamedAudioGenerations()
  let state = streamedAudioGenerationStates.get(generationId)
  if (!state) {
    state = {
      seenSequences: new Set<number>(),
      completed: false,
      updatedAt: Date.now()
    }
    streamedAudioGenerationStates.set(generationId, state)
  }
  state.updatedAt = Date.now()
  return state
}

function markStreamSequenceSeen(generationId: string, sequence: number) {
  const state = getStreamedAudioGenerationState(generationId)
  if (state.seenSequences.has(sequence)) {
    return false
  }
  state.seenSequences.add(sequence)
  state.completed = false
  return true
}

function bumpDiscardEpoch() {
  discardEpoch += 1
}

function getGenerationDiscardedAt(generationId?: string) {
  if (!generationId) {
    return null
  }
  pruneDiscardedGenerations()
  return discardedGenerationIds.get(generationId) ?? null
}

function shouldSkipDiscardedQueueItem(item: QueueItem) {
  const discardedAt = getGenerationDiscardedAt(item.generationId)
  if (item.source !== 'manual') {
    return discardedAt !== null
  }

  return discardedAt !== null && discardedAt !== item.discardedAtWhenQueued
}

function markActiveGenerationsDiscarded() {
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
  streamedAudioGenerationStates.forEach((_state, generationId) => generationIds.add(generationId))
  generationIds.forEach(markGenerationDiscarded)
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
  if (shouldSkipDiscardedQueueItem(item)) {
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
    const discardEpochBeforeSynthesis = discardEpoch
    const generationDiscardedAtBeforeSynthesis = getGenerationDiscardedAt(generationId)
    if (source === 'auto' && generationDiscardedAtBeforeSynthesis !== null) {
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

    const generationDiscardedAtAfterSynthesis = getGenerationDiscardedAt(generationId)
    if (source === 'manual' && discardEpoch !== discardEpochBeforeSynthesis) {
      return
    }
    if (source === 'auto' && generationDiscardedAtAfterSynthesis !== null) {
      return
    }
    if (
      source === 'manual'
      && generationDiscardedAtAfterSynthesis !== null
      && generationDiscardedAtAfterSynthesis !== generationDiscardedAtBeforeSynthesis
    ) {
      return
    }

    const item: QueueItem = {
      id: `tts_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      text: normalizedText,
      source,
      generationId,
      discardedAtWhenQueued: source === 'manual' ? generationDiscardedAtAfterSynthesis : undefined,
      url: URL.createObjectURL(blob)
    }
    queue.value.push(item)
    await playNext()
  }

  async function enqueueAudioSegment(segment: AudioSegmentOptions) {
    const generationId = segment.generationId.trim()
    const sequence = Number(segment.sequence)
    if (!generationId || !Number.isInteger(sequence) || sequence < 0) {
      return
    }
    if (getGenerationDiscardedAt(generationId) !== null) {
      return
    }
    if (!markStreamSequenceSeen(generationId, sequence)) {
      return
    }

    const item: QueueItem = {
      id: `tts_stream_${generationId}_${sequence}_${segment.segmentId}`,
      text: segment.text.trim(),
      source: 'stream',
      generationId,
      segmentId: segment.segmentId,
      sequence,
      mediaType: segment.mediaType,
      url: URL.createObjectURL(segment.audio)
    }

    if (shouldSkipDiscardedQueueItem(item)) {
      revokeItem(item)
      return
    }

    queue.value.push(item)
    await playNext()
  }

  function skipAudioSegment(generationId: string, sequence: number) {
    if (!generationId || !Number.isInteger(sequence) || sequence < 0) {
      return
    }
    markStreamSequenceSeen(generationId, sequence)
  }

  function completeAudioGeneration(generationId: string) {
    if (!generationId) {
      return
    }
    const state = getStreamedAudioGenerationState(generationId)
    state.completed = true
    state.updatedAt = Date.now()
  }

  function trackAudioGeneration(generationId: string) {
    if (!generationId || getGenerationDiscardedAt(generationId) !== null) {
      return
    }
    getStreamedAudioGenerationState(generationId)
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

  function discardGenerationAudio(generationId: string) {
    markGenerationDiscarded(generationId)
    streamedAudioGenerationStates.delete(generationId)
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

  function vadInterruptGeneration(generationId: string) {
    discardGenerationAudio(generationId)
  }

  function discardActiveAudio(generationId?: string) {
    bumpDiscardEpoch()
    if (generationId) {
      discardGenerationAudio(generationId)
    } else {
      markActiveGenerationsDiscarded()
    }
    stop()
  }

  function stopBecauseContextChanged() {
    // Chat or character changed; queued TTS belongs to the previous context.
    discardActiveAudio()
  }

  function vadInterruptPlayback(generationId?: string) {
    discardActiveAudio(generationId)
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
    enqueueAudioSegment,
    skipAudioSegment,
    completeAudioGeneration,
    trackAudioGeneration,
    pause,
    resume,
    stop,
    stopBecauseContextChanged,
    discardGenerationAudio,
    vadInterruptGeneration,
    vadInterruptPlayback,
    seek
  }
}
