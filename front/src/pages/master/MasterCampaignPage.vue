<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdjustDialog from '@/components/AdjustDialog.vue'
import CharacterCard from '@/components/CharacterCard.vue'
import DiceRoller from '@/components/DiceRoller.vue'
import ImagesPanel from '@/components/ImagesPanel.vue'
import LogFeed from '@/components/LogFeed.vue'
import QuickFormDialog from '@/components/QuickFormDialog.vue'
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
  type LogEntry,
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
watch(
  () => state.value?.characters,
  (list) => {
    if (target.value) target.value = list?.find((c) => c.id === target.value!.id) ?? null
  },
)

type FormKind = 'condition' | 'item' | 'summon' | 'sheet' | 'summonDamage' | 'summonHeal'
const formOpen = ref(false)
const formKind = ref<FormKind>('condition')
const formSummon = ref<Summon | null>(null)

const FORMS = computed<Record<FormKind, { title: string; fields: QuickField[]; initial?: Record<string, string | number | null> }>>(() => ({
  condition: {
    title: `Condição em ${target.value?.name ?? ''}`,
    fields: [
      { key: 'name', label: 'Condição', required: true, maxlength: 60, hint: 'ex.: Envenenado, Atordoado' },
      { key: 'duration', label: 'Duração', maxlength: 60, hint: 'ex.: 2 turnos' },
      { key: 'description', label: 'Detalhes', maxlength: 300 },
    ],
  },
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
}))

function openForm(c: Character, kind: FormKind, summon: Summon | null = null) {
  target.value = c
  formSummon.value = summon
  formKind.value = kind
  formOpen.value = true
}

async function submitForm(values: Record<string, string | number>) {
  const c = target.value
  if (!c) return
  const s = formSummon.value
  const request = {
    condition: () => api.post<ActionResult>(`/characters/${c.id}/conditions`, values),
    item: () => api.post<ActionResult>(`/characters/${c.id}/items`, values),
    summon: () => api.post<ActionResult>(`/characters/${c.id}/summons`, values),
    sheet: () => api.patch<ActionResult>(`/characters/${c.id}`, values),
    summonDamage: () => api.post<ActionResult>(`/summons/${s?.id}/adjust`, { ...values, hp: -Number(values.hp) }),
    summonHeal: () => api.post<ActionResult>(`/summons/${s?.id}/adjust`, values),
  }[formKind.value]
  const ok = await campaign.act(request)
  if (ok) formOpen.value = false
}

const removeCondition = (conditionId: string) =>
  campaign.act(() => api.delete<ActionResult>(`/conditions/${conditionId}`))
const removeSummon = (summonId: string) => campaign.act(() => api.delete<ActionResult>(`/summons/${summonId}`))

// ── narração e log ──
const note = ref('')
const sendingNote = ref(false)
async function sendNote() {
  if (!note.value.trim()) return
  sendingNote.value = true
  const ok = await campaign.act(() => api.post<ActionResult>(`/campaigns/${id.value}/note`, { message: note.value.trim() }))
  sendingNote.value = false
  if (ok) note.value = ''
}

const revert = (entry: LogEntry) => campaign.act(() => api.post<ActionResult>(`/logs/${entry.id}/revert`))
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
            <div class="party">
              <CharacterCard
                v-for="c in state.characters"
                :key="c.id"
                :character="c"
                :cls="classes.byId(c.classId)"
                :player-name="campaign.playerName(c.userId)"
                :can-remove-conditions="state.status === 'ACTIVE'"
                @remove-condition="removeCondition"
              >
                <template v-if="state.status === 'ACTIVE'" #summon-actions="{ summon }">
                  <v-btn icon="mdi-sword-cross" size="x-small" variant="text" color="error" :aria-label="`Dano em ${summon.name}`" @click="openForm(c, 'summonDamage', summon)" />
                  <v-btn icon="mdi-heart-plus" size="x-small" variant="text" color="success" :aria-label="`Curar ${summon.name}`" @click="openForm(c, 'summonHeal', summon)" />
                  <v-btn icon="mdi-close" size="x-small" variant="text" :aria-label="`Remover ${summon.name}`" @click="removeSummon(summon.id)" />
                </template>
                <template v-if="state.status === 'ACTIVE'" #actions>
                  <v-btn size="small" color="error" variant="tonal" prepend-icon="mdi-sword-cross" @click="adjust(c, 'damage')">Dano</v-btn>
                  <v-btn size="small" color="success" variant="tonal" prepend-icon="mdi-heart-plus" @click="adjust(c, 'heal')">Cura</v-btn>
                  <v-btn size="small" color="info" variant="tonal" prepend-icon="mdi-water" @click="adjust(c, 'mana')">Mana</v-btn>
                  <v-btn size="small" color="secondary" variant="tonal" prepend-icon="mdi-star-four-points" @click="adjust(c, 'xp')">XP</v-btn>
                  <v-menu>
                    <template #activator="{ props }">
                      <v-btn v-bind="props" size="small" variant="text" icon="mdi-dots-horizontal" :aria-label="`Mais ações para ${c.name}`" />
                    </template>
                    <v-list density="compact">
                      <v-list-item prepend-icon="mdi-alert-decagram" title="Condição" @click="openForm(c, 'condition')" />
                      <v-list-item prepend-icon="mdi-bag-personal" title="Dar item" @click="openForm(c, 'item')" />
                      <v-list-item prepend-icon="mdi-skull" title="Criatura" @click="openForm(c, 'summon')" />
                      <v-list-item prepend-icon="mdi-pencil" title="Editar ficha" @click="openForm(c, 'sheet')" />
                    </v-list>
                  </v-menu>
                </template>
              </CharacterCard>
            </div>

            <aside class="side">
              <v-card v-if="state.status === 'ACTIVE'" class="card-frame pa-4" color="surface">
                <div class="side-title">Narrar</div>
                <div class="note-row">
                  <v-text-field
                    v-model="note"
                    placeholder="Algo acontece…"
                    maxlength="500"
                    hide-details
                    density="compact"
                    @keyup.enter="sendNote"
                  />
                  <v-btn icon="mdi-send" color="primary" variant="flat" :loading="sendingNote" aria-label="Enviar narração" @click="sendNote" />
                </div>
              </v-card>

              <v-card v-if="state.status === 'ACTIVE'" class="card-frame pa-4" color="surface">
                <div class="side-title">Dados</div>
                <DiceRoller :campaign-id="state.id" />
              </v-card>

              <v-card class="card-frame pa-4" color="surface">
                <div class="side-title">Log da mesa</div>
                <LogFeed :logs="campaign.logs" :can-revert="state.status === 'ACTIVE'" max-height="55vh" @revert="revert" />
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

.note-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
