import axios from 'axios'

const TOKEN_KEY = 'grimorio.token'

export const tokenStorage = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string | null) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* navegador sem storage: a sessão dura até recarregar */
    }
  },
}

/** Cliente HTTP da API. Em dev o Vite faz proxy de /api; em produção, o nginx. */
export const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = tokenStorage.get()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let onUnauthorized: (() => void) | null = null

/** Registrado no main.ts: o que fazer quando a sessão expira (401 fora do login). */
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

api.interceptors.response.use(
  (res) => res,
  (err: unknown) => {
    if (
      axios.isAxiosError(err) &&
      err.response?.status === 401 &&
      !err.config?.url?.endsWith('/auth/login')
    ) {
      onUnauthorized?.()
    }
    return Promise.reject(err)
  },
)

/** Extrai a mensagem de erro do Nest (string ou lista da validação). */
export function errorMessage(e: unknown, fallback = 'Algo deu errado, tente de novo'): string {
  if (axios.isAxiosError(e)) {
    if (!e.response) return 'Sem conexão com o servidor'
    const msg = (e.response.data as { message?: unknown } | undefined)?.message
    if (Array.isArray(msg)) return msg.join('\n')
    if (typeof msg === 'string') return msg
  }
  return fallback
}
