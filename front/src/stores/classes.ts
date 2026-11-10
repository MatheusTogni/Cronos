import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/services/api'
import type { CharacterClass } from '@/types/api'

/** Catálogo das classes — muda raramente, então carrega uma vez por sessão. */
export const useClassesStore = defineStore('classes', () => {
  const list = ref<CharacterClass[]>([])
  let loaded: Promise<void> | null = null

  function load(force = false) {
    if (force || !loaded) {
      loaded = api
        .get<CharacterClass[]>('/classes')
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
