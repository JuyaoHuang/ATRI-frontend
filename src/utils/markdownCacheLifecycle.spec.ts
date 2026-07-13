// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authApiMock = vi.hoisted(() => ({
  status: vi.fn(),
  login: vi.fn(),
  me: vi.fn(),
  logout: vi.fn()
}))
const chatsApiMock = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  delete: vi.fn()
}))
const dataApiMock = vi.hoisted(() => ({
  clearShortTermMemory: vi.fn(),
  clearLongTermMemory: vi.fn()
}))

vi.mock('@/api/auth', () => ({ authApi: authApiMock }))
vi.mock('@/api/chats', () => ({ chatsApi: chatsApiMock }))
vi.mock('@/api/data', () => ({ dataApi: dataApiMock }))

import { useDataCleanup } from '@/composables/useDataCleanup'
import { useChatsStore } from '@/stores/chats'
import { useUserStore } from '@/stores/user'
import {
  clearMarkdownRenderCache,
  getMarkdownRenderCacheStats,
  renderMarkdownWithCache
} from '@/utils/markdownRenderCache'
import { renderMarkdown } from '@/utils/markdownRenderer'

const ALICE = {
  username: 'alice',
  avatar_url: null,
  name: 'Alice',
  auth_enabled: true
}

const BOB = {
  username: 'bob',
  avatar_url: null,
  name: 'Bob',
  auth_enabled: true
}

function populateCache(source = '**cached content**'): void {
  expect(renderMarkdownWithCache(source, renderMarkdown).kind).toBe('html')
  expect(getMarkdownRenderCacheStats().entries).toBe(1)
}

describe('Markdown cache lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    sessionStorage.clear()
    clearMarkdownRenderCache()
    vi.clearAllMocks()
  })

  it('clears the cache when the authenticated account changes', async () => {
    const userStore = useUserStore()
    userStore.auth.user = ALICE
    userStore.auth.enabled = true
    authApiMock.me.mockResolvedValue(BOB)
    populateCache()

    await userStore.fetchCurrentUser()

    expect(userStore.auth.user?.username).toBe('bob')
    expect(getMarkdownRenderCacheStats().entries).toBe(0)
  })

  it('retains the cache when the same account profile refreshes', async () => {
    const userStore = useUserStore()
    userStore.auth.user = ALICE
    userStore.auth.enabled = true
    authApiMock.me.mockResolvedValue({ ...ALICE, name: 'Updated Alice' })
    populateCache()

    await userStore.fetchCurrentUser()

    expect(getMarkdownRenderCacheStats().entries).toBe(1)
  })

  it('clears the cache on logout even when the endpoint fails', async () => {
    const userStore = useUserStore()
    userStore.auth.user = ALICE
    userStore.auth.enabled = true
    authApiMock.logout.mockRejectedValue(new Error('offline'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    populateCache()

    await userStore.logout()

    expect(errorLog).toHaveBeenCalledOnce()
    expect(getMarkdownRenderCacheStats().entries).toBe(0)
  })

  it('clears globally after each successful data cleanup action', async () => {
    const cleanup = useDataCleanup()
    chatsApiMock.delete.mockResolvedValue(undefined)
    dataApiMock.clearShortTermMemory.mockResolvedValue({ status: 'cleared' })
    dataApiMock.clearLongTermMemory.mockResolvedValue({ status: 'submitted' })

    populateCache('deleted chat')
    await cleanup.deleteChatSession('chat-a', 'atri')
    expect(getMarkdownRenderCacheStats().entries).toBe(0)

    populateCache('short memory')
    await cleanup.clearShortTermMemory('atri', 'chat-a')
    expect(getMarkdownRenderCacheStats().entries).toBe(0)

    populateCache('long memory')
    await cleanup.clearLongTermMemory('atri')
    expect(getMarkdownRenderCacheStats().entries).toBe(0)
  })

  it('clears the cache after the shared chat deletion action succeeds', async () => {
    const chatsStore = useChatsStore()
    chatsApiMock.delete.mockResolvedValue(undefined)
    populateCache('sidebar deleted chat')

    await chatsStore.deleteChat('chat-a')

    expect(chatsApiMock.delete).toHaveBeenCalledWith('chat-a')
    expect(getMarkdownRenderCacheStats().entries).toBe(0)
  })

  it('keeps the cache when a cleanup request fails', async () => {
    const cleanup = useDataCleanup()
    chatsApiMock.delete.mockRejectedValue(new Error('delete failed'))
    populateCache()

    await expect(cleanup.deleteChatSession('chat-a', 'atri')).rejects.toThrow('delete failed')

    expect(getMarkdownRenderCacheStats().entries).toBe(1)
  })
})
