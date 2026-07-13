import { defineStore } from 'pinia'

import { authApi } from '@/api/auth'
import type { AuthUserResponse } from '@/api/types'
import {
  clearStoredAuthState,
  getStoredSignedInAt,
  setStoredSignedInAt
} from '@/utils/authToken'
import { clearMarkdownRenderCache } from '@/utils/markdownRenderCache'

export interface UserSettings {
  nickname: string
  avatar: string
}

export interface AuthSessionState {
  enabled: boolean
  initialized: boolean
  loading: boolean
  signedInAt: string | null
  user: AuthUserResponse | null
  error: string | null
}

export interface UserState {
  settings: UserSettings
  auth: AuthSessionState
}

const DEFAULT_SETTINGS: UserSettings = {
  nickname: 'juyao',
  avatar: '1.jpg'
}

const DEFAULT_AUTH_USER: AuthUserResponse = {
  username: 'default',
  avatar_url: null,
  name: null,
  auth_enabled: false
}

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    settings: loadSettings(),
    auth: {
      enabled: false,
      initialized: false,
      loading: false,
      signedInAt: getStoredSignedInAt(),
      user: null,
      error: null
    }
  }),

  getters: {
    authEnabled: state => state.auth.enabled,
    isAuthenticated: state => !state.auth.enabled || Boolean(state.auth.user),
    displayName: state => {
      if (state.auth.enabled && state.auth.user) {
        return state.auth.user.name || state.auth.user.username || state.settings.nickname
      }
      return state.settings.nickname
    },
    avatarUrl: state => {
      if (state.auth.enabled && state.auth.user?.avatar_url) {
        return state.auth.user.avatar_url
      }
      return `/avatars/${state.settings.avatar}`
    }
  },

  actions: {
    updateSettings(settings: Partial<UserSettings>) {
      this.settings = { ...this.settings, ...settings }
      saveSettings(this.settings)
    },

    resetSettings() {
      this.settings = { ...DEFAULT_SETTINGS }
      saveSettings(this.settings)
    },

    async initializeAuth(force = false) {
      if (this.auth.initialized && !force) {
        return this.auth
      }

      this.auth.loading = true
      this.auth.error = null
      this.auth.signedInAt = getStoredSignedInAt()

      try {
        const status = await authApi.status()
        this.auth.enabled = status.enabled

        if (!status.enabled) {
          if (authIdentity(this.auth.user) !== authIdentity(DEFAULT_AUTH_USER)) {
            clearMarkdownRenderCache()
          }
          this.auth.user = DEFAULT_AUTH_USER
          return this.auth
        }

        try {
          await this.fetchCurrentUser()
        } catch {
          const hadSession = Boolean(this.auth.signedInAt)
          clearMarkdownRenderCache()
          clearStoredAuthState()
          this.auth.signedInAt = null
          this.auth.user = null
          this.auth.error = hadSession ? 'Login has expired. Please sign in again.' : null
        }
      } catch (error) {
        this.auth.enabled = false
        if (authIdentity(this.auth.user) !== authIdentity(DEFAULT_AUTH_USER)) {
          clearMarkdownRenderCache()
        }
        this.auth.user = DEFAULT_AUTH_USER
        this.auth.error = getErrorMessage(error)
      } finally {
        this.auth.initialized = true
        this.auth.loading = false
      }

      return this.auth
    },

    async fetchCurrentUser() {
      const user = await authApi.me()
      if (authIdentity(this.auth.user) !== authIdentity(user)) {
        clearMarkdownRenderCache()
      }
      this.auth.user = user
      this.auth.enabled = user.auth_enabled
      return user
    },

    async startGitHubLogin() {
      this.auth.loading = true
      this.auth.error = null

      try {
        const state = createLoginState()
        const response = await authApi.login(state)
        this.auth.enabled = response.enabled

        if (!response.enabled) {
          if (authIdentity(this.auth.user) !== authIdentity(DEFAULT_AUTH_USER)) {
            clearMarkdownRenderCache()
          }
          this.auth.user = DEFAULT_AUTH_USER
          return null
        }

        if (!response.authorization_url) {
          throw new Error('GitHub authorization URL is unavailable')
        }

        window.location.assign(response.authorization_url)
        return response.authorization_url
      } catch (error) {
        this.auth.error = getErrorMessage(error)
        throw error
      } finally {
        this.auth.loading = false
      }
    },

    async completeLogin() {
      const signedInAt = new Date().toISOString()
      setStoredSignedInAt(signedInAt)
      this.auth.signedInAt = signedInAt
      this.auth.enabled = true
      this.auth.error = null

      try {
        return await this.fetchCurrentUser()
      } catch (error) {
        clearMarkdownRenderCache()
        clearStoredAuthState()
        this.auth.signedInAt = null
        this.auth.user = null
        this.auth.error = getErrorMessage(error)
        throw error
      }
    },

    async logout() {
      this.auth.loading = true
      this.auth.error = null

      try {
        if (this.auth.enabled) {
          await authApi.logout()
        }
      } catch (error) {
        console.error('Failed to call logout endpoint:', error)
      } finally {
        clearMarkdownRenderCache()
        clearStoredAuthState()
        this.auth.signedInAt = null
        this.auth.user = this.auth.enabled ? null : DEFAULT_AUTH_USER
        this.auth.loading = false
      }
    }
  }
})

const STORAGE_KEY = 'atri_user_settings'

function loadSettings(): UserSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
    }
  } catch (error) {
    console.error('Failed to load user settings:', error)
  }
  return { ...DEFAULT_SETTINGS }
}

function saveSettings(settings: UserSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error('Failed to save user settings:', error)
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function authIdentity(user: AuthUserResponse | null): string {
  if (!user) {
    return 'signed-out'
  }
  return `${user.auth_enabled ? 'authenticated' : 'local'}:${user.username}`
}

function createLoginState() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
