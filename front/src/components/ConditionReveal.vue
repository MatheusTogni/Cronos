<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ConditionArt from '@/components/ConditionArt.vue'
import { useLiteStore } from '@/stores/lite'
import type { Condition, ConditionDef } from '@/types/api'
import { conditionArt } from '@/utils/conditionArt'
import { buzz } from '@/utils/haptics'

/**
 * Quando o mestre coloca uma condição no personagem, a carta dela aparece na
 * tela do jogador: chega girando, assenta e fica balançando e flutuando como
 * nos quadros da galeria de condições, com a arte viva por dentro.
 * Só dispara quando uma condição NOVA surge com a tela aberta: carregar a
 * campanha não conta, e tirar condição não faz efeito nenhum. Várias de uma vez
 * entram na fila, uma carta depois da outra. No modo leve e com movimento
 * reduzido, a carta só aparece, sem girar.
 */
const props = defineProps<{ conditions: Condition[] | undefined }>()

const lite = useLiteStore()

const queue = ref<Condition[]>([])
const current = ref<Condition | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
let gap: ReturnType<typeof setTimeout> | undefined

/** A carta usa o mesmo desenho da galeria; condição avulsa cai no ícone da polaridade. */
const def = computed<ConditionDef | null>(() => {
  const c = current.value
  if (!c) return null
  return {
    id: c.defId ?? 'avulsa',
    name: c.name,
    description: c.description ?? '',
    polarity: c.polarity,
    sortOrder: 0,
  }
})
const tone = computed(() => (def.value ? conditionArt(def.value.id, def.value.polarity).color : '#c9a227'))

function next() {
  clearTimeout(timer)
  current.value = queue.value.shift() ?? null
  if (!current.value) return
  buzz([90, 60, 160])
  timer = setTimeout(close, lite.lite ? 3200 : 5200)
}

function close() {
  clearTimeout(timer)
  current.value = null
  // dá tempo da carta sair antes de entrar a seguinte
  if (queue.value.length) {
    gap = setTimeout(() => {
      gap = undefined
      next()
    }, 400)
  }
}

watch(
  () => props.conditions?.map((c) => c.id).join(','),
  (now, before) => {
    if (now === undefined || before === undefined) return
    const had = new Set(before ? before.split(',') : [])
    const added = (props.conditions ?? []).filter((c) => !had.has(c.id))
    if (!added.length) return
    queue.value.push(...added)
    if (!current.value && gap === undefined) next()
  },
)

onBeforeUnmount(() => {
  clearTimeout(timer)
  clearTimeout(gap)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="cr">
      <div
        v-if="current && def"
        class="cr"
        :style="{ '--tone': tone }"
        role="status"
        aria-live="polite"
        :aria-label="`Nova condição: ${def.name}`"
        @click="close"
      >
        <div class="rays" aria-hidden="true" />

        <div class="stage">
          <div class="kicker">Nova condição</div>

          <div class="card-wrap">
            <div class="burst" aria-hidden="true" />
            <div class="float">
              <div class="spin">
                <div class="sway">
                  <div class="face">
                    <div class="frame">
                      <ConditionArt class="inner" :def="def" :live="!lite.lite" />
                      <div class="glare" />
                    </div>
                  </div>
                  <div class="face back">
                    <div class="frame">
                      <div class="back-inner">
                        <img src="/pwa-192x192.png" alt="" class="back-emblem" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="ground-shadow" aria-hidden="true" />
          </div>

          <div v-if="queue.length" class="hint">
            +{{ queue.length }} {{ queue.length === 1 ? 'condição' : 'condições' }} a seguir
          </div>
          <div v-else class="hint">Toque para fechar</div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cr {
  --tone: #c9a227;
  position: fixed;
  inset: 0;
  z-index: 2600;
  display: grid;
  place-items: center;
  overflow: hidden;
  cursor: pointer;
  background: radial-gradient(ellipse at center, color-mix(in srgb, var(--tone) 30%, rgba(14, 8, 20, 0.4)), rgba(2, 1, 4, 0.9) 72%);
}

.rays {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 160vmax;
  height: 160vmax;
  translate: -50% -50%;
  background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--tone) 18%, transparent) 0 6deg, transparent 6deg 18deg);
  mask-image: radial-gradient(circle, #000 0%, transparent 38%);
  animation: spin-slow 40s linear infinite;
  pointer-events: none;
}

.stage {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 22px;
}

.kicker {
  font-family: var(--font-title);
  font-size: 0.85rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--gold-bright);
  text-shadow: 0 0 14px color-mix(in srgb, var(--tone) 80%, transparent);
  animation: fade-up 0.6s ease 0.2s both;
}

.hint {
  font-size: 0.85rem;
  opacity: 0.6;
  animation: fade-up 0.6s ease 1.2s both;
}

/* ─────────── a carta ─────────── */
.card-wrap {
  position: relative;
  width: min(60vw, 280px, calc(52dvh * 2 / 3));
  aspect-ratio: 2 / 3;
  perspective: 1000px;
}

.float {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  animation: float 4.5s ease-in-out 1.4s infinite alternate;
}

/* chega girando e desacelera até ficar de frente */
.spin {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  animation: arrive 1.5s cubic-bezier(0.15, 0.8, 0.25, 1) both;
}

/* depois balança de leve, como os quadros da galeria */
.sway {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  animation: sway 6s ease-in-out 1.5s infinite alternate backwards;
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

/* clarão de cor atrás da carta quando ela assenta */
.burst {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 150%;
  aspect-ratio: 1;
  translate: -50% -50%;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--tone) 65%, transparent), transparent 65%);
  opacity: 0;
  animation: burst 1.4s ease-out 0.7s both;
  pointer-events: none;
}

.ground-shadow {
  position: absolute;
  left: 18%;
  right: 18%;
  bottom: -26px;
  height: 14px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(0, 0, 0, 0.75), transparent 70%);
  animation: shadow 4.5s ease-in-out 1.4s infinite alternate;
}

/* ─────────── moldura dourada (a mesma da galeria) ─────────── */
.frame {
  position: absolute;
  inset: 0;
  padding: 11px;
  border-radius: 3px;
  background: linear-gradient(135deg, #f6dc9c 0%, #a36c2c 22%, #f0c97a 45%, #7a4b1c 70%, #e3b665 100%);
  box-shadow:
    inset 0 0 0 1px rgba(255, 240, 200, 0.6),
    inset 0 0 0 3px rgba(0, 0, 0, 0.35),
    0 0 0 1px #1a1008,
    -24px 34px 50px rgba(0, 0, 0, 0.7),
    0 0 60px color-mix(in srgb, var(--tone) 55%, transparent);
}

.frame > .inner {
  display: block;
  width: 100%;
  height: 100%;
  border: 2px solid #2a1a0c;
  background: #0b0810;
}

.frame::before {
  content: '';
  position: absolute;
  inset: 11px;
  z-index: 1;
  pointer-events: none;
  box-shadow:
    inset 0 0 22px rgba(0, 0, 0, 0.85),
    inset 0 0 0 1px rgba(0, 0, 0, 0.8);
}

.frame::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background:
    radial-gradient(circle at 5.5px 5.5px, #fff3c8 0 2px, #6b4219 2.6px 3.8px, transparent 4.2px),
    radial-gradient(circle at calc(100% - 5.5px) 5.5px, #fff3c8 0 2px, #6b4219 2.6px 3.8px, transparent 4.2px),
    radial-gradient(circle at 5.5px calc(100% - 5.5px), #fff3c8 0 2px, #6b4219 2.6px 3.8px, transparent 4.2px),
    radial-gradient(circle at calc(100% - 5.5px) calc(100% - 5.5px), #fff3c8 0 2px, #6b4219 2.6px 3.8px, transparent 4.2px);
}

.glare {
  position: absolute;
  inset: 11px;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
}

.glare::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 60%;
  background: linear-gradient(115deg, transparent 20%, rgba(255, 255, 255, 0.18) 50%, transparent 80%);
  transform: translateX(-120%);
  animation: glare 5s ease-in-out 1.2s infinite;
}

.back-inner {
  position: absolute;
  inset: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
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

/* ─────────── animações ─────────── */
@keyframes arrive {
  0% {
    transform: translateY(40px) scale(0.2) rotateY(-900deg);
    opacity: 0;
  }
  25% {
    opacity: 1;
  }
  100% {
    transform: translateY(0) scale(1) rotateY(0deg);
    opacity: 1;
  }
}

@keyframes sway {
  from {
    transform: rotateY(-9deg) rotateZ(-1deg);
  }
  to {
    transform: rotateY(9deg) rotateZ(1deg);
  }
}

@keyframes float {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-12px);
  }
}

@keyframes shadow {
  to {
    transform: scaleX(0.8);
    opacity: 0.6;
  }
}

@keyframes burst {
  0% {
    opacity: 0;
    scale: 0.4;
  }
  30% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
    scale: 1.5;
  }
}

@keyframes glare {
  0%,
  20% {
    transform: translateX(-120%);
  }
  70%,
  100% {
    transform: translateX(220%);
  }
}

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes spin-slow {
  to {
    rotate: 360deg;
  }
}

.cr-enter-active,
.cr-leave-active {
  transition: opacity 0.35s ease;
}

.cr-enter-from,
.cr-leave-to {
  opacity: 0;
}

/* modo leve e movimento reduzido: a carta só aparece, parada */
html.lite .cr .rays,
html.lite .cr .burst,
html.lite .cr .float,
html.lite .cr .spin,
html.lite .cr .sway,
html.lite .cr .ground-shadow,
html.lite .cr .glare::before,
html.lite .cr .kicker,
html.lite .cr .hint {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  .rays,
  .burst,
  .float,
  .spin,
  .sway,
  .ground-shadow,
  .glare::before,
  .kicker,
  .hint {
    animation: none;
  }
}
</style>
