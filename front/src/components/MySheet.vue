<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ConditionChip from '@/components/ConditionChip.vue'
import StatBar from '@/components/StatBar.vue'
import UseAbilityDialog from '@/components/UseAbilityDialog.vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import { useNotifyStore } from '@/stores/notify'
import type { Ability, ActionResult, Character, CharacterClass } from '@/types/api'

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

// Invocações, condições e inventário são controlados pelo mestre: aqui só se vê.

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
        <ConditionChip v-for="c in character.conditions" :key="c.id" :condition="c" size="default" />
      </div>
    </section>

    <!-- habilidades -->
    <section class="block">
      <h3>Habilidades</h3>
      <p v-if="!campaign.canAct" class="wait">
        <v-icon icon="mdi-timer-sand" size="small" /> Aguarde a sua vez para usar habilidades.
      </p>
      <div class="abilities">
        <button
          v-for="a in [basic, ...skills].filter((x): x is Ability => !!x)"
          :key="a.id"
          type="button"
          class="ability"
          :class="{ disabled: a.manaCost > character.mana || !campaign.canAct }"
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
    <section v-if="character.summons.length" class="block">
      <h3>Invocações</h3>
      <div v-for="s in character.summons" :key="s.id" class="row-item">
        <v-icon icon="mdi-skull" />
        <div class="row-main">
          <div>{{ s.name }}</div>
          <StatBar label="Vida" :value="s.hp" :max="s.hpMax" color="error" size="sm" />
          <div v-if="s.conditions.length" class="chips mt-1">
            <ConditionChip v-for="c in s.conditions" :key="c.id" :condition="c" />
          </div>
        </div>
      </div>
    </section>

    <!-- inventário (só leitura: quem dá e tira itens é o mestre) -->
    <section class="block">
      <h3>Inventário</h3>
      <div v-if="!character.inventory.length" class="empty">Mochila vazia.</div>
      <div v-for="item in character.inventory" :key="item.id" class="row-item">
        <v-icon icon="mdi-bag-personal-outline" />
        <div class="row-main">
          <div>{{ item.name }}</div>
          <div v-if="item.description" class="row-desc">{{ item.description }}</div>
        </div>
        <span class="qty-num" :title="`${item.qty} unidade(s)`">×{{ item.qty }}</span>
      </div>
    </section>

    <!-- anotações -->
    <section class="block">
      <h3>Anotações</h3>
      <v-textarea v-model="notes" rows="3" auto-grow placeholder="Pistas, nomes, planos…" hide-details />
      <div class="notes-actions">
        <v-btn v-if="notesDirty" color="secondary" variant="tonal" size="small" :loading="savingNotes" @click="saveNotes">
          Salvar anotações
        </v-btn>
      </div>
    </section>

    <UseAbilityDialog v-model="abilityOpen" :character="character" :ability="selectedAbility" @used="onUsed" />
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

.wait {
  margin: 0 0 8px;
  font-size: 0.9rem;
  opacity: 0.75;
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
