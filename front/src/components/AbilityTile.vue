<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { Ability } from '@/types/api'
import { critLabel } from '@/utils/abilities'
import { buzz } from '@/utils/haptics'

/**
 * A habilidade como quadradinho, na barra de atalhos do combate. Tocar usa
 * (abre a confirmação); segurar o dedo, ou passar o mouse, mostra os detalhes
 * sem usar nada.
 */
const props = defineProps<{
  ability: Ability
  /** 1, 2 ou 3: a ordem em que a classe libera as habilidades. */
  position: number
  /** Ainda não liberada: só mostra em que nível abre. */
  locked: boolean
  /** Sem mana ou fora da vez: apagada, mas ainda dá para ler os detalhes. */
  unusable: boolean
  /** Estilo que mostra a ilustração da skill (recortada da carta da classe); sem ele, só o número. */
  art?: Record<string, string> | null
}>()
const emit = defineEmits<{ use: [] }>()

const NUMERALS = ['I', 'II', 'III']
const numeral = computed(() => NUMERALS[props.position - 1] ?? String(props.position))

const label = computed(() => {
  const a = props.ability
  if (props.locked) return `${a.name}, libera no nível ${a.unlockLevel}`
  return a.manaCost ? `${a.name}, ${a.manaCost} de mana` : `${a.name}, sem custo`
})

// ── detalhes: segurar (toque), passar o mouse ou focar com o teclado ──
const HOLD_MS = 420
const HOVER_MS = 250

type Source = 'hold' | 'hover' | 'focus'
const peek = ref(false)
let source: Source | null = null
let holdTimer: ReturnType<typeof setTimeout> | undefined
let hoverTimer: ReturnType<typeof setTimeout> | undefined
/** O segurar acabou de abrir os detalhes: o toque que termina não conta como "usar". */
let held = false

function show(from: Source) {
  if (props.locked) return // trancada: não mostra o que ainda não abriu
  source = from
  peek.value = true
}
function hide(from?: Source) {
  if (from && source !== from) return
  source = null
  peek.value = false
}

function onPointerDown(e: PointerEvent) {
  held = false
  if (e.pointerType === 'mouse') return // o mouse usa o hover
  clearTimeout(holdTimer)
  holdTimer = setTimeout(() => {
    held = true
    show('hold')
    buzz(12)
  }, HOLD_MS)
}
function endHold() {
  clearTimeout(holdTimer)
  hide('hold')
}
function onEnter(e: PointerEvent) {
  if (e.pointerType !== 'mouse') return
  clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => show('hover'), HOVER_MS)
}
function onLeave(e: PointerEvent) {
  if (e.pointerType === 'mouse') {
    clearTimeout(hoverTimer)
    hide('hover')
  } else {
    endHold() // o dedo saiu do quadradinho
  }
}
function onFocus(e: FocusEvent) {
  // só o foco de teclado: o toque também foca o botão e não deve abrir os detalhes
  if ((e.target as HTMLElement).matches(':focus-visible')) show('focus')
}

function onClick() {
  if (held) {
    held = false
    return
  }
  clearTimeout(hoverTimer)
  hide()
  if (!props.locked) emit('use')
}

onBeforeUnmount(() => {
  clearTimeout(holdTimer)
  clearTimeout(hoverTimer)
})
</script>

<template>
  <button
    type="button"
    class="tile"
    :class="{ locked, unusable, 'has-art': !!art }"
    :aria-label="label"
    :aria-disabled="locked"
    @click="onClick"
    @pointerdown="onPointerDown"
    @pointerup="endHold"
    @pointercancel="endHold"
    @pointerenter="onEnter"
    @pointerleave="onLeave"
    @focus="onFocus"
    @blur="hide('focus')"
    @contextmenu.prevent
  >
    <span v-if="art" class="art" :style="art" aria-hidden="true" />
    <span class="numeral" aria-hidden="true">{{ numeral }}</span>

    <!-- com ilustração: o custo vira um selo no canto e o resto fica por cima da arte -->
    <template v-if="art">
      <span v-if="locked" class="lockbox">
        <v-icon icon="mdi-lock-outline" size="26" />
        <span class="core-lbl">Nível {{ ability.unlockLevel }}</span>
      </span>
      <span v-else class="badge">
        <template v-if="ability.manaCost"><v-icon icon="mdi-water" size="13" />{{ ability.manaCost }}</template>
        <v-icon v-else icon="mdi-auto-fix" size="16" />
      </span>
    </template>
    <template v-else>
      <span v-if="locked" class="core">
        <v-icon icon="mdi-lock-outline" size="26" />
        <span class="core-lbl">Nível {{ ability.unlockLevel }}</span>
      </span>
      <span v-else class="core">
        <template v-if="ability.manaCost">
          <span class="cost">{{ ability.manaCost }}</span>
          <span class="core-lbl">mana</span>
        </template>
        <v-icon v-else icon="mdi-auto-fix" size="30" />
      </span>
    </template>

    <span class="name">{{ ability.name }}</span>

    <v-tooltip
      :model-value="peek"
      activator="parent"
      location="top"
      :open-on-hover="false"
      :open-on-focus="false"
      :open-on-click="false"
      max-width="300"
      content-class="tile-peek"
    >
      <div class="peek">
        <div class="peek-head">
          <span v-if="art" class="peek-art" :style="art" aria-hidden="true" />
          <span class="title-font peek-name">{{ ability.name }}</span>
          <v-chip v-if="ability.manaCost" color="info" size="small" variant="tonal" prepend-icon="mdi-water">
            {{ ability.manaCost }}
          </v-chip>
        </div>
        <p class="peek-desc pre-line">{{ ability.description }}</p>
        <ul v-if="ability.crits?.length" class="peek-crits">
          <li v-for="c in ability.crits" :key="c.min">
            <strong>{{ critLabel(c) }}:</strong> {{ c.text }}
          </li>
        </ul>
      </div>
    </v-tooltip>
  </button>
</template>

<style scoped>
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 2px;
  min-width: 0;
  aspect-ratio: 1;
  /* se um nome comprido crescer o quadradinho, os vizinhos acompanham a altura */
  align-self: stretch;
  padding: 5px 6px 7px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 70%, transparent);
  background:
    radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--accent) 24%, transparent), transparent 68%),
    linear-gradient(180deg, #1b1422, #120d17);
  box-shadow:
    inset 0 2px 6px rgba(0, 0, 0, 0.6),
    0 0 14px color-mix(in srgb, var(--accent) 30%, transparent);
  color: inherit;
  font: inherit;
  cursor: pointer;
  /* segurar não pode abrir menu de texto nem selecionar o nome */
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: manipulation;
  transition:
    transform 120ms ease-out,
    border-color 120ms ease-out;
  animation: tile-in 0.32s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
  animation-delay: calc(var(--i, 0) * 70ms);
}

.tile:active {
  transform: scale(0.97);
}

/* sem mana ou fora da vez: apagada, mas segue legível */
.tile.unusable {
  opacity: 0.5;
  border-color: var(--border-soft);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.6);
}

/* ainda não liberada */
.tile.locked {
  opacity: 0.5;
  cursor: not-allowed;
  border-style: dashed;
  border-color: var(--border-soft);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.6);
}

.numeral {
  align-self: flex-start;
  font-family: var(--font-title);
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  line-height: 1;
  opacity: 0.6;
}

.core {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
  color: var(--accent);
}

.cost {
  font-family: var(--font-title);
  font-size: 2rem;
  line-height: 1;
}

.core-lbl {
  margin-top: 2px;
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.8;
}

.name {
  width: 100%;
  font-family: var(--font-title);
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.15;
  text-align: center;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
}

/* com a ilustração da skill: ela preenche o quadradinho e o texto vai por cima */
.tile.has-art {
  justify-content: flex-end;
  padding: 0 6px 7px;
  overflow: hidden;
}

.art {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-repeat: no-repeat;
}

/* degradê escuro: deixa o nome legível sobre qualquer ilustração */
.tile.has-art::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(180deg, rgba(8, 5, 12, 0.4) 0%, rgba(8, 5, 12, 0) 30%, rgba(8, 5, 12, 0) 46%, rgba(8, 5, 12, 0.92) 100%);
  pointer-events: none;
}

.tile.has-art .numeral {
  position: absolute;
  top: 7px;
  left: 8px;
  z-index: 2;
  opacity: 0.85;
  text-shadow: 0 1px 3px #000;
}

.tile.has-art .name {
  position: relative;
  z-index: 2;
  color: #f6e7c1;
  text-shadow:
    0 1px 4px #000,
    0 0 2px #000;
}

/* custo de mana num selo no canto */
.badge {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 8px 2px 6px;
  border-radius: 99px;
  border: 1px solid color-mix(in srgb, var(--accent) 65%, transparent);
  background: rgba(8, 5, 14, 0.8);
  color: color-mix(in srgb, var(--accent) 55%, #fff);
  font-family: var(--font-title);
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.2;
}

/* trancada: ilustração apagada e o nível em que abre no meio */
.tile.locked .art {
  filter: grayscale(1) brightness(0.5);
}

.lockbox {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: #e8dcc4;
  text-shadow: 0 1px 4px #000;
}

@keyframes tile-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.9);
  }
}

/* painel de detalhes (o balão fica fora do botão, no contêiner de sobreposições) */
.peek {
  padding: 10px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: linear-gradient(180deg, #1d1524, #120c17);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6);
  color: rgb(var(--v-theme-on-surface));
  text-align: left;
}

.peek-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.peek-art {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background-repeat: no-repeat;
}

.peek-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--gold-bright);
}

.peek-desc {
  margin: 8px 0 0;
  font-size: 0.9rem;
  line-height: 1.4;
}

.peek-crits {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.85rem;
}

.peek-crits strong {
  color: var(--gold);
}

:global(.v-tooltip > .v-overlay__content.tile-peek) {
  padding: 0;
  background: transparent;
  box-shadow: none;
}

:global(html.lite) .tile {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  .tile {
    animation: none;
    transition: none;
  }
}
</style>
