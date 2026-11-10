<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import type { ActionResult } from '@/types/api'

/** Rolagem avulsa que aparece no log para todos. */
const props = defineProps<{ campaignId: string }>()

const campaign = useCampaignStore()

const DICE = [4, 6, 8, 10, 12, 20, 100]
const sides = ref(20)
const physical = ref<number | null>(null)
const label = ref('')
const busy = ref(false)
const last = ref<number | null>(null)
const lastSides = ref(20)
/** muda a cada rolagem para o dado "cair" de novo na tela */
const rollKey = ref(0)

const outcome = computed(() => {
  if (last.value === null) return null
  if (last.value === lastSides.value) return 'crit'
  if (last.value === 1) return 'fumble'
  return 'normal'
})

async function roll() {
  busy.value = true
  let result: number | null = null
  const rolledSides = sides.value
  const ok = await campaign.act(async () => {
    const res = await api.post<ActionResult>(`/campaigns/${props.campaignId}/roll`, {
      sides: sides.value,
      ...(physical.value ? { value: physical.value } : {}),
      ...(label.value.trim() ? { label: label.value.trim() } : {}),
    })
    result = res.data.log?.roll ?? null
    return res
  })
  busy.value = false
  if (ok) {
    last.value = result
    lastSides.value = rolledSides
    rollKey.value++
    physical.value = null
    label.value = ''
  }
}
</script>

<template>
  <div class="roller">
    <div class="tray">
      <div class="dice">
        <button
          v-for="d in DICE"
          :key="d"
          type="button"
          class="die-pick"
          :class="{ active: sides === d }"
          :aria-pressed="sides === d"
          @click="sides = d"
        >
          d{{ d }}
        </button>
      </div>

      <div class="row">
        <v-text-field
          v-model.number="physical"
          type="number"
          label="Dado físico (opcional)"
          density="compact"
          hide-details
          :min="1"
          :max="sides"
          class="field"
        />
        <v-text-field
          v-model="label"
          label="Para quê? (opcional)"
          density="compact"
          hide-details
          maxlength="60"
          class="field"
        />
        <v-btn color="secondary" variant="flat" :loading="busy" @click="roll">
          <v-icon icon="mdi-dice-d20" start :class="{ spinning: busy }" />
          {{ physical ? 'Registrar' : 'Rolar' }}
        </v-btn>
      </div>
    </div>

    <div v-if="last !== null" class="result" :class="outcome" aria-live="polite">
      <svg :key="rollKey" class="d20" viewBox="0 0 100 100" aria-hidden="true">
        <polygon class="d20-body" points="50,4 92,27 92,73 50,96 8,73 8,27" />
        <polygon class="d20-face" points="50,22 78,66 22,66" />
        <path
          class="d20-edges"
          d="M50 4 L50 22 M92 27 L78 66 M8 27 L22 66 M50 96 L78 66 M50 96 L22 66 M92 73 L78 66 M8 73 L22 66 M92 27 L50 22 M8 27 L50 22"
        />
        <text x="50" y="57" class="d20-num">{{ last }}</text>
      </svg>
      <div class="result-text">
        <div v-if="outcome === 'crit'" class="verdict title-font">Crítico!</div>
        <div v-else-if="outcome === 'fumble'" class="verdict title-font">Falha crítica</div>
        <div class="detail">
          Saiu <strong>{{ last }}</strong> no d{{ lastSides }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dice {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.die-pick {
  min-width: 46px;
  padding: 5px 10px;
  font-family: var(--font-title);
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--parchment);
  background: linear-gradient(180deg, #241a2c, #120c17);
  border: 1px solid rgba(212, 160, 76, 0.3);
  /* formato de gema lapidada */
  clip-path: polygon(10% 0, 90% 0, 100% 50%, 90% 100%, 10% 100%, 0 50%);
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s,
    transform 0.15s;
}

.die-pick:hover {
  transform: translateY(-1px);
  color: var(--gold-bright);
}

.die-pick.active {
  color: #1a1008;
  background: linear-gradient(180deg, #f3d391, #c08a3c 60%, #8a5a26);
}

.die-pick:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.field {
  flex: 1 1 160px;
}

.spinning {
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ───── resultado ───── */
.result {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 14px;
}

.d20 {
  width: 74px;
  height: 74px;
  flex: 0 0 auto;
  animation: land 0.7s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
  filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.7));
}

@keyframes land {
  0% {
    transform: rotate(-300deg) scale(0.3);
    opacity: 0;
  }
  70% {
    transform: rotate(14deg) scale(1.12);
    opacity: 1;
  }
  100% {
    transform: rotate(0) scale(1);
  }
}

.d20-body {
  fill: #2a2034;
  stroke: #d4a04c;
  stroke-width: 2;
}

.d20-face {
  fill: #3a2c48;
  stroke: #d4a04c;
  stroke-width: 1.2;
}

.d20-edges {
  stroke: rgba(212, 160, 76, 0.55);
  stroke-width: 1;
  fill: none;
}

.d20-num {
  font-family: var(--font-title);
  font-weight: 700;
  font-size: 22px;
  text-anchor: middle;
  fill: var(--parchment);
}

.detail {
  opacity: 0.85;
}

.detail strong {
  font-family: var(--font-title);
  font-size: 1.3rem;
}

.verdict {
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.crit .d20 {
  filter: drop-shadow(0 0 14px rgba(243, 211, 145, 0.9));
}

.crit .d20-body {
  fill: #4a3518;
}

.crit .d20-face {
  fill: #7a5524;
}

.crit .d20-num {
  fill: #fff4d6;
}

.crit .verdict {
  background: var(--gold-text);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: glow 1.4s ease-in-out infinite alternate;
}

.fumble .d20 {
  filter: drop-shadow(0 0 12px rgba(217, 70, 61, 0.8));
}

.fumble .d20-body {
  fill: #3a1214;
  stroke: #d9463d;
}

.fumble .d20-face {
  fill: #571a1c;
  stroke: #d9463d;
}

.fumble .verdict {
  color: #ff7a70;
}

@keyframes glow {
  to {
    filter: drop-shadow(0 0 8px rgba(243, 211, 145, 0.8));
  }
}
</style>
