const TARGET_SAMPLE_RATE = 16000
const TARGET_CHANNELS = 1
const TARGET_ENCODING = 'pcm_s16le'
const WAV_MIME_TYPE = 'audio/wav'
const PROCESSOR_BUFFER_SIZE = 4096

type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext

type AudioWindow = Window & {
  webkitAudioContext?: AudioContextConstructor
}

export interface AudioRecordingContract {
  source: 'browser_recorder'
  sampleRate: number
  channels: number
  encoding: string
}

export interface AudioRecordingResult {
  blob: Blob
  contract: AudioRecordingContract
}

export interface WavRecorderSession {
  stop: () => Promise<AudioRecordingResult>
  cancel: () => Promise<void>
}

function getAudioContextConstructor(): AudioContextConstructor | undefined {
  const audioWindow = window as AudioWindow
  return window.AudioContext || audioWindow.webkitAudioContext
}

function clampSample(sample: number): number {
  if (sample > 1) {
    return 1
  }

  if (sample < -1) {
    return -1
  }

  return sample
}

function resampleAudio(input: Float32Array, sourceSampleRate: number): Float32Array {
  if (input.length === 0 || sourceSampleRate <= 0) {
    return new Float32Array(0)
  }

  if (sourceSampleRate === TARGET_SAMPLE_RATE) {
    return input
  }

  const sampleRateRatio = sourceSampleRate / TARGET_SAMPLE_RATE
  const outputLength = Math.max(1, Math.round(input.length / sampleRateRatio))
  const output = new Float32Array(outputLength)

  for (let index = 0; index < outputLength; index++) {
    const sourceIndex = index * sampleRateRatio
    const beforeIndex = Math.floor(sourceIndex)
    const afterIndex = Math.min(beforeIndex + 1, input.length - 1)
    const weight = sourceIndex - beforeIndex
    const before = input[beforeIndex] ?? 0
    const after = input[afterIndex] ?? before
    output[index] = clampSample(before + (after - before) * weight)
  }

  return output
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Float32Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }

  return merged
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2
  const blockAlign = TARGET_CHANNELS * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  function writeAscii(offset: number, value: string) {
    for (let index = 0; index < value.length; index++) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, TARGET_CHANNELS, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (const sample of samples) {
    const normalized = clampSample(sample)
    const int16 = normalized < 0
      ? Math.round(normalized * 0x8000)
      : Math.round(normalized * 0x7fff)
    view.setInt16(offset, int16, true)
    offset += bytesPerSample
  }

  return new Blob([buffer], { type: WAV_MIME_TYPE })
}

async function closeAudioContext(audioContext: AudioContext | null) {
  if (audioContext && audioContext.state !== 'closed') {
    await audioContext.close()
  }
}

export async function createWavRecorder(stream: MediaStream): Promise<WavRecorderSession> {
  const AudioContextConstructor = getAudioContextConstructor()
  if (!AudioContextConstructor) {
    throw new Error('AudioContext is not available in this browser')
  }

  const audioContext = new AudioContextConstructor()
  if (audioContext.state === 'suspended') {
    await audioContext.resume()
  }

  const sourceNode = audioContext.createMediaStreamSource(stream)
  const processorNode = audioContext.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1)
  const muteGainNode = audioContext.createGain()
  const chunks: Float32Array[] = []
  let stopped = false

  muteGainNode.gain.value = 0
  processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
    const input = event.inputBuffer.getChannelData(0)
    chunks.push(new Float32Array(input))
  }

  sourceNode.connect(processorNode)
  processorNode.connect(muteGainNode)
  muteGainNode.connect(audioContext.destination)

  async function cleanup() {
    processorNode.onaudioprocess = null
    processorNode.disconnect()
    sourceNode.disconnect()
    muteGainNode.disconnect()
    await closeAudioContext(audioContext)
  }

  return {
    async stop() {
      if (stopped) {
        throw new Error('Recorder already stopped')
      }
      stopped = true

      const merged = mergeChunks(chunks)
      const resampled = resampleAudio(merged, audioContext.sampleRate)
      await cleanup()

      return {
        blob: encodeWav(resampled, TARGET_SAMPLE_RATE),
        contract: {
          source: 'browser_recorder',
          sampleRate: TARGET_SAMPLE_RATE,
          channels: TARGET_CHANNELS,
          encoding: TARGET_ENCODING
        }
      }
    },

    async cancel() {
      if (stopped) {
        return
      }
      stopped = true
      await cleanup()
    }
  }
}
