import type { RouteRecordRaw } from 'vue-router'

import { createRouter, createWebHistory } from 'vue-router'

import { useUserStore } from '@/stores/user'
import { normalizeAuthRedirect } from '@/utils/authRedirect'

interface SettingsMetaConfig {
  order: number
  title: string
  description: string
  icon: string
  phase: string
  status: 'active' | 'developing'
  settingsEntry?: boolean
}

function createSettingsMeta(config: SettingsMetaConfig) {
  return {
    title: config.title,
    subtitle: '设置',
    description: config.description,
    icon: config.icon,
    phase: config.phase,
    status: config.status,
    settingsEntry: config.settingsEntry ?? true,
    order: config.order,
  }
}

const settingsChildren: RouteRecordRaw[] = [
  {
    path: 'account',
    component: () => import('@/pages/settings/account.vue'),
    meta: createSettingsMeta({
      order: 1,
      title: '账户设置',
      description: '管理账户与登录状态',
      icon: 'i-solar:user-circle-bold-duotone',
      phase: 'Phase 11',
      status: 'active',
    }),
  },
  {
    path: 'airi-card',
    component: () => import('@/pages/settings/airi-card.vue'),
    meta: createSettingsMeta({
      order: 2,
      title: '角色卡管理',
      description: '配置你的 ATRI，并管理她的头像与提示词',
      icon: 'i-solar:card-bold-duotone',
      phase: 'Phase 7',
      status: 'active',
    }),
  },
  {
    path: 'modules',
    component: () => import('@/pages/settings/modules/index.vue'),
    meta: createSettingsMeta({
      order: 3,
      title: '机体模块',
      description: '意识，视觉，言语模块等五感配置',
      icon: 'i-solar:layers-bold-duotone',
      phase: 'Phase 9-10',
      status: 'active',
    }),
  },
  {
    path: 'modules/consciousness',
    component: () => import('@/pages/settings/placeholder.vue'),
    meta: createSettingsMeta({
      order: 31,
      title: 'LLM 配置',
      description: '管理模型推理、提示词和认知模块参数。',
      icon: 'i-solar:ghost-bold-duotone',
      phase: 'Phase 7',
      status: 'developing',
      settingsEntry: false,
    }),
  },
  {
    path: 'modules/speech',
    component: () => import('@/pages/settings/modules/speech.vue'),
    meta: createSettingsMeta({
      order: 32,
      title: 'TTS 配置',
      description: '设置语音合成模型、音色与输出行为。',
      icon: 'i-solar:user-speak-rounded-bold-duotone',
      phase: 'Phase 10',
      status: 'active',
      settingsEntry: false,
    }),
  },
  {
    path: 'modules/hearing',
    component: () => import('@/pages/settings/modules/hearing.vue'),
    meta: createSettingsMeta({
      order: 33,
      title: 'ASR 配置',
      description: '调整语音识别链路、输入设备与转写策略。',
      icon: 'i-solar:microphone-3-bold-duotone',
      phase: 'Phase 9',
      status: 'active',
      settingsEntry: false,
    }),
  },
  {
    path: 'modules/vision',
    component: () => import('@/pages/settings/modules/vision.vue'),
    meta: createSettingsMeta({
      order: 34,
      title: '视觉功能',
      description: '启用视觉输入，并查看当前标签页的屏幕共享状态。',
      icon: 'i-solar:eye-bold-duotone',
      phase: 'Phase 12',
      status: 'active',
      settingsEntry: false,
    }),
  },
  {
    path: 'scene',
    component: () => import('@/pages/settings/scene.vue'),
    meta: createSettingsMeta({
      order: 4,
      title: '场景设置',
      description: '自定义聊天背景、透明度和模糊效果。',
      icon: 'i-solar:armchair-2-bold-duotone',
      phase: 'Phase 6',
      status: 'active',
    }),
  },
  {
    path: 'models',
    component: () => import('@/pages/settings/models.vue'),
    meta: createSettingsMeta({
      order: 5,
      title: '角色模型',
      description: '选择管理员已安装的 Live2D 模型，并调整主页舞台中的位置与尺寸。',
      icon: 'i-solar:database-bold-duotone',
      phase: 'Phase 8',
      status: 'active',
    }),
  },
  {
    path: 'providers',
    component: () => import('@/pages/settings/placeholder.vue'),
    meta: createSettingsMeta({
      order: 6,
      title: 'Provider 配置',
      description: '管理模型服务商、密钥和路由策略。',
      icon: 'i-solar:server-square-cloud-bold-duotone',
      phase: 'Phase 9-10',
      status: 'developing',
    }),
  },
  {
    path: 'data',
    component: () => import('@/pages/settings/data.vue'),
    meta: createSettingsMeta({
      order: 7,
      title: '数据管理',
      description: '查看缓存、资源文件和持久化数据状态。',
      icon: 'i-solar:database-bold-duotone',
      phase: 'Phase 9',
      status: 'active',
    }),
  },
  {
    path: 'connection',
    component: () => import('@/pages/settings/placeholder.vue'),
    meta: createSettingsMeta({
      order: 8,
      title: '连接设置',
      description: '管理连接端点、网络状态与设备联通性。',
      icon: 'i-solar:server-square-cloud-bold-duotone',
      phase: 'Phase 6',
      status: 'developing',
    }),
  },
  {
    path: 'system',
    component: () => import('@/pages/settings/placeholder.vue'),
    meta: createSettingsMeta({
      order: 9,
      title: '系统设置',
      description: '集中管理系统偏好、交互行为和实验选项。',
      icon: 'i-solar:settings-bold-duotone',
      phase: 'Phase 6',
      status: 'developing',
    }),
  },
]

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/login.vue'),
    meta: {
      public: true,
      title: 'Sign in',
    },
  },
  {
    path: '/auth/callback',
    name: 'auth-callback',
    component: () => import('@/pages/auth-callback.vue'),
    meta: {
      public: true,
      title: 'Sign-in callback',
    },
  },
  {
    path: '/',
    name: 'home',
    component: () => import('@/pages/index.vue'),
  },
  {
    path: '/settings',
    component: () => import('@/pages/settings/index.vue'),
    meta: {
      title: '设置',
      description: '管理账户、角色、模块、场景和系统偏好。',
      icon: 'i-solar:settings-bold-duotone',
    },
    children: settingsChildren,
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(async (to) => {
  const userStore = useUserStore()
  await userStore.initializeAuth()

  if (!userStore.authEnabled) {
    if (to.path === '/login' || to.path === '/auth/callback') {
      return '/'
    }
    return true
  }

  if (to.meta.public) {
    if (to.path === '/login' && userStore.isAuthenticated) {
      return normalizeAuthRedirect(to.query.redirect)
    }
    return true
  }

  if (!userStore.isAuthenticated) {
    return {
      path: '/login',
      query: { redirect: to.fullPath },
    }
  }

  return true
})

export default router
