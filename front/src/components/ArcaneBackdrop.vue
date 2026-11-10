<script setup lang="ts">
/**
 * Fundo fixo de todas as telas: névoa roxa à deriva, estrelas piscando e
 * brasas subindo — o clima do ícone. Só decoração (aria-hidden, sem clique).
 */
const EMBERS = 22

const rand = (min: number, max: number) => min + Math.random() * (max - min)

const embers = Array.from({ length: EMBERS }, () => ({
  left: `${rand(0, 100)}%`,
  '--size': `${rand(2, 4.5)}px`,
  '--drift': `${rand(-90, 90)}px`,
  '--dur': `${rand(9, 20)}s`,
  '--delay': `${rand(-20, 0)}s`,
  '--peak': rand(0.45, 0.95).toFixed(2),
}))
</script>

<template>
  <div class="backdrop" aria-hidden="true">
    <div class="fog fog-a" />
    <div class="fog fog-b" />
    <div class="fog fog-c" />
    <div class="stars stars-a" />
    <div class="stars stars-b" />
    <span v-for="(e, i) in embers" :key="i" class="ember" :style="e" />
    <div class="grain" />
    <div class="vignette" />
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background:
    radial-gradient(ellipse 120% 70% at 50% -10%, rgba(91, 58, 134, 0.28), transparent 60%),
    radial-gradient(ellipse 80% 50% at 50% 110%, rgba(168, 50, 43, 0.12), transparent 70%),
    #0b0810;
}

/* ───── névoa ───── */
.fog {
  position: absolute;
  width: 140vmax;
  height: 140vmax;
  border-radius: 50%;
  opacity: 0.55;
  will-change: transform;
}

.fog-a {
  top: -70vmax;
  left: -60vmax;
  background: radial-gradient(circle, rgba(76, 44, 118, 0.35) 0%, transparent 55%);
  animation: drift-a 70s ease-in-out infinite alternate;
}

.fog-b {
  bottom: -80vmax;
  right: -70vmax;
  background: radial-gradient(circle, rgba(60, 30, 96, 0.4) 0%, transparent 55%);
  animation: drift-b 90s ease-in-out infinite alternate;
}

.fog-c {
  top: -20vmax;
  right: -90vmax;
  background: radial-gradient(circle, rgba(120, 60, 40, 0.14) 0%, transparent 50%);
  animation: drift-a 110s ease-in-out infinite alternate-reverse;
}

@keyframes drift-a {
  to {
    transform: translate(18vmax, 12vmax) scale(1.1);
  }
}

@keyframes drift-b {
  to {
    transform: translate(-22vmax, -10vmax) scale(1.15);
  }
}

/* ───── estrelas ───── */
.stars {
  position: absolute;
  inset: 0;
  background-repeat: repeat;
}

.stars-a {
  background-image:
    radial-gradient(1px 1px at 20px 30px, rgba(243, 211, 145, 0.9), transparent),
    radial-gradient(1px 1px at 120px 80px, rgba(255, 255, 255, 0.7), transparent),
    radial-gradient(1.5px 1.5px at 200px 160px, rgba(243, 211, 145, 0.8), transparent),
    radial-gradient(1px 1px at 300px 40px, rgba(255, 255, 255, 0.6), transparent),
    radial-gradient(1px 1px at 60px 220px, rgba(255, 255, 255, 0.5), transparent);
  background-size: 340px 260px;
  animation: twinkle 6s ease-in-out infinite alternate;
}

.stars-b {
  background-image:
    radial-gradient(1px 1px at 80px 120px, rgba(255, 255, 255, 0.55), transparent),
    radial-gradient(2px 2px at 260px 210px, rgba(243, 211, 145, 0.7), transparent),
    radial-gradient(1px 1px at 400px 60px, rgba(255, 255, 255, 0.5), transparent);
  background-size: 470px 330px;
  animation: twinkle 9s ease-in-out -3s infinite alternate;
}

@keyframes twinkle {
  from {
    opacity: 0.25;
  }
  to {
    opacity: 0.75;
  }
}

/* ───── brasas ───── */
.ember {
  position: absolute;
  bottom: -12px;
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  background: radial-gradient(circle, #fff2c4 0%, #f0b45a 45%, rgba(214, 110, 40, 0) 75%);
  box-shadow: 0 0 6px 1px rgba(240, 170, 80, 0.55);
  opacity: 0;
  animation: rise var(--dur) linear var(--delay) infinite;
}

@keyframes rise {
  0% {
    transform: translate(0, 0);
    opacity: 0;
  }
  10% {
    opacity: var(--peak);
  }
  60% {
    opacity: calc(var(--peak) * 0.7);
  }
  100% {
    transform: translate(var(--drift), -105vh);
    opacity: 0;
  }
}

/* ───── textura e vinheta ───── */
.grain {
  position: absolute;
  inset: 0;
  opacity: 0.07;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 .9  0 0 0 0 .75  0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
}

.vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.75) 100%);
}

@media (prefers-reduced-motion: reduce) {
  .ember {
    display: none;
  }
}
</style>
