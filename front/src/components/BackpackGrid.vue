<script setup lang="ts">
import { computed } from 'vue'
import ItemIcon from '@/components/ItemIcon.vue'
import type { InventoryItem } from '@/types/api'
import { BACKPACK_COLUMNS, backpackSlots } from '@/utils/backpack'

/**
 * A grade de quadradinhos da mochila (3×3): o ícone de cada item e, se houver
 * mais de uma unidade, a quantidade no canto. Usada na mochila do jogador e no
 * "Tirar item" do mestre; quem usa guarda qual item está escolhido.
 */
const props = defineProps<{ inventory: InventoryItem[]; selectedId: string | null }>()
const emit = defineEmits<{ select: [id: string] }>()

const slots = computed(() => backpackSlots(props.inventory))
</script>

<template>
  <div class="grid" :style="{ '--cols': BACKPACK_COLUMNS }">
    <template v-for="(slot, i) in slots" :key="slot?.id ?? `vazio-${i}`">
      <button
        v-if="slot"
        type="button"
        class="slot"
        :class="{ selected: slot.id === selectedId }"
        :aria-label="slot.qty > 1 ? `${slot.name}, ${slot.qty} unidades` : slot.name"
        :aria-pressed="slot.id === selectedId"
        @click="emit('select', slot.id)"
      >
        <ItemIcon :item="slot" :size="40" />
        <span v-if="slot.qty > 1" class="qty">{{ slot.qty }}</span>
      </button>
      <div v-else class="slot empty" aria-hidden="true" />
    </template>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  gap: 8px;
}

/* quadradinho fundo, como as casas de um baú */
.slot {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  padding: 0;
  appearance: none;
  font: inherit;
  color: inherit;
  border-radius: 10px;
  border: 1px solid var(--border-soft);
  background: linear-gradient(180deg, #120d17, #1b1422);
  box-shadow:
    inset 0 2px 6px rgba(0, 0, 0, 0.7),
    inset 0 -1px 0 rgba(255, 255, 255, 0.05);
}

button.slot {
  cursor: pointer;
  transition:
    border-color 120ms ease-out,
    box-shadow 120ms ease-out;
}

button.slot:active {
  border-color: var(--gold);
}

.slot.empty {
  opacity: 0.55;
}

.slot.selected {
  border-color: var(--gold);
  box-shadow:
    inset 0 2px 6px rgba(0, 0, 0, 0.7),
    0 0 0 1px var(--gold),
    0 0 14px color-mix(in srgb, var(--gold) 45%, transparent);
}

/* quantidade no canto, só quando há mais de uma */
.qty {
  position: absolute;
  right: 8px;
  bottom: 4px;
  font-family: var(--font-title);
  font-weight: 700;
  font-size: 1rem;
  line-height: 1;
  color: #fff3d6;
  text-shadow:
    0 1px 3px #000,
    0 0 2px #000;
}

@media (prefers-reduced-motion: reduce) {
  button.slot {
    transition: none;
  }
}
</style>
