<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import QuickFormDialog from '@/components/QuickFormDialog.vue'
import StatBar from '@/components/StatBar.vue'
import UseAbilityDialog from '@/components/UseAbilityDialog.vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import { useNotifyStore } from '@/stores/notify'
import type { Ability, ActionResult, Character, CharacterClass } from '@/types/api'
import type { QuickField } from '@/types/ui'

/** Ficha do próprio jogador durante a aventura. */
const props = defineProps<{ character: Character; cls: CharacterClass }>()

const campaign = useCampaignStore()
const notify = useNotifyStore()

const basic = computed(() => props.cls.abilities.find((a) => a.kind === 'BASIC'))
const skills = computed(() => props.cls.abilities.filter((a) => a.kind === 'SKILL'))

// ── usar habilidade ──
const abilityOpen = ref(false)
const selectedAbility = ref<Ability | null>(null)
function use(a: Ability) {
  selectedAbility.value = a
  abilityOpen.value = true
}
function onUsed(log: ActionResult['log']) {
  if (log) notify.success(log.message)
}

// ── formulários rápidos ──
type FormKind = 'item' | 'condition' | 'summon'
const formOpen = ref(false)
const formKind = ref<FormKind>('item')
const FORMS: Record<FormKind, { title: string; fields: QuickField[] }> = {
  item: {
    title: 'Novo item',
    fields: [
      { key: 'name', label: 'Item', required: true, maxlength: 80 },
      { key: 'qty', label: 'Quantidade', type: 'number', min: 1, max: 9999 },
      { key: 'description', label: 'Descrição', maxlength: 300 },
    ],
  },
  condition: {
    title: 'Nova condição',
    fields: [
      { key: 'name', label: 'Condição', required: true, maxlength: 60, hint: 'ex.: Envenenado, Escondido' },
      { key: 'duration', label: 'Duração', maxlength: 60, hint: 'ex.: 2 turnos' },
      { key: 'description', label: 'Detalhes', maxlength: 300 },
    ],
  },
  summon: {
    title: 'Nova criatura',
    fields: [
      { key: 'name', label: 'Nome', required: true, maxlength: 60 },
      { key: 'hpMax', label: 'Vida', type: 'number', required: true, min: 1, max: 9999 },
    ],
  },
}
const URLS: Record<FormKind, string> = { item: 'items', condition: 'conditions', summon: 'summons' }

function openForm(kind: FormKind) {
  formKind.value = kind
  formOpen.value = true
}

async function submitForm(values: Record<string, string | number>) {
  const ok = await campaign.act(() =>
    api.post<ActionResult>(`/characters/${props.character.id}/${URLS[formKind.value]}`, values),
  )
  if (ok) formOpen.value = false
}

const removeCondition = (id: string) => campaign.act(() => api.delete<ActionResult>(`/conditions/${id}`))
const removeSummon = (id: string) => campaign.act(() => api.delete<ActionResult>(`/summons/${id}`))
const removeItem = (id: string) => campaign.act(() => api.delete<ActionResult>(`/items/${id}`))
const setQty = (id: string, qty: number) =>
  qty <= 0 ? removeItem(id) : campaign.act(() => api.patch<ActionResult>(`/items/${id}`, { qty }))

// ── anotações ──
const notes = ref(props.character.notes)
const notesDirty = computed(() => notes.value !== props.character.notes)
watch(
  () => props.character.notes,
  (v) => {
    if (!notesDirty.value) notes.value = v
  },
)
const savingNotes = ref(false)
async function saveNotes() {
  savingNotes.value = true
  const ok = await campaign.act(() =>
    api.patch<ActionResult>(`/characters/${props.character.id}`, { notes: notes.value }),
  )
  savingNotes.value = false
  if (ok) notify.success('Anotações salvas')
}
</script>

<template>
  <div class="sheet" :style="{ '--accent': cls.color }">
    <!-- cabeçalho -->
    <div class="hero">
      <v-avatar size="64" rounded="lg">
        <v-img :src="cls.artFile" cover position="top" :alt="cls.name" />
      </v-avatar>
      <div class="hero-text">
        <div class="title-font hero-name">{{ character.name }}</div>
        <div class="hero-sub">
          {{ cls.name }} · nível {{ character.level }} · {{ character.xp }} XP
        </div>
      </div>
    </div>

    <div class="bars">
      <StatBar label="Vida" icon="mdi-heart" :value="character.hp" :max="character.hpMax" color="error" size="lg" />
      <StatBar label="Mana" icon="mdi-water" :value="character.mana" :max="character.manaMax" color="info" size="lg" />
    </div>
    <v-alert v-if="character.hp === 0" type="error" variant="tonal" density="compact" class="mt-3">
      {{ character.name }} caiu! Fale com o mestre.
    </v-alert>

    <!-- condições -->
    <section v-if="character.conditions.length" class="block">
      <h3>Condições</h3>
      <div class="chips">
        <v-chip
          v-for="c in character.conditions"
          :key="c.id"
          color="warning"
          variant="tonal"
          closable
          @click:close="removeCondition(c.id)"
        >
          {{ c.name }}<template v-if="c.duration"> ({{ c.duration }})</template>
        </v-chip>
      </div>
    </section>

    <!-- habilidades -->
    <section class="block">
      <h3>Habilidades</h3>
      <div class="abilities">
        <button
          v-for="a in [basic, ...skills].filter((x): x is Ability => !!x)"
          :key="a.id"
          type="button"
          class="ability"
          :class="{ disabled: a.manaCost > character.mana }"
          @click="use(a)"
        >
          <div class="ab-cost">
            <template v-if="a.manaCost">
              <span class="ab-num">{{ a.manaCost }}</span><span class="ab-lbl">mana</span>
            </template>
            <v-icon v-else icon="mdi-sword" />
          </div>
          <div class="ab-body">
            <div class="ab-name">{{ a.name }}</div>
            <div class="ab-desc">{{ a.description.split('\n')[0] }}</div>
          </div>
          <v-icon icon="mdi-chevron-right" class="ab-go" />
        </button>
      </div>
      <details class="mechanic">
        <summary>Mecânica única — {{ cls.mechanicName }}</summary>
        <p class="pre-line">{{ cls.mechanicText }}</p>
      </details>
    </section>

    <!-- invocações -->
    <section class="block">
      <div class="block-head">
        <h3>Invocações</h3>
        <v-btn size="small" variant="text" prepend-icon="mdi-plus" @click="openForm('summon')">Adicionar</v-btn>
      </div>
      <div v-if="!character.summons.length" class="empty">Nenhuma criatura acompanhando.</div>
      <div v-for="s in character.summons" :key="s.id" class="row-item">
        <v-icon icon="mdi-skull" />
        <div class="row-main">
          <div>{{ s.name }}</div>
          <StatBar label="Vida" :value="s.hp" :max="s.hpMax" color="error" size="sm" />
        </div>
        <v-btn icon="mdi-close" size="small" variant="text" :aria-label="`Dispensar ${s.name}`" @click="removeSummon(s.id)" />
      </div>
    </section>

    <!-- inventário -->
    <section class="block">
      <div class="block-head">
        <h3>Inventário</h3>
        <v-btn size="small" variant="text" prepend-icon="mdi-plus" @click="openForm('item')">Adicionar</v-btn>
      </div>
      <div v-if="!character.inventory.length" class="empty">Mochila vazia.</div>
      <div v-for="item in character.inventory" :key="item.id" class="row-item">
        <div class="row-main">
          <div>{{ item.name }}</div>
          <div v-if="item.description" class="row-desc">{{ item.description }}</div>
        </div>
        <div class="qty">
          <v-btn icon="mdi-minus" size="x-small" variant="tonal" :aria-label="`Menos ${item.name}`" @click="setQty(item.id, item.qty - 1)" />
          <span class="qty-num">{{ item.qty }}</span>
          <v-btn icon="mdi-plus" size="x-small" variant="tonal" :aria-label="`Mais ${item.name}`" @click="setQty(item.id, item.qty + 1)" />
        </div>
      </div>
    </section>

    <!-- condição manual + anotações -->
    <section class="block">
      <div class="block-head">
        <h3>Anotações</h3>
        <v-btn size="small" variant="text" prepend-icon="mdi-alert-decagram" @click="openForm('condition')">
          Condição
        </v-btn>
      </div>
      <v-textarea v-model="notes" rows="3" auto-grow placeholder="Pistas, nomes, planos…" hide-details />
      <div class="notes-actions">
        <v-btn v-if="notesDirty" color="secondary" variant="tonal" size="small" :loading="savingNotes" @click="saveNotes">
          Salvar anotações
        </v-btn>
      </div>
    </section>

    <UseAbilityDialog v-model="abilityOpen" :character="character" :ability="selectedAbility" @used="onUsed" />
    <QuickFormDialog
      v-model="formOpen"
      :title="FORMS[formKind].title"
      :fields="FORMS[formKind].fields"
      submit-label="Adicionar"
      @submit="submitForm"
    />
  </div>
</template>

<style scoped>
.sheet {
  --accent: var(--crimson);
}

.hero {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}

.hero-name {
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1.1;
}

.hero-sub {
  opacity: 0.7;
}

.bars {
  display: grid;
  gap: 12px;
}

.block {
  margin-top: 22px;
}

.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

h3 {
  font-family: var(--font-title);
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
  margin: 0 0 8px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.abilities {
  display: grid;
  gap: 8px;
}

.ability {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 64px;
  text-align: left;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border-soft);
  background: rgba(255, 255, 255, 0.025);
  color: inherit;
  cursor: pointer;
  transition: border-color 120ms ease-out;
}

.ability:active {
  border-color: var(--accent);
}

@media (hover: hover) and (pointer: fine) {
  .ability:hover {
    border-color: var(--accent);
  }
}

.ability.disabled {
  opacity: 0.45;
}

.ab-cost {
  flex: 0 0 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--accent);
}

.ab-num {
  font-family: var(--font-title);
  font-size: 1.5rem;
  line-height: 1;
}

.ab-lbl {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.8;
}

.ab-body {
  flex: 1 1 auto;
  min-width: 0;
}

.ab-name {
  font-family: var(--font-title);
  font-weight: 700;
}

.ab-desc {
  font-size: 0.9rem;
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ab-go {
  opacity: 0.4;
}

.mechanic {
  margin-top: 10px;
  opacity: 0.85;
}

.mechanic summary {
  cursor: pointer;
  font-style: italic;
}

.mechanic p {
  margin: 6px 0 0;
}

.empty {
  opacity: 0.55;
  font-style: italic;
}

.row-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(201, 162, 39, 0.08);
}

.row-main {
  flex: 1 1 auto;
  min-width: 0;
}

.row-desc {
  font-size: 0.85rem;
  opacity: 0.6;
}

.qty {
  display: flex;
  align-items: center;
  gap: 6px;
}

.qty-num {
  min-width: 24px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.notes-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
  min-height: 28px;
}

@media (prefers-reduced-motion: reduce) {
  .ability {
    transition: none;
  }
}
</style>
