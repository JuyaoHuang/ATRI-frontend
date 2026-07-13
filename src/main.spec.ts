import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  initializeTheme: vi.fn(),
  mount: vi.fn(),
  use: vi.fn(),
}))

vi.mock('uno.css', () => ({}))

vi.mock('vue', () => ({
  createApp: vi.fn(() => ({
    mount: mocks.mount,
    use: mocks.use,
  })),
}))

vi.mock('pinia', () => ({
  createPinia: vi.fn(() => Symbol('pinia')),
}))

vi.mock('@vueuse/motion', () => ({
  MotionPlugin: Symbol('motion-plugin'),
}))

vi.mock('./App.vue', () => ({
  default: {},
}))

vi.mock('./router', () => ({
  default: Symbol('router'),
}))

vi.mock('@/composables/useTheme', () => ({
  useTheme: mocks.initializeTheme,
}))

describe('application bootstrap', () => {
  it('initializes the persisted theme before mounting any route', async () => {
    await import('./main')

    expect(mocks.initializeTheme).toHaveBeenCalledOnce()
    expect(mocks.initializeTheme.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.mount.mock.invocationCallOrder[0],
    )
  })
})
