import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface ConfirmOptions {
  title: string
  text?: string
  /** Texto do botão de confirmar. Padrão: "Confirmar". */
  confirmLabel?: string
  /** Ícone do topo e do botão. Padrão: mdi-alert. */
  icon?: string
  /** Cor do botão de confirmar. Padrão: error (ação destrutiva). */
  color?: string
}

/**
 * Diálogo de confirmação único (o App.vue desenha).
 * Uso: `if (!(await confirm.ask({ title: 'Excluir?' }))) return`
 */
export const useConfirmStore = defineStore('confirm', () => {
  const visible = ref(false)
  const options = ref<ConfirmOptions>({ title: '' })
  let resolver: ((ok: boolean) => void) | null = null

  function ask(opts: ConfirmOptions): Promise<boolean> {
    resolver?.(false) // um pedido anterior em aberto conta como cancelado
    options.value = opts
    visible.value = true
    return new Promise((resolve) => (resolver = resolve))
  }

  function answer(ok: boolean) {
    visible.value = false
    resolver?.(ok)
    resolver = null
  }

  return { visible, options, ask, answer }
})
