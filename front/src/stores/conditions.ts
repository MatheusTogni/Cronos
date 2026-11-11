import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/services/api'
import type { ConditionDef } from '@/types/api'

/** Catálogo de condições (efeitos de status) — carrega uma vez por sessão. */
export const useConditionsStore = defineStore('conditions', () => {
  const list = ref<ConditionDef[]>([])
  let loaded: Promise<void> | null = null

  function load(force = false) {
    if (force || !loaded) {
      loaded = api
        .get<ConditionDef[]>('/conditions')
        .then(({ data }) => {
          list.value = data
        })
        .catch((e: unknown) => {
          loaded = null
          throw e
        })
    }
    return loaded
  }

  const byId = (id: string) => list.value.find((c) => c.id === id)

  return { list, load, byId }
})
