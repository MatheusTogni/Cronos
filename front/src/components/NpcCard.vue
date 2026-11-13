<script setup lang="ts">
import { computed } from 'vue'
import ConditionChip from '@/components/ConditionChip.vue'
import StatBar from '@/components/StatBar.vue'
import { HEALTH_BANDS, type Npc } from '@/types/api'

/**
 * Inimigo/NPC na mesa. O mestre vê a barra de vida; o jogador só a faixa de
 * saúde (o servidor nem manda o número). Ações (só mestre) vêm pelo slot.
 */
const props = withDefaults(defineProps<{ npc: Npc; canRemoveConditions?: boolean }>(), {
  canRemoveConditions: false,
})
const emit = defineEmits<{ removeCondition: [id: string] }>()

const down = computed(() => props.npc.band === 'DOWN')
const band = computed(() => HEALTH_BANDS[props.npc.band])
</script>

<template>
  <v-card class="npc-card card-frame" :class="{ down }" color="surface">
    <div class="head">
      <v-icon icon="mdi-account-alert" color="error" />
      <div class="title-font name">{{ npc.name }}</div>
      <v-chip v-if="down" color="error" size="small" variant="flat" prepend-icon="mdi-skull">Caído</v-chip>
    </div>

    <StatBar
      v-if="npc.hp !== undefined && npc.hpMax !== undefined"
      label="Vida"
      icon="mdi-heart"
      :value="npc.hp"
      :max="npc.hpMax"
      color="error"
      size="sm"
      class="mt-2"
    />
    <v-chip v-else-if="!down" :color="band.color" size="small" variant="tonal" prepend-icon="mdi-heart-pulse" class="mt-2">
      {{ band.label }}
    </v-chip>

    <div v-if="npc.notes" class="notes">{{ npc.notes }}</div>

    <div v-if="npc.conditions.length" class="chips">
      <ConditionChip
        v-for="c in npc.conditions"
        :key="c.id"
        :condition="c"
        :closable="canRemoveConditions"
        @close="emit('removeCondition', c.id)"
      />
    </div>

    <div v-if="$slots.actions" class="actions">
      <slot name="actions" />
    </div>
  </v-card>
</template>

<style scoped>
.npc-card {
  padding: 12px 14px;
  border-left: 3px solid var(--crimson) !important;
}

.down {
  filter: grayscale(0.75) brightness(0.8);
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.name {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 700;
  color: var(--gold-bright);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notes {
  margin-top: 8px;
  font-size: 0.85rem;
  font-style: italic;
  opacity: 0.7;
  white-space: pre-line;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border-soft);
}
</style>
