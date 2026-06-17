import { computed, onUnmounted, ref, watch } from 'vue'

import { useASRStore } from '@/stores/asr'
import { useWebSocketStore } from '@/stores/websocket'

const TARGET_SAMPLE_RATE = 16000
const PROCESSOR_BUFFER_SIZE = 4096
const AUDIO_CHUNK_TYPE = 'input:audio:chunk'
const AUDIO_END_TYPE = 'input:audio:end'
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

interface RealtimeAudioChunkMessage {
  type: typeof AUDIO_CHUNK_TYPE
  data: {
    chat_id: string
    character_id: string
    audio: number[]
    seq: number
  }
}

interface RealtimeAudioEndMessage {
  type: typeof AUDIO_END_TYPE
  data: {
    chat_id: string
    character_id: string
  }
}

interface StopOptions {
  notifyBackend?: boolean
  errorMessage?: string
}

interface VadListenStateData {
  chat_id?: string
  character_id?: string
  state?: string
  is_speech?: boolean
  seq?: number
  probability?: number
  energy?: number
  reason?: string
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

function buildAudioChunkMessage(
  session: RealtimeVoiceInputSession,
  audio: number[],
  seq: number
): RealtimeAudioChunkMessage {
  return {
    type: AUDIO_CHUNK_TYPE,
    data: {
      chat_id: session.chatId,
      character_id: session.characterId,
      audio,
      seq
    }
  }
}

function buildAudioEndMessage(session: RealtimeVoiceInputSession): RealtimeAudioEndMessage {
  return {
    type: AUDIO_END_TYPE,
    data: {
      chat_id: session.chatId,
      character_id: session.characterId
    }
  }
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
  const wsStore = useWebSocketStore()

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

  const canStart = computed(() => asrStore.moduleEnabled && wsStore.connected)
  const isSpeaking = computed(() => isListening.value && (isSpeech.value || SPEAKING_STATES.has(listenState.value)))

  function resetListenState() {
    listenState.value = 'silence'
    isSpeech.value = false
    probability.value = null
    energy.value = null
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
      error.value = listenStateData.reason || 'Realtime VAD processing failed'
    }
  }

  function detachListenStateListener() {
    wsStore.wsManager?.off(LISTEN_STATE_EVENT, handleListenState)
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
    const session = activeSession
    const notifyBackend = options.notifyBackend ?? true

    if (options.errorMessage) {
      error.value = options.errorMessage
    }

    cleanupAudioGraph()

    if (session && notifyBackend) {
      wsStore.sendIfOpen(buildAudioEndMessage(session))
    }
  }

  function handleAudioProcess(event: AudioProcessingEvent) {
    if (!activeSession || !isListening.value) {
      return
    }

    if (!wsStore.connected) {
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
    const sent = wsStore.sendIfOpen(buildAudioChunkMessage(activeSession, audio, seq.value))
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

    error.value = null

    if (!session.chatId || !session.characterId) {
      error.value = 'Realtime voice input requires an active chat and character'
      return false
    }

    if (!asrStore.moduleEnabled) {
      error.value = 'ASR module is disabled'
      return false
    }

    if (!wsStore.connected) {
      error.value = 'WebSocket is not connected'
      return false
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      error.value = 'Media input is not available in this browser'
      return false
    }

    const AudioContextConstructor = getAudioContextConstructor()
    if (!AudioContextConstructor) {
      error.value = 'AudioContext is not available in this browser'
      return false
    }

    isStarting.value = true
    seq.value = 0
    resetListenState()
    activeSession = { ...session }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: buildAudioConstraints(asrStore.selectedAudioInput)
      })

      if (!wsStore.connected) {
        throw new Error('WebSocket disconnected before realtime voice input started')
      }

      audioContext = new AudioContextConstructor()
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      sourceNode = audioContext.createMediaStreamSource(mediaStream)
      processorNode = audioContext.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1)
      muteGainNode = audioContext.createGain()
      muteGainNode.gain.value = 0
      processorNode.onaudioprocess = handleAudioProcess

      sourceNode.connect(processorNode)
      processorNode.connect(muteGainNode)
      muteGainNode.connect(audioContext.destination)

      isListening.value = true
      isStarting.value = false
      return true
    } catch (err) {
      error.value = errorMessage(err)
      cleanupAudioGraph()
      return false
    }
  }

  watch(
    () => wsStore.wsManager,
    (manager, previousManager) => {
      previousManager?.off(LISTEN_STATE_EVENT, handleListenState)
      manager?.on(LISTEN_STATE_EVENT, handleListenState)
    },
    { immediate: true }
  )

  watch(
    () => wsStore.connected,
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
