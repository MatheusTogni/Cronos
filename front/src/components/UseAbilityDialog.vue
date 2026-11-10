<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import type { Ability, ActionResult, Character, Crit } from '@/types/api'

const props = defineProps<{ character: Character; ability: Ability | null }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ used: [log: ActionResult['log']] }>()

const campaign = useCampaignStore()

type RollMode = 'auto' | 'manual' | 'none'
const rollMode = ref<RollMode>('auto')
const manualRoll = ref<number | null>(null)
// O jogador só escolhe a habilidade (e o dado): alvo e efeitos em outros são com o mestre.
const summonId = ref<string | null>(null)
const busy = ref(false)
const error = ref('')

const hasCrits = computed(() => !!props.ability?.crits?.length)
const effect = computed(() => props.ability?.effect ?? null)
const enoughMana = computed(() => (props.ability?.manaCost ?? 0) <= props.character.mana)

const summonOptions = computed(() =>
  props.character.summons.map((s) => ({ title: `${s.name} (${s.hp}/${s.hpMax})`, value: s.id })),
)

const critLabel = (c: Crit) =>
  c.min === c.max ? `${c.min}` : c.max === 20 ? `${c.min}+` : `${c.min}–${c.max}`

watch(open, (isOpen) => {
  if (!isOpen) return
  rollMode.value = hasCrits.value ? 'auto' : 'none'
  manualRoll.value = null
  summonId.value = props.character.summons.length === 1 ? (props.character.summons[0]?.id ?? null) : null
  error.value = ''
})

async function submit() {
  const a = props.ability
  if (!a) return
  error.value = ''
  if (rollMode.value === 'manual') {
    const r = Number(manualRoll.value)
    if (!Number.isInteger(r) || r < 1 || r > 20) {
      error.value = 'Digite o valor do d20 (1 a 20)'
      return
    }
  }
  if (effect.value === 'SACRIFICE_SUMMON' && !props.character.summons.length) {
    error.value = 'Você não tem criatura para sacrificar'
    return
  }

  const body: Record<string, unknown> = { rollMode: rollMode.value }
  if (rollMode.value === 'manual') body.roll = Number(manualRoll.value)
  if (effect.value === 'SACRIFICE_SUMMON' && summonId.value) body.summonId = summonId.value

  busy.value = true
  let log: ActionResult['log'] = null
  const ok = await campaign.act(async () => {
    const res = await api.post<ActionResult>(
      `/characters/${props.character.id}/abilities/${a.id}/use`,
      body,
    )
    log = res.data.log
    return res
  })
  busy.value = false
  if (ok) {
    emit('used', log)
    open.value = false
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="480" scrollable>
    <v-card v-if="ability" class="card-frame" color="surface">
      <v-card-title class="title-font pt-5 px-6 d-flex align-center ga-2">
        <span class="flex-grow-1">{{ ability.name }}</span>
        <v-chip v-if="ability.manaCost" color="info" size="small" variant="tonal" prepend-icon="mdi-water">
          {{ ability.manaCost }}
        </v-chip>
      </v-card-title>

      <v-card-text class="px-6">
        <p class="pre-line desc">{{ ability.description }}</p>

        <ul v-if="hasCrits" class="crits">
          <li v-for="c in ability.crits ?? []" :key="c.min">
            <strong>{{ critLabel(c) }}:</strong> {{ c.text }}
          </li>
        </ul>

        <v-alert v-if="!enoughMana" type="warning" variant="tonal" density="compact" class="mb-3">
          Mana insuficiente: precisa de {{ ability.manaCost }}, você tem {{ character.mana }}.
        </v-alert>

        <div class="section-label">Dado</div>
        <v-btn-toggle v-model="rollMode" mandatory divided variant="outlined" color="secondary" class="mb-2 roll-toggle">
          <v-btn value="auto" prepend-icon="mdi-dice-d20">Rolar</v-btn>
          <v-btn value="manual" prepend-icon="mdi-hand-back-right">Dado físico</v-btn>
          <v-btn value="none">Sem dado</v-btn>
        </v-btn-toggle>
        <v-text-field
          v-if="rollMode === 'manual'"
          v-model.number="manualRoll"
          label="Valor do d20"
          type="number"
          min="1"
          max="20"
          hide-details
          autofocus
          class="mb-2"
        />

        <div v-if="effect === 'SUMMON' && character.summons.length" class="hint mt-2">
          {{ character.summons.map((s) => s.name).join(', ') }} pode desaparecer ao invocar outra.
        </div>
        <div v-if="effect === 'TARGET_CONDITION'" class="hint mt-2">
          O mestre decide em quem o efeito cai.
        </div>

        <template v-if="effect === 'SACRIFICE_SUMMON' && summonOptions.length > 1">
          <div class="section-label mt-3">Qual criatura sacrificar?</div>
          <v-select v-model="summonId" :items="summonOptions" label="Criatura" hide-details />
        </template>

        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">{{ error }}</v-alert>
      </v-card-text>

      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancelar</v-btn>
        <v-btn color="primary" variant="flat" :loading="busy" :disabled="!enoughMana" @click="submit">
          Usar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.desc {
  margin: 0 0 8px;
  line-height: 1.4;
}

.crits {
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
  font-size: 0.95rem;
}

.crits strong {
  color: var(--gold);
}

.section-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.6;
  margin-bottom: 6px;
}

.roll-toggle {
  flex-wrap: wrap;
  height: auto;
}

.hint {
  font-size: 0.85rem;
  opacity: 0.65;
  margin-top: 4px;
}
</style>
