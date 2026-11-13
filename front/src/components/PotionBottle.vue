<script setup lang="ts">
import { useId } from 'vue'

/** Garrafa de vidro com líquido colorido, desenhada em SVG (sem imagem para carregar). */
withDefaults(defineProps<{ color: string; size?: number }>(), { size: 56 })

const uid = useId()
</script>

<template>
  <svg
    class="bottle"
    :width="size"
    :height="size * 1.25"
    viewBox="0 0 64 80"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <linearGradient :id="`liq-${uid}`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="color" stop-opacity="0.95" />
        <stop offset="1" :stop-color="color" stop-opacity="0.55" />
      </linearGradient>
      <clipPath :id="`glass-${uid}`">
        <path d="M26 18 h12 v10 c0 4 14 10 14 26 a16 16 0 0 1 -16 16 h-8 a16 16 0 0 1 -16 -16 c0 -16 14 -22 14 -26 z" />
      </clipPath>
    </defs>

    <!-- rolha -->
    <rect x="25" y="8" width="14" height="9" rx="2" fill="#8b5a2b" stroke="#4d2f12" stroke-width="1" />

    <!-- vidro -->
    <path
      d="M26 18 h12 v10 c0 4 14 10 14 26 a16 16 0 0 1 -16 16 h-8 a16 16 0 0 1 -16 -16 c0 -16 14 -22 14 -26 z"
      fill="rgba(255,255,255,0.07)"
      stroke="rgba(243,211,145,0.75)"
      stroke-width="1.6"
    />

    <!-- líquido -->
    <g :clip-path="`url(#glass-${uid})`">
      <rect x="8" y="42" width="48" height="36" :fill="`url(#liq-${uid})`" />
      <ellipse cx="32" cy="42" rx="22" ry="3" :fill="color" opacity="0.9" />
    </g>

    <!-- brilho -->
    <path d="M21 52 c0 -5 3 -8 5 -10" stroke="rgba(255,255,255,0.6)" stroke-width="2" fill="none" stroke-linecap="round" />
  </svg>
</template>

<style scoped>
.bottle {
  display: block;
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.55));
}
</style>
