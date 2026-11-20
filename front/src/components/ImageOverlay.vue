<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

/**
 * Imagem que o mestre está mostrando. Abre sozinha quando o mestre mostra uma
 * imagem e só fecha quando o mestre a oculta — o jogador não consegue fechar.
 *
 * Abertura: a tela começa tomada de fumaça, que se abre para os lados e
 * revela a imagem no centro; depois a fumaça continua rolando nas laterais.
 */
const props = defineProps<{ image: { id: string; url: string } | null }>()

const open = computed(() => !!props.image)
const revealed = ref(false)

// a cada imagem nova, a fumaça começa fechada e se abre no quadro seguinte
watch(
  () => props.image?.id,
  async (id) => {
    revealed.value = false
    if (!id) return
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => (revealed.value = true)))
  },
  { immediate: true },
)

// ───── textura de fumaça: ruído fractal em SVG, desenhado uma vez pelo navegador ─────
const smokeTexture = (seed: number, tint: [number, number, number]) => {
  const [r, g, b] = tint
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'>` +
    `<filter id='n' x='0' y='0'><feTurbulence type='fractalNoise' baseFrequency='0.008' numOctaves='5' seed='${seed}'/>` +
    `<feColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 1.6 -0.45'/></filter>` +
    `<rect width='100%' height='100%' filter='url(#n)'/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
const TEXTURES = [
  smokeTexture(3, [0.8, 0.76, 0.86]), // cinza lavanda
  smokeTexture(11, [0.72, 0.68, 0.8]), // mais escura
  smokeTexture(27, [0.88, 0.8, 0.7]), // tocada de dourado
]

/** Gerador fixo: a fumaça é sempre "aleatória" do mesmo jeito (sem pular a cada render). */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

interface Puff {
  style: Record<string, string>
}

/** Nuvens grossas que formam cada banco de fumaça. */
function bank(seed: number, count: number): Puff[] {
  const rnd = seeded(seed)
  return Array.from({ length: count }, (_, i) => {
    // vmin: no celular em pé a nuvem não fica maior que a tela
    const size = 35 + rnd() * 35
    // centro da nuvem dentro do banco (5% a 72% da largura dele)
    const center = 5 + rnd() * 67
    return {
      style: {
        width: `${size}vmin`,
        height: `${size}vmin`,
        top: `calc(${(i / count) * 100 + rnd() * 8}% - ${size / 2}vmin)`,
        left: `calc(${center}% - ${size / 2}vmin)`,
        backgroundImage: TEXTURES[i % TEXTURES.length]!,
        '--dx': `${(rnd() - 0.5) * 10}vw`,
        '--dy': `${(rnd() - 0.5) * 12}vh`,
        '--rot': `${(rnd() - 0.5) * 50}deg`,
        '--o': `${0.55 + rnd() * 0.4}`,
        animationDuration: `${16 + rnd() * 14}s`,
        animationDelay: `${-rnd() * 20}s`,
      },
    }
  })
}

/** Fiapos que atravessam as laterais, por cima das bordas da imagem. */
function wisps(seed: number, count: number): Puff[] {
  const rnd = seeded(seed)
  return Array.from({ length: count }, (_, i) => {
    const size = 30 + rnd() * 25
    return {
      style: {
        width: `${size}vmin`,
        height: `${size * 0.6}vmin`,
        top: `${(i / count) * 100 - 10 + rnd() * 10}%`,
        backgroundImage: TEXTURES[(i + 1) % TEXTURES.length]!,
        '--rot': `${(rnd() - 0.5) * 30}deg`,
        animationDuration: `${10 + rnd() * 8}s`,
        animationDelay: `${-rnd() * 18}s`,
      },
    }
  })
}

// celular: menos nuvens (cada uma é uma camada grande na placa de vídeo)
const small = typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches
const LEFT = bank(7, small ? 7 : 12)
const RIGHT = bank(19, small ? 7 : 12)
const WISPS_LEFT = wisps(31, small ? 3 : 5)
const WISPS_RIGHT = wisps(43, small ? 3 : 5)
</script>

<template>
  <v-dialog :model-value="open" fullscreen persistent no-click-animation transition="fade-transition">
    <div v-if="image" class="overlay" :class="{ revealed }">
      <div class="stage">
        <img :src="image.url" alt="Imagem do mestre" class="overlay-img" />
      </div>

      <!-- bancos de fumaça: cobrem tudo e se abrem para os lados -->
      <div class="smoke smoke-left" aria-hidden="true">
        <span v-for="(p, i) in LEFT" :key="i" class="puff" :style="p.style" />
      </div>
      <div class="smoke smoke-right" aria-hidden="true">
        <span v-for="(p, i) in RIGHT" :key="i" class="puff" :style="p.style" />
      </div>

      <!-- fiapos passando pelas bordas da imagem, sem parar -->
      <div class="wisps wisps-left" aria-hidden="true">
        <span v-for="(p, i) in WISPS_LEFT" :key="i" class="wisp" :style="p.style" />
      </div>
      <div class="wisps wisps-right" aria-hidden="true">
        <span v-for="(p, i) in WISPS_RIGHT" :key="i" class="wisp" :style="p.style" />
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
.overlay {
  /* quanto cada banco fica para dentro da tela depois de aberto */
  --rest: 26vw;
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: radial-gradient(ellipse at center, #1a1220 0%, #050305 75%);
}

@media (max-width: 700px) {
  .overlay {
    --rest: 16vw;
  }
}

/* ─────────── imagem ─────────── */
.stage {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
}

.overlay-img {
  max-width: 100%;
  max-height: calc(100dvh - 90px);
  object-fit: contain;
  border-radius: 8px;
  box-shadow:
    0 10px 40px rgba(0, 0, 0, 0.6),
    0 0 60px rgba(212, 160, 76, 0.15);
  opacity: 0;
  filter: blur(14px) brightness(0.6);
  transform: scale(1.06);
  transition:
    opacity 1.6s ease 0.5s,
    filter 2s ease 0.5s,
    transform 2.6s cubic-bezier(0.2, 0.8, 0.2, 1) 0.4s;
}

.revealed .overlay-img {
  opacity: 1;
  filter: none;
  transform: none;
}

/* ─────────── bancos de fumaça ─────────── */
.smoke {
  position: absolute;
  top: -10%;
  bottom: -10%;
  width: 75vw;
  pointer-events: none;
  transition: transform 2.8s cubic-bezier(0.55, 0.05, 0.2, 1);
}

/* fechados: cada um passa do meio da tela, cobrindo tudo */
.smoke-left {
  left: -15vw;
  transform: translateX(0);
}

.smoke-right {
  right: -15vw;
  transform: translateX(0) scaleX(-1);
}

/* véu denso por baixo das nuvens: garante a tela toda tomada antes de abrir
   e escurece as laterais depois */
.smoke::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to right,
    rgba(30, 24, 36, 0.97) 0%,
    rgba(30, 24, 36, 0.9) 55%,
    rgba(30, 24, 36, 0.45) 80%,
    transparent 100%
  );
}

/* abertos: recuam e ficam só nas laterais */
.revealed .smoke-left {
  transform: translateX(calc(-75vw + 15vw + var(--rest)));
}

.revealed .smoke-right {
  transform: translateX(calc(75vw - 15vw - var(--rest))) scaleX(-1);
}

.puff {
  position: absolute;
  border-radius: 50%;
  background-size: cover;
  /* borda macia: a textura some num degradê radial */
  -webkit-mask-image: radial-gradient(circle, #000 18%, rgba(0, 0, 0, 0.6) 42%, transparent 68%);
  mask-image: radial-gradient(circle, #000 18%, rgba(0, 0, 0, 0.6) 42%, transparent 68%);
  opacity: var(--o);
  will-change: transform;
  animation: drift ease-in-out infinite alternate;
}

@keyframes drift {
  from {
    transform: translate(0, 0) rotate(0deg) scale(1);
  }
  to {
    transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(1.18);
  }
}

/* ─────────── fiapos ─────────── */
.wisps {
  position: absolute;
  top: 0;
  bottom: 0;
  width: calc(var(--rest) + 22vw);
  pointer-events: none;
  opacity: 0;
  transition: opacity 1.5s ease 2s;
}

.wisps-left {
  left: 0;
}

.wisps-right {
  right: 0;
  transform: scaleX(-1);
}

.revealed .wisps {
  opacity: 1;
}

.wisp {
  position: absolute;
  left: -30vmin;
  border-radius: 50%;
  background-size: cover;
  -webkit-mask-image: radial-gradient(ellipse, #000 10%, transparent 65%);
  mask-image: radial-gradient(ellipse, #000 10%, transparent 65%);
  opacity: 0;
  will-change: transform, opacity;
  animation: pass linear infinite;
}

/* entra pela borda da tela, avança um pouco sobre a imagem e se desfaz */
@keyframes pass {
  0% {
    opacity: 0;
    transform: translate(0, 0) rotate(0deg) scale(0.9);
  }
  25% {
    opacity: 0.55;
  }
  70% {
    opacity: 0.35;
  }
  100% {
    opacity: 0;
    transform: translate(calc(var(--rest) + 30vmin), -6vh) rotate(var(--rot)) scale(1.25);
  }
}

/* sem animação: a fumaça só se afasta, sem rolar */
@media (prefers-reduced-motion: reduce) {
  .puff,
  .wisp {
    animation: none;
  }

  .wisps {
    display: none;
  }

  .smoke,
  .overlay-img {
    transition-duration: 0.01s;
    transition-delay: 0s;
  }
}
</style>
