<script setup lang="ts">
import ConditionChip from '@/components/ConditionChip.vue'
import StatBar from '@/components/StatBar.vue'
import type { Npc } from '@/types/api'

/** Inimigo/NPC na mesa: vida e condições. Ações (só mestre) vêm pelo slot. */
withDefaults(defineProps<{ npc: Npc; canRemoveConditions?: boolean }>(), { canRemoveConditions: false })
const emit = defineEmits<{ removeCondition: [id: string] }>()
</script>

<template>
  <v-card class="npc-card card-frame" :class="{ down: npc.hp === 0 }" color="surface">
    <div class="head">
      <v-icon icon="mdi-account-alert" color="error" />
      <div class="title-font name">{{ npc.name }}</div>
      <v-chip v-if="npc.hp === 0" color="error" size="small" variant="flat" prepend-icon="mdi-skull">Caído</v-chip>
    </div>

    <StatBar label="Vida" icon="mdi-heart" :value="npc.hp" :max="npc.hpMax" color="error" size="sm" class="mt-2" />

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
