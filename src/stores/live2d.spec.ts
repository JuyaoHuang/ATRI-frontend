import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { live2dApi } from '@/api/live2d'
import type { Live2DModelResponse } from '@/api/types'
import { useLive2dStore } from '@/stores/live2d'

const TEST_PRIMARY_EXPRESSION = 'ExpressionAlpha'
const TEST_TEMPORARY_EXPRESSION = 'ExpressionBeta'

vi.mock('@/api/live2d', () => ({
  live2dApi: {
    list: vi.fn(),
    getExpressions: vi.fn(),
  },
}))

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key: string) {
      return values.get(key) ?? null
    },
    key(index: number) {
      return [...values.keys()][index] ?? null
    },
    removeItem(key: string) {
      values.delete(key)
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
  }
}

function model(id: string, isDefault = false, expressions: string[] = []): Live2DModelResponse {
  return {
    id,
    name: id,
    model_path: `runtime/${id}.model3.json`,
    model_url: `http://test/api/assets/live2d/${id}/runtime/${id}.model3.json`,
    thumbnail_url: null,
    expressions,
    is_default: isDefault,
  }
}

describe('live2d store model selection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('localStorage', createMemoryStorage())
    vi.mocked(live2dApi.list).mockReset()
  })

  it('keeps a valid browser selection ahead of the backend default', async () => {
    localStorage.setItem('atri-live2d-settings', JSON.stringify({
      enabled: true,
      activeModelId: 'user_choice',
    }))
    vi.mocked(live2dApi.list).mockResolvedValue([
      model('backend_default', true),
      model('user_choice'),
    ])
    const store = useLive2dStore()

    await store.fetchModels()

    expect(store.activeModelId).toBe('user_choice')
    expect(store.activeModel?.id).toBe('user_choice')
    expect(store.enabled).toBe(true)
  })

  it('falls back from a stale browser id to the backend default', async () => {
    localStorage.setItem('atri-live2d-settings', JSON.stringify({
      activeModelId: 'removed_model',
    }))
    vi.mocked(live2dApi.list).mockResolvedValue([
      model('other_model'),
      model('backend_default', true),
    ])
    const store = useLive2dStore()

    await store.fetchModels()

    expect(store.activeModelId).toBe('backend_default')
    expect(store.activeModel?.modelUrl).toContain('/backend_default/')
  })

  it('does not silently select the first model when no default exists', async () => {
    localStorage.setItem('atri-live2d-settings', JSON.stringify({
      activeModelId: 'removed_model',
    }))
    vi.mocked(live2dApi.list).mockResolvedValue([
      model('first_model'),
      model('second_model'),
    ])
    const store = useLive2dStore()

    await store.fetchModels()

    expect(store.activeModelId).toBeNull()
    expect(store.activeModel).toBeNull()
  })

  it('uses a backend default without forcing Live2D on', async () => {
    vi.mocked(live2dApi.list).mockResolvedValue([model('backend_default', true)])
    const store = useLive2dStore()

    await store.fetchModels()

    expect(store.activeModelId).toBe('backend_default')
    expect(store.enabled).toBe(false)
  })

  it('preserves the browser selection when the catalog request fails', async () => {
    localStorage.setItem('atri-live2d-settings', JSON.stringify({
      activeModelId: 'user_choice',
    }))
    vi.mocked(live2dApi.list).mockRejectedValue(new Error('temporary failure'))
    const store = useLive2dStore()

    await store.fetchModels()

    expect(store.activeModelId).toBe('user_choice')
    expect(store.activeModel).toBeNull()
    expect(JSON.parse(localStorage.getItem('atri-live2d-settings') ?? '{}')).toMatchObject({
      activeModelId: 'user_choice',
    })
  })

  it('only accepts a model id returned by the catalog', async () => {
    vi.mocked(live2dApi.list).mockResolvedValue([model('installed')])
    const store = useLive2dStore()
    await store.fetchModels()

    store.setActiveModel('not_installed')
    expect(store.activeModelId).toBeNull()

    store.setActiveModel('installed')
    expect(store.activeModelId).toBe('installed')
  })

  it('does not expose upload, rename, delete, or uploading state', () => {
    const store = useLive2dStore()

    expect('uploadModel' in store).toBe(false)
    expect('renameModel' in store).toBe(false)
    expect('deleteModel' in store).toBe(false)
    expect('uploading' in store).toBe(false)
  })

  it('does not expose custom model cache state or actions', () => {
    const store = useLive2dStore()

    expect('modelCacheVersion' in store).toBe(false)
    expect('clearModelCache' in store).toBe(false)
  })

  it('does not expose manual motion state or actions', () => {
    const store = useLive2dStore()

    expect('availableMotions' in store).toBe(false)
    expect('currentMotion' in store).toBe(false)
    expect('selectedRuntimeMotionPath' in store).toBe(false)
    expect('setAvailableMotions' in store).toBe(false)
    expect('setSelectedRuntimeMotion' in store).toBe(false)
    expect('idleAnimationEnabled' in store).toBe(false)
    expect('setIdleAnimationEnabled' in store).toBe(false)
  })

  it('does not expose a redundant default-expression reset action', () => {
    const store = useLive2dStore()

    expect('resetAllExpressions' in store).toBe(false)
  })

  it('canonicalizes and immediately applies a selected default expression', async () => {
    vi.mocked(live2dApi.list).mockResolvedValue([
      model('expressive', true, [TEST_PRIMARY_EXPRESSION, TEST_TEMPORARY_EXPRESSION]),
    ])
    const store = useLive2dStore()
    await store.fetchModels()

    store.setDefaultExpression(TEST_PRIMARY_EXPRESSION.toLowerCase())

    expect(store.activeExpressions).toEqual([TEST_PRIMARY_EXPRESSION])
    expect(store.savedExpressionDefaults).toEqual([TEST_PRIMARY_EXPRESSION])
    expect(store.expressionRequest.name).toBe(TEST_PRIMARY_EXPRESSION)
  })

  it('uses the model base state when the saved default is cleared', async () => {
    vi.mocked(live2dApi.list).mockResolvedValue([
      model('expressive', true, [TEST_PRIMARY_EXPRESSION]),
    ])
    const store = useLive2dStore()
    await store.fetchModels()
    store.setDefaultExpression(TEST_PRIMARY_EXPRESSION)

    store.setDefaultExpression(null)

    expect(store.activeExpressions).toEqual([])
    expect(store.savedExpressionDefaults).toEqual([])
    expect(store.expressionRequest.name).toBeNull()
  })

  it('keeps the saved default when a temporary expression is requested', async () => {
    vi.mocked(live2dApi.list).mockResolvedValue([
      model('expressive', true, [TEST_PRIMARY_EXPRESSION, TEST_TEMPORARY_EXPRESSION]),
    ])
    const store = useLive2dStore()
    await store.fetchModels()
    store.setDefaultExpression(TEST_PRIMARY_EXPRESSION)

    store.requestExpression(TEST_TEMPORARY_EXPRESSION)

    expect(store.activeExpressions).toEqual([TEST_TEMPORARY_EXPRESSION])
    expect(store.savedExpressionDefaults).toEqual([TEST_PRIMARY_EXPRESSION])
    expect(store.expressionRequest.name).toBe(TEST_TEMPORARY_EXPRESSION)
  })

  it('suspends and restores the current expression when the system is toggled', async () => {
    vi.mocked(live2dApi.list).mockResolvedValue([
      model('expressive', true, [TEST_PRIMARY_EXPRESSION, TEST_TEMPORARY_EXPRESSION]),
    ])
    const store = useLive2dStore()
    await store.fetchModels()
    store.setDefaultExpression(TEST_PRIMARY_EXPRESSION)
    store.requestExpression(TEST_TEMPORARY_EXPRESSION)

    store.setExpressionEnabled(false)

    expect(store.expressionEnabled).toBe(false)
    expect(store.expressionRequest.name).toBeNull()
    expect(store.activeExpressions).toEqual([TEST_TEMPORARY_EXPRESSION])
    expect(store.savedExpressionDefaults).toEqual([TEST_PRIMARY_EXPRESSION])

    store.setExpressionEnabled(true)

    expect(store.expressionEnabled).toBe(true)
    expect(store.expressionRequest.name).toBe(TEST_TEMPORARY_EXPRESSION)
    expect(store.savedExpressionDefaults).toEqual([TEST_PRIMARY_EXPRESSION])
  })

  it('normalizes legacy multi-expression defaults to one saved value', async () => {
    localStorage.setItem('atri-live2d-settings', JSON.stringify({
      activeModelId: 'expressive',
      savedExpressionDefaults: [TEST_TEMPORARY_EXPRESSION, TEST_PRIMARY_EXPRESSION],
    }))
    vi.mocked(live2dApi.list).mockResolvedValue([
      model('expressive', true, [TEST_PRIMARY_EXPRESSION, TEST_TEMPORARY_EXPRESSION]),
    ])
    const store = useLive2dStore()

    await store.fetchModels()

    expect(store.savedExpressionDefaults).toEqual([TEST_TEMPORARY_EXPRESSION])
    expect(store.activeExpressions).toEqual([TEST_TEMPORARY_EXPRESSION])
    expect(store.expressionRequest.name).toBe(TEST_TEMPORARY_EXPRESSION)
  })
})
