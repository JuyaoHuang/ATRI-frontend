import { describe, expect, it, vi } from 'vitest'

import type { InputImage } from '@/types/vision'
import { VisionSessionController } from '@/utils/visionSessionController'

const TEST_IMAGE: InputImage = {
  source: 'screen',
  media_type: 'image/jpeg',
  encoding: 'base64',
  data: 'opaque-image-data'
}

function createMediaRuntime() {
  let endedListener: EventListener | null = null
  const track = {
    readyState: 'live',
    stop: vi.fn(function stop(this: { readyState: string }) {
      this.readyState = 'ended'
    }),
    addEventListener: vi.fn((event: string, listener: EventListener) => {
      if (event === 'ended') endedListener = listener
    }),
    removeEventListener: vi.fn()
  }
  const stream = {
    getVideoTracks: vi.fn(() => [track]),
    getTracks: vi.fn(() => [track])
  }
  const video = {
    muted: false,
    playsInline: false,
    srcObject: null,
    videoWidth: 1920,
    videoHeight: 1080,
    play: vi.fn(async () => undefined),
    pause: vi.fn()
  }
  return {
    track,
    stream,
    video,
    emitEnded: () => endedListener?.({ type: 'ended' } as Event)
  }
}

describe('VisionSessionController', () => {
  it('owns the stream across unrelated component lifecycle and stops explicitly', async () => {
    const runtime = createMediaRuntime()
    const captureFrame = vi.fn(async () => TEST_IMAGE)
    const controller = new VisionSessionController({
      getDisplayMedia: vi.fn(async () => runtime.stream as unknown as MediaStream),
      createVideoElement: () => runtime.video as unknown as HTMLVideoElement,
      captureFrame
    })
    const snapshots: string[] = []
    controller.subscribe(snapshot => snapshots.push(snapshot.status))

    expect(await controller.start()).toBe(true)
    expect(controller.isActive()).toBe(true)
    expect(runtime.track.stop).not.toHaveBeenCalled()

    const result = await controller.captureCurrentFrame({
      jpegQuality: 0.82,
      maxLongEdge: 1920,
      maxDecodedBytes: 1024
    })
    expect(result.status).toBe('captured')
    expect(captureFrame).toHaveBeenCalledTimes(1)

    controller.stop()
    expect(controller.isActive()).toBe(false)
    expect(runtime.track.stop).toHaveBeenCalledTimes(1)
    expect(runtime.video.srcObject).toBeNull()
    expect(snapshots).toEqual(['starting', 'active', 'disabled'])
  })

  it('cleans the runtime when the browser track ends', async () => {
    const runtime = createMediaRuntime()
    const controller = new VisionSessionController({
      getDisplayMedia: vi.fn(async () => runtime.stream as unknown as MediaStream),
      createVideoElement: () => runtime.video as unknown as HTMLVideoElement,
      captureFrame: vi.fn(async () => TEST_IMAGE)
    })

    await controller.start()
    runtime.track.readyState = 'ended'
    runtime.emitEnded()

    expect(controller.getSnapshot()).toEqual({ status: 'disabled', error: null })
    expect(controller.isActive()).toBe(false)
    expect(runtime.video.srcObject).toBeNull()
  })

  it('does not activate a stream that resolves after an explicit stop', async () => {
    const runtime = createMediaRuntime()
    let resolveStream: ((stream: MediaStream) => void) | undefined
    const streamPromise = new Promise<MediaStream>(resolve => {
      resolveStream = resolve
    })
    const controller = new VisionSessionController({
      getDisplayMedia: () => streamPromise,
      createVideoElement: () => runtime.video as unknown as HTMLVideoElement,
      captureFrame: vi.fn(async () => TEST_IMAGE)
    })

    const startPromise = controller.start()
    controller.stop()
    resolveStream?.(runtime.stream as unknown as MediaStream)

    expect(await startPromise).toBe(false)
    expect(controller.getSnapshot()).toEqual({ status: 'disabled', error: null })
    expect(runtime.track.stop).toHaveBeenCalledTimes(1)
  })

  it('does not publish active before the shared video has a usable frame', async () => {
    const runtime = createMediaRuntime()
    runtime.video.videoWidth = 0
    runtime.video.videoHeight = 0
    const controller = new VisionSessionController({
      getDisplayMedia: vi.fn(async () => runtime.stream as unknown as MediaStream),
      createVideoElement: () => runtime.video as unknown as HTMLVideoElement,
      captureFrame: vi.fn(async () => TEST_IMAGE)
    })

    expect(await controller.start()).toBe(false)
    expect(controller.isActive()).toBe(false)
    expect(controller.getSnapshot()).toEqual({
      status: 'error',
      error: '未获得可用的屏幕共享视频画面。'
    })
    expect(runtime.track.stop).toHaveBeenCalledTimes(1)
    expect(runtime.video.srcObject).toBeNull()
  })

  it('reports a safe permission error without retaining the original message', async () => {
    const error = Object.assign(new Error('private browser details'), { name: 'NotAllowedError' })
    const controller = new VisionSessionController({
      getDisplayMedia: vi.fn(async () => { throw error })
    })

    expect(await controller.start()).toBe(false)
    expect(controller.getSnapshot()).toEqual({
      status: 'error',
      error: '屏幕共享权限未授予。'
    })
    expect(controller.getSnapshot().error).not.toContain('private browser details')
  })
})
