<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { LogEntry, LogType } from '@/types/api'

const props = withDefaults(
  defineProps<{
    logs: LogEntry[]
    canRevert?: boolean
    /** Altura máxima da lista (rola por dentro). */
    maxHeight?: string
  }>(),
  { canRevert: false, maxHeight: '60vh' },
)
const emit = defineEmits<{ revert: [entry: LogEntry] }>()

const ICON: Record<LogType, { icon: string; color: string }> = {
  DAMAGE: { icon: 'mdi-sword-cross', color: 'error' },
  HEAL: { icon: 'mdi-heart-plus', color: 'success' },
  MANA: { icon: 'mdi-water', color: 'info' },
  XP: { icon: 'mdi-star-four-points', color: 'secondary' },
  LEVEL: { icon: 'mdi-arrow-up-bold', color: 'secondary' },
  ABILITY_USED: { icon: 'mdi-auto-fix', color: 'primary' },
  DICE_ROLL: { icon: 'mdi-dice-d20', color: 'secondary' },
  CONDITION_ADDED: { icon: 'mdi-alert-decagram', color: 'warning' },
  CONDITION_REMOVED: { icon: 'mdi-alert-decagram-outline', color: 'grey' },
  SUMMON_CREATED: { icon: 'mdi-skull', color: 'primary' },
  SUMMON_REMOVED: { icon: 'mdi-skull-outline', color: 'grey' },
  SUMMON_UPDATED: { icon: 'mdi-skull', color: 'grey' },
  ITEM_ADDED: { icon: 'mdi-bag-personal', color: 'secondary' },
  ITEM_REMOVED: { icon: 'mdi-bag-personal-outline', color: 'grey' },
  ITEM_UPDATED: { icon: 'mdi-bag-personal', color: 'grey' },
  CAMPAIGN: { icon: 'mdi-castle', color: 'secondary' },
  NOTE: { icon: 'mdi-feather', color: 'grey' },
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

const isCrit = (e: LogEntry) => e.roll === 20 && (e.type === 'ABILITY_USED' || e.type === 'DICE_ROLL')

// Rola para o fim quando chega algo novo, se o usuário já estava no fim.
const box = ref<HTMLElement | null>(null)
watch(
  () => props.logs.length,
  async () => {
    const el = box.value
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    await nextTick()
    if (atBottom) el.scrollTop = el.scrollHeight
  },
)
watch(box, (el) => {
  if (el) el.scrollTop = el.scrollHeight
})
</script>

<template>
  <div ref="box" class="feed" :style="{ maxHeight }">
    <div v-if="!logs.length" class="empty">Nada aconteceu ainda.</div>
    <div
      v-for="entry in logs"
      :key="entry.id"
      class="entry"
      :class="{ reverted: !!entry.revertedAt, crit: isCrit(entry), note: entry.type === 'NOTE' && !entry.characterId }"
    >
      <v-icon :icon="ICON[entry.type].icon" :color="ICON[entry.type].color" size="small" class="entry-icon" />
      <div class="entry-body">
        <div class="entry-msg">{{ entry.message }}</div>
        <div class="entry-meta">
          {{ time(entry.createdAt) }}
          <template v-if="entry.revertedAt"> · desfeito</template>
        </div>
      </div>
      <v-btn
        v-if="canRevert && entry.revertible"
        icon="mdi-undo"
        size="x-small"
        variant="text"
        :aria-label="`Desfazer: ${entry.message}`"
        title="Desfazer"
        @click="emit('revert', entry)"
      />
    </div>
  </div>
</template>

<style scoped>
.feed {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.empty {
  opacity: 0.6;
  font-style: italic;
  padding: 12px 4px;
}

.entry {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 7px 6px;
  border-bottom: 1px solid rgba(201, 162, 39, 0.08);
}

.entry-icon {
  margin-top: 3px;
}

.entry-body {
  flex: 1 1 auto;
  min-width: 0;
}

.entry-msg {
  line-height: 1.35;
  word-break: break-word;
}

.entry-meta {
  font-size: 0.78rem;
  opacity: 0.5;
}

.reverted .entry-msg {
  text-decoration: line-through;
  opacity: 0.5;
}

.crit {
  background: rgba(201, 162, 39, 0.1);
  border-radius: 6px;
}

.note .entry-msg {
  font-style: italic;
  color: #e8d9b8;
}
</style>
