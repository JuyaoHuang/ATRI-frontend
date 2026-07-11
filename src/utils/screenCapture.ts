import type { InputImage, ScreenCaptureConfig } from '@/types/vision'

export interface CaptureDimensions {
  width: number
  height: number
}
interface ScreenCaptureDependencies {
  createCanvas?: () => HTMLCanvasElement
  encodeBlob?: (blob: Blob) => Promise<string>
}

const RETRY_SCALE_MARGIN = 0.92
const RETRY_QUALITY_FACTOR = 0.82
const MIN_JPEG_QUALITY = 0.1

export function calculateCaptureDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxLongEdge: number
): CaptureDimensions {
  if (
    !Number.isFinite(sourceWidth)
    || !Number.isFinite(sourceHeight)
    || !Number.isFinite(maxLongEdge)
    || sourceWidth <= 0
    || sourceHeight <= 0
    || maxLongEdge <= 0
  ) {
    throw new RangeError('Capture dimensions must be positive finite numbers')
  }

  const width = Math.round(sourceWidth)
  const height = Math.round(sourceHeight)
  const scale = Math.min(1, maxLongEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

export async function captureScreenFrame(
  video: HTMLVideoElement,
  config: ScreenCaptureConfig,
  dependencies: ScreenCaptureDependencies = {}
): Promise<InputImage | null> {
  let dimensions = calculateCaptureDimensions(
    video.videoWidth,
    video.videoHeight,
    config.maxLongEdge
  )
  const createCanvas = dependencies.createCanvas || (() => document.createElement('canvas'))
  const encodeBlob = dependencies.encodeBlob || encodeBlobBase64
  const canvas = createCanvas()
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }

  let quality = config.jpegQuality
  for (let attempt = 0; attempt < 2; attempt += 1) {
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    context.drawImage(video, 0, 0, dimensions.width, dimensions.height)

    const blob = await canvasToBlob(canvas, quality)
    if (!blob) {
      return null
    }
    if (blob.size <= config.maxDecodedBytes) {
      const data = await encodeBlob(blob)
      if (!data) {
        return null
      }
      return {
        source: 'screen',
        media_type: 'image/jpeg',
        encoding: 'base64',
        data
      }
    }
    if (attempt === 0) {
      dimensions = calculateRetryDimensions(
        dimensions,
        blob.size,
        config.maxDecodedBytes
      )
      quality = Math.max(MIN_JPEG_QUALITY, quality * RETRY_QUALITY_FACTOR)
    }
  }

  return null
}

function calculateRetryDimensions(
  current: CaptureDimensions,
  blobBytes: number,
  maxBytes: number
): CaptureDimensions {
  const scale = Math.min(
    RETRY_SCALE_MARGIN,
    Math.sqrt(maxBytes / Math.max(1, blobBytes)) * RETRY_SCALE_MARGIN
  )
  return {
    width: Math.max(1, Math.floor(current.width * scale)),
    height: Math.max(1, Math.floor(current.height * scale))
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise(resolve => {
    canvas.toBlob(resolve, 'image/jpeg', quality)
  })
}

async function encodeBlobBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const chunkSize = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize))
    for (const value of chunk) {
      binary += String.fromCharCode(value)
    }
  }
  return globalThis.btoa(binary)
}
