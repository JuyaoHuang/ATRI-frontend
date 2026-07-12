import { computed } from 'vue'

import { useVisionStore } from '@/stores/vision'
import {
  ConnectionStatus,
  type ConnectionStatusEvent,
  type VisionCaptureRequestData
} from '@/types/websocket'
import type { InputImage, VisionCaptureOutcome } from '@/types/vision'
import { visionSessionController } from '@/utils/visionSessionController'
import { useWebSocket } from '@/composables/useWebSocket'

let visionHandlersRegistered = false

export function useVision() {
  const visionStore = useVisionStore()
  const websocket = useWebSocket()

  ensureVisionHandlers(visionStore, websocket)

  const reconcileModuleState = (): void => {
    if (
      visionStore.loaded
      && !visionStore.moduleEnabled
      && visionSessionController.getSnapshot().status !== 'disabled'
    ) {
      visionSessionController.stop()
    }
  }

  const loadConfig = async (): Promise<void> => {
    await visionStore.load()
    reconcileModuleState()
  }

  const ensureLoaded = async (): Promise<void> => {
    await visionStore.ensureLoaded()
    reconcileModuleState()
  }

  const start = async (): Promise<boolean> => {
    await ensureLoaded()
    if (!visionStore.moduleEnabled) {
      visionStore.setRuntimeSnapshot('disabled')
      return false
    }
    return visionSessionController.start()
  }

  const stop = (): void => {
    visionSessionController.stop()
  }

  const updateModuleEnabled = async (enabled: boolean): Promise<void> => {
    await visionStore.updateEnabled(enabled)
    if (!visionStore.moduleEnabled) {
      visionSessionController.stop()
    }
  }

  const captureCurrentFrame = async (): Promise<VisionCaptureOutcome> => {
    if (!visionSessionController.isActive()) {
      return { status: 'unavailable' }
    }
    await ensureLoaded()
    if (!visionStore.moduleEnabled) {
      return { status: 'unavailable' }
    }
    return visionSessionController.captureCurrentFrame(visionStore.captureConfig)
  }

  const captureForSubmission = async (): Promise<InputImage | undefined> => {
    const result = await captureCurrentFrame()
    return result.status === 'captured' ? result.image : undefined
  }

  return {
    loaded: computed(() => visionStore.loaded),
    moduleEnabled: computed(() => visionStore.moduleEnabled),
    runtimeStatus: computed(() => visionStore.runtimeStatus),
    runtimeError: computed(() => visionStore.runtimeError),
    runtimeActive: computed(() => visionStore.runtimeActive),
    websocketMaxMessageBytes: computed(() => visionStore.websocketMaxMessageBytes),
    loading: computed(() => visionStore.loading),
    saving: computed(() => visionStore.saving),
    error: computed(() => visionStore.error),
    loadConfig,
    ensureLoaded,
    updateModuleEnabled,
    start,
    stop,
    captureCurrentFrame,
    captureForSubmission
  }
}

function ensureVisionHandlers(
  visionStore: ReturnType<typeof useVisionStore>,
  websocket: ReturnType<typeof useWebSocket>
): void {
  if (visionHandlersRegistered) {
    return
  }
  visionHandlersRegistered = true

  visionSessionController.subscribe(snapshot => {
    visionStore.setRuntimeSnapshot(snapshot.status, snapshot.error)
    if (snapshot.status === 'active') {
      websocket.sendVisionState({ enabled: true, source: 'screen' })
    } else if (snapshot.status === 'disabled' || snapshot.status === 'error') {
      websocket.sendVisionState({ enabled: false, source: 'screen' })
    }
  })

  websocket.on('connection:status', (payload: ConnectionStatusEvent) => {
    if (payload.status === ConnectionStatus.CONNECTED && visionSessionController.isActive()) {
      websocket.sendVisionState({ enabled: true, source: 'screen' })
    }
  })

  websocket.on('vision:capture-request', (request: VisionCaptureRequestData) => {
    void respondToCaptureRequest(request, visionStore, websocket)
  })

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      visionSessionController.destroy()
    })
  }
}

async function respondToCaptureRequest(
  request: VisionCaptureRequestData,
  visionStore: ReturnType<typeof useVisionStore>,
  websocket: ReturnType<typeof useWebSocket>
): Promise<void> {
  const generationId = request.generation_id
  if (!generationId || request.source !== 'screen') {
    return
  }

  await visionStore.ensureLoaded()
  const result = visionStore.moduleEnabled
    ? await visionSessionController.captureCurrentFrame(visionStore.captureConfig)
    : { status: 'unavailable' as const }

  websocket.sendVisionCaptureResult({
    generationId,
    status: result.status,
    image: result.status === 'captured' ? result.image : undefined,
    maxMessageBytes: visionStore.websocketMaxMessageBytes
  })
}
