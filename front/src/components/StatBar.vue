<script setup lang="ts">
import { computed } from 'vue'

/**
 * Barra de recurso estilo RPG: tubo de vidro escuro, líquido com brilho,
 * marcações a cada 10% e um "rastro" que demora a sumir quando o valor cai.
 */
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

const pct = computed(() =>
  props.max > 0 ? Math.max(0, Math.min(100, Math.round((props.value / props.max) * 100))) : 0,
)
const height = computed(() => ({ sm: 8, md: 14, lg: 22 })[props.size])
const low = computed(() => props.max > 0 && pct.value > 0 && pct.value <= 25)
</script>

<template>
  <div class="stat" :class="[`stat-${size}`, { low }]" :style="{ '--c': `rgb(var(--v-theme-${color}))` }">
    <div class="stat-head">
      <span class="stat-label">
        <v-icon v-if="icon" :icon="icon" size="x-small" :color="color" />
        {{ label }}
      </span>
      <span class="stat-num">
        <strong>{{ value }}</strong><span class="stat-max">/{{ max }}</span>
      </span>
    </div>
    <div
      class="gauge"
      :style="{ height: `${height}px` }"
      role="progressbar"
      :aria-label="`${label}: ${value} de ${max}`"
      :aria-valuenow="value"
      aria-valuemin="0"
      :aria-valuemax="max"
    >
      <div class="ghost" :style="{ width: `${pct}%` }" />
      <div class="fill" :style="{ width: `${pct}%` }" />
      <div v-if="size !== 'sm'" class="ticks" />
      <div class="glass" />
    </div>
  </div>
</template>

<style scoped>
.stat-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
}

.stat-label {
  font-family: var(--font-title);
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.85;
}

.stat-num {
  font-variant-numeric: tabular-nums;
  font-size: 0.95rem;
}

.stat-num strong {
  font-family: var(--font-title);
  color: color-mix(in srgb, var(--c) 45%, #fff);
}

.stat-max {
  opacity: 0.6;
}

.stat-lg .stat-num {
  font-size: 1.3rem;
}

.stat-lg .stat-label {
  font-size: 0.9rem;
}

.gauge {
  position: relative;
  overflow: hidden;
  border-radius: 3px;
  border: 1px solid rgba(212, 160, 76, 0.45);
  background: linear-gradient(180deg, #050307, #1a1320);
  box-shadow:
    inset 0 2px 5px rgba(0, 0, 0, 0.9),
    0 0 0 1px rgba(0, 0, 0, 0.7);
}

.fill,
.ghost {
  position: absolute;
  inset: 0 auto 0 0;
}

.fill {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--c), #fff 40%) 0%,
    var(--c) 45%,
    color-mix(in srgb, var(--c), #000 50%) 100%
  );
  box-shadow: 0 0 12px color-mix(in srgb, var(--c) 70%, transparent);
  transition: width 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* brilho correndo pelo líquido */
.fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, transparent 30%, rgba(255, 255, 255, 0.28) 50%, transparent 70%);
  background-size: 250% 100%;
  animation: sheen 4.5s linear infinite;
}

@keyframes sheen {
  from {
    background-position: 150% 0;
  }
  to {
    background-position: -100% 0;
  }
}

/* rastro claro que fica para trás quando o valor cai */
.ghost {
  background: rgba(255, 236, 200, 0.55);
  transition: width 0.9s ease-in 0.35s;
}

.ticks {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    90deg,
    transparent 0 calc(10% - 1px),
    rgba(0, 0, 0, 0.45) calc(10% - 1px) 10%
  );
}

.glass {
  position: absolute;
  inset: 0 0 50% 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.14), transparent);
}

/* recurso baixo: pulsa */
.low .fill {
  animation: pulse 1.2s ease-in-out infinite;
}

.low .stat-num strong {
  color: #ff8a80;
}

@keyframes pulse {
  50% {
    filter: brightness(1.5);
    box-shadow: 0 0 18px var(--c);
  }
}
</style>
