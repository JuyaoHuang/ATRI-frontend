<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import AiriAlert from '@/components/hearing/AiriAlert.vue'
import AiriErrorContainer from '@/components/hearing/AiriErrorContainer.vue'
import AiriLevelMeter from '@/components/hearing/AiriLevelMeter.vue'
import AiriRadioCardSimple from '@/components/hearing/AiriRadioCardSimple.vue'
import AiriTestDummyMarker from '@/components/hearing/AiriTestDummyMarker.vue'
import AiriThresholdMeter from '@/components/hearing/AiriThresholdMeter.vue'
import AiriTimeSeriesChart from '@/components/hearing/AiriTimeSeriesChart.vue'
import Button from '@/components/airi-ui/Button.vue'
import Checkbox from '@/components/airi-ui/Checkbox.vue'
import FieldCheckbox from '@/components/airi-ui/FieldCheckbox.vue'
import FieldComboboxSelect from '@/components/airi-ui/FieldComboboxSelect.vue'
import FieldRange from '@/components/airi-ui/FieldRange.vue'
import { asrApi } from '@/api/asr'
import type { ASRProviderConfig } from '@/api/types'
import { useAudioLevel } from '@/composables/useAudioLevel'
import { useASRStore } from '@/stores/asr'
import { createWavRecorder } from '@/utils/audioRecording'

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition

interface BrowserSpeechRecognitionAlternative {
  transcript: string
}

interface BrowserSpeechRecognitionResult {
  readonly isFinal: boolean
  readonly 0: BrowserSpeechRecognitionAlternative
}

interface BrowserSpeechRecognitionResultList {
  readonly length: number
  [index: number]: BrowserSpeechRecognitionResult
}

interface BrowserSpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: BrowserSpeechRecognitionResultList
}

interface BrowserSpeechRecognitionErrorEvent extends Event {
  readonly error: string
}

interface BrowserSpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type BrowserSpeechWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor
}

const asrStore = useASRStore()
const audioLevel = useAudioLevel()

const isMonitoring = ref(false)
const isTesting = ref(false)
const isTranscribing = ref(false)
const testText = ref('')
const streamingText = ref('')
const statusMessage = ref('')
const testError = ref('')
const mediaStream = ref<MediaStream | null>(null)
let wavRecorder: Awaited<ReturnType<typeof createWavRecorder>> | undefined
let stopWebSpeechTest: (() => void) | undefined

const activeProviderName = computed({
  get: () => asrStore.config.asr_model,
  set: (value: string) => {
    void asrStore.switchProvider(value)
  }
})

const selectedAudioInput = computed({
  get: () => asrStore.selectedAudioInput,
  set: (value: string | undefined) => asrStore.setSelectedAudioInput(value || '')
})

const activeProvider = computed(() => asrStore.activeProvider)
const activeConfig = computed(() => asrStore.activeProviderConfig)
const isWebSpeechAvailable = computed(() => typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window))
const shouldUseBrowserSpeech = computed(() => activeProvider.value?.supports_browser_streaming && isWebSpeechAvailable.value)
const canUseBackendTranscription = computed(() => activeProvider.value?.supports_backend_transcription)
const testButtonIconClass = computed(() => {
  if (isTranscribing.value) {
    return 'i-solar:refresh-bold-duotone mr-2 text-lg animate-spin'
  }
  if (isTesting.value) {
    return 'i-solar:stop-circle-bold-duotone mr-2 text-lg'
  }
  return 'i-solar:microphone-bold-duotone mr-2 text-lg'
})
const statusIconClass = computed(() => isTranscribing.value
  ? 'i-solar:refresh-bold-duotone text-sm animate-spin'
  : 'i-solar:info-circle-bold-duotone text-sm'
)
const infoIconClass = 'i-solar:info-circle-bold-duotone text-sm'
const moduleToggleIconClass = 'i-solar:microphone-bold-duotone h-5 w-5'
const speakingIndicatorClass = computed(() => audioLevel.isSpeech.value
  ? 'bg-green-500 shadow-lg shadow-green-500/50'
  : audioLevel.normalizedVolume.value > audioLevel.threshold.value * 0.55
    ? 'bg-yellow-500 shadow-lg shadow-yellow-500/30'
    : 'bg-white dark:bg-neutral-900 border-2 border-neutral-300 dark:border-neutral-600'
)

const browserLanguageOptions = [
  { label: 'Chinese (Simplified)', value: 'zh-CN' },
  { label: 'Chinese (Traditional)', value: 'zh-TW' },
  { label: 'English (US)', value: 'en-US' },
  { label: 'English (UK)', value: 'en-GB' },
  { label: 'Japanese', value: 'ja-JP' },
  { label: 'Korean', value: 'ko-KR' },
  { label: 'French', value: 'fr-FR' },
  { label: 'German', value: 'de-DE' },
  { label: 'Spanish', value: 'es-ES' },
]

const backendLanguageOptions = [
  { label: '置空项', value: '' },
  { label: '中文', value: 'zh' },
  { label: '英语', value: 'en' },
  { label: '日语', value: 'ja' },
  { label: '韩语', value: 'ko' },
  { label: '俄语', value: 'ru' },
  { label: '法语', value: 'fr' },
  { label: '德语', value: 'de' },
  { label: '西班牙语', value: 'es' },
  { label: '意大利语', value: 'it' },
  { label: '葡萄牙语', value: 'pt' },
]

function configString(key: string, fallback = '') {
  const value = activeConfig.value[key]
  return typeof value === 'string' ? value : fallback
}

function configBoolean(key: string, fallback = false) {
  const value = activeConfig.value[key]
  return typeof value === 'boolean' ? value : fallback
}

function configNumber(key: string, fallback: number) {
  const value = activeConfig.value[key]
  return typeof value === 'number' ? value : fallback
}

function getSpeechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | undefined {
  const speechWindow = window as BrowserSpeechWindow
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
}

async function updateActiveProviderConfig(patch: ASRProviderConfig) {
  await asrStore.updateProviderConfig(activeProviderName.value, patch)
}

async function requestAudioStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Browser does not support microphone capture')
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: asrStore.selectedAudioInput
      ? { deviceId: { exact: asrStore.selectedAudioInput } }
      : true
  })
  mediaStream.value = stream
  await asrStore.loadAudioInputs()
  return stream
}

async function setupAudioMonitoring() {
  await stopAudioMonitoring()
  const stream = await requestAudioStream()
  await audioLevel.start(stream)
}

async function stopAudioMonitoring() {
  audioLevel.stop()
  mediaStream.value?.getTracks().forEach(track => track.stop())
  mediaStream.value = null
  isMonitoring.value = false
}

async function toggleMonitoring() {
  testError.value = ''
  if (!asrStore.moduleEnabled) {
    testError.value = 'ASR module is disabled'
    return
  }

  if (isMonitoring.value) {
    await stopAudioMonitoring()
    return
  }

  try {
    await setupAudioMonitoring()
    isMonitoring.value = true
  } catch (error) {
    testError.value = error instanceof Error ? error.message : String(error)
  }
}

function startWebSpeechTest() {
  const SpeechRecognition = getSpeechRecognitionConstructor()
  if (!SpeechRecognition) {
    testError.value = 'Web Speech API is not available in this browser'
    return
  }

  const recognition = new SpeechRecognition()
  recognition.lang = configString('language', 'zh-CN')
  recognition.continuous = configBoolean('continuous', true)
  recognition.interimResults = configBoolean('interim_results', true)
  recognition.maxAlternatives = configNumber('max_alternatives', 1)

  recognition.onresult = (event: BrowserSpeechRecognitionEvent) => {
    let finalTranscript = ''
    let interimTranscript = ''
    for (let index = event.resultIndex; index < event.results.length; index++) {
      const result = event.results[index]
      const transcript = result[0]?.transcript || ''
      if (result.isFinal) {
        finalTranscript = `${finalTranscript}${transcript} `
      } else {
        interimTranscript += transcript
      }
    }
    streamingText.value = interimTranscript.trim()
    if (finalTranscript.trim()) {
      testText.value = `${testText.value} ${finalTranscript.trim()}`.trim()
      statusMessage.value = 'Transcribing... (streaming)'
    }
  }

  recognition.onerror = (event: BrowserSpeechRecognitionErrorEvent) => {
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      testError.value = `Speech recognition error: ${event.error}`
    }
  }

  recognition.onend = () => {
    isTesting.value = false
    isTranscribing.value = false
    streamingText.value = ''
    statusMessage.value = testText.value ? 'Transcription complete!' : 'Stopped'
    stopWebSpeechTest = undefined
  }

  recognition.start()
  isTesting.value = true
  isTranscribing.value = false
  statusMessage.value = 'Listening for speech... (Web Speech API streaming mode)'
  stopWebSpeechTest = () => recognition.stop()
}

async function startBackendTest() {
  const stream = await requestAudioStream()
  wavRecorder = await createWavRecorder(stream)
  isTesting.value = true
  isTranscribing.value = false
  statusMessage.value = 'Recording audio for transcription...'
}

async function transcribeBackendRecording() {
  if (!wavRecorder) {
    return
  }

  isTranscribing.value = true
  statusMessage.value = 'Processing transcription...'
  try {
    const recording = await wavRecorder.stop()
    const result = await asrApi.transcribe(
      recording.blob,
      activeProviderName.value,
      {
        source: recording.contract.source,
        sample_rate: recording.contract.sampleRate,
        channels: recording.contract.channels,
        encoding: recording.contract.encoding
      }
    )
    testText.value = result.text
    statusMessage.value = result.text ? 'Transcription complete!' : 'No transcription returned'
  } catch (error) {
    testError.value = error instanceof Error ? error.message : String(error)
    statusMessage.value = 'Transcription failed'
  } finally {
    wavRecorder = undefined
    isTranscribing.value = false
    isTesting.value = false
    mediaStream.value?.getTracks().forEach(track => track.stop())
    mediaStream.value = null
  }
}

async function startSTTTest() {
  testError.value = ''
  testText.value = ''
  streamingText.value = ''
  statusMessage.value = ''

  try {
    if (!asrStore.moduleEnabled) {
      testError.value = 'ASR module is disabled'
      return
    }

    if (shouldUseBrowserSpeech.value) {
      startWebSpeechTest()
      return
    }

    if (!canUseBackendTranscription.value) {
      testError.value = 'Selected provider cannot transcribe in this environment'
      return
    }

    await startBackendTest()
  } catch (error) {
    testError.value = error instanceof Error ? error.message : String(error)
    isTesting.value = false
    isTranscribing.value = false
  }
}

async function stopSTTTest() {
  try {
    if (stopWebSpeechTest) {
      stopWebSpeechTest()
      stopWebSpeechTest = undefined
    } else if (wavRecorder) {
      await transcribeBackendRecording()
      return
    }
  } catch {
    // Stopping may race with recorder or browser speech end events.
  }
  if (streamingText.value.trim() && !testText.value) {
    testText.value = streamingText.value.trim()
  }
  mediaStream.value?.getTracks().forEach(track => track.stop())
  mediaStream.value = null
  isTesting.value = false
  isTranscribing.value = false
  statusMessage.value = 'Stopped'
}

watch(() => asrStore.selectedAudioInput, async () => {
  if (isMonitoring.value) {
    await setupAudioMonitoring()
    isMonitoring.value = true
  }
})

watch(() => asrStore.moduleEnabled, (enabled) => {
  if (!enabled) {
    void stopAudioMonitoring()
    void stopSTTTest()
  }
})

onMounted(async () => {
  await asrStore.load()
  await asrStore.loadAudioInputs()
})

onUnmounted(() => {
  void stopAudioMonitoring()
  if (wavRecorder) {
    void wavRecorder.cancel()
    wavRecorder = undefined
  }
  void stopSTTTest()
})
</script>

<template>
  <div flex="~ col md:row gap-6">
    <div bg="neutral-100 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-4" class="h-fit w-full md:w-[40%]">
      <AiriErrorContainer v-if="asrStore.error" title="ASR Error" :error="asrStore.error" />

      <div>
        <FieldComboboxSelect
          v-model="selectedAudioInput"
          label="Audio Input Device"
          description="Select the audio input device for your hearing module."
          :options="asrStore.audioInputs.map(input => ({ label: input.label || input.deviceId, value: input.deviceId }))"
          placeholder="Select an audio input device"
          layout="vertical"
        />
      </div>

      <label class="asr-module-toggle">
        <div class="asr-module-toggle__icon">
          <div :class="moduleToggleIconClass" />
        </div>
        <div class="asr-module-toggle__copy">
          <span class="asr-module-toggle__label">ASR Module</span>
          <span class="asr-module-toggle__hint">
            {{ asrStore.moduleEnabled ? 'Voice input is enabled' : 'Voice input is disabled' }}
          </span>
        </div>
        <Checkbox
          class="asr-module-toggle__switch"
          :model-value="asrStore.moduleEnabled"
          @update:model-value="value => asrStore.setEnabled(value)"
        />
      </label>

      <div flex="~ col gap-4">
        <div>
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
            Providers
          </h2>
          <div text="neutral-400 dark:neutral-400">
            Select the ASR provider used by the hearing module.
          </div>
        </div>

        <fieldset
          v-if="asrStore.providers.length > 0"
          class="grid grid-cols-2 gap-4"
          min-w-0
          role="radiogroup"
        >
          <AiriRadioCardSimple
            v-for="provider in asrStore.providers"
            :id="provider.name"
            :key="provider.name"
            v-model="activeProviderName"
            name="provider"
            :value="provider.name"
            :title="provider.display_name"
            :description="provider.description"
          >
            <template #topRight>
              <div
                class="size-2.5 rounded-full"
                :class="provider.available ? 'bg-green-500' : 'bg-amber-400'"
                :title="provider.reason || (provider.available ? 'Available' : 'Unavailable')"
              />
            </template>
          </AiriRadioCardSimple>
        </fieldset>
        <AiriAlert v-else type="loading">
          <template #title>
            Loading providers
          </template>
        </AiriAlert>
      </div>

      <AiriAlert v-if="activeProvider && !activeProvider.available" type="warning">
        <template #title>
          Provider unavailable
        </template>
        <template #content>
          {{ activeProvider.reason }}
        </template>
      </AiriAlert>

      <div v-if="activeProviderName === 'web_speech_api'" flex="~ col gap-4">
        <FieldComboboxSelect
          :model-value="configString('language', 'zh-CN')"
          label="Recognition Language"
          description="Select the browser speech recognition language."
          :options="browserLanguageOptions"
          layout="vertical"
          @update:model-value="value => updateActiveProviderConfig({ language: String(value || 'zh-CN') })"
        />
        <FieldCheckbox
          :model-value="configBoolean('continuous', true)"
          label="Continuous Recognition"
          description="Keep listening continuously instead of stopping after each phrase."
          @update:model-value="value => updateActiveProviderConfig({ continuous: value })"
        />
        <FieldCheckbox
          :model-value="configBoolean('interim_results', true)"
          label="Show Interim Results"
          description="Display partial recognition results while you speak."
          @update:model-value="value => updateActiveProviderConfig({ interim_results: value })"
        />
      </div>

      <div v-else-if="activeProviderName === 'faster_whisper'" flex="~ col gap-4">
        <div class="grid gap-2">
          <label class="text-sm font-medium">Model</label>
          <input
            class="cursor-not-allowed rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-500 outline-none dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-400"
            :value="configString('model_path', 'distil-medium.en')"
            readonly
            disabled
          >
        </div>
        <FieldComboboxSelect
          :model-value="configString('language', '')"
          label="Language"
          description="OLV-compatible language code; empty means auto-detect."
          :options="backendLanguageOptions"
          layout="vertical"
          @update:model-value="value => updateActiveProviderConfig({ language: String(value ?? '') })"
        />
      </div>

      <div v-else-if="activeProviderName === 'whisper_cpp'" flex="~ col gap-4">
        <div class="grid gap-2">
          <label class="text-sm font-medium">Model</label>
          <input
            class="cursor-not-allowed rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-500 outline-none dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-400"
            :value="configString('model_name', 'small')"
            readonly
            disabled
          >
        </div>
      </div>

      <div v-else-if="activeProviderName === 'openai_whisper'" flex="~ col gap-4">
        <div class="grid gap-2">
          <label class="text-sm font-medium">Model</label>
          <input
            class="cursor-not-allowed rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-500 outline-none dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-400"
            :value="configString('model', 'whisper-1')"
            readonly
            disabled
          >
        </div>
      </div>

      <div class="border-t border-neutral-200 pt-4 dark:border-neutral-700">
        <div class="mb-4">
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
            Auto-send Settings
          </h2>
          <div text="neutral-400 dark:neutral-400">
            Configure automatic sending of transcribed text to chat.
          </div>
        </div>

        <div class="space-y-4">
          <FieldCheckbox
            :model-value="asrStore.autoSendEnabled"
            label="Auto-send transcribed text"
            description="Automatically send transcribed text to chat after a delay."
            @update:model-value="value => asrStore.updateAutoSend(value, asrStore.autoSendDelay)"
          />

          <FieldRange
            v-if="asrStore.autoSendEnabled"
            :model-value="asrStore.autoSendDelay"
            label="Auto-send delay"
            description="Delay before automatically sending transcribed text."
            :min="0"
            :max="10000"
            :step="100"
            :format-value="value => value === 0 ? 'Immediate' : `${(value / 1000).toFixed(1)}s`"
            @update:model-value="value => asrStore.updateAutoSend(true, value)"
          />
        </div>
      </div>
    </div>

    <div flex="~ col gap-6" class="w-full md:w-[60%]">
      <div w-full rounded-xl>
        <h2 class="mb-4 text-lg text-neutral-500 md:text-2xl dark:text-neutral-400" w-full>
          <div class="inline-flex items-center gap-4">
            <AiriTestDummyMarker />
            <div>Audio Monitor</div>
          </div>
        </h2>

        <AiriErrorContainer v-if="testError || audioLevel.error.value" title="Error occurred" :error="testError || audioLevel.error.value" mb-4 />

        <Button class="mb-4" block :disabled="!asrStore.moduleEnabled" @click="toggleMonitoring">
          {{ isMonitoring ? 'Stop Monitoring' : 'Start Monitoring' }}
        </Button>

        <div flex="~ col gap-4">
          <AiriLevelMeter :level="audioLevel.volumeLevel.value" label="Input Level" />
          <AiriThresholdMeter
            :value="audioLevel.normalizedVolume.value"
            :threshold="audioLevel.threshold.value"
            label="Probability of Speech"
            below-label="Silence"
            above-label="Speech"
            threshold-label="Detection threshold"
          />
          <FieldRange
            v-model="audioLevel.threshold.value"
            label="Sensitivity"
            description="Adjust the threshold for speech detection."
            :min="0.02"
            :max="0.5"
            :step="0.01"
            :format-value="value => `${(value * 100).toFixed(0)}%`"
          />
          <div class="flex items-center gap-3">
            <div class="h-4 w-4 rounded-full transition-all duration-200" :class="speakingIndicatorClass" />
            <span class="text-sm font-medium">
              {{ audioLevel.isSpeech.value ? 'Speaking Detected' : 'Silence' }}
            </span>
            <span class="ml-auto text-xs text-neutral-500">Volume Based</span>
          </div>
          <AiriTimeSeriesChart
            :history="audioLevel.history.value"
            :current-value="audioLevel.normalizedVolume.value"
            :threshold="audioLevel.threshold.value"
            :is-active="audioLevel.isSpeech.value"
            title="Voice Activity"
            subtitle="Recent input"
            active-label="Speaking"
            active-legend-label="Voice detected"
            inactive-legend-label="Silence"
            threshold-label="Speech threshold"
          />
        </div>
      </div>

      <div w-full rounded-xl bg="neutral-50 dark:[rgba(0,0,0,0.3)]" p-4 flex="~ col gap-4">
        <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
          Transcription
        </h2>
        <div text="sm neutral-400 dark:neutral-500" mb-2>
          Test your transcription provider with the selected audio device.
        </div>

        <AiriAlert v-if="activeProviderName === 'web_speech_api' && !isWebSpeechAvailable" type="warning">
          <template #title>
            Web Speech API Not Available
          </template>
          <template #content>
            This browser does not expose SpeechRecognition. Choose a backend provider or use Chrome, Edge, or Safari.
          </template>
        </AiriAlert>

        <div class="flex items-center gap-2">
          <Button
            :disabled="!asrStore.moduleEnabled || isTranscribing || (!shouldUseBrowserSpeech && !canUseBackendTranscription)"
            class="flex-1"
            @click="isTesting ? stopSTTTest() : startSTTTest()"
          >
            <div :class="testButtonIconClass" />
            {{ isTesting ? 'Stop' : isTranscribing ? 'Transcribing...' : 'Start transcription' }}
          </Button>
        </div>

        <div v-if="statusMessage" class="border border-primary-200 rounded-lg bg-primary-50 p-3 dark:border-primary-800 dark:bg-primary-900/20">
          <div class="flex items-center gap-2 text-primary-700 dark:text-primary-400">
            <div :class="statusIconClass" />
            <span class="text-sm font-medium">{{ statusMessage }}</span>
          </div>
        </div>

        <div v-if="shouldUseBrowserSpeech" class="border border-blue-200 rounded-lg bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
          <div class="flex items-center gap-2 text-blue-700 dark:text-blue-400">
            <div :class="infoIconClass" />
            <span class="text-xs">Streaming mode: transcription will appear in real-time as you speak.</span>
          </div>
        </div>

        <div>
          <label class="mb-1 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
            Transcription Result
          </label>
          <div
            v-if="testText || streamingText"
            class="min-h-[100px] border border-neutral-200 rounded-lg bg-white p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            <div v-if="streamingText" class="text-neutral-600 dark:text-neutral-400">
              <div class="mb-2 font-medium">Current transcription (streaming):</div>
              <div class="whitespace-pre-wrap">{{ streamingText }}</div>
            </div>
            <div v-if="testText" class="text-neutral-700 dark:text-neutral-200">
              <div v-if="streamingText" class="mb-2 mt-3 border-t border-neutral-200 pt-2 font-medium dark:border-neutral-700">
                Final transcription:
              </div>
              <div class="whitespace-pre-wrap">{{ testText }}</div>
            </div>
          </div>
          <div
            v-else
            class="min-h-[100px] border border-neutral-300 rounded-lg border-dashed bg-neutral-50 p-3 text-sm text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-500"
          >
            No transcription yet. Start recording and speak into your microphone.
          </div>
        </div>

        <div class="text-xs text-neutral-500 dark:text-neutral-400">
          <div>Provider: <span class="font-medium">{{ activeProvider?.display_name || activeProviderName }}</span></div>
          <div>Mode: <span class="font-medium">{{ shouldUseBrowserSpeech ? 'Streaming (real-time)' : 'Recording (file-based)' }}</span></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.asr-module-toggle {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  min-height: 4.25rem;
  padding: 0.85rem 0.95rem;
  border: 1px solid rgb(255 255 255 / 0.78);
  border-radius: 1rem;
  background:
    linear-gradient(135deg, rgb(255 255 255 / 0.9), rgb(240 252 255 / 0.78));
  box-shadow:
    0 12px 30px rgb(0 129 179 / 0.08),
    inset 0 1px 0 rgb(255 255 255 / 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.asr-module-toggle__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  height: 2.4rem;
  flex: 0 0 auto;
  border-radius: 0.85rem;
  color: #0081b3;
  background: rgb(152 236 255 / 0.3);
}

.asr-module-toggle__copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.12rem;
}

.asr-module-toggle__label {
  color: #0071a0;
  font-size: 0.92rem;
  font-weight: 800;
}

.asr-module-toggle__hint {
  color: rgb(0 129 179 / 0.66);
  font-size: 0.78rem;
  line-height: 1.45;
}

.asr-module-toggle__switch {
  flex: 0 0 auto;
}

.dark .asr-module-toggle {
  border-color: rgb(41 189 226 / 0.25);
  background:
    linear-gradient(135deg, rgb(0 51 69 / 0.78), rgb(0 24 32 / 0.72));
  box-shadow:
    0 12px 30px rgb(0 0 0 / 0.2),
    inset 0 1px 0 rgb(255 255 255 / 0.05);
}

.dark .asr-module-toggle__icon {
  color: #c5fcff;
  background: rgb(41 189 226 / 0.18);
}

.dark .asr-module-toggle__label {
  color: #c5fcff;
}

.dark .asr-module-toggle__hint {
  color: rgb(197 252 255 / 0.64);
}
</style>
