import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import vuetify from 'vite-plugin-vuetify'
import { VitePWA } from 'vite-plugin-pwa'

// Em dev o Vite repassa /api para o Nest; em produção quem faz isso é o nginx.
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3100'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
    vueDevTools(),
    // PWA: instala no celular e abre em tela cheia. Ícones gerados por `npm run pwa-assets`.
    VitePWA({
      registerType: 'autoUpdate',
      // Os ícones já entram pelo globPatterns; sem isso eles apareceriam duplicados no pré-cache.
      includeManifestIcons: false,
      manifest: {
        name: 'Cronos',
        short_name: 'Cronos',
        description: 'Fichas de RPG ao vivo para a mesa',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#0e0b0d',
        background_color: '#0e0b0d',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // A arte das classes (~2 MB cada) e o ícone original ficam fora do pré-cache;
        // as classes entram no cache na primeira vez que aparecem.
        globIgnores: ['classes/**', 'icone.png'],
        // Rotas do Vue Router abrem o index.html; API e tempo real sempre vão à rede.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/classes/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'classes',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Imagens do mestre: o nome é um UUID, o conteúdo nunca muda.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/uploads/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'uploads',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
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
