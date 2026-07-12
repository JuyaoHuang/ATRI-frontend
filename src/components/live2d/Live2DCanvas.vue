<script setup lang="ts">
import { Application } from '@pixi/app'
import { extensions } from '@pixi/extensions'
import { InteractionManager } from '@pixi/interaction'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { FileLoader, Live2DModel, MotionPriority } from 'pixi-live2d-display/cubism4'

import { createModelLoadTracker } from './modelLoadTracker'
import type {
  Live2DExpressionRequest,
  Live2DMotion,
  Live2DMotionSelection,
  Live2DPosition,
} from '@/types/live2d'
import type { Live2DModelParameters } from '@/stores/live2d'
import { loadLive2dFilesWithOpfs } from '@/utils/live2dOpfs'

interface Props {
  modelId?: string | null
  modelPath?: string | null
  modelUrl?: string | null
  position?: Live2DPosition
  scale?: number
  expressionRequest?: Live2DExpressionRequest | null
  currentMotion?: Live2DMotionSelection | null
  modelParameters?: Live2DModelParameters
  focusAt?: { x: number, y: number }
  disableFocus?: boolean
  idleAnimationEnabled?: boolean
  expressionSystemEnabled?: boolean
  autoBlinkEnabled?: boolean
  forceAutoBlinkEnabled?: boolean
  shadowEnabled?: boolean
  maxFps?: number
  resolution?: number
  modelCacheVersion?: number
  emptyText?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelId: null,
  modelPath: null,
  modelUrl: null,
  position: () => ({ x: 0, y: 0 }),
  scale: 1,
  expressionRequest: null,
  currentMotion: null,
  modelParameters: () => ({
    angleX: 0,
    angleY: 0,
    angleZ: 0,
    leftEyeOpen: 1,
    rightEyeOpen: 1,
    leftEyeSmile: 0,
    rightEyeSmile: 0,
    leftEyebrowLR: 0,
    rightEyebrowLR: 0,
    leftEyebrowY: 0,
    rightEyebrowY: 0,
    leftEyebrowAngle: 0,
    rightEyebrowAngle: 0,
    leftEyebrowForm: 0,
    rightEyebrowForm: 0,
    mouthOpen: 0,
    mouthForm: 0,
    cheek: 0,
    bodyAngleX: 0,
    bodyAngleY: 0,
    bodyAngleZ: 0,
    breath: 0,
  }),
  focusAt: () => ({ x: 0, y: 0 }),
  disableFocus: false,
  idleAnimationEnabled: true,
  expressionSystemEnabled: true,
  autoBlinkEnabled: true,
  forceAutoBlinkEnabled: false,
  shadowEnabled: true,
  maxFps: 60,
  resolution: 2,
  modelCacheVersion: 0,
  emptyText: 'No current model.',
})

const emit = defineEmits<{
  error: [message: string]
  loaded: []
  motionsLoaded: [motions: Live2DMotion[]]
}>()

let pixiExtensionsRegistered = false

const containerRef = ref<HTMLDivElement | null>(null)
const app = ref<Application | null>(null)
const model = ref<Live2DModel | null>(null)
const width = ref(0)
const height = ref(0)
const initialModelWidth = ref(1)
const initialModelHeight = ref(1)
let resizeObserver: ResizeObserver | null = null
let blinkTimer: number | null = null
let blinkResetTimer: number | null = null
let removeMotionFinishListener: (() => void) | null = null
const modelLoadTracker = createModelLoadTracker()

const resolvedModelUrl = computed(() => {
  if (!props.modelUrl) {
    return null
  }

  if (!props.modelCacheVersion) {
    return props.modelUrl
  }

  const url = new URL(props.modelUrl, window.location.origin)
  url.searchParams.set('_live2d', String(props.modelCacheVersion))
  return url.toString()
})

const hasModel = computed(() => Boolean(resolvedModelUrl.value))

const resolveMaxFps = (value: number) => {
  if (!value || value <= 0) {
    return 0
  }

  return Math.max(1, Math.round(value))
}

const registerPixiExtensions = () => {
  if (pixiExtensionsRegistered) {
    return
  }

  Live2DModel.registerTicker(Ticker)
  extensions.add(TickerPlugin)
  extensions.add(InteractionManager)
  pixiExtensionsRegistered = true
}

const createPixiApp = async () => {
  if (!containerRef.value || app.value) {
    return
  }

  registerPixiExtensions()

  const nextApp = new Application({
    width: Math.max(1, width.value) * props.resolution,
    height: Math.max(1, height.value) * props.resolution,
    backgroundAlpha: 0,
    preserveDrawingBuffer: true,
    autoDensity: false,
    resolution: 1,
  })

  nextApp.ticker.maxFPS = resolveMaxFps(props.maxFps)
  nextApp.stage.scale.set(props.resolution)
  nextApp.view.style.width = '100%'
  nextApp.view.style.height = '100%'
  nextApp.view.style.display = 'block'
  nextApp.view.style.pointerEvents = 'auto'

  containerRef.value.appendChild(nextApp.view)
  app.value = nextApp
}

const clearMotionFinishListener = () => {
  removeMotionFinishListener?.()
  removeMotionFinishListener = null
}

const destroyModel = () => {
  clearMotionFinishListener()

  if (!model.value || !app.value) {
    emit('motionsLoaded', [])
    return
  }

  try {
    app.value.stage.removeChild(model.value as never)
    model.value.destroy()
  }
  catch (error) {
    console.warn('卸载 Live2D 模型失败:', error)
  }
  finally {
    model.value = null
    emit('motionsLoaded', [])
  }
}

const stopBlinkLoop = () => {
  if (blinkTimer != null) {
    window.clearTimeout(blinkTimer)
    blinkTimer = null
  }

  if (blinkResetTimer != null) {
    window.clearTimeout(blinkResetTimer)
    blinkResetTimer = null
  }
}

const destroyPixi = () => {
  destroyModel()
  if (app.value) {
    app.value.destroy(true)
    app.value = null
  }
  stopBlinkLoop()
}

const computeScaleAndPosition = () => {
  let resolvedScale = Math.min(
    (height.value * 0.95 * 2.2) / initialModelHeight.value,
    (width.value * 0.95 * 2.2) / initialModelWidth.value,
  ) * props.scale

  if (Number.isNaN(resolvedScale) || resolvedScale <= 0) {
    resolvedScale = 0.000001
  }

  return {
    scale: resolvedScale,
    x: (width.value / 2) + props.position.x,
    y: height.value + props.position.y,
  }
}

const applyTransform = () => {
  if (!model.value || width.value <= 0 || height.value <= 0) {
    return
  }

  const transform = computeScaleAndPosition()
  model.value.scale.set(transform.scale, transform.scale)
  model.value.anchor.set(0.5, 0.5)
  model.value.x = transform.x
  model.value.y = transform.y
}

const getCoreModel = () => {
  return (model.value?.internalModel as { coreModel?: { setParameterValueById: (id: string, value: number) => void } })?.coreModel
}

const setCoreParameter = (id: string, value: number) => {
  getCoreModel()?.setParameterValueById(id, value)
}

const applyModelParameters = () => {
  const coreModel = getCoreModel()
  if (!coreModel || !props.modelParameters) {
    return
  }

  const parameters = props.modelParameters

  coreModel.setParameterValueById('ParamAngleX', parameters.angleX)
  coreModel.setParameterValueById('ParamAngleY', parameters.angleY)
  coreModel.setParameterValueById('ParamAngleZ', parameters.angleZ)
  coreModel.setParameterValueById('ParamEyeLOpen', parameters.leftEyeOpen)
  coreModel.setParameterValueById('ParamEyeROpen', parameters.rightEyeOpen)
  coreModel.setParameterValueById('ParamEyeSmile', parameters.leftEyeSmile)
  coreModel.setParameterValueById('ParamBrowLX', parameters.leftEyebrowLR)
  coreModel.setParameterValueById('ParamBrowRX', parameters.rightEyebrowLR)
  coreModel.setParameterValueById('ParamBrowLY', parameters.leftEyebrowY)
  coreModel.setParameterValueById('ParamBrowRY', parameters.rightEyebrowY)
  coreModel.setParameterValueById('ParamBrowLAngle', parameters.leftEyebrowAngle)
  coreModel.setParameterValueById('ParamBrowRAngle', parameters.rightEyebrowAngle)
  coreModel.setParameterValueById('ParamBrowLForm', parameters.leftEyebrowForm)
  coreModel.setParameterValueById('ParamBrowRForm', parameters.rightEyebrowForm)
  coreModel.setParameterValueById('ParamMouthOpenY', parameters.mouthOpen)
  coreModel.setParameterValueById('ParamMouthForm', parameters.mouthForm)
  coreModel.setParameterValueById('ParamCheek', parameters.cheek)
  coreModel.setParameterValueById('ParamBodyAngleX', parameters.bodyAngleX)
  coreModel.setParameterValueById('ParamBodyAngleY', parameters.bodyAngleY)
  coreModel.setParameterValueById('ParamBodyAngleZ', parameters.bodyAngleZ)
  coreModel.setParameterValueById('ParamBreath', parameters.breath)
}

const applyFocus = () => {
  if (props.disableFocus) {
    setCoreParameter('ParamEyeBallX', 0)
    setCoreParameter('ParamEyeBallY', 0)
    return
  }

  if (!containerRef.value || width.value <= 0 || height.value <= 0) {
    return
  }

  const rect = containerRef.value.getBoundingClientRect()
  const relativeX = ((props.focusAt.x - rect.left) / Math.max(rect.width, 1)) * 2 - 1
  const relativeY = ((props.focusAt.y - rect.top) / Math.max(rect.height, 1)) * 2 - 1

  const clamp = (value: number) => Math.max(-1, Math.min(1, value))
  setCoreParameter('ParamEyeBallX', clamp(relativeX))
  setCoreParameter('ParamEyeBallY', clamp(relativeY))
}

const applyShadow = () => {
  if (!model.value) {
    return
  }

  model.value.filters = props.shadowEnabled ? null : []
}

const startBlinkLoop = () => {
  stopBlinkLoop()

  if (!model.value || (!props.autoBlinkEnabled && !props.forceAutoBlinkEnabled)) {
    return
  }

  const scheduleBlink = () => {
    blinkTimer = window.setTimeout(() => {
      const leftBase = props.modelParameters.leftEyeOpen
      const rightBase = props.modelParameters.rightEyeOpen

      setCoreParameter('ParamEyeLOpen', 0)
      setCoreParameter('ParamEyeROpen', 0)

      blinkResetTimer = window.setTimeout(() => {
        setCoreParameter('ParamEyeLOpen', leftBase)
        setCoreParameter('ParamEyeROpen', rightBase)
        scheduleBlink()
      }, 160)
    }, 1800 + Math.random() * 2200)
  }

  scheduleBlink()
}

const extractAvailableMotions = (loadedModel: Live2DModel): Live2DMotion[] => {
  const definitions = ((loadedModel.internalModel as {
    motionManager?: { definitions?: Record<string, Array<{ File?: string }> | undefined> }
  }).motionManager?.definitions ?? {}) as Record<string, Array<{ File?: string }> | undefined>

  return Object.entries(definitions).flatMap(([motionName, definition]) =>
    (definition?.map((motion, motionIndex) => ({
      motionName,
      motionIndex,
      fileName: motion.File || `${motionName}/${motionIndex}`,
    })) ?? []),
  )
}

const configureSelectedMotionLoop = () => {
  if (!model.value || !props.currentMotion?.group || props.currentMotion.index == null) {
    return
  }

  const motionManager = ((model.value.internalModel as unknown) as {
    motionManager?: {
      groups?: Record<string, string | number>
      motionGroups?: Array<Array<{ _looper?: { loopDuration?: number } }>>
    }
  }).motionManager

  const groupIndex = motionManager?.groups?.[props.currentMotion.group]
  if (groupIndex == null) {
    return
  }

  const numericGroupIndex = typeof groupIndex === 'number' ? groupIndex : Number.parseInt(String(groupIndex), 10)
  if (Number.isNaN(numericGroupIndex)) {
    return
  }

  const motion = motionManager?.motionGroups?.[numericGroupIndex]?.[props.currentMotion.index]
  if (motion?._looper) {
    motion._looper.loopDuration = 0
  }
}

const applyMotion = async () => {
  if (!model.value || !props.idleAnimationEnabled) {
    return
  }

  if (!props.currentMotion?.group) {
    return
  }

  configureSelectedMotionLoop()

  try {
    await model.value.motion(props.currentMotion.group, props.currentMotion.index, MotionPriority.FORCE)
  }
  catch (error) {
    console.warn('切换 Live2D 动作失败:', error)
  }
}

const bindMotionLoop = () => {
  clearMotionFinishListener()

  const motionManager = (model.value?.internalModel as {
    motionManager?: { on?: (event: string, handler: () => void) => void, off?: (event: string, handler: () => void) => void }
  })?.motionManager

  if (!motionManager?.on) {
    return
  }

  const handleMotionFinish = () => {
    if (props.idleAnimationEnabled && props.currentMotion?.group) {
      void applyMotion()
    }
  }

  motionManager.on('motionFinish', handleMotionFinish)
  if (motionManager.off) {
    removeMotionFinishListener = () => motionManager.off?.('motionFinish', handleMotionFinish)
  }
}

const handleResize = () => {
  if (containerRef.value) {
    width.value = containerRef.value.clientWidth
    height.value = containerRef.value.clientHeight
  }

  if (app.value && width.value > 0 && height.value > 0) {
    app.value.renderer.resize(width.value * props.resolution, height.value * props.resolution)
    app.value.stage.scale.set(props.resolution)
  }

  applyTransform()
}

const createModelFromSource = async (source: {
  modelId: string | null
  modelPath: string | null
  url: string
}) => {
  if (source.modelId && source.modelPath) {
    try {
      const files = await loadLive2dFilesWithOpfs({
        modelId: source.modelId,
        settingsUrl: source.url,
        settingsPath: source.modelPath,
      })
      const settings = await FileLoader.createSettings(files)
      await FileLoader.upload(files, settings)
      return await Live2DModel.from(settings) as Live2DModel
    }
    catch (error) {
      console.warn('[OPFS] Falling back to network model loading:', error)
    }
  }

  return await Live2DModel.from(source.url) as Live2DModel
}

const loadModel = async () => {
  const sourceUrl = resolvedModelUrl.value
  const loadToken = modelLoadTracker.begin(sourceUrl)

  if (!app.value) {
    return
  }

  destroyModel()

  if (!sourceUrl) {
    return
  }

  try {
    const loadedModel = await createModelFromSource({
      modelId: props.modelId,
      modelPath: props.modelPath,
      url: sourceUrl,
    })
    const isCurrentLoad = () => modelLoadTracker.isCurrent(
      loadToken,
      resolvedModelUrl.value,
    )

    if (!isCurrentLoad() || !app.value) {
      loadedModel.destroy()
      return
    }

    initialModelWidth.value = Math.max(loadedModel.width, 1)
    initialModelHeight.value = Math.max(loadedModel.height, 1)

    loadedModel.anchor.set(0.5, 0.5)
    app.value.stage.addChild(loadedModel as never)
    model.value = loadedModel

    emit('motionsLoaded', extractAvailableMotions(loadedModel))

    applyTransform()
    applyModelParameters()
    applyFocus()
    applyShadow()
    startBlinkLoop()
    bindMotionLoop()
    await applyExpression()
    if (!isCurrentLoad()) {
      return
    }
    await applyMotion()
    if (!isCurrentLoad()) {
      return
    }
    emit('loaded')
  }
  catch (error) {
    if (!modelLoadTracker.isCurrent(loadToken, resolvedModelUrl.value)) {
      return
    }
    console.error('加载 Live2D 模型失败:', error)
    emit('motionsLoaded', [])
    emit('error', error instanceof Error ? error.message : '加载 Live2D 模型失败')
  }
}

const applyExpression = async () => {
  if (!model.value) {
    return
  }

  const motionManager = (model.value.internalModel as { motionManager?: { resetExpression?: () => void } }).motionManager

  if (!props.expressionSystemEnabled) {
    motionManager?.resetExpression?.()
    return
  }

  const expressionName = props.expressionRequest?.name
  if (!expressionName) {
    motionManager?.resetExpression?.()
    return
  }

  try {
    await model.value.expression(expressionName)
  }
  catch (error) {
    console.warn('切换 Live2D 表情失败:', error)
  }
}

onMounted(async () => {
  await nextTick()
  handleResize()
  await createPixiApp()
  await loadModel()

  resizeObserver = new ResizeObserver(() => {
    handleResize()
  })

  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  modelLoadTracker.invalidate()
  resizeObserver?.disconnect()
  resizeObserver = null
  destroyPixi()
})

watch(() => resolvedModelUrl.value, async () => {
  await loadModel()
})

watch(
  () => [props.position.x, props.position.y, props.scale, props.resolution, props.maxFps],
  () => {
    if (app.value) {
      app.value.ticker.maxFPS = resolveMaxFps(props.maxFps)
    }
    handleResize()
  },
)

watch(() => props.expressionRequest?.token, async () => {
  await applyExpression()
})

watch(
  () => props.modelParameters,
  () => {
    applyModelParameters()
  },
  { deep: true },
)

watch(
  () => [props.focusAt.x, props.focusAt.y, props.disableFocus],
  () => {
    applyFocus()
  },
)

watch(
  () => props.shadowEnabled,
  () => {
    applyShadow()
  },
)

watch(
  () => [props.autoBlinkEnabled, props.forceAutoBlinkEnabled],
  () => {
    startBlinkLoop()
  },
)

watch(
  () => [props.currentMotion?.group, props.currentMotion?.index, props.idleAnimationEnabled],
  async () => {
    bindMotionLoop()
    await applyMotion()
  },
)

watch(
  () => props.expressionSystemEnabled,
  async () => {
    await applyExpression()
  },
)

async function captureFrame() {
  const canvas = app.value?.view
  if (!canvas) {
    return undefined
  }

  return await new Promise<Blob | undefined>((resolve) => {
    canvas.toBlob(blob => resolve(blob ?? undefined))
  })
}

function canvasElement() {
  return app.value?.view
}

defineExpose({
  captureFrame,
  canvasElement,
})
</script>

<template>
  <div ref="containerRef" class="live2d-canvas">
    <div v-if="!hasModel" class="live2d-empty-state">
      <div class="empty-orb" />
      <p>{{ emptyText }}</p>
    </div>
  </div>
</template>

<style scoped>
.live2d-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.live2d-empty-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  color: rgb(0 129 179 / 0.68);
  text-align: center;
  pointer-events: none;
}

.empty-orb {
  width: 5.5rem;
  height: 5.5rem;
  border-radius: 999px;
  background:
    radial-gradient(circle at 35% 35%, rgb(255 255 255 / 0.95), transparent 45%),
    radial-gradient(circle at center, rgb(152 236 255 / 0.68), rgb(0 129 179 / 0.16));
  box-shadow:
    0 24px 40px rgb(0 129 179 / 0.12),
    inset 0 1px 0 rgb(255 255 255 / 0.8);
}

.dark .live2d-empty-state {
  color: rgb(197 252 255 / 0.8);
}

.dark .empty-orb {
  background:
    radial-gradient(circle at 35% 35%, rgb(197 252 255 / 0.72), transparent 45%),
    radial-gradient(circle at center, rgb(41 189 226 / 0.58), rgb(0 51 69 / 0.12));
  box-shadow:
    0 24px 40px rgb(0 0 0 / 0.24),
    inset 0 1px 0 rgb(197 252 255 / 0.24);
}
</style>
