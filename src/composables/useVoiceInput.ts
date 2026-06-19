import { computed, onUnmounted, ref } from 'vue'

import { asrApi } from '@/api/asr'
import { useASRStore } from '@/stores/asr'
import { createWavRecorder } from '@/utils/audioRecording'

type SpeechRecognitionConstructor = new () => SpeechRecognition

interface SpeechRecognitionAlternative {
  transcript: string
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean
  readonly 0: SpeechRecognitionAlternative
}

interface SpeechRecognitionResultList {
  readonly length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
}

interface SpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

export interface VoiceInputOptions {
  onTranscript?: (text: string) => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  const speechWindow = window as SpeechWindow
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
}

export function useVoiceInput(options: VoiceInputOptions = {}) {
  const asrStore = useASRStore()
  const isListening = ref(false)
  const isRecording = ref(false)
  const isTranscribing = ref(false)
  const interimText = ref('')
  const error = ref<string | null>(null)
  const elapsedMs = ref(0)

  let recognition: SpeechRecognition | undefined
  let wavRecorder: Awaited<ReturnType<typeof createWavRecorder>> | undefined
  let mediaStream: MediaStream | undefined
  let timer: ReturnType<typeof setInterval> | undefined

  const activeProvider = computed(() => asrStore.activeProvider)
  const supportsWebSpeech = computed(() => typeof window !== 'undefined' && !!getSpeechRecognitionConstructor())
  const isBusy = computed(() => isListening.value || isRecording.value || isTranscribing.value)

  function startTimer() {
    const startedAt = Date.now()
    elapsedMs.value = 0
    timer = setInterval(() => {
      elapsedMs.value = Date.now() - startedAt
    }, 250)
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer)
      timer = undefined
    }
    elapsedMs.value = 0
  }

  async function start() {
    error.value = null
    interimText.value = ''

    if (!asrStore.moduleEnabled) {
      error.value = 'ASR module is disabled'
      return
    }

    if (activeProvider.value?.supports_browser_streaming) {
      startWebSpeech()
      return
    }

    await startBackendRecording()
  }

  async function stop() {
    if (recognition) {
      recognition.stop()
      return
    }

    if (wavRecorder) {
      void stopBackendRecording()
    }
  }

  function startWebSpeech() {
    const SpeechRecognition = getSpeechRecognitionConstructor()
    if (!SpeechRecognition) {
      error.value = 'Web Speech API is not available in this browser'
      return
    }

    const providerConfig = asrStore.activeProviderConfig
    recognition = new SpeechRecognition()
    recognition.lang = String(providerConfig.language || 'zh-CN')
    recognition.continuous = Boolean(providerConfig.continuous ?? true)
    recognition.interimResults = Boolean(providerConfig.interim_results ?? true)
    recognition.maxAlternatives = Number(providerConfig.max_alternatives ?? 1)

    recognition.onresult = (event) => {
      let finalTranscript = ''
      let interimTranscript = ''

      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index]
        const transcript = result[0]?.transcript || ''
        if (result.isFinal) {
          finalTranscript = `${finalTranscript}${transcript} `
        } else if (recognition?.interimResults) {
          interimTranscript += transcript
        }
      }

      interimText.value = interimTranscript.trim()
      const text = finalTranscript.trim()
      if (text) {
        options.onTranscript?.(text)
      }
    }

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return
      }
      error.value = `Speech recognition error: ${event.error}`
    }

    recognition.onend = () => {
      recognition = undefined
      isListening.value = false
      interimText.value = ''
      stopTimer()
    }

    try {
      recognition.start()
      isListening.value = true
      startTimer()
    } catch (err) {
      error.value = errorMessage(err)
      recognition = undefined
      isListening.value = false
      stopTimer()
    }
  }

  async function startBackendRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      error.value = 'Audio recording is not available in this browser'
      return
    }

    const constraints: MediaStreamConstraints = {
      audio: asrStore.selectedAudioInput
        ? { deviceId: { exact: asrStore.selectedAudioInput } }
        : true
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
      wavRecorder = await createWavRecorder(mediaStream)
      isRecording.value = true
      startTimer()
    } catch (err) {
      error.value = errorMessage(err)
      cleanupMedia()
    }
  }

  async function stopBackendRecording() {
    if (!wavRecorder) {
      return
    }

    isRecording.value = false
    isTranscribing.value = true
    stopTimer()

    try {
      const recording = await wavRecorder.stop()
      const result = await asrApi.transcribe(
        recording.blob,
        asrStore.config.asr_model,
        {
          source: recording.contract.source,
          sample_rate: recording.contract.sampleRate,
          channels: recording.contract.channels,
          encoding: recording.contract.encoding
        }
      )
      if (result.text.trim()) {
        options.onTranscript?.(result.text.trim())
      } else {
        error.value = 'No transcription result returned from provider'
      }
    } catch (err) {
      error.value = errorMessage(err)
    } finally {
      isTranscribing.value = false
      cleanupMedia()
    }
  }

  function cleanupMedia() {
    wavRecorder = undefined
    mediaStream?.getTracks().forEach(track => track.stop())
    mediaStream = undefined
    isRecording.value = false
  }

  onUnmounted(() => {
    recognition?.abort()
    if (wavRecorder) {
      void wavRecorder.cancel()
    }
    cleanupMedia()
    stopTimer()
  })

  return {
    isListening,
    isRecording,
    isTranscribing,
    isBusy,
    interimText,
    error,
    elapsedMs,
    supportsWebSpeech,
    start,
    stop
  }
}
