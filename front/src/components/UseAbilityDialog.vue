<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import { useConditionsStore } from '@/stores/conditions'
import type { Ability, ActionResult, Character, Crit } from '@/types/api'

/**
 * O jogador declara a habilidade e o alvo. O d20 e o dano são do mestre: ele
 * digita o valor na mesa dele e a ação se resolve. Habilidade sem dado, sem
 * dano e sem inimigo como alvo acontece na hora.
 */
const props = defineProps<{ character: Character; ability: Ability | null }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ used: [log: ActionResult['log']] }>()

const campaign = useCampaignStore()
const catalog = useConditionsStore()

const target = ref<string | null>(null) // 'self' | 'character:<id>' | 'npc:<id>'
const note = ref('')
const summonId = ref<string | null>(null)
const busy = ref(false)
const error = ref('')

const hasCrits = computed(() => !!props.ability?.crits?.length)
const effect = computed(() => props.ability?.effect ?? null)
const enoughMana = computed(() => (props.ability?.manaCost ?? 0) <= props.character.mana)

// habilidades de invocação ou de si mesmo não escolhem alvo
const ownEffect = computed(
  () => effect.value === 'SUMMON' || effect.value === 'SACRIFICE_SUMMON' || effect.value === 'SELF_CONDITION',
)
const takesTarget = computed(() => !!props.ability?.dealsDamage || !ownEffect.value)
const needsTarget = computed(() => !!props.ability?.dealsDamage || effect.value === 'TARGET_CONDITION')
const targetsEnemy = computed(() => !!target.value?.startsWith('npc:'))
/** Espelho do back: dano, faixa de crítico ou efeito num inimigo passam pelo mestre. */
const needsMaster = computed(
  () => !!props.ability?.dealsDamage || hasCrits.value || (effect.value === 'TARGET_CONDITION' && targetsEnemy.value),
)
const waiting = computed(() => !!campaign.myPendingAction)

type Item = { title: string; value: string } | { type: 'subheader'; title: string }
const targetItems = computed<Item[]>(() => {
  const s = campaign.state
  if (!s || !props.ability) return []
  const items: Item[] = []
  if (!props.ability.dealsDamage) {
    items.push({ type: 'subheader', title: 'Aliados' }, { title: 'Si mesmo', value: 'self' })
    for (const c of s.characters) {
      if (c.id !== props.character.id) items.push({ title: c.name, value: `character:${c.id}` })
    }
  }
  const enemies = props.ability.dealsDamage ? s.npcs.filter((n) => n.band !== 'DOWN') : s.npcs
  if (enemies.length) {
    items.push({ type: 'subheader', title: 'Inimigos' })
    for (const n of enemies) items.push({ title: n.name, value: `npc:${n.id}` })
  }
  return items
})

const summonOptions = computed(() =>
  props.character.summons.map((s) => ({ title: `${s.name} (${s.hp}/${s.hpMax})`, value: s.id })),
)

/** "Incapacitado, 1 turno" — condição que a faixa aplica. */
const critCondition = (c: Crit) => {
  if (!c.condition) return ''
  const name = catalog.byId(c.condition)?.name ?? c.condition
  const turns = c.turns ? `, ${c.turns} ${c.turns === 1 ? 'turno' : 'turnos'}` : ''
  return `${name}${turns}${c.on === 'self' ? ' (em você)' : ''}`
}

const critLabel = (c: Crit) => (c.min === c.max ? `${c.min}` : c.max === 20 ? `${c.min}+` : `${c.min}–${c.max}`)

watch(open, (isOpen) => {
  if (!isOpen) return
  catalog.load().catch(() => {
    /* sem catálogo, mostra o id da condição */
  })
  target.value = null
  note.value = ''
  summonId.value = props.character.summons.length === 1 ? (props.character.summons[0]?.id ?? null) : null
  error.value = ''
})

function targetBody() {
  const t = target.value
  if (!t) return undefined
  if (t === 'self') return { kind: 'self' }
  const [kind, id] = t.split(':')
  return { kind, id }
}

async function submit() {
  const a = props.ability
  if (!a) return
  error.value = ''
  if (needsTarget.value && !target.value) {
    error.value = a.dealsDamage ? 'Escolha o inimigo que você ataca' : 'Escolha o alvo'
    return
  }
  if (a.prompt && !note.value.trim()) {
    error.value = a.prompt
    return
  }
  if (effect.value === 'SACRIFICE_SUMMON' && !props.character.summons.length) {
    error.value = 'Você não tem criatura para sacrificar'
    return
  }

  const body: Record<string, unknown> = {}
  if (takesTarget.value && target.value) body.target = targetBody()
  if (a.prompt) body.note = note.value.trim()
  if (effect.value === 'SACRIFICE_SUMMON' && summonId.value) body.summonId = summonId.value

  busy.value = true
  let log: ActionResult['log'] = null
  const ok = await campaign.act(async () => {
    const res = await api.post<ActionResult>(`/characters/${props.character.id}/abilities/${a.id}/use`, body)
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
            <v-chip v-if="c.condition" size="x-small" color="warning" variant="tonal" class="ml-1">
              {{ critCondition(c) }}
            </v-chip>
          </li>
        </ul>

        <v-alert v-if="campaign.fallen" type="error" variant="tonal" density="compact" class="mb-3">
          {{ character.name }} está caído e não pode agir.
        </v-alert>
        <v-alert v-else-if="!campaign.canAct" type="warning" variant="tonal" density="compact" class="mb-3">
          Não é a sua vez: aguarde o seu turno no combate.
        </v-alert>
        <v-alert v-if="waiting" type="info" variant="tonal" density="compact" class="mb-3">
          Sua ação anterior ainda espera o mestre.
        </v-alert>
        <v-alert v-if="!enoughMana" type="warning" variant="tonal" density="compact" class="mb-3">
          Mana insuficiente: precisa de {{ ability.manaCost }}, você tem {{ character.mana }}.
        </v-alert>

        <template v-if="takesTarget">
          <div class="section-label">{{ ability.dealsDamage ? 'Quem você ataca' : needsTarget ? 'Alvo' : 'Alvo (opcional)' }}</div>
          <v-select
            v-model="target"
            :items="targetItems"
            :clearable="!needsTarget"
            :placeholder="ability.dealsDamage ? 'Escolha um inimigo' : 'Escolha o alvo'"
            hide-details
            class="mb-2"
          />
          <div v-if="ability.dealsDamage && !targetItems.length" class="hint">Não há inimigos em cena.</div>
        </template>

        <template v-if="ability.prompt">
          <div class="section-label mt-2">{{ ability.prompt }}</div>
          <v-text-field v-model="note" maxlength="120" hide-details autofocus class="mb-2" />
        </template>

        <template v-if="effect === 'SACRIFICE_SUMMON' && summonOptions.length > 1">
          <div class="section-label mt-3">Qual criatura sacrificar?</div>
          <v-select v-model="summonId" :items="summonOptions" label="Criatura" hide-details />
        </template>

        <div v-if="effect === 'SUMMON' && character.summons.length" class="hint mt-2">
          {{ character.summons.map((s) => s.name).join(', ') }} pode desaparecer ao invocar outra.
        </div>
        <div v-if="needsMaster" class="hint mt-2">
          <v-icon icon="mdi-dice-d20" size="x-small" />
          Role o d20 na mesa. O mestre digita o valor e a ação acontece.
        </div>

        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">{{ error }}</v-alert>
      </v-card-text>

      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancelar</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="busy"
          :disabled="!enoughMana || !campaign.canAct || (needsMaster && waiting)"
          @click="submit"
        >
          {{ needsMaster ? 'Declarar' : 'Usar' }}
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

.hint {
  font-size: 0.85rem;
  opacity: 0.65;
  margin-top: 4px;
}
</style>
