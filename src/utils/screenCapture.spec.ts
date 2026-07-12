import { describe, expect, it, vi } from 'vitest'

import { calculateCaptureDimensions, captureScreenFrame } from '@/utils/screenCapture'

function createVideo(width = 2560, height = 1440): HTMLVideoElement {
  return { videoWidth: width, videoHeight: height } as HTMLVideoElement
}

function createCanvas(blobSizes: number[]) {
  const dimensions: Array<{ width: number, height: number }> = []
  let width = 0
  let height = 0
  const drawImage = vi.fn(() => {
    dimensions.push({ width, height })
  })
  const toBlob = vi.fn((callback: BlobCallback) => {
    const size = blobSizes.shift()
    callback(size === undefined ? null : new Blob([new Uint8Array(size)], { type: 'image/jpeg' }))
  })
  const canvas = {
    get width() {
      return width
    },
    set width(value: number) {
      width = value
    },
    get height() {
      return height
    },
    set height(value: number) {
      height = value
    },
    getContext: vi.fn(() => ({ drawImage })),
    toBlob
  } as unknown as HTMLCanvasElement
  return { canvas, dimensions, drawImage, toBlob }
}

describe('calculateCaptureDimensions', () => {
  it('scales the longest edge without changing aspect ratio', () => {
    expect(calculateCaptureDimensions(3840, 2160, 1920)).toEqual({
      width: 1920,
      height: 1080
    })
    expect(calculateCaptureDimensions(1080, 1920, 960)).toEqual({
      width: 540,
      height: 960
    })
  })

  it('does not upscale a smaller frame', () => {
    expect(calculateCaptureDimensions(800, 600, 1920)).toEqual({ width: 800, height: 600 })
  })
})
describe('captureScreenFrame', () => {
  it('performs at most one smaller retry for an oversized JPEG', async () => {
    const { canvas, dimensions, toBlob } = createCanvas([200, 80])
    const encodeBlob = vi.fn(async () => 'opaque-image-data')

    const image = await captureScreenFrame(
      createVideo(),
      { jpegQuality: 0.82, maxLongEdge: 1920, maxDecodedBytes: 100 },
      { createCanvas: () => canvas, encodeBlob }
    )

    expect(toBlob).toHaveBeenCalledTimes(2)
    expect(dimensions).toHaveLength(2)
    expect(dimensions[1]!.width).toBeLessThan(dimensions[0]!.width)
    expect(dimensions[1]!.height).toBeLessThan(dimensions[0]!.height)
    expect(encodeBlob).toHaveBeenCalledTimes(1)
    expect(image).toMatchObject({
      source: 'screen',
      media_type: 'image/jpeg',
      encoding: 'base64'
    })
    expect(image?.data.length).toBe('opaque-image-data'.length)
  })

  it('returns null after the bounded retry remains oversized', async () => {
    const { canvas, toBlob } = createCanvas([200, 150, 20])
    const encodeBlob = vi.fn(async () => 'unused')

    const image = await captureScreenFrame(
      createVideo(),
      { jpegQuality: 0.82, maxLongEdge: 1920, maxDecodedBytes: 100 },
      { createCanvas: () => canvas, encodeBlob }
    )

    expect(image).toBeNull()
    expect(toBlob).toHaveBeenCalledTimes(2)
    expect(encodeBlob).not.toHaveBeenCalled()
  })
})
