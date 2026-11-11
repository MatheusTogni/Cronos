import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

const KEY = 'cronos:lite'

function read() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Modo leve: desliga as animações decorativas (névoa e brasas do fundo,
 * brilhos, quadros girando, fumaça rolando). Fica salvo neste aparelho.
 * Liga a classe `lite` no <html>; as regras estão em styles/main.css.
 */
export const useLiteStore = defineStore('lite', () => {
  const lite = ref(read())

  watch(
    lite,
    (on) => {
      document.documentElement.classList.toggle('lite', on)
      try {
        localStorage.setItem(KEY, on ? '1' : '0')
      } catch {
        /* sem armazenamento (aba anônima): vale só nesta sessão */
      }
    },
    { immediate: true },
  )

  const toggle = () => (lite.value = !lite.value)

  return { lite, toggle }
})
