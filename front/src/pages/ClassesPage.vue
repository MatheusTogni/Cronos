<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import ClassSheet from '@/components/ClassSheet.vue'
import { errorMessage } from '@/services/api'
import { useClassesStore } from '@/stores/classes'
import type { CharacterClass } from '@/types/api'

/**
 * Galeria das classes como quadros presos num lapso de tempo: flutuam e giram
 * cada um num momento diferente da volta. Ao clicar, o quadro "voa" até a
 * tela (FLIP), fica torto em 3D à esquerda e a ficha em texto entra à direita.
 */
const classes = useClassesStore()
const { list } = storeToRefs(classes)

const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    await classes.load()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

// ───── relógio do fundo ─────
const NUMERALS = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].map((n, i) => {
  const a = (i * Math.PI) / 6
  return { n, x: 300 + 238 * Math.sin(a), y: 300 - 238 * Math.cos(a) + 9 }
})

// ───── abrir / fechar com o quadro voando ─────
const slots = new Map<string, HTMLElement>()
function setSlot(id: string, el: unknown) {
  if (el instanceof HTMLElement) slots.set(id, el)
  else slots.delete(id)
}

const selected = ref<CharacterClass | null>(null)
const show = ref(false)
const entered = ref(false)
const flat = ref(false)
const hero = ref<HTMLElement | null>(null)
const heroWrap = ref<HTMLElement | null>(null)
let closeTimer: ReturnType<typeof setTimeout> | undefined

const P = 'perspective(1400px)'
const tilt = () =>
  window.matchMedia('(max-width: 800px)').matches
    ? `${P} translate(0px, 0px) scale(1, 1) rotateY(14deg) rotateZ(-2deg)`
    : `${P} translate(0px, 0px) scale(1, 1) rotateY(24deg) rotateZ(-4deg)`
const STRAIGHT = `${P} translate(0px, 0px) scale(1, 1) rotateY(0deg) rotateZ(0deg)`

/** Transform que põe o quadro grande exatamente em cima do quadro pequeno da galeria. */
function fromSlot(id: string) {
  const box = slots.get(id)?.querySelector<HTMLElement>('.frame-box')
  const target = heroWrap.value?.getBoundingClientRect()
  if (!box || !target) return `${P} translate(0px, 0px) scale(0.3, 0.3) rotateY(0deg) rotateZ(0deg)`
  const o = box.getBoundingClientRect()
  const dx = o.left + o.width / 2 - (target.left + target.width / 2)
  const dy = o.top + o.height / 2 - (target.top + target.height / 2)
  return `${P} translate(${dx}px, ${dy}px) scale(${o.width / target.width}, ${o.height / target.height}) rotateY(0deg) rotateZ(0deg)`
}

function lockScroll(lock: boolean) {
  document.documentElement.style.overflow = lock ? 'hidden' : ''
}

async function open(cls: CharacterClass) {
  clearTimeout(closeTimer)
  selected.value = cls
  flat.value = false
  entered.value = false
  show.value = true
  lockScroll(true)
  await nextTick()
  const el = hero.value
  if (!el) return
  el.style.transition = 'none'
  el.style.transform = fromSlot(cls.id)
  void el.offsetWidth // aplica a posição inicial antes de animar
  el.style.transition = ''
  el.style.transform = tilt()
  entered.value = true
}

function close() {
  if (!show.value || !entered.value) return
  entered.value = false
  const el = hero.value
  if (el && selected.value) {
    el.style.transform = fromSlot(selected.value.id)
  }
  closeTimer = setTimeout(() => {
    show.value = false
    selected.value = null
    lockScroll(false)
  }, 700)
}

function toggleFlat() {
  flat.value = !flat.value
  if (hero.value) hero.value.style.transform = flat.value ? STRAIGHT : tilt()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

onMounted(() => {
  void load()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  clearTimeout(closeTimer)
  lockScroll(false)
})
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Classes</h1>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ error }}
      <template #append>
        <v-btn variant="text" @click="load">Tentar de novo</v-btn>
      </template>
    </v-alert>

    <v-progress-linear v-if="loading && !list.length" indeterminate color="secondary" />

    <div class="gallery">
      <!-- relógio parado no tempo, atrás dos quadros -->
      <svg class="clock" viewBox="0 0 600 600" aria-hidden="true">
        <circle cx="300" cy="300" r="290" class="c-line" />
        <circle cx="300" cy="300" r="276" class="c-line faint" />
        <circle cx="300" cy="300" r="262" class="c-ticks" />
        <circle cx="300" cy="300" r="200" class="c-line faint" />
        <text v-for="m in NUMERALS" :key="m.n" :x="m.x" :y="m.y" class="c-num">{{ m.n }}</text>
        <line x1="300" y1="300" x2="300" y2="150" class="hand hand-h" />
        <line x1="300" y1="320" x2="300" y2="90" class="hand hand-m" />
        <circle cx="300" cy="300" r="8" class="c-pin" />
      </svg>

      <div class="grid">
        <button
          v-for="(cls, i) in list"
          :key="cls.id"
          :ref="(el) => setSlot(cls.id, el)"
          type="button"
          class="slot"
          :class="{ taken: show && selected?.id === cls.id }"
          :style="{ '--accent': cls.color, '--delay': `${-i * 3.7}s`, '--float-delay': `${-i * 1.3}s` }"
          :aria-label="`Ver a classe ${cls.name}`"
          @click="open(cls)"
        >
          <div class="frame-box">
            <div class="float">
              <div class="spinner">
                <div class="face">
                  <div class="frame">
                    <img :src="cls.artFile" alt="" loading="lazy" />
                    <div class="glare" />
                  </div>
                </div>
                <div class="face back">
                  <div class="frame">
                    <div class="back-inner">
                      <img src="/pwa-192x192.png" alt="" class="back-emblem" />
                      <div class="back-name">{{ cls.name }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="ground-shadow" />
          </div>

          <div class="plaque">
            <div class="plaque-name">{{ cls.name }}</div>
            <div class="plaque-cats">{{ cls.categories.join(' · ') }}</div>
          </div>
        </button>
      </div>
    </div>

    <!-- ───── classe aberta ───── -->
    <Teleport to=".v-application">
      <div
        v-if="show && selected"
        class="cx"
        :class="{ entered }"
        :style="{ '--accent': selected.color }"
        role="dialog"
        aria-modal="true"
        :aria-label="`Classe ${selected.name}`"
      >
        <div class="cx-backdrop" @click="close" />

        <div class="cx-stage">
          <div ref="heroWrap" class="cx-hero-wrap">
            <div
              ref="hero"
              class="cx-hero"
              :class="{ flat }"
              role="button"
              tabindex="0"
              :title="flat ? 'Inclinar de novo' : 'Endireitar a ficha'"
              @click="toggleFlat"
              @keydown.enter.prevent="toggleFlat"
            >
              <div class="frame">
                <img :src="selected.artFile" :alt="`Ficha original: ${selected.name}`" />
                <div class="glare" />
              </div>
            </div>
            <div class="cx-hint">
              <v-icon :icon="flat ? 'mdi-rotate-3d-variant' : 'mdi-magnify-plus-outline'" size="small" />
              {{ flat ? 'Toque para inclinar' : 'Toque para endireitar a ficha' }}
            </div>
          </div>

          <div class="cx-panel card-frame">
            <ClassSheet :cls="selected" />
          </div>
        </div>

        <v-btn
          class="cx-close"
          icon="mdi-close"
          variant="flat"
          color="surface-bright"
          aria-label="Fechar"
          @click="close"
        />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* ─────────── galeria ─────────── */
.gallery {
  position: relative;
  padding-top: 12px;
  /* o relógio girando passa da largura na diagonal; sem isto a página ficava
     mais larga que a tela no celular (e o X do quadro aberto sumia à direita) */
  overflow-x: clip;
}

.clock {
  position: absolute;
  top: -40px;
  left: 50%;
  width: min(900px, 100%);
  transform: translateX(-50%);
  opacity: 0.13;
  pointer-events: none;
  animation: clock-spin 240s linear infinite;
}

@keyframes clock-spin {
  to {
    transform: translateX(-50%) rotate(-360deg);
  }
}

.c-line {
  fill: none;
  stroke: #d4a04c;
  stroke-width: 2;
}

.faint {
  opacity: 0.5;
}

.c-ticks {
  fill: none;
  stroke: #d4a04c;
  stroke-width: 14;
  stroke-dasharray: 2 25.4;
}

.c-num {
  font-family: var(--font-title);
  font-size: 34px;
  font-weight: 700;
  fill: #d4a04c;
  text-anchor: middle;
}

.hand {
  stroke: #e3b665;
  stroke-linecap: round;
  transform-origin: 300px 300px;
}

.hand-h {
  stroke-width: 10;
  animation: hand 60s linear infinite;
}

.hand-m {
  stroke-width: 5;
  animation: hand 8s linear infinite;
}

@keyframes hand {
  to {
    transform: rotate(360deg);
  }
}

.c-pin {
  fill: #e3b665;
}

.grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 44px 30px;
}

@media (max-width: 520px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 34px 18px;
  }
}

.slot {
  --accent: var(--crimson);
  display: block;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: center;
  cursor: pointer;
}

.slot.taken .frame-box {
  visibility: hidden;
}

.slot:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 8px;
  border-radius: 4px;
}

.frame-box {
  position: relative;
  aspect-ratio: 2 / 3;
  perspective: 1000px;
}

.float {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  animation: float 5s ease-in-out var(--float-delay) infinite alternate;
}

@keyframes float {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-12px);
  }
}

/* balança, dá a volta mostrando o verso, volta a balançar — sem emenda */
.spinner {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  animation: timeloop 26s ease-in-out var(--delay) infinite;
}

@keyframes timeloop {
  0% {
    transform: rotateY(-10deg) rotateZ(-1deg);
  }
  20% {
    transform: rotateY(10deg) rotateZ(1deg);
  }
  40% {
    transform: rotateY(-10deg) rotateZ(-1deg);
  }
  52% {
    transform: rotateY(180deg) rotateZ(0deg);
  }
  60% {
    transform: rotateY(180deg) rotateZ(0deg);
  }
  72% {
    transform: rotateY(350deg) rotateZ(-1deg);
  }
  86% {
    transform: rotateY(370deg) rotateZ(1deg);
  }
  100% {
    transform: rotateY(350deg) rotateZ(-1deg);
  }
}

.slot:hover .spinner,
.slot:hover .float,
.slot:focus-visible .spinner,
.slot:focus-visible .float {
  animation-play-state: paused;
}

.slot:hover .frame,
.slot:focus-visible .frame {
  box-shadow:
    inset 0 0 0 1px rgba(255, 240, 200, 0.7),
    inset 0 0 0 3px rgba(0, 0, 0, 0.35),
    0 0 0 1px #1a1008,
    0 18px 30px rgba(0, 0, 0, 0.6),
    0 0 40px color-mix(in srgb, var(--accent) 70%, transparent);
}

.face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.face.back {
  transform: rotateY(180deg);
}

.ground-shadow {
  position: absolute;
  left: 18%;
  right: 18%;
  bottom: -22px;
  height: 14px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(0, 0, 0, 0.75), transparent 70%);
  animation: shadow 5s ease-in-out var(--float-delay) infinite alternate;
}

@keyframes shadow {
  to {
    transform: scaleX(0.8);
    opacity: 0.6;
  }
}

/* ─────────── moldura dourada (galeria e quadro aberto) ─────────── */
.frame {
  position: absolute;
  inset: 0;
  padding: 9px;
  border-radius: 3px;
  background: linear-gradient(135deg, #f6dc9c 0%, #a36c2c 22%, #f0c97a 45%, #7a4b1c 70%, #e3b665 100%);
  box-shadow:
    inset 0 0 0 1px rgba(255, 240, 200, 0.6),
    inset 0 0 0 3px rgba(0, 0, 0, 0.35),
    0 0 0 1px #1a1008,
    0 18px 30px rgba(0, 0, 0, 0.6),
    0 0 26px color-mix(in srgb, var(--accent) 35%, transparent);
  transition: box-shadow 0.3s;
}

.frame > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top;
  border: 2px solid #2a1a0c;
  background: #0b0810;
}

/* chanfro escuro por dentro da moldura */
.frame::before {
  content: '';
  position: absolute;
  inset: 9px;
  z-index: 1;
  pointer-events: none;
  box-shadow:
    inset 0 0 22px rgba(0, 0, 0, 0.85),
    inset 0 0 0 1px rgba(0, 0, 0, 0.8);
}

/* rosetas nos cantos */
.frame::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background:
    radial-gradient(circle at 4.5px 4.5px, #fff3c8 0 1.8px, #6b4219 2.2px 3.2px, transparent 3.6px),
    radial-gradient(circle at calc(100% - 4.5px) 4.5px, #fff3c8 0 1.8px, #6b4219 2.2px 3.2px, transparent 3.6px),
    radial-gradient(circle at 4.5px calc(100% - 4.5px), #fff3c8 0 1.8px, #6b4219 2.2px 3.2px, transparent 3.6px),
    radial-gradient(circle at calc(100% - 4.5px) calc(100% - 4.5px), #fff3c8 0 1.8px, #6b4219 2.2px 3.2px, transparent 3.6px);
}

/* reflexo de vidro passando */
.glare {
  position: absolute;
  inset: 9px;
  z-index: 1;
  pointer-events: none;
  background: linear-gradient(115deg, transparent 35%, rgba(255, 255, 255, 0.16) 48%, transparent 60%);
  background-size: 260% 100%;
  animation: glare 7s ease-in-out infinite;
}

@keyframes glare {
  0%,
  20% {
    background-position: 130% 0;
  }
  70%,
  100% {
    background-position: -60% 0;
  }
}

.back-inner {
  position: absolute;
  inset: 9px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border: 2px solid #2a1a0c;
  background:
    repeating-conic-gradient(from 0deg at 50% 42%, rgba(212, 160, 76, 0.07) 0 6deg, transparent 6deg 18deg),
    radial-gradient(circle at 50% 42%, #2c1a3c, #0b0810 75%);
}

.back-emblem {
  width: 52%;
  border-radius: 50%;
  border: 1px solid rgba(212, 160, 76, 0.6);
  box-shadow: 0 0 24px rgba(212, 160, 76, 0.35);
}

.back-name {
  font-family: var(--font-title);
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--gold);
  padding: 0 8px;
}

/* plaquinha de latão embaixo do quadro */
.plaque {
  position: relative;
  margin: 30px auto 0;
  max-width: 92%;
  padding: 7px 12px 8px;
  background: linear-gradient(180deg, #3d2c18, #1c130b);
  border: 1px solid rgba(212, 160, 76, 0.6);
  clip-path: polygon(8px 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 8px 100%, 0 50%);
  box-shadow: inset 0 1px 0 rgba(255, 230, 180, 0.2);
  transition: filter 0.25s;
}

.slot:hover .plaque {
  filter: brightness(1.25);
}

.plaque-name {
  font-family: var(--font-title);
  font-weight: 700;
  font-size: 1.02rem;
  letter-spacing: 0.06em;
  background: var(--gold-text);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.plaque-cats {
  font-size: 0.8rem;
  opacity: 0.65;
}

/* ─────────── classe aberta ─────────── */
.cx {
  position: fixed;
  inset: 0;
  z-index: 2400;
  display: grid;
  place-items: center;
  font-family: var(--font-body);
  font-size: 1.05rem;
}

.cx-backdrop {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 28% 50%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 55%),
    radial-gradient(ellipse at center, rgba(40, 20, 64, 0.75), rgba(4, 2, 6, 0.95) 70%);
  opacity: 0;
  transition: opacity 0.45s ease;
}

.cx.entered .cx-backdrop {
  opacity: 1;
}

.cx-stage {
  position: relative;
  width: min(1200px, calc(100% - 32px));
  height: min(86vh, 920px);
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1fr);
  gap: 56px;
  align-items: center;
  pointer-events: none;
}

.cx-hero-wrap {
  position: relative;
  justify-self: center;
  width: min(100%, calc(80vh * 2 / 3));
  aspect-ratio: 2 / 3;
  pointer-events: auto;
}

.cx-hero {
  position: absolute;
  inset: 0;
  transform-origin: center;
  transition: transform 0.7s cubic-bezier(0.2, 0.85, 0.25, 1);
  will-change: transform;
  cursor: zoom-in;
}

.cx-hero.flat {
  cursor: zoom-out;
}

.cx-hero .frame {
  padding: 12px;
  box-shadow:
    inset 0 0 0 1px rgba(255, 240, 200, 0.6),
    inset 0 0 0 3px rgba(0, 0, 0, 0.35),
    0 0 0 1px #1a1008,
    -30px 40px 60px rgba(0, 0, 0, 0.7),
    0 0 70px color-mix(in srgb, var(--accent) 45%, transparent);
}

.cx-hero .frame::before,
.cx-hero .glare {
  inset: 12px;
}

.cx-hero:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 6px;
}

.cx-hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -34px;
  text-align: center;
  font-size: 0.85rem;
  opacity: 0;
  transition: opacity 0.4s 0.5s;
}

.cx.entered .cx-hint {
  opacity: 0.6;
}

.cx-panel {
  max-height: 100%;
  overflow-y: auto;
  padding: 26px 28px;
  background-color: rgba(22, 16, 28, 0.94);
  border-radius: 4px;
  pointer-events: auto;
  opacity: 0;
  transform: translateX(48px);
  transition:
    opacity 0.45s ease 0.25s,
    transform 0.6s cubic-bezier(0.2, 0.85, 0.25, 1) 0.25s;
}

.cx.entered .cx-panel {
  opacity: 1;
  transform: none;
}

.cx:not(.entered) .cx-panel {
  transition-delay: 0s;
}

.cx-close {
  position: fixed;
  z-index: 3;
  top: max(12px, env(safe-area-inset-top));
  right: max(12px, env(safe-area-inset-right));
  border: 1px solid var(--border-strong);
  opacity: 0;
  transition: opacity 0.3s 0.3s;
}

.cx.entered .cx-close {
  opacity: 1;
}

/* celular: quadro em cima, ficha embaixo */
@media (max-width: 800px) {
  .cx-stage {
    height: calc(100dvh - 32px);
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    gap: 40px;
    align-items: start;
    padding-top: 8px;
  }

  .cx-hero-wrap {
    width: min(48vw, calc(34dvh * 2 / 3));
  }

  .cx-hint {
    bottom: -28px;
    font-size: 0.78rem;
  }

  .cx-panel {
    padding: 20px 18px;
    transform: translateY(40px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner,
  .float,
  .clock,
  .hand,
  .glare,
  .ground-shadow {
    animation: none;
  }
}
</style>
