<script setup lang="ts">
import { computed } from 'vue'
import PotionBottle from '@/components/PotionBottle.vue'
import { itemVisual } from '@/utils/backpack'

/** O desenho de um item: garrafa colorida, ícone do catálogo ou um genérico (item dado à mão pelo mestre). */
const props = withDefaults(defineProps<{ item: { code: string | null; name: string }; size?: number }>(), {
  size: 44,
})

const visual = computed(() => itemVisual(props.item))
</script>

<template>
  <PotionBottle v-if="visual.bottle" :color="visual.bottle" :size="size * 0.85" />
  <v-icon v-else :icon="visual.icon" :size="size" class="item-icon" />
</template>

<style scoped>
.item-icon {
  color: var(--gold);
  filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.6));
}
</style>
