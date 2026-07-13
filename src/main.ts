import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { MotionPlugin } from '@vueuse/motion'
import { useTheme } from '@/composables/useTheme'
import router from './router'
import App from './App.vue'
import 'uno.css'
import './assets/styles/airi-theme.css'
import './assets/styles/main.css'
import './styles/main.css'

useTheme()

const app = createApp(App)

app.use(createPinia())
app.use(MotionPlugin)
app.use(router)

app.mount('#app')
