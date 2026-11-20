<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdjustDialog from '@/components/AdjustDialog.vue'
import CharacterCard from '@/components/CharacterCard.vue'
import CombatEffect from '@/components/CombatEffect.vue'
import CombatPanel from '@/components/CombatPanel.vue'
import ConditionDialog from '@/components/ConditionDialog.vue'
import ImagesPanel from '@/components/ImagesPanel.vue'
import LogFeed from '@/components/LogFeed.vue'
import NpcCard from '@/components/NpcCard.vue'
import QuickFormDialog from '@/components/QuickFormDialog.vue'
import TakeItemDialog from '@/components/TakeItemDialog.vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import { useClassesStore } from '@/stores/classes'
import { useConfirmStore } from '@/stores/confirm'
import { useNotifyStore } from '@/stores/notify'
import { useRealtimeStore } from '@/stores/realtime'
import {
  STATUS_COLOR,
  STATUS_LABEL,
  type ActionResult,
  type Character,
  type ConditionTarget,
  type LogEntry,
  type Npc,
  type Summon,
} from '@/types/api'
import type { AdjustKind, QuickField } from '@/types/ui'

const route = useRoute()
const router = useRouter()
const campaign = useCampaignStore()
const classes = useClassesStore()
const notify = useNotifyStore()
const confirm = useConfirmStore()
const realtime = useRealtimeStore()

const id = computed(() => String(route.params.id))
const state = computed(() => campaign.state)
const tab = ref<'mesa' | 'imagens'>('mesa')

watch(id, (v) => campaign.open(v), { immediate: true })
onBeforeUnmount(() => campaign.close())

// ── ciclo da campanha ──
const busy = ref(false)
async function lifecycle(action: 'open' | 'start' | 'end') {
  busy.value = true
  const ok = await campaign.act(() => api.post(`/campaigns/${id.value}/${action}`))
  busy.value = false
  if (ok && action === 'start') notify.success('A aventura começou!')
}

async function endCampaign() {
  const ok = await confirm.ask({
    title: 'Encerrar a campanha?',
    text: 'A aventura termina para todos e as fichas deixam de ser editadas.',
    confirmLabel: 'Encerrar',
    icon: 'mdi-close-octagon',
  })
  if (ok) void lifecycle('end')
}

async function deleteCampaign() {
  const sure = await confirm.ask({
    title: `Excluir "${state.value?.name ?? 'a campanha'}"?`,
    text: 'Personagens, imagens e o log da mesa serão apagados. Isso não pode ser desfeito.',
    confirmLabel: 'Excluir',
    icon: 'mdi-delete',
  })
  if (!sure) return
  const ok = await campaign.act(() => api.delete(`/campaigns/${id.value}`).then(() => ({ data: null })))
  if (ok) await router.push('/mestre/campanhas')
}

// ── lobby ──
const readyCount = computed(() => state.value?.players.filter((p) => p.ready).length ?? 0)
const canStart = computed(
  () => !!state.value && state.value.players.length > 0 && readyCount.value === state.value.players.length,
)
const characterOf = (userId: string) => state.value?.characters.find((c) => c.userId === userId)
const className = (classId: string) => classes.byId(classId)?.name ?? classId

async function kick(userId: string, displayName: string) {
  const ok = await confirm.ask({
    title: `Remover ${displayName} do lobby?`,
    text: 'O personagem escolhido por ele nesta campanha também sai.',
    confirmLabel: 'Remover',
    icon: 'mdi-account-remove',
  })
  if (!ok) return
  await campaign.act(() => api.delete(`/campaigns/${id.value}/players/${userId}`).then(() => ({ data: null })))
}

// ── ações rápidas ──
const adjustOpen = ref(false)
const adjustKind = ref<AdjustKind>('damage')
const target = ref<Character | null>(null)
function adjust(c: Character, kind: AdjustKind) {
  target.value = c
  adjustKind.value = kind
  adjustOpen.value = true
}
// mantém o personagem do diálogo atualizado com o estado ao vivo
// (o patch troca só o item alterado, então vigia o item, não o array)
watch(
  () => (target.value ? (state.value?.characters.find((c) => c.id === target.value!.id) ?? null) : null),
  (fresh) => {
    if (target.value && fresh !== target.value) target.value = fresh
  },
)

// tirar item da mochila de um jogador (o mesmo `target` do diálogo acompanha o estado ao vivo)
const takeOpen = ref(false)
function openTake(c: Character) {
  target.value = c
  takeOpen.value = true
}

// condição tem diálogo próprio (catálogo, turnos, vida por turno), para
// personagem, invocação ou inimigo
const conditionOpen = ref(false)
const conditionTarget = ref<ConditionTarget | null>(null)
function openCondition(t: ConditionTarget) {
  conditionTarget.value = t
  conditionOpen.value = true
}

type FormKind = 'item' | 'summon' | 'sheet' | 'summonDamage' | 'summonHeal' | 'npcNew' | 'npcDamage' | 'npcHeal' | 'npcNotes'
const formOpen = ref(false)
const formKind = ref<FormKind>('item')
const formSummon = ref<Summon | null>(null)
const formNpc = ref<Npc | null>(null)

const FORMS = computed<Record<FormKind, { title: string; fields: QuickField[]; initial?: Record<string, string | number | null> }>>(() => ({
  item: {
    title: `Item para ${target.value?.name ?? ''}`,
    fields: [
      { key: 'name', label: 'Item', required: true, maxlength: 80 },
      { key: 'qty', label: 'Quantidade', type: 'number', min: 1, max: 9999 },
      { key: 'description', label: 'Descrição', maxlength: 300 },
    ],
  },
  summon: {
    title: `Criatura de ${target.value?.name ?? ''}`,
    fields: [
      { key: 'name', label: 'Nome', required: true, maxlength: 60 },
      { key: 'hpMax', label: 'Vida', type: 'number', required: true, min: 1, max: 9999 },
    ],
  },
  sheet: {
    title: `Ficha de ${target.value?.name ?? ''}`,
    fields: [
      { key: 'name', label: 'Nome', required: true, maxlength: 40 },
      { key: 'hpMax', label: 'Vida máxima', type: 'number', required: true, min: 1, max: 9999 },
      { key: 'manaMax', label: 'Mana máxima', type: 'number', required: true, min: 0, max: 9999 },
    ],
    initial: target.value
      ? { name: target.value.name, hpMax: target.value.hpMax, manaMax: target.value.manaMax }
      : undefined,
  },
  summonDamage: {
    title: `Dano em ${formSummon.value?.name ?? ''}`,
    fields: [
      { key: 'hp', label: 'Dano', type: 'number', required: true, min: 1, max: 9999 },
      { key: 'reason', label: 'Motivo', maxlength: 120 },
    ],
  },
  summonHeal: {
    title: `Curar ${formSummon.value?.name ?? ''}`,
    fields: [
      { key: 'hp', label: 'Vida recuperada', type: 'number', required: true, min: 1, max: 9999 },
      { key: 'reason', label: 'Motivo', maxlength: 120 },
    ],
  },
  npcNew: {
    title: 'Novo inimigo',
    fields: [
      { key: 'name', label: 'Nome', required: true, maxlength: 60, hint: 'ex.: Goblin, Guarda da ponte' },
      { key: 'hpMax', label: 'Vida', type: 'number', required: true, min: 1, max: 9999 },
      {
        key: 'quantity',
        label: 'Quantos',
        type: 'number',
        min: 1,
        max: 20,
        hint: 'Com mais de um, o nome ganha número: Goblin 1, Goblin 2…',
      },
    ],
  },
  npcDamage: {
    title: `Dano em ${formNpc.value?.name ?? ''}`,
    fields: [
      { key: 'hp', label: 'Dano', type: 'number', required: true, min: 1, max: 9999 },
      { key: 'reason', label: 'Motivo', maxlength: 120 },
    ],
  },
  npcHeal: {
    title: `Curar ${formNpc.value?.name ?? ''}`,
    fields: [
      { key: 'hp', label: 'Vida recuperada', type: 'number', required: true, min: 1, max: 9999 },
      { key: 'reason', label: 'Motivo', maxlength: 120 },
    ],
  },
  npcNotes: {
    title: `Anotações de ${formNpc.value?.name ?? ''}`,
    fields: [{ key: 'notes', label: 'Só o mestre vê', type: 'textarea', maxlength: 1000, hint: 'Manhas, fraquezas, o que ele faz quando está ferido…' }],
    initial: formNpc.value ? { notes: formNpc.value.notes ?? '' } : undefined,
  },
}))

function openForm(c: Character | null, kind: FormKind, summon: Summon | null = null, npc: Npc | null = null) {
  target.value = c
  formSummon.value = summon
  formNpc.value = npc
  formKind.value = kind
  formOpen.value = true
}

async function submitForm(values: Record<string, string | number>) {
  const c = target.value
  const s = formSummon.value
  const n = formNpc.value
  const forCharacter = (fn: (c: Character) => Promise<{ data: ActionResult }>) => () =>
    c ? fn(c) : Promise.reject(new Error('Personagem não encontrado'))
  const request = {
    item: forCharacter((c) => api.post<ActionResult>(`/characters/${c.id}/items`, values)),
    summon: forCharacter((c) => api.post<ActionResult>(`/characters/${c.id}/summons`, values)),
    sheet: forCharacter((c) => api.patch<ActionResult>(`/characters/${c.id}`, values)),
    summonDamage: () => api.post<ActionResult>(`/summons/${s?.id}/adjust`, { ...values, hp: -Number(values.hp) }),
    summonHeal: () => api.post<ActionResult>(`/summons/${s?.id}/adjust`, values),
    npcNew: () => api.post<ActionResult>(`/campaigns/${id.value}/npcs`, values),
    npcDamage: () => api.post<ActionResult>(`/npcs/${n?.id}/adjust`, { ...values, hp: -Number(values.hp) }),
    npcHeal: () => api.post<ActionResult>(`/npcs/${n?.id}/adjust`, values),
    // vazio apaga as anotações (o formulário omite campo vazio)
    npcNotes: () => api.patch<ActionResult>(`/npcs/${n?.id}`, { notes: String(values.notes ?? '') }),
  }[formKind.value]
  const ok = await campaign.act(request)
  if (ok) formOpen.value = false
}

async function removeNpc(n: Npc) {
  const ok = await confirm.ask({
    title: `Tirar ${n.name} de cena?`,
    text: 'O inimigo e as condições dele saem da mesa. Dá para desfazer pelo log.',
    confirmLabel: 'Tirar de cena',
    icon: 'mdi-account-remove',
  })
  if (ok) await campaign.act(() => api.delete<ActionResult>(`/npcs/${n.id}`))
}

const removeCondition = (conditionId: string) =>
  campaign.act(() => api.delete<ActionResult>(`/conditions/${conditionId}`))
const removeSummon = (summonId: string) => campaign.act(() => api.delete<ActionResult>(`/summons/${summonId}`))

// ── log ──
const revert = (entry: LogEntry) => campaign.act(() => api.post<ActionResult>(`/logs/${entry.id}/revert`))

// ── mercador ──
const shopBusy = ref(false)
async function toggleShop() {
  if (!state.value) return
  shopBusy.value = true
  const ok = await campaign.act(() =>
    api.post<ActionResult>(`/campaigns/${id.value}/shop/${state.value?.shopOpen ? 'close' : 'open'}`),
  )
  // falhou (ex.: "A loja já está fechada"): a tela estava velha; recarrega o estado real
  if (!ok) await campaign.refresh().catch(() => {})
  shopBusy.value = false
}
</script>

<template>
  <div class="page wide">
    <v-alert v-if="campaign.error" type="error" variant="tonal" class="mb-4">{{ campaign.error }}</v-alert>
    <v-progress-linear v-if="campaign.loading && !state" indeterminate color="secondary" />

    <template v-if="state">
      <!-- cabeçalho -->
      <div class="page-header">
        <v-btn icon="mdi-arrow-left" variant="text" to="/mestre/campanhas" aria-label="Voltar para campanhas" />
        <h1>{{ state.name }}</h1>
        <v-chip :color="STATUS_COLOR[state.status]" variant="tonal">{{ STATUS_LABEL[state.status] }}</v-chip>
        <v-icon
          :icon="realtime.connected ? 'mdi-access-point' : 'mdi-access-point-off'"
          :color="realtime.connected ? 'success' : 'error'"
          :title="realtime.connected ? 'Ao vivo' : 'Sem conexão ao vivo — tentando reconectar'"
        />
      </div>
      <p v-if="state.description" class="desc">{{ state.description }}</p>

      <v-tabs v-model="tab" color="secondary" class="mb-4">
        <v-tab value="mesa" prepend-icon="mdi-table-furniture">
          {{ state.status === 'ACTIVE' || state.status === 'ENDED' ? 'Mesa' : 'Lobby' }}
        </v-tab>
        <v-tab value="imagens" prepend-icon="mdi-image-multiple">Imagens</v-tab>
      </v-tabs>

      <v-window v-model="tab">
        <!-- ───────── MESA / LOBBY ───────── -->
        <v-window-item value="mesa">
          <!-- preparação -->
          <v-card v-if="state.status === 'DRAFT'" class="card-frame pa-6 text-center" color="surface">
            <p class="mb-4">
              A campanha ainda não aparece para ninguém. Quando abrir o lobby, os jogadores verão ela na tela deles.
            </p>
            <v-btn color="primary" size="large" prepend-icon="mdi-door-open" :loading="busy" @click="lifecycle('open')">
              Abrir lobby
            </v-btn>
            <div class="mt-6">
              <v-btn variant="text" prepend-icon="mdi-delete" size="small" @click="deleteCampaign">
                Excluir campanha
              </v-btn>
            </div>
          </v-card>

          <!-- lobby -->
          <template v-else-if="state.status === 'LOBBY'">
            <v-card class="card-frame pa-4 mb-4" color="surface">
              <div class="lobby-head">
                <div>
                  <div class="title-font lobby-count">{{ readyCount }}/{{ state.players.length }} prontos</div>
                  <div class="hint">Os jogadores entram pela tela "Campanhas abertas".</div>
                </div>
                <v-btn
                  color="primary"
                  size="large"
                  prepend-icon="mdi-sword-cross"
                  :disabled="!canStart"
                  :loading="busy"
                  @click="lifecycle('start')"
                >
                  Começar aventura
                </v-btn>
              </div>
              <div v-if="!state.players.length" class="empty mt-4">Ninguém entrou ainda.</div>
              <div v-for="p in state.players" :key="p.userId" class="lobby-row">
                <v-icon
                  :icon="p.ready ? 'mdi-check-circle' : 'mdi-timer-sand'"
                  :color="p.ready ? 'success' : 'grey'"
                />
                <div class="lobby-who">
                  <div class="lobby-name">{{ p.displayName }}</div>
                  <div class="lobby-char">
                    <template v-if="characterOf(p.userId)">
                      {{ characterOf(p.userId)!.name }} · {{ className(characterOf(p.userId)!.classId) }}
                    </template>
                    <template v-else>escolhendo classe…</template>
                  </div>
                </div>
                <span class="lobby-status">{{ p.ready ? 'Pronto' : 'Aguardando' }}</span>
                <v-btn
                  icon="mdi-close"
                  size="small"
                  variant="text"
                  title="Remover do lobby"
                  :aria-label="`Remover ${p.displayName} do lobby`"
                  @click="kick(p.userId, p.displayName)"
                />
              </div>
            </v-card>
            <v-btn variant="text" size="small" prepend-icon="mdi-close-octagon" @click="endCampaign">
              Encerrar campanha
            </v-btn>
          </template>

          <!-- aventura / encerrada -->
          <div v-else class="table-grid">
            <div class="main-col">
              <section v-if="state.status === 'ACTIVE' || state.npcs.length" class="enemies">
                <div class="section-head">
                  <span class="side-title">Inimigos</span>
                  <v-btn
                    v-if="state.status === 'ACTIVE'"
                    size="small"
                    variant="tonal"
                    color="error"
                    prepend-icon="mdi-plus"
                    @click="openForm(null, 'npcNew')"
                  >
                    Novo inimigo
                  </v-btn>
                </div>
                <div v-if="!state.npcs.length" class="empty">Nenhum inimigo em cena.</div>
                <div class="party">
                  <NpcCard
                    v-for="n in state.npcs"
                    :key="n.id"
                    :npc="n"
                    :can-remove-conditions="state.status === 'ACTIVE'"
                    @remove-condition="removeCondition"
                  >
                    <template v-if="state.status === 'ACTIVE'" #actions>
                      <v-btn size="small" color="error" variant="tonal" prepend-icon="mdi-sword-cross" @click="openForm(null, 'npcDamage', null, n)">Dano</v-btn>
                      <v-btn size="small" color="success" variant="tonal" icon="mdi-heart-plus" :aria-label="`Curar ${n.name}`" @click="openForm(null, 'npcHeal', null, n)" />
                      <v-btn size="small" color="warning" variant="tonal" icon="mdi-alert-decagram" :aria-label="`Condição em ${n.name}`" @click="openCondition({ kind: 'npc', id: n.id, name: n.name })" />
                      <v-btn size="small" variant="tonal" icon="mdi-note-text-outline" :aria-label="`Anotações de ${n.name}`" @click="openForm(null, 'npcNotes', null, n)" />
                      <v-btn size="small" variant="text" icon="mdi-close" :aria-label="`Tirar ${n.name} de cena`" @click="removeNpc(n)" />
                    </template>
                  </NpcCard>
                </div>
              </section>

              <div class="party">
                <CharacterCard
                  v-for="c in state.characters"
                  :key="c.id"
                  :character="c"
                  :cls="classes.byId(c.classId)"
                  :player-name="campaign.playerName(c.userId)"
                  :highlight="state.combat?.currentCharacterId === c.id"
                  :can-remove-conditions="state.status === 'ACTIVE'"
                  @remove-condition="removeCondition"
                >
                  <template v-if="state.status === 'ACTIVE'" #summon-actions="{ summon }">
                    <v-btn icon="mdi-sword-cross" size="x-small" variant="text" color="error" :aria-label="`Dano em ${summon.name}`" @click="openForm(c, 'summonDamage', summon)" />
                    <v-btn icon="mdi-heart-plus" size="x-small" variant="text" color="success" :aria-label="`Curar ${summon.name}`" @click="openForm(c, 'summonHeal', summon)" />
                    <v-btn icon="mdi-alert-decagram" size="x-small" variant="text" color="warning" :aria-label="`Condição em ${summon.name}`" @click="openCondition({ kind: 'summon', id: summon.id, name: summon.name })" />
                    <v-btn icon="mdi-close" size="x-small" variant="text" :aria-label="`Remover ${summon.name}`" @click="removeSummon(summon.id)" />
                  </template>
                  <template v-if="state.status === 'ACTIVE'" #actions>
                    <v-btn size="small" color="error" variant="tonal" prepend-icon="mdi-sword-cross" @click="adjust(c, 'damage')">Dano</v-btn>
                    <v-btn size="small" color="success" variant="tonal" prepend-icon="mdi-heart-plus" @click="adjust(c, 'heal')">Cura</v-btn>
                    <v-btn size="small" color="info" variant="tonal" prepend-icon="mdi-water" @click="adjust(c, 'mana')">Mana</v-btn>
                    <v-btn size="small" color="secondary" variant="tonal" prepend-icon="mdi-star-four-points" @click="adjust(c, 'level')">Nível</v-btn>
                    <v-btn size="small" color="warning" variant="tonal" prepend-icon="mdi-circle-multiple" @click="adjust(c, 'gold')">Ouro</v-btn>
                    <v-menu>
                      <template #activator="{ props }">
                        <v-btn v-bind="props" size="small" variant="text" icon="mdi-dots-horizontal" :aria-label="`Mais ações para ${c.name}`" />
                      </template>
                      <v-list density="compact">
                        <v-list-item prepend-icon="mdi-alert-decagram" title="Condição" @click="openCondition({ kind: 'character', id: c.id, name: c.name })" />
                        <v-list-item prepend-icon="mdi-bag-personal" title="Dar item" @click="openForm(c, 'item')" />
                        <v-list-item prepend-icon="mdi-bag-personal-off-outline" title="Tirar item" :disabled="!c.inventory.length" @click="openTake(c)" />
                        <v-list-item prepend-icon="mdi-skull" title="Criatura" @click="openForm(c, 'summon')" />
                        <v-list-item prepend-icon="mdi-pencil" title="Editar ficha" @click="openForm(c, 'sheet')" />
                      </v-list>
                    </v-menu>
                  </template>
                </CharacterCard>
              </div>
            </div>

            <aside class="side">
              <v-card v-if="state.status === 'ACTIVE'" class="card-frame pa-4" color="surface">
                <div class="side-title">Combate</div>
                <CombatPanel />
              </v-card>

              <v-card v-if="state.status === 'ACTIVE'" class="card-frame pa-4" color="surface">
                <div class="side-title">Mercador</div>
                <p class="shop-hint">
                  {{ state.shopOpen ? 'A loja está aberta: os jogadores veem o estande e podem comprar.' : 'Abra a loja para os jogadores gastarem o ouro.' }}
                </p>
                <v-btn
                  block
                  :color="state.shopOpen ? undefined : 'secondary'"
                  :variant="state.shopOpen ? 'tonal' : 'flat'"
                  :prepend-icon="state.shopOpen ? 'mdi-door-closed' : 'mdi-storefront-outline'"
                  :loading="shopBusy"
                  @click="toggleShop"
                >
                  {{ state.shopOpen ? 'Fechar loja' : 'Abrir loja' }}
                </v-btn>
              </v-card>

              <v-card class="card-frame pa-4" color="surface">
                <div class="side-title">Log da mesa</div>
                <LogFeed
                  :logs="campaign.logs"
                  :can-revert="state.status === 'ACTIVE'"
                  max-height="55vh"
                  @revert="revert"
                />
              </v-card>

              <div v-if="state.status === 'ACTIVE'">
                <v-btn variant="text" size="small" prepend-icon="mdi-close-octagon" @click="endCampaign">
                  Encerrar campanha
                </v-btn>
              </div>
              <div v-else>
                <v-btn variant="text" size="small" prepend-icon="mdi-delete" @click="deleteCampaign">
                  Excluir campanha
                </v-btn>
              </div>
            </aside>
          </div>
        </v-window-item>

        <!-- ───────── IMAGENS ───────── -->
        <v-window-item value="imagens">
          <ImagesPanel :campaign-id="state.id" />
        </v-window-item>
      </v-window>
    </template>

    <AdjustDialog v-model="adjustOpen" :character="target" :kind="adjustKind" />
    <TakeItemDialog v-model="takeOpen" :character="target" />
    <CombatEffect />
    <ConditionDialog v-model="conditionOpen" :target="conditionTarget" />
    <QuickFormDialog
      v-model="formOpen"
      :title="FORMS[formKind].title"
      :fields="FORMS[formKind].fields"
      :initial="FORMS[formKind].initial"
      @submit="submitForm"
    />
  </div>
</template>

<style scoped>
.wide {
  max-width: 1400px;
}

.desc {
  opacity: 0.7;
  margin: -8px 0 16px;
}

.hint {
  opacity: 0.6;
  font-size: 0.9rem;
}

.empty {
  opacity: 0.6;
  font-style: italic;
}

.shop-hint {
  margin: 0 0 10px;
  opacity: 0.7;
  font-size: 0.9rem;
}

.lobby-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.lobby-count {
  font-size: 1.4rem;
  color: var(--gold);
}

.lobby-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid rgba(201, 162, 39, 0.1);
}

.lobby-who {
  flex: 1 1 auto;
  min-width: 0;
}

.lobby-name {
  font-weight: 600;
}

.lobby-char {
  opacity: 0.65;
  font-size: 0.95rem;
}

.lobby-status {
  opacity: 0.7;
  font-size: 0.9rem;
}

.table-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 16px;
  align-items: start;
}

@media (max-width: 960px) {
  .table-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.main-col {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.section-head .side-title {
  margin-bottom: 0;
}

.party {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.side {
  display: grid;
  gap: 12px;
}

.side-title {
  font-family: var(--font-title);
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gold);
  margin-bottom: 8px;
}
</style>
