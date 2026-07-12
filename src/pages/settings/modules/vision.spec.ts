import { createSSRApp, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'

import VisionSettings from '@/pages/settings/modules/vision.vue'

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(async () => undefined),
  updateModuleEnabled: vi.fn(async () => undefined),
}))

vi.mock('@/composables/useVision', () => ({
  useVision: () => ({
    error: ref<string | null>(null),
    loaded: ref(true),
    loading: ref(false),
    loadConfig: mocks.loadConfig,
    moduleEnabled: ref(true),
    runtimeError: ref<string | null>(null),
    runtimeStatus: ref('disabled'),
    saving: ref(false),
    updateModuleEnabled: mocks.updateModuleEnabled,
  }),
}))

describe('vision settings page', () => {
  it('exposes one persistent module switch and no runtime share control', async () => {
    const html = await renderToString(createSSRApp(VisionSettings))

    expect(html.match(/role="switch"/g)).toHaveLength(1)
    expect(html).toContain('启用视觉功能')
    expect(html).toContain('不会立即请求屏幕共享权限')
    expect(html).not.toContain('开始屏幕共享')
  })
})
