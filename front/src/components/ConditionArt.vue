<script setup lang="ts">
import { computed, useId } from 'vue'
import { POLARITY_LABEL, type ConditionDef } from '@/types/api'
import { conditionArt } from '@/utils/conditionArt'

/**
 * Arte de uma condição como carta arcana: tipo no topo, ícone dentro de um
 * círculo de runas girando e o nome no rodapé.
 * Tudo em cqw, então serve tanto no quadro pequeno quanto no aberto.
 */
const props = defineProps<{
  def: ConditionDef
  /** Animação interna completa (carta aberta). Na galeria fica parada: são 29 cartas. */
  live?: boolean
}>()

const art = computed(() => conditionArt(props.def.id, props.def.polarity))
const pathId = `cond-ring-${useId()}`
const inscription = computed(() => `${props.def.name.toUpperCase()} ✦ `.repeat(4))
</script>

<template>
  <div class="art" :class="[def.polarity.toLowerCase(), { live }]" :style="{ '--tone': art.color }" aria-hidden="true">
    <div class="rays" />

    <div class="top">
      <span class="numeral">{{ POLARITY_LABEL[def.polarity] }}</span>
    </div>

    <div class="seal">
      <svg class="ring ring-text" viewBox="0 0 300 300">
        <defs>
          <path :id="pathId" d="M150 150 m-122 0 a122 122 0 1 1 244 0 a122 122 0 1 1 -244 0" />
        </defs>
        <circle cx="150" cy="150" r="145" class="line" />
        <circle cx="150" cy="150" r="104" class="line faint" />
        <text class="inscription">
          <textPath :href="`#${pathId}`" textLength="760">{{ inscription }}</textPath>
        </text>
      </svg>
      <svg class="ring ring-ticks" viewBox="0 0 300 300">
        <circle cx="150" cy="150" r="96" class="ticks" />
        <g class="diamonds">
          <path d="M150 40 L155 50 L150 60 L145 50 Z" />
          <path d="M150 240 L155 250 L150 260 L145 250 Z" />
          <path d="M40 150 L50 145 L60 150 L50 155 Z" />
          <path d="M240 150 L250 145 L260 150 L250 155 Z" />
        </g>
      </svg>
      <div class="glow" />
      <v-icon :icon="art.icon" class="sigil" />
    </div>

    <div v-if="live" class="motes">
      <span v-for="n in 6" :key="n" :style="{ '--i': n }" />
    </div>

    <div class="foot">
      <div class="name">{{ def.name }}</div>
    </div>
  </div>
</template>

<style scoped>
.art {
  --tone: #c9a227;
  position: relative;
  overflow: hidden;
  container-type: size;
  /* !important: a moldura (FrameGallery e ConditionReveal) força `display: block`
     em quem entra nela e ganha por especificidade; sem isto o selo encosta na
     esquerda e o nome sobe, em vez de ficar no rodapé */
  display: flex !important;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 6cqw 4cqw 5cqw;
  color: #f3e6c8;
  background:
    radial-gradient(ellipse 80% 55% at 50% 44%, color-mix(in srgb, var(--tone) 45%, transparent), transparent 70%),
    radial-gradient(ellipse at 50% 120%, color-mix(in srgb, var(--tone) 30%, transparent), transparent 60%),
    linear-gradient(180deg, #1a1222, #0b0810 60%, #120b16) !important;
}

/* raios girando atrás do selo */
.rays {
  position: absolute;
  left: 50%;
  top: 44%;
  width: 180cqw;
  height: 180cqw;
  translate: -50% -50%;
  background: repeating-conic-gradient(
    from 0deg,
    color-mix(in srgb, var(--tone) 16%, transparent) 0 5deg,
    transparent 5deg 15deg
  );
  mask: radial-gradient(circle, #000 18%, transparent 60%);
  animation: spin 90s linear infinite;
}

.top {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
}

.numeral {
  font-family: var(--font-title);
  font-weight: 700;
  font-size: 6cqw;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  background: var(--gold-text);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 0 2cqw rgba(0, 0, 0, 0.9));
}

.seal {
  position: relative;
  width: 78cqw;
  height: 78cqw;
  display: grid;
  place-items: center;
}

.ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.ring-text {
  animation: spin 70s linear infinite;
}

.ring-ticks {
  animation: spin 45s linear infinite reverse;
}

.line {
  fill: none;
  stroke: color-mix(in srgb, var(--tone) 55%, #e3b665);
  stroke-width: 1.5;
}

.faint {
  opacity: 0.45;
}

.ticks {
  fill: none;
  stroke: color-mix(in srgb, var(--tone) 50%, #e3b665);
  stroke-width: 8;
  stroke-dasharray: 1.5 13.6;
  opacity: 0.7;
}

.diamonds path {
  fill: color-mix(in srgb, var(--tone) 40%, #f3d391);
}

.inscription {
  font-family: var(--font-title);
  font-size: 15px;
  letter-spacing: 2px;
  fill: color-mix(in srgb, var(--tone) 35%, #f3d391);
  opacity: 0.85;
}

.glow {
  position: absolute;
  width: 46%;
  height: 46%;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--tone) 70%, transparent), transparent 70%);
  filter: blur(3cqw);
  animation: pulse 3.2s ease-in-out infinite alternate;
}

.sigil {
  position: relative;
  font-size: 30cqw !important;
  width: auto !important;
  height: auto !important;
  color: color-mix(in srgb, var(--tone) 45%, #fff3d6);
  filter: drop-shadow(0 0 2.5cqw var(--tone)) drop-shadow(0 1cqw 1cqw rgba(0, 0, 0, 0.9));
  animation: hover 4s ease-in-out infinite alternate;
}

/* faíscas subindo */
.motes {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.motes span {
  position: absolute;
  bottom: 18%;
  left: calc(10% + var(--i) * 13%);
  width: 1.4cqw;
  height: 1.4cqw;
  border-radius: 50%;
  background: color-mix(in srgb, var(--tone) 60%, #fff3d6);
  box-shadow: 0 0 2cqw var(--tone);
  opacity: 0;
  animation: rise 6s ease-in calc(var(--i) * -1.1s) infinite;
}

.foot {
  position: relative;
  width: 100%;
  text-align: center;
}

.name {
  font-family: var(--font-title);
  font-weight: 700;
  font-size: 7.5cqw;
  line-height: 1.1;
  letter-spacing: 0.04em;
  color: #fbe7b4;
  text-shadow: 0 0 3cqw rgba(0, 0, 0, 0.9);
}

@keyframes spin {
  to {
    rotate: 360deg;
  }
}

@keyframes pulse {
  from {
    opacity: 0.55;
    scale: 0.9;
  }
  to {
    opacity: 1;
    scale: 1.1;
  }
}

@keyframes hover {
  from {
    translate: 0 1cqw;
  }
  to {
    translate: 0 -1cqw;
  }
}

@keyframes rise {
  0% {
    opacity: 0;
    translate: 0 0;
  }
  20% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
    translate: 0 -55cqh;
  }
}

/* miniatura da galeria: tudo parado (o quadro já flutua e gira por fora) */
.art:not(.live) .rays,
.art:not(.live) .ring-text,
.art:not(.live) .ring-ticks,
.art:not(.live) .glow,
.art:not(.live) .sigil {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  .rays,
  .ring-text,
  .ring-ticks,
  .glow,
  .sigil,
  .motes span {
    animation: none;
  }
}
</style>
