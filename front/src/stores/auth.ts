import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, tokenStorage } from '@/services/api'
import type { AuthUser, LoginResponse, Role } from '@/types/api'

/** Tela inicial de cada papel. */
export const homeFor = (role: Role) => (role === 'MASTER' ? '/mestre' : '/jogador')

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(tokenStorage.get())
  const user = ref<AuthUser | null>(null)

  const isMaster = computed(() => user.value?.role === 'MASTER')

  function setToken(value: string | null) {
    token.value = value
    tokenStorage.set(value)
  }

  async function login(username: string, password: string) {
    const { data } = await api.post<LoginResponse>('/auth/login', { username, password })
    setToken(data.accessToken)
    user.value = data.user
    return data.user
  }

  /** Garante o usuário carregado (usa o token salvo). Devolve null se não houver sessão válida. */
  let pending: Promise<AuthUser | null> | null = null
  function ensureUser(): Promise<AuthUser | null> {
    if (user.value) return Promise.resolve(user.value)
    if (!token.value) return Promise.resolve(null)
    pending ??= api
      .get<AuthUser>('/auth/me')
      .then(({ data }) => (user.value = data))
      .catch(() => {
        logout()
        return null
      })
      .finally(() => (pending = null))
    return pending
  }

  function logout() {
    setToken(null)
    user.value = null
  }

  return { token, user, isMaster, login, ensureUser, logout }
})
