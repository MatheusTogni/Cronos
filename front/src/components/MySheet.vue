<script setup lang="ts">
import { computed, ref } from 'vue'
import AbilityTile from '@/components/AbilityTile.vue'
import BackpackDialog from '@/components/BackpackDialog.vue'
import ConditionChip from '@/components/ConditionChip.vue'
import NotesDialog from '@/components/NotesDialog.vue'
import StatBar from '@/components/StatBar.vue'
import TransferDialog from '@/components/TransferDialog.vue'
import UseAbilityDialog from '@/components/UseAbilityDialog.vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import { useNotifyStore } from '@/stores/notify'
import type { Ability, ActionResult, Character, CharacterClass, InventoryItem } from '@/types/api'
import type { TransferMode } from '@/types/ui'
import { BACKPACK_SLOTS } from '@/utils/backpack'
import { frenzyActive } from '@/utils/classHooks'
import { skillArt } from '@/utils/skillArt'
import { transferSummary } from '@/utils/transfer'

/**
 * Ficha do próprio jogador durante a aventura. Enxuta para o celular: o que se
 * olha o tempo todo fica na página (vida, mana, habilidades) e o resto abre
 * por atalhos com ícone (mochila, doar/trocar, anotações).
 */
const props = defineProps<{ character: Character; cls: CharacterClass }>()

const campaign = useCampaignStore()
const notify = useNotifyStore()

/** As habilidades na ordem em que a classe as libera (a que abre primeiro vem primeiro). */
const skills = computed(() =>
  props.cls.abilities
    .filter((a) => a.kind === 'SKILL')
    .sort((a, b) => a.unlockLevel - b.unlockLevel || a.sortOrder - b.sortOrder),
)
/** Sem mana ou fora da vez: não dá para usar agora (a trancada tem o próprio visual). */
const unusable = (a: Ability) => !isLocked(a) && (a.manaCost > props.character.mana || !campaign.canAct)
/** A habilidade só abre quando o personagem chega ao nível dela. */
const isLocked = (a: Ability) => a.unlockLevel > props.character.level

// ── usar habilidade ──
const abilityOpen = ref(false)
const selectedAbility = ref<Ability | null>(null)
function use(a: Ability) {
  if (isLocked(a)) return
  selectedAbility.value = a
  abilityOpen.value = true
}
function onUsed(log: ActionResult['log']) {
  if (log) notify.success(log.message)
}

const frenzy = computed(() => frenzyActive(props.character))

// Invocações e condições são controladas pelo mestre: aqui só se vê.

// ── mochila e anotações: abrem em diálogos ──
const backpackOpen = ref(false)
const notesOpen = ref(false)
const backpackFull = computed(() => props.character.inventory.length >= BACKPACK_SLOTS)

// ── doar e trocar ──
const transferOpen = ref(false)
const transferMode = ref<TransferMode>('give')
const transferItem = ref<InventoryItem | null>(null)
function openTransfer(mode: TransferMode, item: InventoryItem | null = null) {
  transferMode.value = mode
  transferItem.value = item
  transferOpen.value = true
}
/** Atalho Doar / Trocar. Se não dá agora, o aviso diz por quê (no celular não existe "passar o mouse"). */
function openOffer() {
  if (campaign.offerBlock) {
    notify.info(campaign.offerBlock)
    return
  }
  openTransfer('give')
}
const cancelling = ref(false)
async function cancelOffer() {
  const offer = campaign.outgoingTransfer
  if (!offer) return
  cancelling.value = true
  const ok = await campaign.act(() => api.post(`/transfers/${offer.id}/cancel`).then(() => ({ data: null })))
  cancelling.value = false
  if (ok) campaign.dropTransfer(offer.id)
}
</script>

<template>
  <div class="sheet" :class="{ frenzy }" :style="{ '--accent': cls.color }">
    <!-- cabeçalho: retrato, nome e ouro -->
    <div class="hero">
      <v-avatar size="56" rounded="lg">
        <v-img :src="cls.artFile" cover position="top" :alt="cls.name" />
      </v-avatar>
      <div class="hero-text">
        <div class="title-font hero-name">{{ character.name }}</div>
        <div class="hero-sub">{{ cls.name }} · nível {{ character.level }} · {{ character.xp }} XP</div>
      </div>
      <div class="purse" role="status" :aria-label="`${character.gold} moedas de ouro`" :title="`${character.gold} moedas de ouro`">
        <v-icon icon="mdi-circle-multiple" color="secondary" size="small" />
        <span class="purse-num">{{ character.gold }}</span>
      </div>
    </div>

    <div class="bars">
      <StatBar label="Vida" icon="mdi-heart" :value="character.hp" :max="character.hpMax" color="error" />
      <StatBar label="Mana" icon="mdi-water" :value="character.mana" :max="character.manaMax" color="info" />
    </div>

    <!-- atalhos: cada um abre o que antes ocupava a página inteira -->
    <div class="actions" role="group" aria-label="Atalhos da ficha">
      <button type="button" class="action" @click="backpackOpen = true">
        <span class="action-icon">
          <v-icon icon="mdi-bag-personal" size="28" />
          <span class="action-badge" :class="{ full: backpackFull }">{{ character.inventory.length }}/{{ BACKPACK_SLOTS }}</span>
        </span>
        <span class="action-label">Mochila</span>
      </button>
      <button
        type="button"
        class="action"
        :class="{ blocked: !!campaign.offerBlock }"
        :aria-disabled="!!campaign.offerBlock"
        @click="openOffer"
      >
        <span class="action-icon"><v-icon icon="mdi-gift-outline" size="28" /></span>
        <span class="action-label">Doar / Trocar</span>
      </button>
      <button type="button" class="action" @click="notesOpen = true">
        <span class="action-icon"><v-icon icon="mdi-notebook-outline" size="28" /></span>
        <span class="action-label">Anotações</span>
      </button>
    </div>

    <v-alert
      v-if="campaign.outgoingTransfer"
      type="info"
      variant="tonal"
      density="compact"
      icon="mdi-timer-sand"
      class="mt-3"
    >
      Aguardando {{ campaign.outgoingTransfer.to.name }} responder: {{ transferSummary(campaign.outgoingTransfer) }}
      <template #append>
        <v-btn size="small" variant="text" :loading="cancelling" @click="cancelOffer">Cancelar oferta</v-btn>
      </template>
    </v-alert>

    <p v-if="frenzy" class="frenzy-note">
      <v-icon icon="mdi-flash" size="small" /> Frenesi: ferido, você fica mais perigoso e ignora parte da dor.
    </p>
    <v-alert v-if="character.hp === 0" type="error" variant="tonal" density="compact" class="mt-3">
      {{ character.name }} está caído e não pode agir até ser curado.
    </v-alert>

    <!-- condições -->
    <div v-if="character.conditions.length" class="chips conditions" aria-label="Condições">
      <ConditionChip v-for="c in character.conditions" :key="c.id" :condition="c" size="default" />
    </div>

    <!-- habilidades -->
    <section class="block">
      <h3>Habilidades</h3>
      <p v-if="character.hp === 0" class="wait">
        <v-icon icon="mdi-skull" size="small" /> Caído: ninguém age até ser curado.
      </p>
      <p v-else-if="!campaign.canAct" class="wait">
        <v-icon icon="mdi-timer-sand" size="small" /> Aguarde a sua vez para usar habilidades.
      </p>
      <!-- em combate: três quadradinhos lado a lado, da que libera primeiro à que libera por último -->
      <template v-if="campaign.combat">
        <div class="tiles" role="group" aria-label="Habilidades">
          <AbilityTile
            v-for="(a, i) in skills"
            :key="a.id"
            :ability="a"
            :position="i + 1"
            :locked="isLocked(a)"
            :unusable="unusable(a)"
            :art="skillArt(cls.id, cls.artFile, i)"
            :style="{ '--i': i }"
            @use="use(a)"
          />
        </div>
        <p class="tiles-hint">
          <span class="hint-touch">Segure uma habilidade para ver os detalhes.</span>
          <span class="hint-hover">Passe o mouse numa habilidade para ver os detalhes.</span>
        </p>
      </template>
      <div v-else class="abilities">
        <button
          v-for="a in skills"
          :key="a.id"
          type="button"
          class="ability"
          :class="{ locked: isLocked(a), disabled: unusable(a) }"
          :disabled="isLocked(a)"
          @click="use(a)"
        >
          <div class="ab-cost">
            <v-icon v-if="isLocked(a)" icon="mdi-lock-outline" />
            <template v-else-if="a.manaCost">
              <span class="ab-num">{{ a.manaCost }}</span><span class="ab-lbl">mana</span>
            </template>
            <v-icon v-else icon="mdi-auto-fix" />
          </div>
          <div class="ab-body">
            <div class="ab-name">{{ a.name }}</div>
            <div v-if="isLocked(a)" class="ab-desc">Libera no nível {{ a.unlockLevel }}</div>
            <div v-else class="ab-desc">{{ a.description.split('\n')[0] }}</div>
          </div>
          <v-icon v-if="!isLocked(a)" icon="mdi-chevron-right" class="ab-go" />
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

    <UseAbilityDialog v-model="abilityOpen" :character="character" :ability="selectedAbility" @used="onUsed" />
    <BackpackDialog v-model="backpackOpen" :character="character" @transfer="openTransfer" />
    <NotesDialog v-model="notesOpen" :character="character" />
    <TransferDialog v-model="transferOpen" :character="character" :item="transferItem" :mode="transferMode" />
  </div>
</template>

<style scoped>
.sheet {
  --accent: var(--crimson);
}

.hero {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.hero-text {
  flex: 1 1 auto;
  min-width: 0;
}

.hero-name {
  font-size: 1.45rem;
  font-weight: 700;
  line-height: 1.1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero-sub {
  margin-top: 2px;
  font-size: 0.85rem;
  line-height: 1.25;
  opacity: 0.7;
}

/* ouro: um selo no canto, em vez de uma linha só para ele */
.purse {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 99px;
  border: 1px solid var(--border-strong);
  background: rgba(0, 0, 0, 0.35);
}

.purse-num {
  font-family: var(--font-title);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--gold-bright);
}

/* vida e mana lado a lado: ocupam metade da altura */
.bars {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

/* atalhos com ícone, no estilo de uma barra de ações de jogo */
.actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}

.action {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 64px;
  padding: 8px 4px;
  border-radius: 12px;
  border: 1px solid var(--border-soft);
  background: rgba(255, 255, 255, 0.03);
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition: border-color 120ms ease-out;
}

.action:active {
  border-color: var(--accent);
}

@media (hover: hover) and (pointer: fine) {
  .action:hover {
    border-color: var(--accent);
  }
}

/* sem poder agora: fica apagado, e tocar explica o motivo */
.action.blocked {
  opacity: 0.45;
}

.action-icon {
  position: relative;
  display: inline-flex;
  color: var(--accent);
}

.action-badge {
  position: absolute;
  top: -6px;
  left: 100%;
  margin-left: -4px;
  padding: 1px 6px;
  border-radius: 99px;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  color: #1a1008;
  background: var(--gold);
}

.action-badge.full {
  color: #fff;
  background: rgb(var(--v-theme-error));
}

.action-label {
  font-size: 0.78rem;
  letter-spacing: 0.02em;
  line-height: 1.1;
  text-align: center;
}

.block {
  margin-top: 18px;
}

.wait {
  margin: 0 0 8px;
  font-size: 0.9rem;
  opacity: 0.75;
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

.conditions {
  margin-top: 14px;
}

.abilities {
  display: grid;
  gap: 8px;
}

/* combate: a barra de atalhos com as 3 habilidades em quadradinhos */
.tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  /* em tela larga os quadradinhos não viram blocos enormes */
  max-width: 440px;
  margin-inline: auto;
}

.tiles-hint {
  margin: 8px 0 0;
  font-size: 0.8rem;
  text-align: center;
  opacity: 0.6;
}

/* no celular se segura o dedo; com mouse, é só passar por cima */
.hint-hover {
  display: none;
}

@media (hover: hover) and (pointer: fine) {
  .hint-touch {
    display: none;
  }

  .hint-hover {
    display: inline;
  }
}

.ability {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 58px;
  text-align: left;
  padding: 8px 12px;
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

/* ainda não liberada: só mostra em que nível abre */
.ability.locked {
  opacity: 0.5;
  cursor: not-allowed;
  border-style: dashed;
  border-color: var(--border-soft);
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

.frenzy-note {
  margin: 8px 0 0;
  font-size: 0.9rem;
  color: #e0634f;
}

/* Frenesi: a ficha ferida pulsa em vermelho */
.sheet.frenzy .hero {
  border-radius: 12px;
  animation: frenzy-pulse 2.4s ease-in-out infinite;
}

@keyframes frenzy-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 1px rgba(208, 74, 58, 0.35);
  }
  50% {
    box-shadow:
      0 0 0 1px rgba(208, 74, 58, 0.8),
      0 0 20px rgba(208, 74, 58, 0.45);
  }
}

:global(html.lite) .sheet.frenzy .hero {
  animation: none;
  box-shadow: 0 0 0 1px rgba(208, 74, 58, 0.7);
}

@media (prefers-reduced-motion: reduce) {
  .ability,
  .action {
    transition: none;
  }

  .sheet.frenzy .hero {
    animation: none;
  }
}
</style>
