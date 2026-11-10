import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Gera os ícones do PWA (e o favicon) a partir de public/icone.png.
// Rode `npm run pwa-assets` quando trocar o ícone; os arquivos vão para public/.
const background = '#0e0b0d'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // A arte já ocupa o quadrado inteiro: sem borda nos ícones comuns.
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    // Android recorta o maskable em círculo/gota: borda para o anel não ser cortado.
    maskable: { ...minimal2023Preset.maskable, padding: 0.25, resizeOptions: { background } },
    apple: { ...minimal2023Preset.apple, padding: 0.1, resizeOptions: { background } },
  },
  images: ['public/icone.png'],
})
