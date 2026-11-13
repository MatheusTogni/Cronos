<script setup lang="ts">
import { computed } from 'vue'
import type { CharacterClass, Crit } from '@/types/api'

/** Ficha completa de uma classe (texto estruturado, legível no celular). */
const props = defineProps<{ cls: CharacterClass }>()

const skills = computed(() => props.cls.abilities.filter((a) => a.kind === 'SKILL'))

const critLabel = (c: Crit) =>
  c.min === c.max ? `${c.min}` : c.max === 20 ? `${c.min}+` : `${c.min}–${c.max}`
</script>

<template>
  <div class="sheet" :style="{ '--accent': cls.color }">
    <header class="sheet-head">
      <h2 class="title-font">{{ cls.name }}</h2>
      <div v-if="cls.tagline" class="tagline">{{ cls.tagline }}</div>
      <div class="cats">
        <v-chip
          v-for="cat in cls.categories"
          :key="cat"
          size="small"
          variant="outlined"
          :color="cls.color"
        >
          {{ cat }}
        </v-chip>
      </div>
    </header>

    <section>
      <h3>Identidade</h3>
      <p class="pre-line">{{ cls.identity }}</p>
    </section>

    <section>
      <h3>
        Mecânica única — <span class="accent">{{ cls.mechanicName }}</span>
      </h3>
      <p class="pre-line">{{ cls.mechanicText }}</p>
    </section>

    <section>
      <h3>Skills</h3>
      <div v-for="skill in skills" :key="skill.id" class="ability skill">
        <div class="mana" :title="`${skill.manaCost} de mana`">
          <span class="mana-num">{{ skill.manaCost }}</span>
          <span class="mana-lbl">mana</span>
        </div>
        <div class="skill-body">
          <div class="ability-name">{{ skill.name }}</div>
          <p class="pre-line">{{ skill.description }}</p>
          <ul v-if="skill.crits?.length" class="crits">
            <li v-for="c in skill.crits" :key="c.min">
              <strong class="accent">{{ critLabel(c) }}:</strong> {{ c.text }}
            </li>
          </ul>
        </div>
      </div>
    </section>

    <footer class="base-stats">
      <span><v-icon icon="mdi-heart" size="small" /> Vida inicial {{ cls.baseHp }}</span>
      <span><v-icon icon="mdi-water" size="small" /> Mana inicial {{ cls.baseMana }}</span>
    </footer>
  </div>
</template>

<style scoped>
.sheet {
  --accent: var(--crimson);
}

.sheet-head h2 {
  font-size: 1.8rem;
  margin: 0;
  color: #f0e6d6;
}

.tagline {
  font-style: italic;
  opacity: 0.7;
}

.cats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

section {
  margin-top: 18px;
}

h3 {
  font-family: var(--font-title);
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
  margin: 0 0 6px;
  font-weight: 700;
}

h3 .accent {
  color: #f0e6d6;
}

p {
  margin: 0;
  line-height: 1.45;
}

.accent {
  color: var(--accent);
}

.ability {
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.02);
}

.skill {
  display: flex;
  gap: 12px;
  margin-bottom: 10px;
}

.ability-name {
  font-family: var(--font-title);
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 2px;
}

.mana {
  flex: 0 0 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--border-soft);
  padding-right: 10px;
}

.mana-num {
  font-family: var(--font-title);
  font-size: 1.8rem;
  line-height: 1;
  color: var(--accent);
}

.mana-lbl {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.7;
}

.skill-body {
  flex: 1 1 auto;
  min-width: 0;
}

.crits {
  list-style: none;
  padding: 0;
  margin: 6px 0 0;
}

.base-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 16px;
  opacity: 0.75;
  font-size: 0.95rem;
}
</style>
