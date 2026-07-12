import { captureScreenFrame } from '@/utils/screenCapture'
import type {
  ScreenCaptureConfig,
  VisionCaptureOutcome,
  VisionRuntimeSnapshot
} from '@/types/vision'

type VisionRuntimeListener = (snapshot: VisionRuntimeSnapshot) => void

export interface VisionSessionDependencies {
  getDisplayMedia: () => Promise<MediaStream>
  createVideoElement: () => HTMLVideoElement
  captureFrame: typeof captureScreenFrame
}

const DEFAULT_DEPENDENCIES: VisionSessionDependencies = {
  getDisplayMedia: () => navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }),
  createVideoElement: () => document.createElement('video'),
  captureFrame: captureScreenFrame
}

export class VisionSessionController {
  private readonly dependencies: VisionSessionDependencies
  private readonly listeners = new Set<VisionRuntimeListener>()
  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private track: MediaStreamTrack | null = null
  private status: VisionRuntimeSnapshot = { status: 'disabled', error: null }
  private startPromise: Promise<boolean> | null = null
  private lifecycleEpoch = 0

  constructor(dependencies: Partial<VisionSessionDependencies> = {}) {
    this.dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies }
  }

  getSnapshot(): VisionRuntimeSnapshot {
    return { ...this.status }
  }

  isActive(): boolean {
    return this.status.status === 'active'
      && this.track?.readyState === 'live'
      && this.video !== null
      && hasUsableVideoFrame(this.video)
  }

  subscribe(listener: VisionRuntimeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async start(): Promise<boolean> {
    if (this.isActive()) {
      return true
    }
    if (this.startPromise) {
      return this.startPromise
    }

    const epoch = ++this.lifecycleEpoch
    this.startPromise = this.startInternal(epoch)
    try {
      return await this.startPromise
    } finally {
      this.startPromise = null
    }
  }

  stop(): void {
    this.lifecycleEpoch += 1
    this.releaseResources(true)
    this.publish({ status: 'disabled', error: null })
  }

  destroy(): void {
    this.stop()
    this.listeners.clear()
  }

  async captureCurrentFrame(config: ScreenCaptureConfig): Promise<VisionCaptureOutcome> {
    if (!this.isActive() || !this.video) {
      return { status: 'unavailable' }
    }

    try {
      const image = await this.dependencies.captureFrame(this.video, config)
      return image ? { status: 'captured', image } : { status: 'failed' }
    } catch {
      return { status: 'failed' }
    }
  }

  private async startInternal(epoch: number): Promise<boolean> {
    this.publish({ status: 'starting', error: null })
    try {
      const stream = await this.dependencies.getDisplayMedia()
      if (epoch !== this.lifecycleEpoch) {
        stream.getTracks().forEach(track => track.stop())
        return false
      }
      const track = stream.getVideoTracks()[0]
      if (!track || track.readyState !== 'live') {
        stream.getTracks().forEach(item => item.stop())
        this.publish({ status: 'error', error: '未获得可用的屏幕共享视频轨道。' })
        return false
      }

      const video = this.dependencies.createVideoElement()
      video.muted = true
      video.playsInline = true
      video.srcObject = stream
      track.addEventListener('ended', this.handleTrackEnded)
      this.stream = stream
      this.track = track
      this.video = video
      await video.play()

      if (epoch !== this.lifecycleEpoch || track.readyState !== 'live') {
        this.releaseResources(false)
        if (epoch === this.lifecycleEpoch) {
          this.publish({ status: 'disabled', error: null })
        }
        return false
      }
      if (!hasUsableVideoFrame(video)) {
        this.releaseResources(true)
        this.publish({ status: 'error', error: '未获得可用的屏幕共享视频画面。' })
        return false
      }

      this.publish({ status: 'active', error: null })
      return true
    } catch (error) {
      this.releaseResources(true)
      if (epoch === this.lifecycleEpoch) {
        this.publish({ status: 'error', error: screenShareErrorMessage(error) })
      }
      return false
    }
  }

  private readonly handleTrackEnded = () => {
    this.releaseResources(true)
    this.publish({ status: 'disabled', error: null })
  }

  private releaseResources(stopTracks: boolean): void {
    if (this.track) {
      this.track.removeEventListener('ended', this.handleTrackEnded)
    }
    if (stopTracks && this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
    }
    if (this.video) {
      this.video.pause()
      this.video.srcObject = null
    }
    this.track = null
    this.stream = null
    this.video = null
  }

  private publish(snapshot: VisionRuntimeSnapshot): void {
    this.status = snapshot
    this.listeners.forEach(listener => listener({ ...snapshot }))
  }
}

function screenShareErrorMessage(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error
    ? String(error.name)
    : ''
  if (name === 'NotAllowedError') {
    return '屏幕共享权限未授予。'
  }
  if (name === 'NotFoundError') {
    return '没有可用的屏幕共享来源。'
  }
  if (name === 'NotSupportedError') {
    return '当前浏览器不支持屏幕共享。'
  }
  return '无法启动屏幕共享。'
}

export const visionSessionController = new VisionSessionController()

function hasUsableVideoFrame(video: HTMLVideoElement): boolean {
  return Number.isFinite(video.videoWidth)
    && Number.isFinite(video.videoHeight)
    && video.videoWidth > 0
    && video.videoHeight > 0
}
