import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { api, errorMessage } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useClassesStore } from '@/stores/classes'
import { useNotifyStore } from '@/stores/notify'
import { useRealtimeStore } from '@/stores/realtime'
import type { ActionResult, CampaignPatch, CampaignState, ListPatch, LogEntry, Transfer, Whisper } from '@/types/api'
import { buzz } from '@/utils/haptics'

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
  /**
   * Jogador: imagem que o mestre mostrou só a alguns. Chega por evento e não
   * fica guardada no servidor (é só apoio à narração): recarregar a página a limpa.
   */
  const privateImage = ref<{ id: string; url: string } | null>(null)
  /**
   * Jogador: mensagens secretas do mestre ainda não lidas, na ordem em que
   * chegaram. Só existem nesta tela: o servidor não guarda nem põe no log.
   */
  const whispers = ref<Whisper[]>([])
  /** Mestre: a última imagem que mostrou só a alguns, para avisar e poder ocultar. */
  const privateShown = ref<{ imageId: string; names: string[] } | null>(null)

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
  /** Quem está com 0 de vida (Caído) não age. */
  const fallen = computed(() => !isMaster.value && !!myCharacter.value && myCharacter.value.hp === 0)
  /** Fora de combate todos agem; em combate, só quem está com a vez (o mestre sempre). Caído não age. */
  const canAct = computed(
    () =>
      !fallen.value &&
      (!combat.value || isMaster.value || (!!myCharacter.value && currentTurnCharacter.value?.id === myCharacter.value.id)),
  )
  const isMyTurn = computed(
    () => !!combat.value && !!myCharacter.value && currentTurnCharacter.value?.id === myCharacter.value.id,
  )
  /** Na minha vez, já usei a habilidade do turno: é uma por turno (atacar é narrativo, o app não conta). */
  const skillSpent = computed(() => !isMaster.value && isMyTurn.value && !!combat.value?.skillUsed)

  // ── doações e trocas ──
  /** Ofertas abertas em que o meu personagem oferece ou recebe. */
  const transfers = ref<Transfer[]>([])
  /** Ofertas que esperam a minha resposta (a mais antiga aparece primeiro no popup). */
  const incomingTransfers = computed(() =>
    transfers.value.filter((t) => t.to.id === myCharacter.value?.id),
  )
  const incomingTransfer = computed(() => incomingTransfers.value[0] ?? null)
  /** A oferta minha que espera resposta (só uma por vez). */
  const outgoingTransfer = computed(
    () => transfers.value.find((t) => t.from.id === myCharacter.value?.id) ?? null,
  )
  /** Fora de combate qualquer um oferece; em combate, só quem está na vez. */
  const canOffer = computed(() => !combat.value || isMyTurn.value)
  /** Por que Dar e Trocar estão desligados agora (vazio = liberado). */
  const offerBlock = computed(() =>
    outgoingTransfer.value
      ? 'Você já tem uma oferta aguardando resposta'
      : !canOffer.value
        ? 'Em combate, só na sua vez'
        : '',
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

  /**
   * Aplica só o que mudou. Troca apenas os itens alterados: os cards dos
   * outros personagens nem re-renderizam.
   */
  function patchList<T extends { id: string }>(list: T[], p: ListPatch<T>) {
    if (p.remove.length) {
      const gone = new Set(p.remove)
      for (let i = list.length - 1; i >= 0; i--) if (gone.has(list[i]!.id)) list.splice(i, 1)
    }
    for (const item of p.upsert) {
      const i = list.findIndex((x) => x.id === item.id)
      if (i >= 0) list[i] = item
      else list.push(item)
    }
    if (p.order) {
      const byId = new Map(list.map((x) => [x.id, x]))
      list.splice(0, list.length, ...p.order.map((id) => byId.get(id)).filter((x): x is T => !!x))
    }
  }

  function applyPatch(p: CampaignPatch) {
    const s = state.value
    if (!s || p.id !== s.id) return
    if (p.set) Object.assign(s, p.set)
    if (p.characters) patchList(s.characters, p.characters)
    if (p.npcs) patchList(s.npcs, p.npcs)
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
    await loadTransfers()
  }

  /** Recarrega as ofertas abertas (ao abrir a tela e ao reconectar). */
  async function loadTransfers() {
    const id = campaignId.value
    if (!id) return
    try {
      const { data } = await api.get<{ transfers: Transfer[] }>(`/campaigns/${id}/transfers`)
      if (campaignId.value === id) transfers.value = data.transfers
    } catch {
      /* o próximo evento corrige */
    }
  }

  /** Tira a oferta da lista na hora (o aviso do servidor confirma depois). */
  function dropTransfer(transferId: string) {
    transfers.value = transfers.value.filter((t) => t.id !== transferId)
  }

  /** Oferta nova ou alterada, vinda do servidor só para os dois jogadores. */
  function onTransfer(t: Transfer, fresh: boolean) {
    if (t.campaignId !== campaignId.value) return
    const mine = myCharacter.value?.id
    const i = transfers.value.findIndex((x) => x.id === t.id)
    if (t.status === 'PENDING') {
      if (i >= 0) transfers.value[i] = t
      else transfers.value.push(t)
      if (fresh && t.to.id === mine) buzz([150, 80, 150]) // o popup aparece sozinho
      return
    }
    if (i >= 0) transfers.value.splice(i, 1)
    if (t.from.id === mine) {
      if (t.status === 'ACCEPTED') notify.success(`${t.to.name} aceitou a oferta`)
      else if (t.status === 'DECLINED') notify.info(`${t.to.name} recusou a oferta`)
    } else if (t.to.id === mine && t.status === 'CANCELLED') {
      notify.info(`${t.from.name} cancelou a oferta`)
    }
  }

  // ── socket ──
  const offs: (() => void)[] = []

  function listen() {
    offs.push(
      realtime.on<CampaignState>('campaign:state', (s) => {
        if (s.id === campaignId.value) apply(s)
      }),
      realtime.on<CampaignPatch>('campaign:patch', (p) => {
        if (p.id === campaignId.value) applyPatch(p)
      }),
      realtime.on<LogEntry>('log:new', (entry) => pushLog(entry)),
      realtime.on<{ campaignId: string; image: { id: string; url: string } | null }>('image:shown', (p) => {
        if (p.campaignId === campaignId.value) privateImage.value = p.image
      }),
      realtime.on<Whisper & { campaignId: string }>('whisper', ({ campaignId: cid, ...w }) => {
        if (cid === campaignId.value) whispers.value.push(w)
      }),
      realtime.on<Transfer>('transfer:new', (t) => onTransfer(t, true)),
      realtime.on<Transfer>('transfer:updated', (t) => onTransfer(t, false)),
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
    transfers.value = []
    privateImage.value = null
    whispers.value = []
    privateShown.value = null
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
    privateImage,
    whispers,
    privateShown,
    isMaster,
    myCharacter,
    mySeat,
    characterById,
    playerName,
    combat,
    currentTurnCharacter,
    canAct,
    fallen,
    isMyTurn,
    skillSpent,
    transfers,
    incomingTransfers,
    incomingTransfer,
    outgoingTransfer,
    canOffer,
    offerBlock,
    dropTransfer,
    open,
    close,
    refresh,
    act,
  }
})
