import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { live2dApi } from '@/api/live2d'
import type { Live2DModelResponse } from '@/api/types'
import { useLive2dStore } from '@/stores/live2d'

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

  it('canonicalizes and immediately applies a selected default expression', async () => {
    vi.mocked(live2dApi.list).mockResolvedValue([
      model('expressive', true, ['F_FUN', 'F_SAD']),
    ])
    const store = useLive2dStore()
    await store.fetchModels()

    store.setDefaultExpression('f_fun')

    expect(store.activeExpressions).toEqual(['F_FUN'])
    expect(store.savedExpressionDefaults).toEqual(['F_FUN'])
    expect(store.expressionRequest.name).toBe('F_FUN')
  })

  it('uses the model expression when the saved default is cleared', async () => {
    vi.mocked(live2dApi.list).mockResolvedValue([
      model('expressive', true, ['F_FUN']),
    ])
    const store = useLive2dStore()
    await store.fetchModels()
    store.setDefaultExpression('F_FUN')

    store.setDefaultExpression(null)

    expect(store.activeExpressions).toEqual([])
    expect(store.savedExpressionDefaults).toEqual([])
    expect(store.expressionRequest.name).toBeNull()
  })

  it('keeps the saved default when a temporary expression is requested', async () => {
    vi.mocked(live2dApi.list).mockResolvedValue([
      model('expressive', true, ['F_FUN', 'F_SAD']),
    ])
    const store = useLive2dStore()
    await store.fetchModels()
    store.setDefaultExpression('F_FUN')

    store.requestExpression('F_SAD')

    expect(store.activeExpressions).toEqual(['F_SAD'])
    expect(store.savedExpressionDefaults).toEqual(['F_FUN'])
    expect(store.expressionRequest.name).toBe('F_SAD')
  })

  it('restores the saved default after a temporary expression', async () => {
    vi.mocked(live2dApi.list).mockResolvedValue([
      model('expressive', true, ['F_FUN', 'F_SAD']),
    ])
    const store = useLive2dStore()
    await store.fetchModels()
    store.setDefaultExpression('F_FUN')
    store.requestExpression('F_SAD')

    store.resetAllExpressions()

    expect(store.activeExpressions).toEqual(['F_FUN'])
    expect(store.savedExpressionDefaults).toEqual(['F_FUN'])
    expect(store.expressionRequest.name).toBe('F_FUN')
  })

  it('normalizes legacy multi-expression defaults to one saved value', async () => {
    localStorage.setItem('atri-live2d-settings', JSON.stringify({
      activeModelId: 'expressive',
      savedExpressionDefaults: ['F_SAD', 'F_FUN'],
    }))
    vi.mocked(live2dApi.list).mockResolvedValue([
      model('expressive', true, ['F_FUN', 'F_SAD']),
    ])
    const store = useLive2dStore()

    await store.fetchModels()

    expect(store.savedExpressionDefaults).toEqual(['F_SAD'])
    expect(store.activeExpressions).toEqual(['F_SAD'])
    expect(store.expressionRequest.name).toBe('F_SAD')
  })
})
