import { computed, onUnmounted, ref, watch } from 'vue'

import { useASRStore } from '@/stores/asr'
import { useWebSocket } from '@/composables/useWebSocket'
import type { VadListenStateData } from '@/types/websocket'

const TARGET_SAMPLE_RATE = 16000
const PROCESSOR_BUFFER_SIZE = 4096
const ERROR_DISPLAY_MS = 3000
const LISTEN_STATE_EVENT = 'vad:listen-state'
const SPEAKING_STATES = new Set(['speech_start', 'speech_chunk'])

type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext
type VadListenState = 'speech_start' | 'speech_chunk' | 'speech_end' | 'silence' | 'error'

type AudioWindow = Window & {
  webkitAudioContext?: AudioContextConstructor
}

export interface RealtimeVoiceInputSession {
  chatId: string
  characterId: string
}

interface StopOptions {
  notifyBackend?: boolean
  errorMessage?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getAudioContextConstructor(): AudioContextConstructor | undefined {
  const audioWindow = window as AudioWindow
  return window.AudioContext || audioWindow.webkitAudioContext
}

function clampAudioSample(sample: number): number {
  if (sample > 1) {
    return 1
  }

  if (sample < -1) {
    return -1
  }

  return sample
}

function resampleToTargetRate(input: Float32Array, sourceSampleRate: number): number[] {
  if (input.length === 0 || sourceSampleRate <= 0) {
    return []
  }

  if (sourceSampleRate === TARGET_SAMPLE_RATE) {
    return Array.from(input, clampAudioSample)
  }

  const sampleRateRatio = sourceSampleRate / TARGET_SAMPLE_RATE
  const outputLength = Math.max(1, Math.floor(input.length / sampleRateRatio))
  const output = new Array<number>(outputLength)

  for (let index = 0; index < outputLength; index++) {
    const sourceIndex = index * sampleRateRatio
    const beforeIndex = Math.floor(sourceIndex)
    const afterIndex = Math.min(beforeIndex + 1, input.length - 1)
    const weight = sourceIndex - beforeIndex
    const before = input[beforeIndex] ?? 0
    const after = input[afterIndex] ?? before

    output[index] = clampAudioSample(before + (after - before) * weight)
  }

  return output
}

function buildAudioConstraints(deviceId: string): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }

  if (deviceId) {
    constraints.deviceId = { exact: deviceId }
  }

  return constraints
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseListenState(data: unknown): VadListenStateData | null {
  if (!isRecord(data)) {
    return null
  }

  return {
    chat_id: typeof data.chat_id === 'string' ? data.chat_id : undefined,
    character_id: typeof data.character_id === 'string' ? data.character_id : undefined,
    state: typeof data.state === 'string' ? data.state : undefined,
    is_speech: typeof data.is_speech === 'boolean' ? data.is_speech : undefined,
    seq: typeof data.seq === 'number' ? data.seq : undefined,
    probability: typeof data.probability === 'number' ? data.probability : undefined,
    energy: typeof data.energy === 'number' ? data.energy : undefined,
    code: typeof data.code === 'string' ? data.code : undefined,
    message: typeof data.message === 'string' ? data.message : undefined,
    reason: typeof data.reason === 'string' ? data.reason : undefined
  }
}

function normalizeListenState(state: string | undefined): VadListenState {
  switch (state) {
    case 'speech_start':
    case 'speech_chunk':
    case 'speech_end':
    case 'silence':
    case 'error':
      return state
    default:
      return 'silence'
  }
}

export function useRealtimeVoiceInput() {
  const asrStore = useASRStore()
  const {
    canSend,
    connected,
    sendAudioChunk,
    sendAudioEnd,
    on: onSocketEvent,
    off: offSocketEvent
  } = useWebSocket()

  const isListening = ref(false)
  const isStarting = ref(false)
  const error = ref<string | null>(null)
  const seq = ref(0)
  const listenState = ref<VadListenState>('silence')
  const isSpeech = ref(false)
  const probability = ref<number | null>(null)
  const energy = ref<number | null>(null)

  let activeSession: RealtimeVoiceInputSession | null = null
  let mediaStream: MediaStream | null = null
  let audioContext: AudioContext | null = null
  let sourceNode: MediaStreamAudioSourceNode | null = null
  let processorNode: ScriptProcessorNode | null = null
  let muteGainNode: GainNode | null = null
  let errorTimer: number | null = null
  let startRunId = 0

  const canStart = computed(() => asrStore.moduleEnabled && connected.value)
  const isSpeaking = computed(() => isListening.value && (isSpeech.value || SPEAKING_STATES.has(listenState.value)))

  function clearErrorTimer() {
    if (errorTimer !== null) {
      window.clearTimeout(errorTimer)
      errorTimer = null
    }
  }

  function setError(message: string | null) {
    clearErrorTimer()
    error.value = message

    if (!message) {
      return
    }

    // VAD 错误只短暂展示；新错误会覆盖旧错误并重新计时。
    errorTimer = window.setTimeout(() => {
      if (error.value === message) {
        error.value = null
      }
      errorTimer = null
    }, ERROR_DISPLAY_MS)
  }

  function resetListenState() {
    listenState.value = 'silence'
    isSpeech.value = false
    probability.value = null
    energy.value = null
  }

  function nextStartRunId() {
    startRunId += 1
    return startRunId
  }

  function isCurrentStartRun(runId: number) {
    return runId === startRunId
  }

  function cleanupLocalAudioGraph(parts: {
    stream?: MediaStream | null
    context?: AudioContext | null
    source?: MediaStreamAudioSourceNode | null
    processor?: ScriptProcessorNode | null
    gain?: GainNode | null
  }) {
    parts.processor?.disconnect()
    parts.source?.disconnect()
    parts.gain?.disconnect()
    parts.stream?.getTracks().forEach(track => track.stop())

    if (parts.processor) {
      parts.processor.onaudioprocess = null
    }

    if (parts.context && parts.context.state !== 'closed') {
      void parts.context.close()
    }
  }

  function handleListenState(data?: unknown) {
    const listenStateData = parseListenState(data)
    if (!activeSession || !listenStateData) {
      return
    }

    if (
      listenStateData.chat_id !== activeSession.chatId ||
      listenStateData.character_id !== activeSession.characterId
    ) {
      return
    }

    listenState.value = normalizeListenState(listenStateData.state)
    isSpeech.value = Boolean(listenStateData.is_speech)
    probability.value = listenStateData.probability ?? null
    energy.value = listenStateData.energy ?? null

    if (listenState.value === 'error') {
      setError(listenStateData.message || listenStateData.reason || listenStateData.code || 'VAD processing failed')
    }
  }

  function detachListenStateListener() {
    offSocketEvent(LISTEN_STATE_EVENT, handleListenState)
  }

  function cleanupAudioGraph() {
    processorNode?.disconnect()
    sourceNode?.disconnect()
    muteGainNode?.disconnect()
    mediaStream?.getTracks().forEach(track => track.stop())

    if (processorNode) {
      processorNode.onaudioprocess = null
    }

    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close()
    }

    activeSession = null
    mediaStream = null
    audioContext = null
    sourceNode = null
    processorNode = null
    muteGainNode = null
    isListening.value = false
    isStarting.value = false
    resetListenState()
  }

  async function stop(options: StopOptions = {}) {
    nextStartRunId()
    const session = activeSession
    const notifyBackend = options.notifyBackend ?? true

    if (options.errorMessage) {
      setError(options.errorMessage)
    }

    cleanupAudioGraph()

    if (session && notifyBackend) {
      sendAudioEnd({
        chatId: session.chatId,
        characterId: session.characterId
      })
    }
  }

  function handleAudioProcess(event: AudioProcessingEvent) {
    if (!activeSession || !isListening.value) {
      return
    }

    if (!canSend()) {
      void stop({
        notifyBackend: false,
        errorMessage: 'WebSocket disconnected; realtime voice input stopped'
      })
      return
    }

    const input = event.inputBuffer.getChannelData(0)
    const sourceSampleRate = audioContext?.sampleRate ?? TARGET_SAMPLE_RATE
    const audio = resampleToTargetRate(input, sourceSampleRate)

    if (audio.length === 0) {
      return
    }

    seq.value += 1
    const sent = sendAudioChunk({
      chatId: activeSession.chatId,
      characterId: activeSession.characterId,
      audio,
      seq: seq.value
    })
    if (!sent) {
      void stop({
        notifyBackend: false,
        errorMessage: 'WebSocket disconnected; realtime voice input stopped'
      })
    }
  }

  async function start(session: RealtimeVoiceInputSession): Promise<boolean> {
    if (isListening.value || isStarting.value) {
      return true
    }

    setError(null)

    if (!session.chatId || !session.characterId) {
      setError('Realtime voice input requires an active chat and character')
      return false
    }

    if (!asrStore.moduleEnabled) {
      setError('ASR module is disabled')
      return false
    }

    if (!canSend()) {
      setError('WebSocket is not connected')
      return false
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Media input is not available in this browser')
      return false
    }

    const AudioContextConstructor = getAudioContextConstructor()
    if (!AudioContextConstructor) {
      setError('AudioContext is not available in this browser')
      return false
    }

    isStarting.value = true
    seq.value = 0
    resetListenState()
    const runId = nextStartRunId()

    let nextMediaStream: MediaStream | null = null
    let nextAudioContext: AudioContext | null = null
    let nextSourceNode: MediaStreamAudioSourceNode | null = null
    let nextProcessorNode: ScriptProcessorNode | null = null
    let nextMuteGainNode: GainNode | null = null

    try {
      nextMediaStream = await navigator.mediaDevices.getUserMedia({
        audio: buildAudioConstraints(asrStore.selectedAudioInput)
      })

      if (!isCurrentStartRun(runId)) {
        cleanupLocalAudioGraph({ stream: nextMediaStream })
        return false
      }

      if (!canSend()) {
        throw new Error('WebSocket disconnected before realtime voice input started')
      }

      nextAudioContext = new AudioContextConstructor()
      if (nextAudioContext.state === 'suspended') {
        await nextAudioContext.resume()
      }

      if (!isCurrentStartRun(runId)) {
        cleanupLocalAudioGraph({
          stream: nextMediaStream,
          context: nextAudioContext
        })
        return false
      }

      nextSourceNode = nextAudioContext.createMediaStreamSource(nextMediaStream)
      nextProcessorNode = nextAudioContext.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1)
      nextMuteGainNode = nextAudioContext.createGain()
      nextMuteGainNode.gain.value = 0
      nextProcessorNode.onaudioprocess = handleAudioProcess

      if (!isCurrentStartRun(runId)) {
        cleanupLocalAudioGraph({
          stream: nextMediaStream,
          context: nextAudioContext,
          source: nextSourceNode,
          processor: nextProcessorNode,
          gain: nextMuteGainNode
        })
        return false
      }

      nextSourceNode.connect(nextProcessorNode)
      nextProcessorNode.connect(nextMuteGainNode)
      nextMuteGainNode.connect(nextAudioContext.destination)

      if (!isCurrentStartRun(runId)) {
        cleanupLocalAudioGraph({
          stream: nextMediaStream,
          context: nextAudioContext,
          source: nextSourceNode,
          processor: nextProcessorNode,
          gain: nextMuteGainNode
        })
        return false
      }

      activeSession = { ...session }
      mediaStream = nextMediaStream
      audioContext = nextAudioContext
      sourceNode = nextSourceNode
      processorNode = nextProcessorNode
      muteGainNode = nextMuteGainNode
      isListening.value = true
      isStarting.value = false
      return true
    } catch (err) {
      cleanupLocalAudioGraph({
        stream: nextMediaStream,
        context: nextAudioContext,
        source: nextSourceNode,
        processor: nextProcessorNode,
        gain: nextMuteGainNode
      })
      if (isCurrentStartRun(runId)) {
        setError(errorMessage(err))
        cleanupAudioGraph()
      }
      return false
    }
  }

  onSocketEvent(LISTEN_STATE_EVENT, handleListenState)

  watch(
    () => connected.value,
    (connected) => {
      if (!connected && (isListening.value || isStarting.value)) {
        void stop({
          notifyBackend: false,
          errorMessage: 'WebSocket disconnected; realtime voice input stopped'
        })
      }
    }
  )

  onUnmounted(() => {
    clearErrorTimer()
    detachListenStateListener()
    void stop()
  })

  return {
    isListening,
    isStarting,
    isSpeaking,
    canStart,
    error,
    seq,
    listenState,
    isSpeech,
    probability,
    energy,
    start,
    stop
  }
}
