import { createSSRApp, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import VisionInput from '@/components/chat/VisionInput.vue'
import type { VisionRuntimeStatus } from '@/types/vision'

const mocks = vi.hoisted(() => ({
  useVision: vi.fn(),
}))

vi.mock('@/composables/useVision', () => ({
  useVision: mocks.useVision,
}))

interface VisionRenderState {
  loaded?: boolean
  loading?: boolean
  moduleEnabled?: boolean
  runtimeActive?: boolean
  runtimeError?: string | null
  runtimeStatus?: VisionRuntimeStatus
}

function mockVision(state: VisionRenderState = {}) {
  mocks.useVision.mockReturnValue({
    ensureLoaded: vi.fn(async () => undefined),
    error: ref<string | null>(null),
    loaded: ref(state.loaded ?? true),
    loading: ref(state.loading ?? false),
    moduleEnabled: ref(state.moduleEnabled ?? true),
    runtimeActive: ref(state.runtimeActive ?? false),
    runtimeError: ref(state.runtimeError ?? null),
    runtimeStatus: ref<VisionRuntimeStatus>(state.runtimeStatus ?? 'disabled'),
    start: vi.fn(async () => true),
    stop: vi.fn(),
  })
}

async function renderVisionInput(): Promise<string> {
  return renderToString(createSSRApp(VisionInput))
}

describe('VisionInput', () => {
  beforeEach(() => {
    mocks.useVision.mockReset()
    vi.stubGlobal('navigator', {
      mediaDevices: { getDisplayMedia: vi.fn() },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is disabled while the backend module is unavailable', async () => {
    mockVision({ moduleEnabled: false })

    const html = await renderVisionInput()

    expect(html).toMatch(/<button[^>]*\sdisabled(?:\s|>)/)
    expect(html).toContain('请先在设置中启用视觉功能')
    expect(html).toContain('i-solar:eye-closed-bold-duotone')
  })

  it('is available without starting a share when the module is enabled', async () => {
    mockVision()

    const html = await renderVisionInput()

    expect(html).not.toMatch(/<button[^>]*\sdisabled(?:\s|>)/)
    expect(html).toContain('开始屏幕共享')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('i-solar:eye-bold-duotone')
  })

  it('shows a cancellable permission-request state', async () => {
    mockVision({ runtimeStatus: 'starting' })

    const html = await renderVisionInput()

    expect(html).not.toMatch(/<button[^>]*\sdisabled(?:\s|>)/)
    expect(html).toContain('正在请求屏幕共享权限，点击可取消')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('i-solar:refresh-bold-duotone')
  })

  it('renders a clearly pressed active state', async () => {
    mockVision({ runtimeActive: true, runtimeStatus: 'active' })

    const html = await renderVisionInput()

    expect(html).toContain('停止屏幕共享')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('i-solar:eye-scan-bold-duotone')
  })

  it('renders a safe retry notice after permission denial', async () => {
    mockVision({
      runtimeError: '屏幕共享权限未授予。',
      runtimeStatus: 'error',
    })

    const html = await renderVisionInput()

    expect(html).toContain('i-solar:danger-circle-bold-duotone')
    expect(html).toContain('role="status"')
    expect(html).toContain('屏幕共享权限未授予。 点击视觉按钮可重新尝试。')
  })

  it('is disabled when getDisplayMedia is unsupported', async () => {
    vi.stubGlobal('navigator', { mediaDevices: {} })
    mockVision()

    const html = await renderVisionInput()

    expect(html).toMatch(/<button[^>]*\sdisabled(?:\s|>)/)
    expect(html).toContain('当前浏览器不支持屏幕共享')
  })
})
