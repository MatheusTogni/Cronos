<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useLiteStore } from '@/stores/lite'
import { buzz } from '@/utils/haptics'

/**
 * Efeito de tela quando o personagem sobe de nível (o mestre sobe o nível dele).
 * Só dispara quando o nível AUMENTA com a tela aberta: carregar a campanha ou
 * reconectar não conta. No modo leve fica um aviso simples, sem animação.
 */
const props = defineProps<{
  level: number | undefined
  hpPerLevel?: number
  manaPerLevel?: number
  /** As habilidades da classe, para avisar quais abriram neste nível. */
  skills?: { name: string; unlockLevel: number }[]
}>()

const lite = useLiteStore()
const shown = ref(false)
const reached = ref(0)
const hpGain = ref(0)
const manaGain = ref(0)
const unlocked = ref<string[]>([])
let timer: ReturnType<typeof setTimeout> | undefined

function close() {
  shown.value = false
  clearTimeout(timer)
}

watch(
  () => props.level,
  (now, before) => {
    if (now === undefined || before === undefined || now <= before) return
    reached.value = now
    hpGain.value = (now - before) * (props.hpPerLevel ?? 0)
    manaGain.value = (now - before) * (props.manaPerLevel ?? 0)
    unlocked.value = (props.skills ?? [])
      .filter((s) => s.unlockLevel > before && s.unlockLevel <= now)
      .map((s) => s.name)
    shown.value = true
    buzz([120, 80, 220])
    clearTimeout(timer)
    timer = setTimeout(close, lite.lite ? 2800 : 4500)
  },
)

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <Teleport to="body">
    <Transition name="lvl">
      <div v-if="shown" class="lvl" role="status" aria-live="polite" @click="close">
        <div class="rays" aria-hidden="true" />
        <div class="card">
          <div class="kicker">Você ficou mais forte</div>
          <div class="title-font number">Nível {{ reached }}</div>
          <div v-if="hpGain" class="gain">
            <v-icon icon="mdi-heart-plus" size="small" /> +{{ hpGain }} de vida máxima
          </div>
          <div v-if="manaGain" class="gain mana">
            <v-icon icon="mdi-water-plus" size="small" /> +{{ manaGain }} de mana máxima
          </div>
          <div v-if="unlocked.length" class="gain unlock">
            <v-icon icon="mdi-lock-open-variant" size="small" />
            {{ unlocked.length > 1 ? 'Habilidades liberadas' : 'Nova habilidade' }}: {{ unlocked.join(', ') }}
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.lvl {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: grid;
  place-items: center;
  background: radial-gradient(ellipse at center, rgba(201, 162, 39, 0.28), rgba(0, 0, 0, 0.82) 70%);
  cursor: pointer;
}

.rays {
  position: absolute;
  inset: -30%;
  background: repeating-conic-gradient(from 0deg, rgba(240, 205, 90, 0.16) 0deg 6deg, transparent 6deg 18deg);
  mask-image: radial-gradient(circle, #000 0%, transparent 60%);
  animation: spin 14s linear infinite;
  pointer-events: none;
}

.card {
  position: relative;
  text-align: center;
  padding: 24px 32px;
  animation: rise 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
}

.kicker {
  font-size: 0.8rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--gold);
}

.number {
  font-size: clamp(2.6rem, 14vw, 5rem);
  line-height: 1.1;
  color: var(--gold-bright);
  text-shadow:
    0 0 24px rgba(240, 205, 90, 0.7),
    0 2px 0 rgba(0, 0, 0, 0.6);
}

.gain {
  margin-top: 6px;
  color: rgb(var(--v-theme-success));
}

.gain.mana {
  color: rgb(var(--v-theme-info));
}

.gain.unlock {
  margin-top: 10px;
  color: var(--gold-bright);
  font-family: var(--font-title);
}

.lvl-enter-active,
.lvl-leave-active {
  transition: opacity 0.35s ease;
}

.lvl-enter-from,
.lvl-leave-to {
  opacity: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes rise {
  from {
    transform: scale(0.7) translateY(16px);
    opacity: 0;
  }
  to {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}

/* modo leve e movimento reduzido: o mesmo aviso, sem animação */
:global(html.lite) .lvl .rays,
:global(html.lite) .lvl .card {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  .rays,
  .card {
    animation: none;
  }
}
</style>
