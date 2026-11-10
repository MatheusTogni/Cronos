<script setup lang="ts">
import StatBar from '@/components/StatBar.vue'
import type { Character, CharacterClass } from '@/types/api'

/** Resumo de um personagem para a visão da party (mestre e jogadores). */
withDefaults(
  defineProps<{
    character: Character
    cls?: CharacterClass
    playerName?: string
    highlight?: boolean
    canRemoveConditions?: boolean
  }>(),
  { cls: undefined, playerName: '', highlight: false, canRemoveConditions: false },
)
const emit = defineEmits<{ removeCondition: [id: string] }>()
</script>

<template>
  <v-card
    class="char-card card-frame"
    :class="{ down: character.hp === 0, highlight }"
    color="surface"
    :style="{ '--accent': cls?.color ?? 'var(--crimson)' }"
  >
    <div class="aura" aria-hidden="true" />
    <div class="head">
      <v-avatar size="48" class="avatar">
        <v-img v-if="cls" :src="cls.artFile" cover position="top" :alt="cls.name" />
      </v-avatar>
      <div class="who">
        <div class="title-font name">{{ character.name }}</div>
        <div class="sub">
          {{ cls?.name ?? character.classId }} · nível {{ character.level }}
          <template v-if="playerName"> · {{ playerName }}</template>
        </div>
      </div>
      <v-chip v-if="character.hp === 0" color="error" size="small" variant="flat" prepend-icon="mdi-skull">
        Caído
      </v-chip>
    </div>

    <div class="bars">
      <StatBar label="Vida" icon="mdi-heart" :value="character.hp" :max="character.hpMax" color="error" />
      <StatBar label="Mana" icon="mdi-water" :value="character.mana" :max="character.manaMax" color="info" />
    </div>

    <div v-if="character.conditions.length" class="chips">
      <v-chip
        v-for="c in character.conditions"
        :key="c.id"
        size="small"
        color="warning"
        variant="tonal"
        :closable="canRemoveConditions"
        :title="[c.description, c.duration, c.source && `por ${c.source}`].filter(Boolean).join(' · ')"
        @click:close="emit('removeCondition', c.id)"
      >
        {{ c.name }}<template v-if="c.duration"> ({{ c.duration }})</template>
      </v-chip>
    </div>

    <div v-if="character.summons.length" class="summons">
      <div v-for="s in character.summons" :key="s.id" class="summon">
        <v-icon icon="mdi-skull" size="small" />
        <span class="summon-name">{{ s.name }}</span>
        <span class="summon-hp">{{ s.hp }}/{{ s.hpMax }}</span>
        <slot name="summon-actions" :summon="s" />
      </div>
    </div>

    <div class="foot">
      <span title="Experiência"><v-icon icon="mdi-star-four-points" size="x-small" /> {{ character.xp }} XP</span>
      <span v-if="character.inventory.length" title="Itens">
        <v-icon icon="mdi-bag-personal" size="x-small" /> {{ character.inventory.length }}
      </span>
    </div>

    <div v-if="$slots.actions" class="actions">
      <slot name="actions" />
    </div>
  </v-card>
</template>

<style scoped>
.char-card {
  padding: 14px 16px;
  border-left: 3px solid var(--accent) !important;
}

/* o conteúdo fica acima da aura */
.char-card > :not(.aura) {
  position: relative;
}

/* brilho da cor da classe no canto do card */
.aura {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    ellipse 70% 60% at 0% 0%,
    color-mix(in srgb, var(--accent) 22%, transparent),
    transparent 70%
  );
}

.highlight {
  box-shadow:
    0 0 0 1px var(--accent),
    0 0 22px color-mix(in srgb, var(--accent) 45%, transparent) !important;
}

.down {
  filter: grayscale(0.75) brightness(0.8);
}

.head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  border: 2px solid var(--accent);
  box-shadow:
    0 0 0 2px #0b0810,
    0 0 0 3px rgba(212, 160, 76, 0.55),
    0 0 14px color-mix(in srgb, var(--accent) 60%, transparent);
}

.who {
  flex: 1 1 auto;
  min-width: 0;
}

.name {
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--gold-bright);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sub {
  font-size: 0.85rem;
  opacity: 0.65;
}

.bars {
  position: relative;
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 10px;
}

.summons {
  margin-top: 10px;
  display: grid;
  gap: 4px;
}

.summon {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.95rem;
}

.summon-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summon-hp {
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}

.foot {
  display: flex;
  gap: 14px;
  margin-top: 10px;
  font-size: 0.85rem;
  opacity: 0.7;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border-soft);
}
</style>
