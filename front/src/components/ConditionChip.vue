<script setup lang="ts">
import { computed } from 'vue'
import { POLARITY_COLOR, type Condition } from '@/types/api'

/** Uma condição: um status à mostra, com a cor da polaridade. O mestre decide o que ela faz. */
const props = withDefaults(defineProps<{ condition: Condition; closable?: boolean; size?: string }>(), {
  closable: false,
  size: 'small',
})
const emit = defineEmits<{ close: [] }>()

const c = computed(() => props.condition)

const details = computed(() =>
  [c.value.description, c.value.source && `por ${c.value.source}`].filter(Boolean).join(' · '),
)
</script>

<template>
  <v-chip
    :size="size"
    :color="POLARITY_COLOR[c.polarity]"
    variant="tonal"
    :closable="closable"
    :title="details"
    @click:close="emit('close')"
  >
    {{ c.name }}
  </v-chip>
</template>
