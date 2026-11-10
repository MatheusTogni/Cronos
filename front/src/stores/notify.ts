import { ref } from 'vue'
import { defineStore } from 'pinia'

type Kind = 'success' | 'error' | 'info'

/** Avisos rápidos (snackbar) — o App.vue desenha. */
export const useNotifyStore = defineStore('notify', () => {
  const visible = ref(false)
  const text = ref('')
  const kind = ref<Kind>('info')

  function show(message: string, type: Kind = 'info') {
    text.value = message
    kind.value = type
    visible.value = true
  }

  return {
    visible,
    text,
    kind,
    success: (m: string) => show(m, 'success'),
    error: (m: string) => show(m, 'error'),
    info: (m: string) => show(m, 'info'),
  }
})
