import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import { live2dApi } from '@/api/live2d'
import type { Live2DModelResponse } from '@/api/types'
import type {
  Live2DExpressionLlmMode,
  Live2DExpressionRequest,
  Live2DModel,
  Live2DMotion,
  Live2DMotionSelection,
  Live2DPosition,
} from '@/types/live2d'
import { clearLive2dOpfsCache } from '@/utils/live2dOpfs'
import { extractLive2dExpression } from '@/utils/live2dExpression'

export interface Live2DModelParameters {
  angleX: number
  angleY: number
  angleZ: number
  leftEyeOpen: number
  rightEyeOpen: number
  leftEyeSmile: number
  rightEyeSmile: number
  leftEyebrowLR: number
  rightEyebrowLR: number
  leftEyebrowY: number
  rightEyebrowY: number
  leftEyebrowAngle: number
  rightEyebrowAngle: number
  leftEyebrowForm: number
  rightEyebrowForm: number
  mouthOpen: number
  mouthForm: number
  cheek: number
  bodyAngleX: number
  bodyAngleY: number
  bodyAngleZ: number
  breath: number
}

interface Live2DPreferences {
  enabled: boolean
  activeModelId: string | null
  position: Live2DPosition
  scale: number
  disableFocus: boolean
  idleAnimationEnabled: boolean
  autoBlinkEnabled: boolean
  forceAutoBlinkEnabled: boolean
  shadowEnabled: boolean
  maxFps: number
  renderScale: number
  modelParameters: Live2DModelParameters
  savedExpressionDefaults: string[]
  selectedRuntimeMotionPath: string
  currentMotion: Live2DMotionSelection | null
  expressionEnabled: boolean
  expressionLlmMode: Live2DExpressionLlmMode
  expressionLlmExposed: Record<string, boolean>
}

const STORAGE_KEY = 'atri-live2d-settings'

export const DEFAULT_MODEL_PARAMETERS: Live2DModelParameters = {
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
}

const DEFAULT_PREFERENCES: Live2DPreferences = {
  enabled: false,
  activeModelId: null,
  position: { x: 0, y: 0 },
  scale: 1,
  disableFocus: false,
  idleAnimationEnabled: true,
  autoBlinkEnabled: true,
  forceAutoBlinkEnabled: false,
  shadowEnabled: true,
  maxFps: 0,
  renderScale: 2,
  modelParameters: { ...DEFAULT_MODEL_PARAMETERS },
  savedExpressionDefaults: [],
  selectedRuntimeMotionPath: '',
  currentMotion: null,
  expressionEnabled: true,
  expressionLlmMode: 'none',
  expressionLlmExposed: {},
}

function loadPreferences(): Live2DPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { ...DEFAULT_PREFERENCES, modelParameters: { ...DEFAULT_MODEL_PARAMETERS } }
    }

    const parsed = JSON.parse(raw) as Partial<Live2DPreferences>
    return {
      enabled: parsed.enabled ?? DEFAULT_PREFERENCES.enabled,
      activeModelId: parsed.activeModelId ?? DEFAULT_PREFERENCES.activeModelId,
      position: {
        x: parsed.position?.x ?? DEFAULT_PREFERENCES.position.x,
        y: parsed.position?.y ?? DEFAULT_PREFERENCES.position.y,
      },
      scale: parsed.scale ?? DEFAULT_PREFERENCES.scale,
      disableFocus: parsed.disableFocus ?? DEFAULT_PREFERENCES.disableFocus,
      idleAnimationEnabled: parsed.idleAnimationEnabled ?? DEFAULT_PREFERENCES.idleAnimationEnabled,
      autoBlinkEnabled: parsed.autoBlinkEnabled ?? DEFAULT_PREFERENCES.autoBlinkEnabled,
      forceAutoBlinkEnabled: parsed.forceAutoBlinkEnabled ?? DEFAULT_PREFERENCES.forceAutoBlinkEnabled,
      shadowEnabled: parsed.shadowEnabled ?? DEFAULT_PREFERENCES.shadowEnabled,
      maxFps: parsed.maxFps ?? DEFAULT_PREFERENCES.maxFps,
      renderScale: parsed.renderScale ?? DEFAULT_PREFERENCES.renderScale,
      modelParameters: {
        ...DEFAULT_MODEL_PARAMETERS,
        ...parsed.modelParameters,
      },
      savedExpressionDefaults: parsed.savedExpressionDefaults ?? DEFAULT_PREFERENCES.savedExpressionDefaults,
      selectedRuntimeMotionPath: parsed.selectedRuntimeMotionPath ?? DEFAULT_PREFERENCES.selectedRuntimeMotionPath,
      currentMotion: parsed.currentMotion ?? DEFAULT_PREFERENCES.currentMotion,
      expressionEnabled: parsed.expressionEnabled ?? DEFAULT_PREFERENCES.expressionEnabled,
      expressionLlmMode: parsed.expressionLlmMode ?? DEFAULT_PREFERENCES.expressionLlmMode,
      expressionLlmExposed: parsed.expressionLlmExposed ?? DEFAULT_PREFERENCES.expressionLlmExposed,
    }
  }
  catch (error) {
    console.error('加载 Live2D 设置失败:', error)
    return { ...DEFAULT_PREFERENCES, modelParameters: { ...DEFAULT_MODEL_PARAMETERS } }
  }
}

function mapModel(model: Live2DModelResponse): Live2DModel {
  return {
    id: model.id,
    name: model.name,
    modelPath: model.model_path,
    modelUrl: model.model_url,
    thumbnailUrl: model.thumbnail_url || undefined,
    expressions: model.expressions || [],
    isDefault: model.is_default,
  }
}

export const useLive2dStore = defineStore('live2d', () => {
  const preferences = loadPreferences()

  const enabled = ref(preferences.enabled)
  const activeModelId = ref<string | null>(preferences.activeModelId)
  const position = ref<Live2DPosition>({ ...preferences.position })
  const scale = ref(preferences.scale)
  const disableFocus = ref(preferences.disableFocus)
  const idleAnimationEnabled = ref(preferences.idleAnimationEnabled)
  const autoBlinkEnabled = ref(preferences.autoBlinkEnabled)
  const forceAutoBlinkEnabled = ref(preferences.forceAutoBlinkEnabled)
  const shadowEnabled = ref(preferences.shadowEnabled)
  const maxFps = ref(preferences.maxFps)
  const renderScale = ref(preferences.renderScale)
  const modelParameters = ref<Live2DModelParameters>({ ...preferences.modelParameters })
  const savedExpressionDefaults = ref<string[]>([...preferences.savedExpressionDefaults])
  const selectedRuntimeMotionPath = ref(preferences.selectedRuntimeMotionPath)
  const currentMotion = ref<Live2DMotionSelection | null>(preferences.currentMotion)
  const expressionEnabled = ref(preferences.expressionEnabled)
  const expressionLlmMode = ref<Live2DExpressionLlmMode>(preferences.expressionLlmMode)
  const expressionLlmExposed = ref<Record<string, boolean>>({ ...preferences.expressionLlmExposed })

  const models = ref<Live2DModel[]>([])
  const loading = ref(false)
  const availableMotions = ref<Live2DMotion[]>([])
  const expressionRequest = ref<Live2DExpressionRequest>({
    name: null,
    token: 0,
  })
  const activeExpressions = ref<string[]>([...preferences.savedExpressionDefaults])
  const modelCacheVersion = ref(0)

  const activeModel = computed<Live2DModel | null>(() =>
    models.value.find(model => model.id === activeModelId.value) || null,
  )

  const expressionGroups = computed(() => activeModel.value?.expressions ?? [])

  function savePreferences() {
    try {
      const payload: Live2DPreferences = {
        enabled: enabled.value,
        activeModelId: activeModelId.value,
        position: position.value,
        scale: scale.value,
        disableFocus: disableFocus.value,
        idleAnimationEnabled: idleAnimationEnabled.value,
        autoBlinkEnabled: autoBlinkEnabled.value,
        forceAutoBlinkEnabled: forceAutoBlinkEnabled.value,
        shadowEnabled: shadowEnabled.value,
        maxFps: maxFps.value,
        renderScale: renderScale.value,
        modelParameters: modelParameters.value,
        savedExpressionDefaults: savedExpressionDefaults.value,
        selectedRuntimeMotionPath: selectedRuntimeMotionPath.value,
        currentMotion: currentMotion.value,
        expressionEnabled: expressionEnabled.value,
        expressionLlmMode: expressionLlmMode.value,
        expressionLlmExposed: expressionLlmExposed.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    }
    catch (error) {
      console.error('保存 Live2D 设置失败:', error)
    }
  }

  watch(
    () => ({
      enabled: enabled.value,
      activeModelId: activeModelId.value,
      position: position.value,
      scale: scale.value,
      disableFocus: disableFocus.value,
      idleAnimationEnabled: idleAnimationEnabled.value,
      autoBlinkEnabled: autoBlinkEnabled.value,
      forceAutoBlinkEnabled: forceAutoBlinkEnabled.value,
      shadowEnabled: shadowEnabled.value,
      maxFps: maxFps.value,
      renderScale: renderScale.value,
      modelParameters: modelParameters.value,
      savedExpressionDefaults: savedExpressionDefaults.value,
      selectedRuntimeMotionPath: selectedRuntimeMotionPath.value,
      currentMotion: currentMotion.value,
      expressionEnabled: expressionEnabled.value,
      expressionLlmMode: expressionLlmMode.value,
      expressionLlmExposed: expressionLlmExposed.value,
    }),
    () => savePreferences(),
    { deep: true },
  )

  function syncExpressionState() {
    const validExpressions = new Set(activeModel.value?.expressions ?? [])
    activeExpressions.value = activeExpressions.value.filter(name => validExpressions.has(name))
    savedExpressionDefaults.value = savedExpressionDefaults.value.filter(name => validExpressions.has(name))

    expressionLlmExposed.value = Object.fromEntries(
      Object.entries(expressionLlmExposed.value).filter(([name]) => validExpressions.has(name)),
    )

    if (!expressionEnabled.value || activeExpressions.value.length === 0) {
      expressionRequest.value = {
        name: null,
        token: Date.now(),
      }
      return
    }

    const nextExpression = activeExpressions.value[0] || null
    expressionRequest.value = {
      name: nextExpression,
      token: Date.now(),
    }
  }

  function ensureActiveModel() {
    const active = models.value.find(model => model.id === activeModelId.value)
    if (active) {
      syncExpressionState()
      return
    }

    const fallbackModel = models.value.find(model => model.isDefault) || null
    if (activeModelId.value !== fallbackModel?.id) {
      availableMotions.value = []
      selectedRuntimeMotionPath.value = ''
      currentMotion.value = null
    }
    activeModelId.value = fallbackModel?.id || null
    syncExpressionState()
  }

  function setAvailableMotions(motions: Live2DMotion[]) {
    availableMotions.value = motions

    if (!selectedRuntimeMotionPath.value) {
      return
    }

    const selectedMotion = motions.find(motion => motion.fileName === selectedRuntimeMotionPath.value)
    if (selectedMotion) {
      currentMotion.value = {
        group: selectedMotion.motionName,
        index: selectedMotion.motionIndex,
      }
    }
  }

  async function fetchModels() {
    loading.value = true
    try {
      const response = await live2dApi.list()
      models.value = response.map(mapModel)
      ensureActiveModel()
      return models.value
    }
    catch (error) {
      console.error('获取 Live2D 模型失败:', error)
      models.value = []
      activeExpressions.value = []
      availableMotions.value = []
      selectedRuntimeMotionPath.value = ''
      currentMotion.value = null
      return []
    }
    finally {
      loading.value = false
    }
  }

  function setEnabled(value: boolean) {
    enabled.value = value
  }

  function setActiveModel(modelId: string) {
    if (!models.value.some(model => model.id === modelId)) {
      return
    }
    activeModelId.value = modelId
    availableMotions.value = []
    selectedRuntimeMotionPath.value = ''
    currentMotion.value = null
    syncExpressionState()
  }

  function setScale(value: number) {
    scale.value = value
  }

  function setMaxFps(value: number) {
    maxFps.value = value
  }

  function setRenderScale(value: number) {
    renderScale.value = value
  }

  function setDisableFocus(value: boolean) {
    disableFocus.value = value
  }

  function setIdleAnimationEnabled(value: boolean) {
    idleAnimationEnabled.value = value
  }

  function setAutoBlinkEnabled(value: boolean) {
    autoBlinkEnabled.value = value
  }

  function setForceAutoBlinkEnabled(value: boolean) {
    forceAutoBlinkEnabled.value = value
  }

  function setShadowEnabled(value: boolean) {
    shadowEnabled.value = value
  }

  function setExpressionEnabled(value: boolean) {
    expressionEnabled.value = value
    syncExpressionState()
  }

  function setExpressionLlmMode(value: Live2DExpressionLlmMode) {
    expressionLlmMode.value = value
  }

  function setExpressionLlmExposed(name: string, value: boolean) {
    expressionLlmExposed.value = {
      ...expressionLlmExposed.value,
      [name]: value,
    }
  }

  function setPosition(nextPosition: Partial<Live2DPosition>) {
    position.value = {
      ...position.value,
      ...nextPosition,
    }
  }

  function resetTransform() {
    position.value = { ...DEFAULT_PREFERENCES.position }
    scale.value = DEFAULT_PREFERENCES.scale
  }

  function setModelParameter<K extends keyof Live2DModelParameters>(key: K, value: Live2DModelParameters[K]) {
    modelParameters.value = {
      ...modelParameters.value,
      [key]: value,
    }
  }

  function resetModelParameters() {
    modelParameters.value = { ...DEFAULT_MODEL_PARAMETERS }
  }

  function requestExpression(name: string | null) {
    const matchedExpression = !name
      ? null
      : activeModel.value?.expressions.find(expression => expression.toLowerCase() === name.toLowerCase()) || null

    expressionRequest.value = {
      name: expressionEnabled.value ? matchedExpression : null,
      token: Date.now(),
    }

    activeExpressions.value = matchedExpression ? [matchedExpression] : []
  }

  function toggleExpression(name: string) {
    const isActive = activeExpressions.value.includes(name)
    if (isActive) {
      activeExpressions.value = activeExpressions.value.filter(item => item !== name)
      requestExpression(null)
      return
    }

    activeExpressions.value = [name]
    requestExpression(name)
  }

  function saveExpressionDefaults() {
    savedExpressionDefaults.value = [...activeExpressions.value]
  }

  function resetAllExpressions() {
    activeExpressions.value = [...savedExpressionDefaults.value]
    requestExpression(activeExpressions.value[0] || null)
  }

  function setSelectedRuntimeMotion(path: string | number | undefined) {
    const nextPath = typeof path === 'string' ? path : ''
    selectedRuntimeMotionPath.value = nextPath

    if (!nextPath) {
      currentMotion.value = null
      return
    }

    const selectedMotion = availableMotions.value.find(motion => motion.fileName === nextPath)
    if (!selectedMotion) {
      return
    }

    idleAnimationEnabled.value = true
    currentMotion.value = {
      group: selectedMotion.motionName,
      index: selectedMotion.motionIndex,
    }
  }

  async function clearModelCache() {
    await clearLive2dOpfsCache()
    modelCacheVersion.value = Date.now()
  }

  function parseAndApplyExpression(text: string) {
    const parsed = extractLive2dExpression(text)
    if (parsed.expression) {
      requestExpression(parsed.expression)
    }
    return parsed
  }

  return {
    enabled,
    activeModelId,
    position,
    scale,
    disableFocus,
    idleAnimationEnabled,
    autoBlinkEnabled,
    forceAutoBlinkEnabled,
    shadowEnabled,
    maxFps,
    renderScale,
    modelParameters,
    savedExpressionDefaults,
    selectedRuntimeMotionPath,
    currentMotion,
    expressionEnabled,
    expressionLlmMode,
    expressionLlmExposed,
    models,
    loading,
    availableMotions,
    expressionRequest,
    activeExpressions,
    modelCacheVersion,
    activeModel,
    expressionGroups,
    fetchModels,
    setEnabled,
    setActiveModel,
    setScale,
    setMaxFps,
    setRenderScale,
    setDisableFocus,
    setIdleAnimationEnabled,
    setAutoBlinkEnabled,
    setForceAutoBlinkEnabled,
    setShadowEnabled,
    setExpressionEnabled,
    setExpressionLlmMode,
    setExpressionLlmExposed,
    setPosition,
    resetTransform,
    setModelParameter,
    resetModelParameters,
    requestExpression,
    toggleExpression,
    saveExpressionDefaults,
    resetAllExpressions,
    setSelectedRuntimeMotion,
    setAvailableMotions,
    clearModelCache,
    parseAndApplyExpression,
  }
})
