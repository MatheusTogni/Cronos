import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import vuetify from './plugins/vuetify'
import { setUnauthorizedHandler } from './services/api'
import { useAuthStore } from './stores/auth'
import { useLiteStore } from './stores/lite'
import { useNotifyStore } from './stores/notify'
import { useRealtimeStore } from './stores/realtime'
import './styles/main.css'

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(vuetify)

// Token expirado ou login desativado pelo mestre: volta para o login.
setUnauthorizedHandler(() => {
  const auth = useAuthStore(pinia)
  if (!auth.token) return
  useRealtimeStore(pinia).disconnect()
  auth.logout()
  useNotifyStore(pinia).info('Sua sessão expirou, entre novamente')
  void router.push('/login')
})

// modo leve aplicado antes da primeira pintura
useLiteStore(pinia)

app.mount('#app')
