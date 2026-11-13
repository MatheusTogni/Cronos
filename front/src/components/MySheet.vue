<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ConditionChip from '@/components/ConditionChip.vue'
import StatBar from '@/components/StatBar.vue'
import TransferDialog from '@/components/TransferDialog.vue'
import UseAbilityDialog from '@/components/UseAbilityDialog.vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import { useConfirmStore } from '@/stores/confirm'
import { useNotifyStore } from '@/stores/notify'
import type { Ability, ActionResult, Character, CharacterClass, InventoryItem } from '@/types/api'
import type { TransferMode } from '@/types/ui'
import { frenzyActive } from '@/utils/classHooks'
import { shopItem } from '@/utils/shop'
import { transferSummary } from '@/utils/transfer'

/** Ficha do próprio jogador durante a aventura. */
const props = defineProps<{ character: Character; cls: CharacterClass }>()

const campaign = useCampaignStore()
const confirm = useConfirmStore()
const notify = useNotifyStore()

const skills = computed(() => props.cls.abilities.filter((a) => a.kind === 'SKILL'))
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

// ── usar item do inventário ──
async function useItem(item: InventoryItem) {
  const product = shopItem(item.code)
  if (!product) return
  const c = props.character
  // item de cura com tudo o que ele recupera já cheio: pede confirmação antes de gastar
  const hpFull = !product.hp || c.hp >= c.hpMax
  const manaFull = !product.mana || c.mana >= c.manaMax
  if ((product.hp || product.mana) && hpFull && manaFull) {
    const what = product.hp && product.mana ? 'Sua vida e sua mana já estão cheias' : product.hp ? `Sua vida já está cheia (${c.hp}/${c.hpMax})` : `Sua mana já está cheia (${c.mana}/${c.manaMax})`
    const ok = await confirm.ask({
      title: `Usar ${item.name}?`,
      text: `${what}. O item será gasto sem efeito.`,
      confirmLabel: 'Usar mesmo assim',
      icon: 'mdi-flask-round-bottom',
      color: 'warning',
    })
    if (!ok) return
  }
  const result = { log: null as ActionResult['log'] }
  const ok = await campaign.act(async () => {
    const res = await api.post<ActionResult>(`/items/${item.id}/use`)
    result.log = res.data.log
    return res
  })
  if (ok && result.log) notify.success(result.log.message)
}

// ── doar e trocar ──
const transferOpen = ref(false)
const transferMode = ref<TransferMode>('give')
const transferItem = ref<InventoryItem | null>(null)
function openTransfer(mode: TransferMode, item: InventoryItem | null = null) {
  transferMode.value = mode
  transferItem.value = item
  transferOpen.value = true
}
/** Por que Dar/Trocar/Dar ouro estão desligados agora (vazio = liberado). */
const offerBlock = computed(() =>
  campaign.outgoingTransfer
    ? 'Você já tem uma oferta aguardando resposta'
    : !campaign.canOffer
      ? 'Em combate, só na sua vez'
      : '',
)
const cancelling = ref(false)
async function cancelOffer() {
  const offer = campaign.outgoingTransfer
  if (!offer) return
  cancelling.value = true
  const ok = await campaign.act(() => api.post(`/transfers/${offer.id}/cancel`).then(() => ({ data: null })))
  cancelling.value = false
  if (ok) campaign.dropTransfer(offer.id)
}

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
  <div class="sheet" :class="{ frenzy }" :style="{ '--accent': cls.color }">
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
    <div class="purse">
      <v-icon icon="mdi-circle-multiple" color="secondary" />
      <span class="purse-num">{{ character.gold }}</span>
      <span class="purse-lbl">{{ character.gold === 1 ? 'moeda de ouro' : 'moedas de ouro' }}</span>
      <v-btn
        size="x-small"
        variant="tonal"
        prepend-icon="mdi-gift-outline"
        :disabled="character.gold < 1 || !!offerBlock"
        :title="offerBlock || 'Dar ouro a outro jogador'"
        @click="openTransfer('gold')"
      >
        Dar ouro
      </v-btn>
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
    <section v-if="character.conditions.length" class="block">
      <h3>Condições</h3>
      <div class="chips">
        <ConditionChip v-for="c in character.conditions" :key="c.id" :condition="c" size="default" />
      </div>
    </section>

    <!-- habilidades -->
    <section class="block">
      <h3>Habilidades</h3>
      <p v-if="character.hp === 0" class="wait">
        <v-icon icon="mdi-skull" size="small" /> Caído: ninguém age até ser curado.
      </p>
      <p v-else-if="!campaign.canAct" class="wait">
        <v-icon icon="mdi-timer-sand" size="small" /> Aguarde a sua vez para usar habilidades.
      </p>
      <div class="abilities">
        <button
          v-for="a in skills"
          :key="a.id"
          type="button"
          class="ability"
          :class="{ locked: isLocked(a), disabled: !isLocked(a) && (a.manaCost > character.mana || !campaign.canAct) }"
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

    <!-- inventário: usar o que é da loja, dar ou trocar com outro jogador (o mestre também dá e tira itens) -->
    <section class="block">
      <h3>Inventário</h3>
      <div v-if="!character.inventory.length" class="empty">Mochila vazia.</div>
      <div v-for="item in character.inventory" :key="item.id" class="row-item item-row">
        <v-icon icon="mdi-bag-personal-outline" />
        <div class="row-main">
          <div>{{ item.name }}</div>
          <div v-if="item.description" class="row-desc">{{ item.description }}</div>
        </div>
        <span class="qty-num" :title="`${item.qty} unidade(s)`">×{{ item.qty }}</span>
        <div class="item-actions">
          <v-btn
            v-if="shopItem(item.code)"
            size="x-small"
            color="secondary"
            variant="tonal"
            :disabled="!campaign.canAct"
            :title="campaign.canAct ? `Usar ${item.name}` : 'Só na sua vez, e não caído'"
            @click="useItem(item)"
          >
            Usar
          </v-btn>
          <v-btn
            icon="mdi-gift-outline"
            size="x-small"
            variant="text"
            :disabled="!!offerBlock"
            :title="offerBlock || `Dar ${item.name} a outro jogador`"
            :aria-label="`Dar ${item.name}`"
            @click="openTransfer('give', item)"
          />
          <v-btn
            icon="mdi-swap-horizontal"
            size="x-small"
            variant="text"
            :disabled="!!offerBlock"
            :title="offerBlock || `Trocar ${item.name} com outro jogador`"
            :aria-label="`Trocar ${item.name}`"
            @click="openTransfer('trade', item)"
          />
        </div>
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

.purse {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.purse-num {
  font-family: var(--font-title);
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--gold-bright);
}

.purse-lbl {
  flex: 1 1 auto;
  opacity: 0.7;
}

.item-row {
  flex-wrap: wrap;
}

.item-actions {
  display: flex;
  align-items: center;
  gap: 2px;
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
  .ability {
    transition: none;
  }

  .sheet.frenzy .hero {
    animation: none;
  }
}
</style>
