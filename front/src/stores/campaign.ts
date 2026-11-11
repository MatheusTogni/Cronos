import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { api, errorMessage } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useClassesStore } from '@/stores/classes'
import { useNotifyStore } from '@/stores/notify'
import { useRealtimeStore } from '@/stores/realtime'
import type { ActionResult, CampaignState, LogEntry } from '@/types/api'

type StateWithLogs = CampaignState & { logs: LogEntry[] }

/**
 * A campanha aberta na tela (mestre ou jogador). Carrega pelo REST e se mantém
 * atualizada pelo socket. Ao reconectar, refaz o join na sala e recarrega tudo —
 * sem isso a tela fica conectada mas fora da sala, sem receber nada.
 */
export const useCampaignStore = defineStore('campaign', () => {
  const auth = useAuthStore()
  const realtime = useRealtimeStore()
  const notify = useNotifyStore()
  const classes = useClassesStore()

  const campaignId = ref<string | null>(null)
  const state = ref<CampaignState | null>(null)
  const logs = ref<LogEntry[]>([])
  const loading = ref(false)
  const error = ref('')
  /** Removido do lobby pelo mestre — a tela decide para onde ir. */
  const kicked = ref(false)

  const isMaster = computed(() => !!state.value && state.value.master.id === auth.user?.id)
  const myCharacter = computed(
    () => state.value?.characters.find((c) => c.userId === auth.user?.id) ?? null,
  )
  const mySeat = computed(
    () => state.value?.players.find((p) => p.userId === auth.user?.id) ?? null,
  )
  // ── combate ──
  const combat = computed(() => state.value?.combat ?? null)
  /** Personagem com a vez (null = mestre ou fora de combate). */
  const currentTurnCharacter = computed(() =>
    combat.value?.currentCharacterId ? characterById(combat.value.currentCharacterId) : null,
  )
  /** Fora de combate todos agem; em combate, só quem está com a vez (o mestre sempre). */
  const canAct = computed(
    () => !combat.value || isMaster.value || (!!myCharacter.value && currentTurnCharacter.value?.id === myCharacter.value.id),
  )
  const isMyTurn = computed(
    () => !!combat.value && !!myCharacter.value && currentTurnCharacter.value?.id === myCharacter.value.id,
  )

  const characterById = (id: string | null | undefined) =>
    state.value?.characters.find((c) => c.id === id) ?? null
  const playerName = (userId: string) =>
    state.value?.players.find((p) => p.userId === userId)?.displayName ?? ''

  function apply(data: StateWithLogs | CampaignState) {
    const { logs: incoming, ...rest } = data as StateWithLogs
    state.value = rest
    if (incoming) logs.value = incoming
  }

  function pushLog(entry: LogEntry | null | undefined) {
    if (!entry || logs.value.some((l) => l.id === entry.id)) return
    logs.value.push(entry)
    if (logs.value.length > 300) logs.value.splice(0, logs.value.length - 300)
  }

  async function refresh() {
    if (!campaignId.value) return
    const id = campaignId.value
    const { data } = await api.get<StateWithLogs>(`/campaigns/${id}/state`)
    if (campaignId.value === id) apply(data)
  }

  // ── socket ──
  const offs: (() => void)[] = []

  function listen() {
    offs.push(
      realtime.on<CampaignState>('campaign:state', (s) => {
        if (s.id === campaignId.value) apply(s)
      }),
      realtime.on<LogEntry>('log:new', (entry) => pushLog(entry)),
      realtime.on<LogEntry>('log:updated', (entry) => {
        const i = logs.value.findIndex((l) => l.id === entry.id)
        if (i >= 0) logs.value[i] = entry
      }),
      realtime.on<{ id: string }>('log:reverted', ({ id }) => {
        const entry = logs.value.find((l) => l.id === id)
        if (entry) {
          entry.revertedAt = new Date().toISOString()
          entry.revertible = false
        }
      }),
      realtime.on<{ campaignId: string }>('campaign:kicked', (p) => {
        if (p.campaignId === campaignId.value) kicked.value = true
      }),
    )
  }

  async function syncRoom() {
    if (!campaignId.value || !realtime.connected) return
    await realtime.joinCampaign(campaignId.value)
    try {
      await refresh() // pode ter perdido eventos enquanto estava fora
    } catch {
      /* o próximo evento corrige */
    }
  }

  watch(() => realtime.connectedAt, syncRoom)

  /** Abre a campanha na tela. */
  async function open(id: string) {
    close()
    campaignId.value = id
    kicked.value = false
    loading.value = true
    error.value = ''
    listen()
    realtime.connect()
    try {
      await Promise.all([refresh(), classes.load()])
      await realtime.joinCampaign(id)
    } catch (e) {
      error.value = errorMessage(e)
    } finally {
      loading.value = false
    }
  }

  function close() {
    if (campaignId.value) realtime.leaveCampaign()
    offs.splice(0).forEach((off) => off())
    campaignId.value = null
    state.value = null
    logs.value = []
  }

  /**
   * Executa uma ação de jogo. O estado novo chega pelo socket; se ele estiver
   * desconectado, recarrega na mão para quem agiu não ficar com a tela velha.
   * Devolve true se deu certo (o erro já vira aviso na tela).
   */
  async function act(request: () => Promise<{ data: ActionResult | StateWithLogs | null }>) {
    try {
      const { data } = await request()
      if (data && 'logs' in data) apply(data)
      else if (data && 'log' in data) pushLog(data.log)
      if (!realtime.connected) await refresh()
      return true
    } catch (e) {
      notify.error(errorMessage(e))
      return false
    }
  }

  return {
    campaignId,
    state,
    logs,
    loading,
    error,
    kicked,
    isMaster,
    myCharacter,
    mySeat,
    characterById,
    playerName,
    combat,
    currentTurnCharacter,
    canAct,
    isMyTurn,
    open,
    close,
    refresh,
    act,
  }
})
