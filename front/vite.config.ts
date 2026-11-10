import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import vuetify from 'vite-plugin-vuetify'

// Em dev o Vite repassa /api para o Nest; em produção quem faz isso é o nginx.
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3100'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true }), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Permite abrir pelo celular na mesma rede (http://<ip-do-pc>:5173).
    host: true,
    proxy: {
      '/api': { target: API_URL, changeOrigin: true },
      '/socket.io': { target: API_URL, ws: true, changeOrigin: true },
    },
  },
})
