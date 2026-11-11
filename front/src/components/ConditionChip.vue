<script setup lang="ts">
import { computed } from 'vue'
import { POLARITY_COLOR, type Condition } from '@/types/api'

/** Uma condição: cor pela polaridade, turnos restantes e efeito por turno. */
const props = withDefaults(defineProps<{ condition: Condition; closable?: boolean; size?: string }>(), {
  closable: false,
  size: 'small',
})
const emit = defineEmits<{ close: [] }>()

const c = computed(() => props.condition)

const icon = computed(() => {
  if (c.value.skipsTurn) return 'mdi-pause-circle'
  if (c.value.hpPerTurn < 0) return 'mdi-heart-minus'
  if (c.value.hpPerTurn > 0) return 'mdi-heart-plus'
  return undefined
})

const details = computed(() =>
  [
    c.value.description,
    c.value.turnsLeft !== null
      ? `${c.value.turnsLeft} ${c.value.turnsLeft === 1 ? 'turno restante' : 'turnos restantes'}`
      : c.value.duration,
    c.value.hpPerTurn < 0 && `−${-c.value.hpPerTurn} de vida por turno`,
    c.value.hpPerTurn > 0 && `+${c.value.hpPerTurn} de vida por turno`,
    c.value.skipsTurn && 'perde a vez',
    c.value.source && `por ${c.value.source}`,
  ]
    .filter(Boolean)
    .join(' · '),
)
</script>

<template>
  <v-chip
    :size="size"
    :color="POLARITY_COLOR[c.polarity]"
    variant="tonal"
    :prepend-icon="icon"
    :closable="closable"
    :title="details"
    @click:close="emit('close')"
  >
    {{ c.name }}
    <span v-if="c.turnsLeft !== null" class="turns" :aria-label="`${c.turnsLeft} turnos`">{{ c.turnsLeft }}t</span>
    <template v-else-if="c.duration"> ({{ c.duration }})</template>
  </v-chip>
</template>

<style scoped>
.turns {
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 8px;
  font-size: 0.75em;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: color-mix(in srgb, currentColor 22%, transparent);
}
</style>
