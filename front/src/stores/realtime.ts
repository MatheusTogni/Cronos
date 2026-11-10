import { ref } from 'vue'
import { defineStore } from 'pinia'
import { io, type Socket } from 'socket.io-client'
import { tokenStorage } from '@/services/api'

/**
 * Conexão única do Socket.IO. O servidor só ENVIA eventos; as ações vão pela API.
 * `connectedAt` muda a cada (re)conexão — quem depende de sala refaz o join observando ele.
 */
export const useRealtimeStore = defineStore('realtime', () => {
  const connected = ref(false)
  const connectedAt = ref(0)
  let socket: Socket | null = null

  function connect() {
    if (socket) return socket
    socket = io({
      path: '/socket.io',
      // função: a cada reconexão pega o token atual
      auth: (cb) => cb({ token: tokenStorage.get() }),
      transports: ['websocket', 'polling'],
    })
    socket.on('connect', () => {
      connected.value = true
      connectedAt.value = Date.now()
    })
    socket.on('disconnect', () => {
      connected.value = false
    })
    return socket
  }

  function disconnect() {
    socket?.disconnect()
    socket?.removeAllListeners()
    socket = null
    connected.value = false
  }

  /** Registra um handler e devolve a função que o remove. */
  function on<T>(event: string, handler: (payload: T) => void) {
    const s = connect()
    s.on(event, handler as (...args: unknown[]) => void)
    return () => s.off(event, handler as (...args: unknown[]) => void)
  }

  async function joinCampaign(campaignId: string) {
    const s = connect()
    if (!s.connected) return false
    try {
      const res = (await s.timeout(5000).emitWithAck('campaign:join', { campaignId })) as {
        ok: boolean
      }
      return res.ok
    } catch {
      return false
    }
  }

  function leaveCampaign() {
    socket?.emit('campaign:leave')
  }

  return { connected, connectedAt, connect, disconnect, on, joinCampaign, leaveCampaign }
})
