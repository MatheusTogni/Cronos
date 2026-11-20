<script setup lang="ts">
import { computed } from 'vue'
import { POLARITY_COLOR, POLARITY_LABEL, type ConditionDef } from '@/types/api'
import { conditionArt } from '@/utils/conditionArt'

/** Ficha de uma condição do catálogo: tipo e descrição. */
const props = defineProps<{ def: ConditionDef }>()

const accent = computed(() => conditionArt(props.def.id, props.def.polarity).color)
</script>

<template>
  <div class="sheet" :style="{ '--accent': accent }">
    <header class="sheet-head">
      <h2 class="title-font">{{ def.name }}</h2>
      <div class="cats">
        <v-chip size="small" variant="outlined" :color="POLARITY_COLOR[def.polarity]">
          {{ POLARITY_LABEL[def.polarity] }}
        </v-chip>
      </div>
    </header>

    <section>
      <h3>Efeito</h3>
      <p class="pre-line">{{ def.description }}</p>
    </section>
  </div>
</template>

<style scoped>
.sheet-head h2 {
  font-size: 1.8rem;
  margin: 0;
  color: #f0e6d6;
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

p {
  margin: 0;
  line-height: 1.45;
}
</style>
