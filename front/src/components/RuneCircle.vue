<script setup lang="ts">
import { useId } from 'vue'

/**
 * Círculo arcano em volta de um conteúdo (o ícone, no login): anel com
 * inscrição em latim girando devagar e anel de marcações girando ao contrário.
 */
withDefaults(defineProps<{ size?: number }>(), { size: 280 })

const pathId = `rune-path-${useId()}`
const INSCRIPTION = 'TEMPVS EDAX RERVM ✦ OMNIA VINCIT HORA ✦ MEMENTO MORI ✦ '
</script>

<template>
  <div class="rune" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg class="ring ring-text" viewBox="0 0 300 300" aria-hidden="true">
      <defs>
        <path :id="pathId" d="M150 150 m-128 0 a128 128 0 1 1 256 0 a128 128 0 1 1 -256 0" />
      </defs>
      <circle cx="150" cy="150" r="145" class="line" />
      <circle cx="150" cy="150" r="112" class="line faint" />
      <text class="inscription">
        <textPath :href="`#${pathId}`" textLength="800">{{ INSCRIPTION }}</textPath>
      </text>
    </svg>

    <svg class="ring ring-ticks" viewBox="0 0 300 300" aria-hidden="true">
      <circle cx="150" cy="150" r="104" class="ticks" />
      <g class="diamonds">
        <path d="M150 34 L156 46 L150 58 L144 46 Z" />
        <path d="M150 242 L156 254 L150 266 L144 254 Z" />
        <path d="M34 150 L46 144 L58 150 L46 156 Z" />
        <path d="M242 150 L254 144 L266 150 L254 156 Z" />
      </g>
    </svg>

    <div class="glow" />
    <div class="content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.rune {
  position: relative;
  margin: 0 auto;
  max-width: 100%;
}

.ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.ring-text {
  animation: spin 120s linear infinite;
}

.ring-ticks {
  animation: spin 80s linear infinite reverse;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.line {
  fill: none;
  stroke: #d4a04c;
  stroke-width: 1.2;
  opacity: 0.7;
}

.faint {
  opacity: 0.35;
}

.ticks {
  fill: none;
  stroke: #d4a04c;
  stroke-width: 6;
  stroke-dasharray: 1.2 9.7;
  opacity: 0.45;
}

.diamonds path {
  fill: #d4a04c;
  filter: drop-shadow(0 0 4px rgba(243, 211, 145, 0.8));
}

.inscription {
  font-family: var(--font-title);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 2px;
  fill: #e3b665;
  opacity: 0.85;
}

.glow {
  position: absolute;
  inset: 18%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(212, 160, 76, 0.28), rgba(91, 58, 134, 0.2) 50%, transparent 72%);
  filter: blur(8px);
  animation: breathe 5s ease-in-out infinite alternate;
}

@keyframes breathe {
  from {
    opacity: 0.55;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1.05);
  }
}

.content {
  position: absolute;
  inset: 22%;
  display: grid;
  place-items: center;
}
</style>
