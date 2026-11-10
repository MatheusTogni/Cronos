<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    value: number
    max: number
    color: string
    icon?: string
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { icon: undefined, size: 'md' },
)

const pct = computed(() => (props.max > 0 ? Math.round((props.value / props.max) * 100) : 0))
const height = computed(() => ({ sm: 8, md: 14, lg: 22 })[props.size])
</script>

<template>
  <div class="stat" :class="`stat-${size}`">
    <div class="stat-head">
      <span class="stat-label">
        <v-icon v-if="icon" :icon="icon" size="x-small" :color="color" />
        {{ label }}
      </span>
      <span class="stat-num">
        <strong>{{ value }}</strong>/{{ max }}
      </span>
    </div>
    <v-progress-linear
      :model-value="pct"
      :color="color"
      bg-color="surface-variant"
      bg-opacity="1"
      :height="height"
      rounded
      :aria-label="`${label}: ${value} de ${max}`"
    />
  </div>
</template>

<style scoped>
.stat-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 3px;
}

.stat-label {
  font-size: 0.85rem;
  opacity: 0.8;
}

.stat-num {
  font-variant-numeric: tabular-nums;
  font-size: 0.95rem;
}

.stat-lg .stat-num {
  font-size: 1.25rem;
}

.stat-lg .stat-label {
  font-size: 1rem;
}
</style>
